import { useEffect, useMemo, useState } from 'react'
import { BarChart3, ChevronLeft, ChevronRight } from 'lucide-react'
import { supabase } from '../supabaseClient'
import { getTaskEndDate, getTaskStartDate, getTaskTechnicianIds } from '../utils/taskUtils'
import TaskSearch from './TaskSearch'

export default function PmWorkloadView() {
  const [tasks, setTasks] = useState([])
  const [technicians, setTechnicians] = useState([])
  const [clients, setClients] = useState([])
  const [activeClientId, setActiveClientId] = useState('')
  const [currentDate, setCurrentDate] = useState(new Date())

  const getWeekDaysLocal = (baseDate) => {
    const current = new Date(baseDate)
    const day = current.getDay()
    const diff = current.getDate() - day + (day === 0 ? -6 : 1)
    const monday = new Date(current.setDate(diff))

    return Array.from({ length: 7 }, (_, idx) => {
      const date = new Date(monday)
      date.setDate(monday.getDate() + idx)
      const year = date.getFullYear()
      const month = String(date.getMonth() + 1).padStart(2, '0')
      const dayStr = String(date.getDate()).padStart(2, '0')
      return `${year}-${month}-${dayStr}`
    })
  }

  const getWeekNumber = (d) => {
    const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
    const dayNum = date.getUTCDay() || 7
    date.setUTCDate(date.getUTCDate() + 4 - dayNum)
    const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1))
    return Math.ceil((((date - yearStart) / 86400000) + 1) / 7)
  }

  const weekDays = useMemo(() => getWeekDaysLocal(currentDate), [currentDate])
  const currentWeekNumber = getWeekNumber(currentDate)

  useEffect(() => {
    fetchData()

    const tasksChannel = supabase
      .channel('pm-workload-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, () => fetchData())
      .subscribe()

    return () => supabase.removeChannel(tasksChannel)
  }, [])

  const fetchData = async () => {
    const [{ data: tasksData }, { data: techniciansData }, { data: clientsData }] = await Promise.all([
      supabase.from('tasks').select('*'),
      supabase.from('profiles').select('*').eq('role', 'technik').order('full_name', { ascending: true }),
      supabase.from('clients').select('*').order('name', { ascending: true }),
    ])

    if (tasksData) setTasks(tasksData)
    if (techniciansData) setTechnicians(techniciansData)
    if (clientsData) setClients(clientsData)
  }

  const taskOverlapsWeek = (task) => getTaskStartDate(task) <= weekDays[6] && getTaskEndDate(task) >= weekDays[0]
  const taskCoversDate = (task, dateStr) => getTaskStartDate(task) <= dateStr && getTaskEndDate(task) >= dateStr
  const visibleTasks = tasks.filter(task => {
    if (!taskOverlapsWeek(task)) return false
    if (activeClientId && Number(task.client_id) !== Number(activeClientId)) return false
    return true
  })

  const technicianStats = technicians.map(technician => {
    const assignedTasks = visibleTasks.filter(task => getTaskTechnicianIds(task).includes(technician.id))
    const totalHours = assignedTasks.reduce((sum, task) => sum + (Number(task.duration_hours) || 0), 0)
    const doneCount = assignedTasks.filter(task => task.status === 'Zrealizowane').length
    const daily = weekDays.map(dateStr => {
      const dayTasks = assignedTasks.filter(task => taskCoversDate(task, dateStr))
      return {
        date: dateStr,
        taskCount: dayTasks.length,
        hours: dayTasks.reduce((sum, task) => sum + (Number(task.duration_hours) || 0), 0),
      }
    })

    return {
      technician,
      taskCount: assignedTasks.length,
      doneCount,
      openCount: assignedTasks.length - doneCount,
      totalHours,
      daily,
    }
  }).sort((a, b) => b.totalHours - a.totalHours || b.taskCount - a.taskCount)

  const unassignedTasks = visibleTasks.filter(task => getTaskTechnicianIds(task).length === 0)
  const totalTaskCount = technicianStats.reduce((sum, stat) => sum + stat.taskCount, 0)
  const totalHours = technicianStats.reduce((sum, stat) => sum + stat.totalHours, 0)
  const maxHours = Math.max(1, ...technicianStats.map(stat => stat.totalHours))
  const maxDailyCount = Math.max(1, ...technicianStats.flatMap(stat => stat.daily.map(day => day.taskCount)))

  const handlePrevWeek = () => {
    const nextDate = new Date(currentDate)
    nextDate.setDate(currentDate.getDate() - 7)
    setCurrentDate(nextDate)
  }

  const handleNextWeek = () => {
    const nextDate = new Date(currentDate)
    nextDate.setDate(currentDate.getDate() + 7)
    setCurrentDate(nextDate)
  }

  const handleSearchSelectTask = (task) => {
    const startDate = getTaskStartDate(task)
    if (startDate) setCurrentDate(new Date(`${startDate}T12:00:00`))
  }

  return (
    <div className="space-y-6">
      <TaskSearch tasks={tasks} technicians={technicians} onSelectTask={handleSearchSelectTask} />

      <div className="bg-white p-4 rounded-xl shadow-md border border-slate-200 flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <BarChart3 size={22} className="text-blue-600" />
            <h2 className="text-2xl font-black text-slate-900">Workload PM</h2>
            <span className="px-2.5 py-0.5 bg-blue-100 text-blue-800 rounded-full text-xs font-black uppercase tracking-wider">
              Tydzień {currentWeekNumber}
            </span>
          </div>
          <p className="text-sm text-slate-500">Zestawienie liczby zadań i czasochłonności techników w wybranym tygodniu.</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select value={activeClientId} onChange={e => setActiveClientId(e.target.value)} className="border rounded-lg px-3 py-2 text-xs font-bold text-slate-700 outline-none bg-white">
            <option value="">Wszyscy klienci</option>
            {clients.map(client => <option key={client.id} value={client.id}>{client.name}</option>)}
          </select>
          <button onClick={handlePrevWeek} className="p-2 bg-slate-100 hover:bg-slate-200 rounded-lg text-slate-700 transition"><ChevronLeft size={18} /></button>
          <button onClick={() => setCurrentDate(new Date())} className="px-3 py-2 bg-slate-100 hover:bg-slate-200 rounded-lg text-xs font-bold text-slate-700 transition">Bieżący tydzień</button>
          <button onClick={handleNextWeek} className="p-2 bg-slate-100 hover:bg-slate-200 rounded-lg text-slate-700 transition"><ChevronRight size={18} /></button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white p-4 rounded-xl shadow-md border border-slate-200">
          <div className="text-xs font-black uppercase tracking-wider text-slate-500">Zadania przypisane</div>
          <div className="mt-2 text-3xl font-black text-slate-900">{totalTaskCount}</div>
        </div>
        <div className="bg-white p-4 rounded-xl shadow-md border border-slate-200">
          <div className="text-xs font-black uppercase tracking-wider text-slate-500">Czasochłonność</div>
          <div className="mt-2 text-3xl font-black text-blue-700">{totalHours}h</div>
        </div>
        <div className="bg-white p-4 rounded-xl shadow-md border border-slate-200">
          <div className="text-xs font-black uppercase tracking-wider text-slate-500">Nieprzypisane</div>
          <div className="mt-2 text-3xl font-black text-orange-600">{unassignedTasks.length}</div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-md border border-slate-200 overflow-hidden">
        <div className="p-4 border-b">
          <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider">Obciążenie techników</h3>
        </div>
        <div className="divide-y">
          {technicianStats.map(stat => (
            <div key={stat.technician.id} className="p-4 grid grid-cols-1 xl:grid-cols-[220px_1fr_340px] gap-4 items-center">
              <div>
                <div className="font-black text-slate-900">{stat.technician.full_name}</div>
                <div className="text-xs text-slate-500">{stat.taskCount} zadań · {stat.totalHours}h · {stat.doneCount} zrealiz.</div>
              </div>

              <div className="space-y-2">
                <div className="h-5 bg-slate-100 rounded overflow-hidden">
                  <div className="h-full bg-blue-600 rounded" style={{ width: `${Math.max(4, (stat.totalHours / maxHours) * 100)}%` }} />
                </div>
                <div className="flex justify-between text-[11px] font-bold text-slate-500">
                  <span>Otwarte: {stat.openCount}</span>
                  <span>{stat.totalHours}h</span>
                </div>
              </div>

              <div className="grid grid-cols-7 gap-1">
                {stat.daily.map(day => (
                  <div key={day.date} className="text-center">
                    <div className="h-16 bg-slate-100 rounded flex items-end overflow-hidden">
                      <div className="w-full bg-emerald-500" style={{ height: `${Math.max(day.taskCount ? 10 : 0, (day.taskCount / maxDailyCount) * 100)}%` }} />
                    </div>
                    <div className="mt-1 text-[10px] font-bold text-slate-500">{day.date.slice(5)}</div>
                    <div className="text-[10px] font-black text-slate-700">{day.taskCount}</div>
                  </div>
                ))}
              </div>
            </div>
          ))}

          {technicianStats.length === 0 && (
            <div className="p-8 text-center text-sm text-slate-500">Brak techników do wyświetlenia.</div>
          )}
        </div>
      </div>

      {unassignedTasks.length > 0 && (
        <div className="bg-orange-50 rounded-xl shadow-md border border-orange-200 p-4">
          <h3 className="text-sm font-black text-orange-800 uppercase tracking-wider">Zadania nieprzypisane</h3>
          <div className="mt-3 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
            {unassignedTasks.map(task => (
              <div key={task.id} className="bg-white border border-orange-200 rounded-lg p-3 text-xs">
                <div className="font-black text-slate-900 truncate">{task.client_name ? `[${task.client_name}] ` : ''}{task.title}</div>
                <div className="mt-1 text-slate-500">{getTaskStartDate(task)} - {getTaskEndDate(task)} · {task.duration_hours || 0}h</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
