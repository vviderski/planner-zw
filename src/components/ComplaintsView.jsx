import { useEffect, useMemo, useRef, useState } from 'react'
import { Download, Eraser, FileWarning, Upload } from 'lucide-react'
import * as XLSX from 'xlsx'
import { supabase } from '../supabaseClient'
import { formatDateLocal, getIsoWeekNumber, getTaskTechnicianIds } from '../utils/taskUtils'

const normalizeText = (value) => String(value || '')
  .toLowerCase()
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/\s+/g, ' ')
  .trim()

const ticketKey = (value) => String(value || '').replace(/\D/g, '')

const getFirstValue = (row, keys) => {
  for (const key of keys) {
    const value = row[key]
    if (value !== undefined && value !== null && String(value).trim() !== '') return value
  }
  return ''
}

const parseDateValue = (value) => {
  if (!value) return ''
  if (value instanceof Date) return formatDateLocal(value)
  if (typeof value === 'number') {
    const parsed = XLSX.SSF.parse_date_code(value)
    if (!parsed) return ''
    return formatDateLocal(new Date(parsed.y, parsed.m - 1, parsed.d))
  }
  const raw = String(value).trim()
  const isoDate = raw.match(/\d{4}-\d{2}-\d{2}/)?.[0]
  if (isoDate) return isoDate
  const parsed = new Date(raw)
  return Number.isNaN(parsed.getTime()) ? '' : formatDateLocal(parsed)
}

const toDate = (dateStr) => new Date(`${dateStr}T12:00:00`)

const getWeekStart = (dateStr) => {
  const date = toDate(dateStr)
  const day = date.getDay()
  date.setDate(date.getDate() - day + (day === 0 ? -6 : 1))
  return formatDateLocal(date)
}

const getWeekEnd = (weekStart) => {
  const date = toDate(weekStart)
  date.setDate(date.getDate() + 6)
  return formatDateLocal(date)
}

const getTechnicianNames = (task, technicians) => {
  const names = getTaskTechnicianIds(task)
    .map(id => technicians.find(tech => tech.id === id)?.full_name)
    .filter(Boolean)

  return names.length ? names.join(', ') : 'Brak'
}

const getRowsFromWorkbook = (workbook) => {
  const worksheet = workbook.Sheets[workbook.SheetNames[0]]
  const matrix = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '', raw: true })
  const headerIndex = matrix.findIndex(row => row.some(cell => normalizeText(cell) === 'ticket id'))
  if (headerIndex === -1) return []

  const headers = matrix[headerIndex].map(normalizeText)
  return matrix.slice(headerIndex + 1).map(row => {
    const record = {}
    headers.forEach((header, index) => {
      if (header) record[header] = row[index]
    })
    return record
  })
}

