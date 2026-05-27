import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, BarChart3, CalendarDays, ChevronLeft, ChevronRight, Clock, Gauge, Users } from 'lucide-react'
import { supabase } from '../supabaseClient'
import { getIsoWeekNumber, getTaskDurationHours, getTaskEndDate, getTaskStartDate, getTaskTechnicianIds, isAdminAvailabilityTask } from '../utils/taskUtils'

const DAILY_WORK_HOURS = 8

const formatDateLocal = (dateObj) => {
  const year = dateObj.getFullYear()
  const month = String(dateObj.getMonth() + 1).padStart(2, '0')
  const day = String(dateObj.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

const formatNumber = (value) => Number(value || 0).toLocaleString('pl-PL', { maximumFractionDigits: 1 })

const taskCoversDate = (task, dateStr) => getTaskStartDate(task) <= dateStr && getTaskEndDate(task) >= dateStr

const getDateRange = (startDate, endDate) => {
  const days = []
  const cursor = new Date(`${startDate}T12:00:00`)
  const end = new Date(`${endDate}T12:00:00`)
  while (cursor <= end) {
    days.push(formatDateLocal(cursor))
    cursor.setDate(cursor.getDate() + 1)
  }
  return days
}

const getWeekStart = (dateStr) => {
  const date = new Date(`${dateStr}T12:00:00`)
  const day = date.getDay()
  date.setDate(date.getDate() - day + (day === 0 ? -6 : 1))
  return formatDateLocal(date)
}

const getWeekEnd = (weekStart) => {
  const date = new Date(`${weekStart}T12:00:00`)
  date.setDate(date.getDate() + 6)
  return formatDateLocal(date)
}

export default function DashboardZw() {
  const [tasks, setTasks] = useState([])
  const [clientCategories, setClientCategories] = useState([])
  const [complaints, setComplaints] = useState([])
  const [complaintsMessage, setComplaintsMessage] = useState('')
  const [currentMonth, setCurrentMonth] = useState(() => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  })

  useEffect(() => {
    fetchData()

    const tasksChannel = supabase
      .channel('dashboard-tasks-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, () => fetchData())
      .subscribe()

    const complaintsChannel = supabase
      .channel('dashboard-complaints-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'complaints' }, () => fetchData())
      .subscribe()

    return () => {
      supabase.removeChannel(tasksChannel)
      supabase.removeChannel(complaintsChannel)
    }
  }, [])

  const fetchData = async () => {
    const [{ data: tasksData }, { data: categoriesData }, { data: complaintsData, error: complaintsError }] = await Promise.all([
      supabase.from('tasks').select('*'),
      supabase.from('client_categories').select('*'),
      supabase.from('complaints').select('*'),
    ])

    if (tasksData) setTasks(tasksData)
    if (categoriesData) setClientCategories(categoriesData)
    if (complaintsError) {
      setComplaints([])
      setComplaintsMessage('Brakuje tabeli complaints. Uruchom supabase_add_complaints.sql, aby dashboard liczyl reklamacje.')
    } else {
      setComplaints(complaintsData || [])
      setComplaintsMessage('')
    }
  }

  const stats = useMemo(() => {
    const [year, month] = currentMonth.split('-').map(Number)
    const monthStart = formatDateLocal(new Date(year, month - 1, 1))
    const monthEnd = formatDateLocal(new Date(year, month, 0))

    const calculateRangeStats = (rangeStart, rangeEnd) => {
      const rangeDays = getDateRange(rangeStart, rangeEnd)
      const rangeTasks = tasks.filter(task => getTaskStartDate(task) <= rangeEnd && getTaskEndDate(task) >= rangeStart)
      const workloadTasks = rangeTasks.filter(task => !isAdminAvailabilityTask(task, clientCategories))
      const adminTasks = rangeTasks.filter(task => isAdminAvailabilityTask(task, clientCategories))
      const complaintsInRange = complaints.filter(complaint => complaint.complaint_date >= rangeStart && complaint.complaint_date <= rangeEnd)
      const workedPersonDays = new Set()
      const adminPersonDays = new Set()

      workloadTasks.forEach(task => {
        getTaskTechnicianIds(task).forEach(technicianId => {
          rangeDays.forEach(dateStr => {
            if (taskCoversDate(task, dateStr)) workedPersonDays.add(`${technicianId}|${dateStr}`)
          })
        })
      })

      adminTasks.forEach(task => {
        getTaskTechnicianIds(task).forEach(technicianId => {
          rangeDays.forEach(dateStr => {
            if (taskCoversDate(task, dateStr)) adminPersonDays.add(`${technicianId}|${dateStr}`)
          })
        })
      })

      const taskCount = workloadTasks.length
      const durationHours = workloadTasks.reduce((sum, task) => sum + getTaskDurationHours(task, clientCategories, DAILY_WORK_HOURS), 0)
      const complaintCount = complaintsInRange.length
      const productivePersonDays = workedPersonDays.size
      const adminPersonDayCount = adminPersonDays.size
      const totalPersonDays = productivePersonDays + adminPersonDayCount

      return {
        taskCount,
        adminTaskCount: adminTasks.length,
        personDays: productivePersonDays,
        adminPersonDays: adminPersonDayCount,
        durationHours,
        complaintCount,
        complaintRatio: taskCount > 0 ? (complaintCount / taskCount) * 100 : 0,
        teamEfficiency: totalPersonDays > 0 ? (productivePersonDays / totalPersonDays) * 100 : 0,
        workloadTasks,
        complaintsInRange,
      }
    }

    const monthRangeStats = calculateRangeStats(monthStart, monthEnd)
    const workloadTasks = monthRangeStats.workloadTasks
    const complaintsInMonth = monthRangeStats.complaintsInRange

    const taskCount = workloadTasks.length
    const clientCounts = Object.values(workloadTasks.reduce((acc, task) => {
      const key = task.client_name || 'Brak klienta'
      acc[key] = acc[key] || { name: key, count: 0 }
      acc[key].count += 1
      return acc
    }, {})).sort((a, b) => b.count - a.count).slice(0, 6)
    const complaintClientCounts = Object.values(complaintsInMonth.reduce((acc, complaint) => {
      const key = complaint.client_name || 'Brak klienta'
      acc[key] = acc[key] || { name: key, count: 0 }
      acc[key].count += 1
      return acc
    }, {})).sort((a, b) => b.count - a.count).slice(0, 6)
    const weekRows = []
    let weekCursor = getWeekStart(monthStart)

    while (weekCursor <= monthEnd) {
      const weekStart = weekCursor < monthStart ? monthStart : weekCursor
      const weekNaturalEnd = getWeekEnd(weekCursor)
      const weekEnd = weekNaturalEnd > monthEnd ? monthEnd : weekNaturalEnd
      const weekStats = calculateRangeStats(weekStart, weekEnd)

      weekRows.push({
        weekStart,
        weekEnd,
        weekNumber: getIsoWeekNumber(weekCursor),
        ...weekStats,
      })

      const nextWeek = new Date(`${weekCursor}T12:00:00`)
      nextWeek.setDate(nextWeek.getDate() + 7)
      weekCursor = formatDateLocal(nextWeek)
    }

    return {
      monthStart,
      monthEnd,
      taskCount,
      personDays: monthRangeStats.personDays,
      adminTaskCount: monthRangeStats.adminTaskCount,
      adminPersonDays: monthRangeStats.adminPersonDays,
      teamEfficiency: monthRangeStats.teamEfficiency,
      durationHours: monthRangeStats.durationHours,
      complaintCount: monthRangeStats.complaintCount,
      complaintRatio: monthRangeStats.complaintRatio,
      clientCounts,
      complaintClientCounts,
      weekRows,
    }
  }, [clientCategories, complaints, currentMonth, tasks])

  const shiftMonth = (direction) => {
    const [year, month] = currentMonth.split('-').map(Number)
    const nextDate = new Date(year, month - 1 + direction, 1)
    setCurrentMonth(`${nextDate.getFullYear()}-${String(nextDate.getMonth() + 1).padStart(2, '0')}`)
  }

  const kpis = [
    { label: 'Ilosc zadan', value: stats.taskCount, hint: `${stats.monthStart} - ${stats.monthEnd}`, icon: CalendarDays, color: 'text-blue-700', bg: 'bg-blue-50' },
    { label: 'Osobodniowki', value: stats.personDays, hint: `ADM: ${stats.adminTaskCount} zadan / ${stats.adminPersonDays} OSD`, icon: Users, color: 'text-emerald-700', bg: 'bg-emerald-50' },
    { label: 'Efektywnosc zespolu', value: `${formatNumber(stats.teamEfficiency)}%`, hint: 'OSD zadaniowe / OSD razem z ADM', icon: Gauge, color: stats.teamEfficiency < 80 ? 'text-orange-700' : 'text-emerald-700', bg: stats.teamEfficiency < 80 ? 'bg-orange-50' : 'bg-emerald-50' },
    { label: 'Czasochlonnosc', value: `${formatNumber(stats.durationHours)}h`, hint: 'Brak czasu = 8h', icon: Clock, color: 'text-indigo-700', bg: 'bg-indigo-50' },
    { label: 'Reklamacje', value: stats.complaintCount, hint: 'Z importu Service Desk', icon: AlertTriangle, color: 'text-orange-700', bg: 'bg-orange-50' },
    { label: 'Reklamacje / zadania', value: `${formatNumber(stats.complaintRatio)}%`, hint: 'Im mniej, tym lepiej', icon: Gauge, color: stats.complaintRatio > 10 ? 'text-red-700' : 'text-slate-900', bg: stats.complaintRatio > 10 ? 'bg-red-50' : 'bg-slate-50' },
  ]

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-md">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex items-center gap-3">
              <BarChart3 size={24} className="text-blue-600" />
              <h1 className="text-2xl font-black text-slate-900">Dashboard ZW</h1>
            </div>
            <p className="mt-1 text-sm font-semibold text-slate-500">Miesieczny przeglad zadan, osobodniowek, czasochlonnosci i reklamacji.</p>
          </div>
          <div className="flex items-end gap-2">
            <button type="button" onClick={() => shiftMonth(-1)} className="rounded-lg bg-slate-100 p-2 text-slate-700 transition hover:bg-slate-200" title="Poprzedni miesiac">
              <ChevronLeft size={18} />
            </button>
            <label className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Miesiac
              <input type="month" value={currentMonth} onChange={e => setCurrentMonth(e.target.value)} className="mt-1 block rounded-lg border px-3 py-2 text-sm font-black text-slate-800" />
            </label>
            <button type="button" onClick={() => shiftMonth(1)} className="rounded-lg bg-slate-100 p-2 text-slate-700 transition hover:bg-slate-200" title="Nastepny miesiac">
              <ChevronRight size={18} />
            </button>
          </div>
        </div>
        {complaintsMessage && <div className="mt-4 rounded-lg border border-orange-200 bg-orange-50 p-3 text-xs font-bold text-orange-800">{complaintsMessage}</div>}
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-6">
        {kpis.map(item => {
          const Icon = item.icon
          return (
            <div key={item.label} className="rounded-xl border border-slate-200 bg-white p-4 shadow-md">
              <div className={`inline-flex rounded-lg p-2 ${item.bg}`}>
                <Icon size={18} className={item.color} />
              </div>
              <div className="mt-3 text-xs font-black uppercase tracking-wider text-slate-500">{item.label}</div>
              <div className={`mt-1 text-3xl font-black ${item.color}`}>{item.value}</div>
              <div className="mt-1 text-xs font-bold text-slate-400">{item.hint}</div>
            </div>
          )
        })}
      </div>

      <div className="rounded-xl border border-slate-200 bg-white shadow-md">
        <div className="border-b p-4">
          <h2 className="text-sm font-black uppercase tracking-wider text-slate-900">Podzial na tygodnie w miesiacu</h2>
          <p className="mt-1 text-xs font-semibold text-slate-500">Tygodnie sa przyciete do wybranego miesiaca, wiec pierwszy i ostatni tydzien moga miec krotszy zakres.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-[980px] w-full text-left text-xs">
            <thead className="bg-slate-100 text-slate-600">
              <tr>
                <th className="p-3">Tydzien</th>
                <th className="p-3">Zakres</th>
                <th className="p-3">Ilosc zadan</th>
                <th className="p-3">Przepracowane OSD</th>
                <th className="p-3">Efektywnosc zespolu</th>
                <th className="p-3">Czasochlonnosc</th>
                <th className="p-3">Reklamacje</th>
                <th className="p-3">Reklamacje / zadania</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {stats.weekRows.map(row => (
                <tr key={`${row.weekNumber}-${row.weekStart}`}>
                  <td className="p-3 font-black text-slate-900">{row.weekNumber}</td>
                  <td className="p-3 font-bold text-slate-500">{row.weekStart} - {row.weekEnd}</td>
                  <td className="p-3 font-black text-blue-700">{row.taskCount}</td>
                  <td className="p-3 font-black text-emerald-700">{row.personDays}</td>
                  <td className={`p-3 font-black ${row.teamEfficiency < 80 ? 'text-orange-700' : 'text-emerald-700'}`}>{formatNumber(row.teamEfficiency)}%</td>
                  <td className="p-3 font-black text-indigo-700">{formatNumber(row.durationHours)}h</td>
                  <td className="p-3 font-black text-orange-700">{row.complaintCount}</td>
                  <td className={`p-3 font-black ${row.complaintRatio > 10 ? 'text-red-700' : 'text-slate-700'}`}>{formatNumber(row.complaintRatio)}%</td>
                </tr>
              ))}
              {stats.weekRows.length === 0 && (
                <tr><td colSpan="8" className="p-6 text-center text-sm font-bold text-slate-400">Brak danych tygodniowych.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-md">
          <h2 className="text-sm font-black uppercase tracking-wider text-slate-900">Zadania wg klientow</h2>
          <div className="mt-4 space-y-3">
            {stats.clientCounts.map(row => (
              <div key={row.name}>
                <div className="mb-1 flex justify-between text-xs font-bold text-slate-600"><span>{row.name}</span><span>{row.count}</span></div>
                <div className="h-2 rounded-full bg-slate-100"><div className="h-full rounded-full bg-blue-600" style={{ width: `${Math.max(6, (row.count / Math.max(1, stats.clientCounts[0]?.count || 1)) * 100)}%` }} /></div>
              </div>
            ))}
            {stats.clientCounts.length === 0 && <div className="rounded-lg bg-slate-50 p-4 text-center text-sm font-bold text-slate-400">Brak zadan w miesiacu.</div>}
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-md">
          <h2 className="text-sm font-black uppercase tracking-wider text-slate-900">Reklamacje wg klientow</h2>
          <div className="mt-4 space-y-3">
            {stats.complaintClientCounts.map(row => (
              <div key={row.name}>
                <div className="mb-1 flex justify-between text-xs font-bold text-slate-600"><span>{row.name}</span><span>{row.count}</span></div>
                <div className="h-2 rounded-full bg-slate-100"><div className="h-full rounded-full bg-orange-500" style={{ width: `${Math.max(6, (row.count / Math.max(1, stats.complaintClientCounts[0]?.count || 1)) * 100)}%` }} /></div>
              </div>
            ))}
            {stats.complaintClientCounts.length === 0 && <div className="rounded-lg bg-slate-50 p-4 text-center text-sm font-bold text-slate-400">Brak reklamacji w miesiacu.</div>}
          </div>
        </div>
      </div>
    </div>
  )
}
