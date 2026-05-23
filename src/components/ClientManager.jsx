import { useState, useEffect, useRef } from 'react'
import { supabase } from '../supabaseClient'
import { createClient } from '@supabase/supabase-js'
import { Plus, Trash2, Edit2, Check, X, Building2, Tag, ChevronDown, ChevronUp, FolderPlus, Upload, Download, Eraser } from 'lucide-react'
import * as XLSX from 'xlsx'
import { buildTechnicianPayload, formatDateLocal, getTaskEndDate, getTaskMutationErrorMessage, getTaskStartDate, getTaskTechnicianIds } from '../utils/taskUtils'

const normalizeText = (value) => String(value || '')
  .toLowerCase()
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/\s+/g, ' ')
  .trim()

const slugify = (value) => normalizeText(value)
  .replace(/[^a-z0-9]+/g, '.')
  .replace(/^\.+|\.+$/g, '')
  || crypto.randomUUID()

const makeTemporaryPassword = () => {
  const bytes = new Uint8Array(12)
  crypto.getRandomValues(bytes)
  const token = Array.from(bytes, byte => byte.toString(36).padStart(2, '0')).join('').slice(0, 16)
  return `PlannerZW-${token}!`
}

const getMonthRange = () => {
  const now = new Date()
  return {
    start: formatDateLocal(new Date(now.getFullYear(), now.getMonth(), 1)),
    end: formatDateLocal(new Date(now.getFullYear(), now.getMonth() + 1, 0)),
  }
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
  if (!raw) return ''
  const isoDate = raw.match(/\d{4}-\d{2}-\d{2}/)?.[0]
  if (isoDate) return isoDate
  const parsed = new Date(raw)
  return Number.isNaN(parsed.getTime()) ? raw.split(' ')[0] : formatDateLocal(parsed)
}

const splitAssignees = (value) => String(value || '')
  .split(/[,;]+/)
  .map(name => name.trim().replace(/\s+/g, ' '))
  .filter(name => name && normalizeText(name) !== 'brak')

const getFirstValue = (row, keys) => {
  for (const key of keys) {
    const value = row[key]
    if (value !== undefined && value !== null && String(value).trim() !== '') return value
  }
  return ''
}

const normalizeStatus = (value) => {
  const status = normalizeText(value)
  if (['closed', 'done', 'resolved', 'zrealizowane', 'tak'].includes(status)) return 'Zrealizowane'
  if (['cancelled', 'canceled', 'anulowane', 'anulowany', 'rejected'].includes(status)) return 'Anulowane'
  return 'Do realizacji'
}

const buildExternalKey = ({ clientName, storeNumber, title }) => {
  const parts = [clientName, storeNumber, title].map(normalizeText).filter(Boolean)
  return parts.length >= 2 ? parts.join('|') : ''
}