export default function ComplaintsView() {
  const [complaints, setComplaints] = useState([])
  const [tasks, setTasks] = useState([])
  const [technicians, setTechnicians] = useState([])
  const [dateFrom, setDateFrom] = useState(() => {
    const now = new Date()
    return formatDateLocal(new Date(now.getFullYear(), now.getMonth(), 1))
  })
  const [dateTo, setDateTo] = useState(() => formatDateLocal(new Date()))
  const [message, setMessage] = useState('')
  const fileInputRef = useRef(null)

  useEffect(() => {
    fetchData()

    const complaintsChannel = supabase
      .channel('complaints-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'complaints' }, () => fetchData())
      .subscribe()

    return () => supabase.removeChannel(complaintsChannel)
  }, [])

  const fetchData = async () => {
    const [{ data: complaintsData, error: complaintsError }, { data: tasksData }, { data: techniciansData }] = await Promise.all([
      supabase.from('complaints').select('*').order('complaint_date', { ascending: false }),
      supabase.from('tasks').select('*'),
      supabase.from('profiles').select('*').eq('role', 'technik').order('full_name', { ascending: true }),
    ])

    if (complaintsError) {
      setMessage('Brakuje tabeli complaints. Uruchom supabase_add_complaints.sql w Supabase SQL Editor.')
    } else if (complaintsData) {
      setComplaints(complaintsData)
    }
    if (tasksData) setTasks(tasksData)
    if (techniciansData) setTechnicians(techniciansData)
  }

  const tasksByTicket = useMemo(() => {
    const map = new Map()
    tasks.forEach(task => {
      const key = ticketKey(task.ticket_number)
      if (!key) return
      const current = map.get(key) || []
      current.push(task)
      map.set(key, current)
    })
    return map
  }, [tasks])

  const getTaskForComplaint = (complaint) => {
    if (complaint.task_id) return tasks.find(task => Number(task.id) === Number(complaint.task_id)) || null
    const matches = tasksByTicket.get(ticketKey(complaint.ticket_id)) || []
    return matches.length === 1 ? matches[0] : null
  }

  const visibleComplaints = complaints.filter(complaint => {
    if (!complaint.complaint_date) return false
    return complaint.complaint_date >= dateFrom && complaint.complaint_date <= dateTo
  })

  const enrichedComplaints = visibleComplaints.map(complaint => {
    const task = getTaskForComplaint(complaint)
    return {
      complaint,
      task,
      clientName: task?.client_name || complaint.client_name || 'Brak klienta',
      technicianNames: task ? getTechnicianNames(task, technicians) : 'Brak przypisanego zadania',
      weekStart: getWeekStart(complaint.complaint_date),
    }
  })

  const weeklyRows = [...new Map(enrichedComplaints.map(item => [item.weekStart, item.weekStart])).values()]
    .sort()
    .map(weekStart => {
      const weekItems = enrichedComplaints.filter(item => item.weekStart === weekStart)
      const matched = weekItems.filter(item => item.task).length
      return {
        weekStart,
        weekEnd: getWeekEnd(weekStart),
        weekNumber: getIsoWeekNumber(weekStart),
        total: weekItems.length,
        matched,
        unmatched: weekItems.length - matched,
      }
    })

  const clientRows = Object.values(enrichedComplaints.reduce((acc, item) => {
    const key = item.clientName
    if (!acc[key]) acc[key] = { clientName: key, total: 0, matched: 0, unmatched: 0 }
    acc[key].total += 1
    if (item.task) acc[key].matched += 1
    else acc[key].unmatched += 1
    return acc
  }, {})).sort((a, b) => b.total - a.total)

  const technicianRows = Object.values(enrichedComplaints.reduce((acc, item) => {
    const names = item.task ? getTaskTechnicianIds(item.task)
      .map(id => technicians.find(tech => tech.id === id)?.full_name)
      .filter(Boolean) : ['Brak przypisanego zadania']
    const finalNames = names.length ? names : ['Brak technika']
    finalNames.forEach(name => {
      if (!acc[name]) acc[name] = { technicianName: name, total: 0, clients: new Set() }
      acc[name].total += 1
      acc[name].clients.add(item.clientName)
    })
    return acc
  }, {})).map(row => ({ ...row, clients: [...row.clients].join(', ') })).sort((a, b) => b.total - a.total)

  const unmatchedRows = enrichedComplaints.filter(item => !item.task)
  const matchedCount = enrichedComplaints.length - unmatchedRows.length

  const handleImport = (event) => {
    const file = event.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = async (evt) => {
      try {
        setMessage('')
        const workbook = XLSX.read(evt.target.result, { type: 'binary', cellDates: true })
        const rows = getRowsFromWorkbook(workbook)

        if (rows.length === 0) {
          alert('Nie znaleziono kolumny Ticket ID w pliku.')
          return
        }

        const payload = rows.map(row => {
          const ticketId = String(getFirstValue(row, ['ticket id']) || '').trim()
          const key = ticketKey(ticketId)
          const matches = tasksByTicket.get(key) || []
          const task = matches.length === 1 ? matches[0] : null
          const matchStatus = task ? 'Dopasowano' : (matches.length > 1 ? 'Kilka pasujacych zadan' : 'Brak przypisanego zadania')
          const sourceId = String(getFirstValue(row, ['id']) || `${ticketId}-${getFirstValue(row, ['created at'])}`).trim()

          return {
            source_id: sourceId || null,
            ticket_id: ticketId,
            task_id: task?.id || null,
            match_status: matchStatus,
            type: String(getFirstValue(row, ['type']) || '').trim(),
            client_name: String(getFirstValue(row, ['client']) || '').trim(),
            priority: String(getFirstValue(row, ['ticket priority']) || '').trim(),
            complaint_date: parseDateValue(getFirstValue(row, ['created at'])),
            created_by: String(getFirstValue(row, ['created by']) || '').trim(),
            root_category: String(getFirstValue(row, ['root category']) || '').trim(),
            category: String(getFirstValue(row, ['category']) || '').trim(),
            description: String(getFirstValue(row, ['description']) || '').trim(),
            resolved_on_workgroup: String(getFirstValue(row, ['resolved on workgroup']) || '').trim(),
            deleted: Boolean(getFirstValue(row, ['deleted'])),
            deleted_at: parseDateValue(getFirstValue(row, ['deleted at'])) || null,
            raw_payload: row,
          }
        }).filter(item => item.ticket_id && item.complaint_date)

        if (payload.length === 0) {
          alert('Nie znaleziono reklamacji z Ticket ID i datą.')
          return
        }

        for (let index = 0; index < payload.length; index += 500) {
          const chunk = payload.slice(index, index + 500)
          const { error } = await supabase
            .from('complaints')
            .upsert(chunk, { onConflict: 'source_id' })

          if (error) throw error
        }

        const matched = payload.filter(item => item.task_id).length
        setMessage(`Zaimportowano/zaktualizowano ${payload.length} reklamacji. Dopasowano do zadan: ${matched}. Bez przypisanego zadania: ${payload.length - matched}.`)
        fetchData()
      } catch (error) {
        alert(error.message || 'Nie udało się zaimportować reklamacji.')
      }
    }
    reader.readAsBinaryString(file)
    event.target.value = null
  }

  const handleClearComplaints = async () => {
    if (complaints.length === 0) {
      alert('Brak reklamacji do usuniecia.')
      return
    }

    const confirmed = window.confirm(`Usunac wszystkie reklamacje z bazy? Liczba rekordow: ${complaints.length}. Tej operacji nie da sie cofnac.`)
    if (!confirmed) return

    const { error } = await supabase
      .from('complaints')
      .delete()
      .neq('id', 0)

    if (error) {
      alert(error.message || 'Nie udalo sie usunac reklamacji.')
      return
    }

    setComplaints([])
    setMessage(`Usunieto wszystkie reklamacje: ${complaints.length}.`)
  }

  const handleExport = () => {
    const summaryRows = weeklyRows.map(row => ({
      'Tydzien roku': row.weekNumber,
      'Zakres od': row.weekStart,
      'Zakres do': row.weekEnd,
      'Ilosc reklamacji': row.total,
      'Dopasowane do zadan': row.matched,
      'Brak przypisanego zadania': row.unmatched,
    }))
    const clientExportRows = clientRows.map(row => ({
      'Klient': row.clientName,
      'Ilosc reklamacji': row.total,
      'Dopasowane': row.matched,
      'Brak przypisanego zadania': row.unmatched,
    }))
    const detailRows = enrichedComplaints.map(({ complaint, task, clientName, technicianNames }) => ({
      'Ticket ID': complaint.ticket_id,
      'Data reklamacji': complaint.complaint_date,
      'Tydzien roku': getIsoWeekNumber(complaint.complaint_date),
      'Klient': clientName,
      'Technik': technicianNames,
      'Status dopasowania': task ? 'Dopasowano' : complaint.match_status,
      'Planner ID': task?.id || '',
      'Zadanie': task?.title || '',
      'Kategoria reklamacji': complaint.category || '',
      'Opis': complaint.description || '',
    }))

    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(summaryRows), 'Tygodnie')
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(clientExportRows), 'Klienci')
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(detailRows), 'Szczegoly')
    XLSX.writeFile(workbook, `Reklamacje_${dateFrom}_${dateTo}.xlsx`)
  }

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-md">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <div className="flex items-center gap-3">
              <FileWarning size={22} className="text-red-600" />
              <h2 className="text-2xl font-black text-slate-900">Reklamacje</h2>
            </div>
            <p className="text-sm font-semibold text-slate-500">Import z Service Desk i analiza reklamacji po tygodniach, klientach oraz technikach.</p>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <label className="text-xs font-bold text-slate-600">Od<input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="mt-1 block rounded-lg border px-3 py-2 text-xs font-bold" /></label>
            <label className="text-xs font-bold text-slate-600">Do<input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="mt-1 block rounded-lg border px-3 py-2 text-xs font-bold" /></label>
            <input ref={fileInputRef} type="file" accept=".xlsx,.xls" onChange={handleImport} className="hidden" />
            <button onClick={() => fileInputRef.current?.click()} className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-black text-white hover:bg-emerald-700"><Upload size={15} /> Import XLS</button>
            <button onClick={handleExport} disabled={enrichedComplaints.length === 0} className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-xs font-black text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"><Download size={15} /> Eksport XLS</button>
            <button onClick={handleClearComplaints} disabled={complaints.length === 0} className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-xs font-black text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:bg-slate-300"><Eraser size={15} /> Wyczyść reklamacje</button>
          </div>
        </div>
        {message && <div className="mt-3 rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs font-bold text-blue-800">{message}</div>}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-md">
          <div className="text-xs font-black uppercase tracking-wider text-slate-500">Ilosc reklamacji</div>
          <div className="mt-2 text-3xl font-black text-slate-900">{enrichedComplaints.length}</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-md">
          <div className="text-xs font-black uppercase tracking-wider text-slate-500">Dopasowane do zadan</div>
          <div className="mt-2 text-3xl font-black text-emerald-700">{matchedCount}</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-md">
          <div className="text-xs font-black uppercase tracking-wider text-slate-500">Brak przypisanego zadania</div>
          <div className="mt-2 text-3xl font-black text-orange-600">{unmatchedRows.length}</div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <div className="rounded-xl border border-slate-200 bg-white shadow-md overflow-hidden">
          <div className="border-b p-4 text-sm font-black uppercase tracking-wider text-slate-900">Tydzien po tygodniu</div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-xs">
              <thead className="bg-slate-100 text-slate-600">
                <tr><th className="p-3">Tydzien</th><th className="p-3">Zakres</th><th className="p-3">Razem</th><th className="p-3">Dopasowane</th><th className="p-3">Brak zadania</th></tr>
              </thead>
              <tbody className="divide-y">
                {weeklyRows.map(row => (
                  <tr key={row.weekStart}><td className="p-3 font-black">{row.weekNumber}</td><td className="p-3">{row.weekStart} - {row.weekEnd}</td><td className="p-3 font-black">{row.total}</td><td className="p-3 text-emerald-700 font-bold">{row.matched}</td><td className="p-3 text-orange-600 font-bold">{row.unmatched}</td></tr>
                ))}
                {weeklyRows.length === 0 && <tr><td colSpan="5" className="p-6 text-center font-bold text-slate-400">Brak danych w zakresie.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white shadow-md overflow-hidden">
          <div className="border-b p-4 text-sm font-black uppercase tracking-wider text-slate-900">Podzial na klientow</div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-xs">
              <thead className="bg-slate-100 text-slate-600">
                <tr><th className="p-3">Klient</th><th className="p-3">Razem</th><th className="p-3">Dopasowane</th><th className="p-3">Brak zadania</th></tr>
              </thead>
              <tbody className="divide-y">
                {clientRows.slice(0, 15).map(row => (
                  <tr key={row.clientName}><td className="p-3 font-bold">{row.clientName}</td><td className="p-3 font-black">{row.total}</td><td className="p-3 text-emerald-700 font-bold">{row.matched}</td><td className="p-3 text-orange-600 font-bold">{row.unmatched}</td></tr>
                ))}
                {clientRows.length === 0 && <tr><td colSpan="4" className="p-6 text-center font-bold text-slate-400">Brak danych w zakresie.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white shadow-md overflow-hidden">
        <div className="border-b p-4 text-sm font-black uppercase tracking-wider text-slate-900">Podzial na technikow</div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-xs">
            <thead className="bg-slate-100 text-slate-600">
              <tr><th className="p-3">Technik</th><th className="p-3">Ilosc reklamacji</th><th className="p-3">Klienci</th></tr>
            </thead>
            <tbody className="divide-y">
              {technicianRows.slice(0, 20).map(row => (
                <tr key={row.technicianName}><td className="p-3 font-bold">{row.technicianName}</td><td className="p-3 font-black">{row.total}</td><td className="p-3 text-slate-500">{row.clients}</td></tr>
              ))}
              {technicianRows.length === 0 && <tr><td colSpan="3" className="p-6 text-center font-bold text-slate-400">Brak danych w zakresie.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded-xl border border-orange-200 bg-orange-50 shadow-md overflow-hidden">
        <div className="border-b border-orange-200 p-4 text-sm font-black uppercase tracking-wider text-orange-800">Brak przypisanego zadania</div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-xs">
            <thead className="bg-orange-100 text-orange-900">
              <tr><th className="p-3">Ticket ID</th><th className="p-3">Data</th><th className="p-3">Klient</th><th className="p-3">Kategoria</th><th className="p-3">Opis</th></tr>
            </thead>
            <tbody className="divide-y divide-orange-100 bg-white">
              {unmatchedRows.slice(0, 50).map(({ complaint }) => (
                <tr key={complaint.id}><td className="p-3 font-black">{complaint.ticket_id}</td><td className="p-3">{complaint.complaint_date}</td><td className="p-3">{complaint.client_name || 'Brak'}</td><td className="p-3">{complaint.category || 'Brak'}</td><td className="p-3 max-w-xl truncate">{complaint.description || 'Brak'}</td></tr>
              ))}
              {unmatchedRows.length === 0 && <tr><td colSpan="5" className="p-6 text-center font-bold text-slate-400">Wszystkie reklamacje w zakresie sa dopasowane do zadan.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