const extractStoreNumber = (row, taskName) => {
  const explicit = String(getFirstValue(row, ['store number', 'shop number', 'numer sklepu', 'sklep', 'store', 'nr sklepu']) || '').trim()
  if (explicit) return explicit

  return String(taskName || '').match(/\b(?:sklep|store|nr)\s*[:#-]?\s*([a-z0-9-]{2,})\b/i)?.[1] || ''
}

const getTechnicianFullLabel = (task, technicians) => {
  const names = getTaskTechnicianIds(task)
    .map(id => technicians.find(tech => tech.id === id)?.full_name)
    .filter(Boolean)

  return names.length > 0 ? names.join(', ') : 'Brak'
}

export default function ClientManager() {
  const initialRange = getMonthRange()
  const [clients, setClients] = useState([])
  const [categories, setCategories] = useState([])
  const [tasks, setTasks] = useState([])
  const [technicians, setTechnicians] = useState([])
  const [expandedClients, setExpandedClients] = useState({})
  const [showAddFormForClient, setShowAddFormForClient] = useState({})

  const [newClientName, setNewClientName] = useState('')
  const [newCategoryNames, setNewCategoryNames] = useState({})
  const [newCategoryHours, setNewCategoryHours] = useState({})
  const [editingCategoryId, setEditingCategoryId] = useState(null)
  const [editCategoryName, setEditCategoryName] = useState('')
  const [editCategoryHours, setEditCategoryHours] = useState('')

  const [exportStartDate, setExportStartDate] = useState(initialRange.start)
  const [exportEndDate, setExportEndDate] = useState(initialRange.end)
  const [exportClientIds, setExportClientIds] = useState([])
  const [clearClientId, setClearClientId] = useState('')
  const [clearStartDate, setClearStartDate] = useState(initialRange.start)
  const [clearEndDate, setClearEndDate] = useState(initialRange.end)
  const [adminMessage, setAdminMessage] = useState('')
  const [importSummary, setImportSummary] = useState(null)
  const fileInputRef = useRef(null)

  useEffect(() => {
    fetchClients()
    fetchCategories()
    fetchTasks()
    fetchTechnicians()

    const clientsChannel = supabase
      .channel('clients-acc-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'clients' }, () => fetchClients())
      .subscribe()

    const categoriesChannel = supabase
      .channel('categories-acc-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'client_categories' }, () => fetchCategories())
      .subscribe()

    const tasksChannel = supabase
      .channel('client-admin-tasks-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, () => fetchTasks())
      .subscribe()

    const profilesChannel = supabase
      .channel('client-admin-profiles-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => fetchTechnicians())
      .subscribe()

    return () => {
      supabase.removeChannel(clientsChannel)
      supabase.removeChannel(categoriesChannel)
      supabase.removeChannel(tasksChannel)
      supabase.removeChannel(profilesChannel)
    }
  }, [])

  const fetchClients = async () => {
    const { data } = await supabase.from('clients').select('*').order('name', { ascending: true })
    if (data) setClients(data)
  }

  const fetchCategories = async () => {
    const { data } = await supabase.from('client_categories').select('*').order('name', { ascending: true })
    if (data) setCategories(data)
  }

  const fetchTasks = async () => {
    const { data } = await supabase.from('tasks').select('*')
    if (data) setTasks(data)
  }

  const fetchTechnicians = async () => {
    const { data } = await supabase.from('profiles').select('*').eq('role', 'technik').order('full_name', { ascending: true })
    if (data) setTechnicians(data)
  }

  const toggleClientExpand = (clientId) => {
    setExpandedClients(prev => ({ ...prev, [clientId]: !prev[clientId] }))
  }

  const toggleAddForm = (clientId, e) => {
    e.stopPropagation()
    setShowAddFormForClient(prev => ({ ...prev, [clientId]: !prev[clientId] }))
    if (!showAddFormForClient[clientId]) setExpandedClients(prev => ({ ...prev, [clientId]: true }))
  }

  const toggleExportClient = (clientId) => {
    setExportClientIds(prev => (
      prev.includes(clientId) ? prev.filter(id => id !== clientId) : [...prev, clientId]
    ))
  }

  const findClientForTask = (taskName, explicitClientName = '') => {
    const explicit = normalizeText(explicitClientName)
    if (explicit) {
      const exact = clients.find(client => normalizeText(client.name) === explicit)
      if (exact) return exact
    }

    const normalizedName = normalizeText(taskName)
    return [...clients]
      .sort((a, b) => String(b.name).length - String(a.name).length)
      .find(client => normalizedName.includes(normalizeText(client.name))) || null
  }

  const getRowsFromWorkbook = (workbook) => {
    const worksheet = workbook.Sheets[workbook.SheetNames[0]]
    const matrix = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '', raw: true })
    const headerIndex = matrix.findIndex(row => row.some(cell => {
      const header = normalizeText(cell)
      return ['task name', 'summary', 'zadanie', 'planner id', 'id servicedesk'].includes(header)
    }))
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

  const ensureTechnicians = async (names) => {
    const existing = [...technicians]
    const missingNames = [...new Set(names)]
      .filter(name => !existing.some(tech => normalizeText(tech.full_name) === normalizeText(name)))

    if (missingNames.length === 0) return existing

    const authClient = createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY)
    const newProfiles = []

    for (const [index, name] of missingNames.entries()) {
      const email = `technik.${slugify(name)}.${Date.now()}-${index}@example.com`
      const { data, error } = await authClient.auth.signUp({
        email,
        password: makeTemporaryPassword(),
        options: { data: { full_name: name } },
      })

      if (error) throw error
      if (!data?.user?.id) throw new Error(`Nie udało się utworzyć konta technika: ${name}`)

      newProfiles.push({
        id: data.user.id,
        full_name: name,
        role: 'technik',
      })
    }

    const { data, error } = await supabase.from('profiles').insert(newProfiles).select('*')
    if (error) throw error

    const nextTechnicians = [...existing, ...(data || newProfiles)]
    setTechnicians(nextTechnicians)
    return nextTechnicians
  }

  const handleScheduleImport = (e) => {
    const file = e.target.files[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = async (evt) => {
      try {
        setAdminMessage('')
        setImportSummary(null)
        const workbook = XLSX.read(evt.target.result, { type: 'binary', cellDates: true })
        const rows = getRowsFromWorkbook(workbook)
        const assigneeNames = rows.flatMap(row => splitAssignees(row.assignee || row['assigned to'] || row['assign to'] || row.technik))
        const nextTechnicians = await ensureTechnicians(assigneeNames)
        const { data: latestTasks, error: latestTasksError } = await supabase.from('tasks').select('*')
        if (latestTasksError) throw latestTasksError
        const sourceTasks = latestTasks || tasks

        const importedRows = rows.map(row => {
          const plannerId = Number(getFirstValue(row, ['planner id', 'planner_id', 'id kafelki']))
          const taskName = String(getFirstValue(row, ['task name', 'summary', 'zadanie', 'nazwa zadania']) || '').trim()
          const startDate = parseDateValue(getFirstValue(row, ['start', 'due date', 'fixed date', 'data']))
          const endDate = parseDateValue(getFirstValue(row, ['koniec', 'end', 'end date'])) || startDate
          if (!taskName || !startDate) return null

          const matchedClient = findClientForTask(taskName, row.client || row.klient)
          const assignedIds = splitAssignees(row.assignee || row['assigned to'] || row['assign to'] || row.technik)
            .map(name => nextTechnicians.find(tech => normalizeText(tech.full_name) === normalizeText(name))?.id)
            .filter(Boolean)
          const status = normalizeStatus(getFirstValue(row, ['status', 'zrealizowane']))
          const ticketNumber = String(getFirstValue(row, ['id (servicedesk)', 'id servicedesk', 'ticket number', 'numer zgloszenia', 'numer zgłoszenia', 'sd']) || taskName.match(/\b\d{6,}\b/)?.[0] || '').trim() || null
          const storeNumber = extractStoreNumber(row, taskName)
          const address = String(getFirstValue(row, ['address', 'adres', 'adres dojazdu', 'full address', 'location', 'lokalizacja']) || '').trim()
          const clientName = matchedClient ? matchedClient.name : String(row.client || row.klient || 'Brak')
          const externalKey = buildExternalKey({ clientName, storeNumber, title: taskName })

          return {
            plannerId: Number.isFinite(plannerId) ? plannerId : null,
            title: taskName,
            client_id: matchedClient ? matchedClient.id : null,
            client_name: clientName,
            start_date: startDate,
            end_date: endDate,
            status,
            description: String(getFirstValue(row, ['lokalizacja', 'miejscowosc', 'miejscowość']) || '').trim(),
            address,
            ticket_number: ticketNumber,
            store_number: storeNumber,
            external_key: externalKey,
            duration_hours: Number(getFirstValue(row, ['czasochłonnosc (h)', 'czasochlonnosc (h)', 'czasochlonnosc h', 'czasochłonność h', 'duration_hours', 'duration hours'])) || null,
            ...(assignedIds.length > 0 ? buildTechnicianPayload(assignedIds) : {}),
          }
        }).filter(Boolean)

        if (importedRows.length === 0) {
          alert('Nie znaleziono kafelek do importu.')
          return
        }

        const findMatchingTask = (row) => {
          if (row.plannerId) {
            const byPlannerId = sourceTasks.find(task => Number(task.id) === row.plannerId)
            if (byPlannerId) return { task: byPlannerId }
          }

          if (row.ticket_number) {
            const byTicket = sourceTasks.filter(task => normalizeText(task.ticket_number) === normalizeText(row.ticket_number))
            if (byTicket.length === 1) return { task: byTicket[0] }
            if (byTicket.length > 1) return { conflict: `kilka kafelek z numerem SD ${row.ticket_number}` }
          }

          if (row.external_key) {
            const byExternalKey = sourceTasks.filter(task => normalizeText(task.external_key) === normalizeText(row.external_key))
            if (byExternalKey.length === 1) return { task: byExternalKey[0] }
            if (byExternalKey.length > 1) return { conflict: `kilka kafelek dla klucza ${row.external_key}` }
          }

          const fallbackMatches = sourceTasks.filter(task => (
            normalizeText(task.client_name) === normalizeText(row.client_name)
            && normalizeText(task.title) === normalizeText(row.title)
            && (!row.store_number || normalizeText(task.store_number) === normalizeText(row.store_number))
          ))
          if (fallbackMatches.length === 1) return { task: fallbackMatches[0] }
          if (fallbackMatches.length > 1) return { conflict: `kilka podobnych kafelek: ${row.client_name} / ${row.title}` }

          return { task: null }
        }

        let insertedCount = 0
        let updatedCount = 0
        let skippedCount = 0
        const conflictMessages = []

        for (const row of importedRows) {
          const payload = { ...row }
          delete payload.plannerId
          const match = findMatchingTask(row)

          if (match.conflict) {
            skippedCount += 1
            conflictMessages.push({
              row: row.title,
              reason: match.conflict,
              client: row.client_name,
              ticket: row.ticket_number,
              store: row.store_number,
            })
            continue
          }

          if (match.task) {
            const updatePayload = {
              ...payload,
              description: payload.description || match.task.description || '',
              address: payload.address || match.task.address || '',
              ticket_number: payload.ticket_number || match.task.ticket_number || null,
              store_number: payload.store_number || match.task.store_number || '',
              external_key: payload.external_key || match.task.external_key || '',
              duration_hours: payload.duration_hours || match.task.duration_hours || null,
              ...(!payload.technician_ids ? buildTechnicianPayload(getTaskTechnicianIds(match.task)) : {}),
            }
            const { error } = await supabase.from('tasks').update(updatePayload).eq('id', match.task.id)
            if (error) throw error
            updatedCount += 1
          } else {
            const { error } = await supabase.from('tasks').insert([payload])
            if (error) throw error
            insertedCount += 1
          }
        }

        const summary = `Import zakończony. Dodano: ${insertedCount}. Zaktualizowano: ${updatedCount}. Pominięto: ${skippedCount}. Dodano nowych techników: ${Math.max(0, nextTechnicians.length - technicians.length)}.`
        alert(summary)
        setImportSummary({
          insertedCount,
          updatedCount,
          skippedCount,
          newTechniciansCount: Math.max(0, nextTechnicians.length - technicians.length),
          conflicts: conflictMessages,
        })
        fetchTasks()
        fetchTechnicians()
      } catch (error) {
        alert(getTaskMutationErrorMessage(error) || 'Błąd pliku Excel.')
      }
    }
    reader.readAsBinaryString(file)
    e.target.value = null
  }

  const handleExportToExcel = () => {
    const rangeStart = exportStartDate || initialRange.start
    const rangeEnd = exportEndDate || initialRange.end
    const filteredTasks = tasks
      .filter(t => getTaskStartDate(t) <= rangeEnd && getTaskEndDate(t) >= rangeStart)
      .filter(t => exportClientIds.length === 0 || exportClientIds.includes(Number(t.client_id)))

    const excelRows = filteredTasks.map(task => ({
      'Planner ID': task.id,
      'ID (ServiceDesk)': task.ticket_number || '',
      'Klient': task.client_name || 'Brak',
      'Numer sklepu': task.store_number || '',
      'Kategoria': categories.find(cat => cat.id === task.category_id)?.name || '',
      'Zadanie': task.title,
      'Lokalizacja': task.description || '',
      'Adres': task.address || '',
      'Technik': getTechnicianFullLabel(task, technicians),
      'Czasochłonność (h)': task.duration_hours || '',
      'Zrealizowane': task.status === 'Zrealizowane' ? 'Tak' : 'Nie',
      'Status': task.status || 'Do realizacji',
      'Start': getTaskStartDate(task),
      'Koniec': getTaskEndDate(task),
    }))

    const worksheet = XLSX.utils.json_to_sheet(excelRows)
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Harmonogram')
    XLSX.writeFile(workbook, `Harmonogram_${rangeStart}_${rangeEnd}.xlsx`)
  }

  const handleExportSkippedImportRows = () => {
    if (!importSummary?.conflicts?.length) return

    const excelRows = importSummary.conflicts.map(item => ({
      'Powód': item.reason,
      'Klient': item.client || '',
      'ID (ServiceDesk)': item.ticket || '',
      'Numer sklepu': item.store || '',
      'Zadanie': item.row || '',
    }))

    const worksheet = XLSX.utils.json_to_sheet(excelRows)
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Pominiete')
    XLSX.writeFile(workbook, `Pominiete_kafelki_${formatDateLocal(new Date())}.xlsx`)
  }

  const handleClearClientTasks = async () => {
    if (!clearClientId || !clearStartDate || !clearEndDate) {
      alert('Wybierz klienta i zakres dat.')
      return
    }

    const client = clients.find(item => item.id === Number(clearClientId))
    const tasksToDelete = tasks.filter(task => (
      Number(task.client_id) === Number(clearClientId)
      && getTaskStartDate(task) <= clearEndDate
      && getTaskEndDate(task) >= clearStartDate
    ))

    if (tasksToDelete.length === 0) {
      alert('Brak kafelek do usunięcia w tym zakresie.')
      return
    }

    const confirmed = window.confirm(`Usunąć ${tasksToDelete.length} kafelek klienta ${client?.name || ''} w zakresie ${clearStartDate} - ${clearEndDate}? Tej operacji nie da się cofnąć.`)
    if (!confirmed) return

    const { error } = await supabase.from('tasks').delete().in('id', tasksToDelete.map(task => task.id))
    if (error) {
      alert(getTaskMutationErrorMessage(error))
      return
    }

    setImportSummary(null)
    setAdminMessage(`Usunięto ${tasksToDelete.length} kafelek klienta ${client?.name || ''}.`)
    fetchTasks()
  }

  const handleAddClient = async (e) => {
    e.preventDefault()
    if (!newClientName.trim()) return
    const { error } = await supabase.from('clients').insert([{ name: newClientName.trim() }])
    if (!error) {
      setNewClientName('')
      fetchClients()
    }
  }

  const handleDeleteClient = async (id, name) => {
    if (!window.confirm(`Czy na pewno chcesz usunąć klienta ${name} i wszystkie jego przypisane kategorie?`)) return
    const { error } = await supabase.from('clients').delete().eq('id', id)
    if (!error) {
      fetchClients()
      fetchCategories()
    }
  }

  const handleAddCategory = async (e, clientId) => {
    e.preventDefault()
    const catName = newCategoryNames[clientId] || ''
    const catHours = newCategoryHours[clientId] || '8'
    if (!catName.trim()) return

    const { error } = await supabase.from('client_categories').insert([{
      client_id: clientId,
      name: catName.trim(),
      default_hours: Number(catHours) || 1,
    }])

    if (!error) {
      setNewCategoryNames({ ...newCategoryNames, [clientId]: '' })
      setNewCategoryHours({ ...newCategoryHours, [clientId]: '' })
      setShowAddFormForClient({ ...showAddFormForClient, [clientId]: false })
      fetchCategories()
    }
  }

  const handleDeleteCategory = async (id) => {
    if (!window.confirm('Usunąć tę kategorię rozliczeniową?')) return
    const { error } = await supabase.from('client_categories').delete().eq('id', id)
    if (!error) fetchCategories()
  }

  const startEditingCategory = (cat) => {
    setEditingCategoryId(cat.id)
    setEditCategoryName(cat.name)
    setEditCategoryHours(cat.default_hours.toString())
  }

  const cancelEditingCategory = () => {
    setEditingCategoryId(null)
    setEditCategoryName('')
    setEditCategoryHours('')
  }

  const handleUpdateCategory = async (id) => {
    if (!editCategoryName.trim()) return
    const { error } = await supabase.from('client_categories').update({
      name: editCategoryName.trim(),
      default_hours: Number(editCategoryHours) || 1,
    }).eq('id', id)

    if (!error) {
      setEditingCategoryId(null)
      fetchCategories()
    }
  }

  return (
    <div className="space-y-6">
      <div className="bg-white p-4 rounded-xl shadow-md border border-slate-200">
        <h2 className="text-2xl font-bold text-slate-900">Baza Klientów i Kategorii</h2>
        <p className="text-sm text-slate-500">Zarządzaj klientami, kategoriami oraz masowymi operacjami harmonogramu</p>
      </div>

      <div className="bg-white p-4 rounded-xl shadow-md border border-slate-200 space-y-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h3 className="text-sm font-black text-slate-900">Import / eksport / czyszczenie</h3>
            <p className="text-[11px] text-slate-500">Import dodaje nowe kafelki albo aktualizuje istniejące po Planner ID, numerze SD lub kluczu klient + numer sklepu + zadanie.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => fileInputRef.current.click()} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-lg shadow-sm flex items-center gap-1.5">
              <Upload size={14} />
              Importuj / aktualizuj XLS
            </button>
            <button type="button" onClick={handleExportToExcel} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-lg shadow-sm flex items-center gap-1.5">
              <Download size={14} />
              Eksportuj XLS
            </button>
          </div>
          <input type="file" ref={fileInputRef} accept=".xlsx, .xls, .csv" onChange={handleScheduleImport} className="hidden" />
        </div>

        {importSummary && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-950">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <div className="rounded-lg bg-white/80 p-2">
                <div className="text-[10px] font-black uppercase text-emerald-600">Dodano</div>
                <div className="text-xl font-black">{importSummary.insertedCount}</div>
              </div>
              <div className="rounded-lg bg-white/80 p-2">
                <div className="text-[10px] font-black uppercase text-emerald-600">Zaktualizowano</div>
                <div className="text-xl font-black">{importSummary.updatedCount}</div>
              </div>
              <div className="rounded-lg bg-white/80 p-2">
                <div className="text-[10px] font-black uppercase text-amber-600">Pominięto</div>
                <div className="text-xl font-black">{importSummary.skippedCount}</div>
              </div>
              <div className="rounded-lg bg-white/80 p-2">
                <div className="text-[10px] font-black uppercase text-emerald-600">Nowi technicy</div>
                <div className="text-xl font-black">{importSummary.newTechniciansCount}</div>
              </div>
            </div>
            {importSummary.conflicts.length > 0 && (
              <details className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-950">
                <summary className="cursor-pointer text-xs font-black uppercase tracking-wider">
                  <span>Do sprawdzenia: {importSummary.conflicts.length}</span>
                </summary>
                <button type="button" onClick={handleExportSkippedImportRows} className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-amber-600 px-3 py-2 text-xs font-black text-white hover:bg-amber-700">
                  <Download size={14} />
                  Eksportuj pominięte XLS
                </button>
                <div className="mt-3 max-h-64 overflow-y-auto rounded-lg border border-amber-100 bg-white">
                  <table className="w-full text-left text-xs">
                    <thead className="sticky top-0 bg-amber-100 text-[10px] uppercase text-amber-800">
                      <tr>
                        <th className="p-2">Powód</th>
                        <th className="p-2">Klient</th>
                        <th className="p-2">SD</th>
                        <th className="p-2">Sklep</th>
                        <th className="p-2">Zadanie</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-amber-100">
                      {importSummary.conflicts.map((item, index) => (
                        <tr key={`${item.reason}-${index}`}>
                          <td className="p-2 font-bold text-amber-900">{item.reason}</td>
                          <td className="p-2">{item.client || 'Brak'}</td>
                          <td className="p-2">{item.ticket || 'Brak'}</td>
                          <td className="p-2">{item.store || 'Brak'}</td>
                          <td className="p-2">{item.row || 'Brak'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            )}
          </div>
        )}

        {adminMessage && !importSummary && <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-800">{adminMessage}</div>}

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 border-t pt-4">
          <div className="space-y-3">
            <div className="text-[11px] font-black uppercase tracking-wider text-slate-500">Eksportuj zakres</div>
            <div className="flex flex-wrap gap-2">
              <label className="text-[11px] font-bold uppercase text-slate-500">
                Od
                <input type="date" value={exportStartDate} onChange={e => setExportStartDate(e.target.value)} className="block mt-1 border rounded-lg px-2 py-1.5 text-xs font-bold text-slate-700" />
              </label>
              <label className="text-[11px] font-bold uppercase text-slate-500">
                Do
                <input type="date" value={exportEndDate} onChange={e => setExportEndDate(e.target.value)} className="block mt-1 border rounded-lg px-2 py-1.5 text-xs font-bold text-slate-700" />
              </label>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => setExportClientIds([])} className={`px-3 py-1.5 rounded-lg text-xs font-bold border ${exportClientIds.length === 0 ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-700 border-slate-200'}`}>
                Wszyscy
              </button>
              {clients.map(client => (
                <label key={client.id} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border cursor-pointer ${exportClientIds.includes(client.id) ? 'bg-blue-50 text-blue-800 border-blue-200' : 'bg-white text-slate-700 border-slate-200'}`}>
                  <input type="checkbox" checked={exportClientIds.includes(client.id)} onChange={() => toggleExportClient(client.id)} className="h-3.5 w-3.5 rounded border-slate-300" />
                  <span>{client.name}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="space-y-3 rounded-xl border border-red-100 bg-red-50/40 p-3">
            <div className="text-[11px] font-black uppercase tracking-wider text-red-700">Wyczyść kafelki klienta</div>
            <div className="flex flex-wrap gap-2">
              <select value={clearClientId} onChange={e => setClearClientId(e.target.value)} className="border rounded-lg px-2 py-1.5 text-xs font-bold text-slate-700 bg-white">
                <option value="">Wybierz klienta</option>
                {clients.map(client => <option key={client.id} value={client.id}>{client.name}</option>)}
              </select>
              <input type="date" value={clearStartDate} onChange={e => setClearStartDate(e.target.value)} className="border rounded-lg px-2 py-1.5 text-xs font-bold text-slate-700 bg-white" />
              <input type="date" value={clearEndDate} onChange={e => setClearEndDate(e.target.value)} className="border rounded-lg px-2 py-1.5 text-xs font-bold text-slate-700 bg-white" />
              <button type="button" onClick={handleClearClientTasks} className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-bold text-xs rounded-lg shadow-sm flex items-center gap-1.5">
                <Eraser size={14} />
                Wyczyść
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white p-4 rounded-xl shadow-md border border-slate-200">
        <form onSubmit={handleAddClient} className="flex gap-3 max-w-md">
          <div className="relative flex-1">
            <Building2 className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              type="text"
              placeholder="Wpisz nazwę nowej sieci..."
              value={newClientName}
              onChange={(e) => setNewClientName(e.target.value)}
              className="pl-9 pr-3 py-2 w-full border rounded-lg text-sm bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500 transition outline-none font-semibold"
              required
            />
          </div>
          <button type="submit" className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm rounded-lg shadow-sm transition flex items-center gap-1.5 shrink-0">
            <Plus size={16} /> Dodaj sieć
          </button>
        </form>
      </div>

      <div className="bg-white rounded-xl shadow-md border border-slate-200 divide-y divide-slate-100 overflow-hidden">
        {clients.map((client) => {
          const clientCats = categories.filter((c) => c.client_id === client.id)
          const isExpanded = !!expandedClients[client.id]
          const isFormOpen = !!showAddFormForClient[client.id]

          return (
            <div key={client.id} className="w-full transition">
              <div onClick={() => toggleClientExpand(client.id)} className={`p-4 flex items-center justify-between cursor-pointer transition select-none ${isExpanded ? 'bg-slate-50/70 font-black' : 'hover:bg-slate-50/40'}`}>
                <div className="flex items-center space-x-3 truncate">
                  {isExpanded ? <ChevronUp size={18} className="text-slate-500" /> : <ChevronDown size={18} className="text-slate-400" />}
                  <Building2 size={18} className="text-blue-600 shrink-0" />
                  <span className="text-base text-slate-800 font-bold truncate">{client.name}</span>
                  <span className="text-xs bg-slate-200 text-slate-700 px-2 py-0.5 rounded-full font-black">{clientCats.length}</span>
                </div>

                <div className="flex items-center space-x-2">
                  <button onClick={(e) => toggleAddForm(client.id, e)} className={`px-3 py-1 rounded-lg text-xs font-bold transition flex items-center space-x-1 border ${isFormOpen ? 'bg-amber-100 border-amber-300 text-amber-800 hover:bg-amber-200' : 'bg-blue-50 border-blue-200 text-blue-700 hover:bg-blue-100'}`}>
                    <FolderPlus size={13} />
                    <span>{isFormOpen ? 'Zamknij' : 'Dodaj kat.'}</span>
                  </button>
                  <button onClick={(e) => { e.stopPropagation(); handleDeleteClient(client.id, client.name); }} className="p-1.5 text-slate-400 hover:text-red-600 rounded-lg hover:bg-red-50 transition" title="Usuń całą sieć">
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>

              {isExpanded && (
                <div className="bg-white px-6 pb-4 pt-2 border-t border-slate-50 space-y-3">
                  {isFormOpen && (
                    <form onSubmit={(e) => handleAddCategory(e, client.id)} className="bg-amber-50/50 p-3 rounded-lg border border-amber-200/60 flex flex-wrap items-center gap-3 animate-fadeIn mb-2">
                      <div className="flex-1 min-w-[180px]">
                        <input type="text" placeholder="Wpisz nazwę kategorii..." value={newCategoryNames[client.id] || ''} onChange={(e) => setNewCategoryNames({ ...newCategoryNames, [client.id]: e.target.value })} className="px-3 py-1.5 w-full border border-slate-300 rounded-lg text-xs bg-white font-medium outline-none focus:ring-2 focus:ring-blue-500" autoFocus required />
                      </div>
                      <div className="flex items-center space-x-1.5 text-xs text-slate-600">
                        <span>Czas domyślny:</span>
                        <input type="number" min="1" placeholder="8" value={newCategoryHours[client.id] || ''} onChange={(e) => setNewCategoryHours({ ...newCategoryHours, [client.id]: e.target.value })} className="w-14 px-2 py-1.5 border border-slate-300 rounded-lg text-center font-bold bg-white" />
                        <span>godz.</span>
                      </div>
                      <button type="submit" className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs rounded-lg shadow-sm transition">Zapisz i dodaj</button>
                    </form>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                    {clientCats.map((cat) => {
                      const isEditing = editingCategoryId === cat.id

                      return (
                        <div key={cat.id} className={`flex items-center justify-between p-2.5 rounded-xl border text-xs font-bold transition ${isEditing ? 'bg-blue-50 border-blue-400 shadow-sm' : 'bg-slate-50/50 border-slate-200 text-slate-700 hover:border-slate-300'}`}>
                          {isEditing ? (
                            <div className="flex items-center justify-between w-full">
                              <div className="flex items-center gap-1.5 flex-1 pr-2">
                                <Tag size={12} className="text-blue-600 shrink-0" />
                                <input type="text" value={editCategoryName} onChange={(e) => setEditCategoryName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') handleUpdateCategory(cat.id); if (e.key === 'Escape') cancelEditingCategory() }} className="px-2 py-1 border rounded bg-white font-bold text-xs w-full outline-none focus:ring-1 focus:ring-blue-500" autoFocus />
                              </div>
                              <div className="flex items-center gap-1 text-slate-500 font-normal mr-2 shrink-0">
                                <input type="number" min="1" value={editCategoryHours} onChange={(e) => setEditCategoryHours(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') handleUpdateCategory(cat.id); if (e.key === 'Escape') cancelEditingCategory() }} className="w-10 text-center border rounded font-bold bg-white p-0.5 text-xs text-slate-800" />
                                h
                              </div>
                              <div className="flex items-center space-x-1 shrink-0">
                                <button onClick={() => handleUpdateCategory(cat.id)} className="p-1 text-green-700 hover:bg-green-100 rounded-lg transition"><Check size={14} /></button>
                                <button onClick={cancelEditingCategory} className="p-1 text-slate-500 hover:bg-slate-200 rounded-lg transition"><X size={14} /></button>
                              </div>
                            </div>
                          ) : (
                            <>
                              <div className="flex items-center space-x-2 truncate">
                                <Tag size={12} className="text-slate-400 shrink-0" />
                                <span className="truncate text-slate-800">{cat.name}</span>
                                <span className="text-[10px] bg-white text-slate-500 border border-slate-200 px-1.5 py-0.5 rounded-md font-medium shrink-0">{cat.default_hours}h</span>
                              </div>
                              <div className="flex items-center space-x-1 ml-2 shrink-0 border-l border-slate-200 pl-1.5">
                                <button onClick={() => startEditingCategory(cat)} className="text-slate-400 hover:text-blue-600 p-1 rounded-md hover:bg-white transition" title="Edytuj"><Edit2 size={12} /></button>
                                <button onClick={() => handleDeleteCategory(cat.id)} className="text-slate-400 hover:text-red-600 p-1 rounded-md hover:bg-white transition" title="Usuń"><Trash2 size={12} /></button>
                              </div>
                            </>
                          )}
                        </div>
                      )
                    })}

                    {clientCats.length === 0 && !isFormOpen && <p className="text-xs text-slate-400 italic py-1 col-span-full">Brak kategorii. Kliknij przycisk „Dodaj kat.” na górze wiersza.</p>}
                  </div>
                </div>
              )}
            </div>
          )
        })}

        {clients.length === 0 && (
          <div className="text-center p-12 text-slate-400">Brak zdefiniowanych sieci w bazie. Dodaj pierwszą powyżej.</div>
        )}
      </div>
    </div>
  )
}
