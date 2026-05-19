import { useState, useEffect, useRef } from 'react'
import { supabase } from '../supabaseClient'
import { Plus, Building2, Download } from 'lucide-react'
import * as XLSX from 'xlsx'
import TaskModal from './TaskModal'
import { formatDateLocal, getTaskCardTitle, getTaskEndDate, getTaskMutationErrorMessage, getTaskStartDate, getTaskTechnicianIds, getTechnicianLabel } from '../utils/taskUtils'

export default function MonthView({ currentUser: authUser, currentUserRole = 'technik' }) {
  const [tasks, setTasks] = useState([])
  const [technicians, setTechnicians] = useState([])
  const [clients, setClients] = useState([])
  const [clientCategories, setClientCategories] = useState([])
  
  const [userRole, setUserRole] = useState(currentUserRole)
  const [currentUser, setCurrentUser] = useState(authUser ? {
    id: authUser.id,
    email: authUser.email,
    fullName: authUser.email,
    role: currentUserRole,
  } : null)
  const [selectedViewClientIds, setSelectedViewClientIds] = useState([])
  const [activeTechFilterId, setActiveTechFilterId] = useState('')

  // Obsługa Modalu
  const [modalOpen, setModalOpen] = useState(false)
  const [currentActiveTask, setCurrentActiveTask] = useState(null)

  const fileInputRef = useRef(null)
  const [currentDate, setCurrentDate] = useState(new Date())
  const year = currentDate.getFullYear()
  const month = currentDate.getMonth()

  useEffect(() => {
    fetchTasks()
    fetchTechnicians()
    fetchClients()
    fetchClientCategories()
    checkCurrentUser()
  }, [currentDate])

  useEffect(() => {
    setUserRole(currentUserRole)
    if (authUser) {
      setCurrentUser(prev => ({
        id: authUser.id,
        email: authUser.email,
        fullName: prev?.fullName || authUser.email,
        role: currentUserRole,
      }))
    }
  }, [authUser, currentUserRole])

  useEffect(() => {
    if (!currentUser?.id) return
    const savedClientIds = window.localStorage.getItem(`planner-zw-view-clients-${currentUser.id}`)
    if (!savedClientIds) return

    try {
      setSelectedViewClientIds(JSON.parse(savedClientIds))
    } catch {
      setSelectedViewClientIds([])
    }
  }, [currentUser?.id])

  useEffect(() => {
    if (!currentUser?.id) return
    window.localStorage.setItem(`planner-zw-view-clients-${currentUser.id}`, JSON.stringify(selectedViewClientIds))
  }, [currentUser?.id, selectedViewClientIds])

  const fetchTasks = async () => {
    const { data } = await supabase.from('tasks').select('*')
    if (data) setTasks(data)
  }

  const fetchTechnicians = async () => {
    const { data } = await supabase.from('profiles').select('*').eq('role', 'technik')
    if (data) setTechnicians(data)
  }

  const fetchClients = async () => {
    const { data } = await supabase.from('clients').select('*').order('name', { ascending: true })
    if (data) setClients(data)
  }

  const fetchClientCategories = async () => {
    const { data } = await supabase.from('client_categories').select('*').order('name', { ascending: true })
    if (data) setClientCategories(data)
  }

  const checkCurrentUser = async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (session?.user) {
      const { data } = await supabase.from('profiles').select('full_name, role').eq('id', session.user.id).single()
      setCurrentUser({
        id: session.user.id,
        email: session.user.email,
        fullName: data?.full_name || session.user.email,
        role: data?.role || 'pm',
      })
      if (data && data.role) setUserRole(data.role)
    }
  }

  const handleOpenCreateModal = (dateStr) => {
    setCurrentActiveTask({ start_date: dateStr, end_date: dateStr, status: 'Do realizacji' })
    setModalOpen(true)
  }

  const handleOpenDetails = (task, e) => {
    e.stopPropagation()
    setCurrentActiveTask(task)
    setModalOpen(true)
  }

  const handleSaveModal = async (payload) => {
    let result

    if (currentActiveTask?.id) {
      // Edycja obecnego zlecenia
      const updateData = userRole === 'technik' ? { status: payload.status } : payload
      result = await supabase.from('tasks').update(updateData).eq('id', currentActiveTask.id)
    } else {
      // Dodawanie nowego zlecenia
      const clientName = payload.client_id ? clients.find(c => Number(c.id) === payload.client_id)?.name : null
      const insertData = userRole === 'technik'
        ? {
            title: payload.title,
            description: payload.description,
            status: payload.status,
            start_date: payload.start_date,
            end_date: payload.end_date,
            technik_id: currentUser?.id || null,
            technician_ids: currentUser?.id ? [currentUser.id] : [],
          }
        : { ...payload, client_name: clientName }
      result = await supabase.from('tasks').insert([insertData])
    }

    if (result?.error) {
      alert(getTaskMutationErrorMessage(result.error))
      return
    }

    setModalOpen(false)
    setCurrentActiveTask(null)
    fetchTasks()
  }

  const handleDeleteModal = async (id) => {
    if (!window.confirm("Usunąć to zlecenie?")) return
    await supabase.from('tasks').delete().eq('id', id)
    setModalOpen(false)
    setCurrentActiveTask(null)
    fetchTasks()
  }

  // 🌍 NATYWNE, STABILNE PRZERZUCANIE DRAG & DROP HTML5
  const handleMoveTaskDate = async (taskId, newDate) => {
    if (userRole === 'technik') return
    const task = tasks.find(t => t.id === Number(taskId))
    if (!task) return

    const originalStart = new Date(task.start_date)
    const originalEnd = new Date(task.end_date || task.start_date)
    const diffDays = Math.ceil(Math.abs(originalEnd - originalStart) / (1000 * 60 * 60 * 24))

    const newStart = new Date(newDate)
    const newEnd = new Date(newDate)
    newEnd.setDate(newStart.getDate() + diffDays)

    const { error } = await supabase.from('tasks').update({ 
      start_date: formatDateLocal(newStart), 
      end_date: formatDateLocal(newEnd) 
    }).eq('id', taskId)
    if (error) {
      alert(getTaskMutationErrorMessage(error))
      return
    }
    fetchTasks()
  }

  const handleResizeTaskDate = async (taskId, edge, newDate) => {
    if (userRole === 'technik') return
    const task = tasks.find(t => t.id === Number(taskId))
    if (!task) return

    const currentStart = getTaskStartDate(task)
    const currentEnd = getTaskEndDate(task) || currentStart
    const updateData = edge === 'start'
      ? { start_date: newDate <= currentEnd ? newDate : currentEnd }
      : { end_date: newDate >= currentStart ? newDate : currentStart }

    const { error } = await supabase.from('tasks').update(updateData).eq('id', taskId)
    if (error) {
      alert(getTaskMutationErrorMessage(error))
      return
    }
    fetchTasks()
  }

  const handleToggleTaskDone = async (task, checked) => {
    const { error } = await supabase
      .from('tasks')
      .update({ status: checked ? 'Zrealizowane' : 'Do realizacji' })
      .eq('id', task.id)

    if (error) {
      alert(getTaskMutationErrorMessage(error))
      return
    }

    fetchTasks()
  }

  const readDragPayload = (event) => {
    try {
      const payload = JSON.parse(event.dataTransfer.getData('application/json'))
      if (payload?.taskId) return payload
    } catch {
      // Older cards still use text/plain; keep that path working.
    }

    const taskId = event.dataTransfer.getData('text/plain')
    return taskId ? { taskId, action: 'move' } : null
  }

  const isTaskVisible = (task) => {
    if (userRole === 'technik' && currentUser?.id && !getTaskTechnicianIds(task).includes(currentUser.id)) return false
    if (selectedViewClientIds.length > 0 && !selectedViewClientIds.includes(Number(task.client_id))) return false
    if (activeTechFilterId && !getTaskTechnicianIds(task).includes(activeTechFilterId)) return false
    return true
  }

  const taskCoversDate = (task, dateStr) => {
    const start = getTaskStartDate(task)
    const end = getTaskEndDate(task)
    return dateStr >= start && dateStr <= end
  }

  const taskOverlapsWeek = (task, weekDates) => {
    const visibleDates = weekDates.filter(Boolean)
    if (visibleDates.length === 0) return false
    const weekStart = visibleDates[0]
    const weekEnd = visibleDates[visibleDates.length - 1]
    return getTaskStartDate(task) <= weekEnd && getTaskEndDate(task) >= weekStart
  }

  const buildWeekLanes = (weekDates) => {
    const weekTasks = tasks
      .filter(isTaskVisible)
      .filter(task => taskOverlapsWeek(task, weekDates))
      .sort((a, b) => {
        const startDiff = getTaskStartDate(a).localeCompare(getTaskStartDate(b))
        if (startDiff !== 0) return startDiff
        return String(a.id).localeCompare(String(b.id))
      })

    const lanes = []
    weekTasks.forEach(task => {
      const lane = lanes.find(items => !items.some(item => (
        getTaskStartDate(task) <= getTaskEndDate(item) && getTaskEndDate(task) >= getTaskStartDate(item)
      )))

      if (lane) lane.push(task)
      else lanes.push([task])
    })

    return lanes
  }

  const toggleViewClient = (clientId) => {
    setSelectedViewClientIds(prev => (
      prev.includes(clientId)
        ? prev.filter(id => id !== clientId)
        : [...prev, clientId]
    ))
  }

  const renderMonthTaskCard = (task, dateStr) => {
    const cat = clientCategories.find(c => c.id === task.category_id)
    const start = getTaskStartDate(task)
    const end = getTaskEndDate(task) || start
    const isStart = start === dateStr
    const isEnd = end === dateStr
    const isDone = task.status === 'Zrealizowane'

    return (
      <div
        key={`${task.id}-${dateStr}`}
        draggable={userRole !== 'technik'}
        onDragStart={e => {
          e.dataTransfer.setData('application/json', JSON.stringify({ taskId: task.id, action: 'move' }))
          e.dataTransfer.setData('text/plain', task.id)
        }}
        onClick={(e) => handleOpenDetails(task, e)}
        className={`relative h-12 bg-blue-600 text-white text-xs px-2 py-1 shadow font-bold cursor-grab active:cursor-grabbing text-left hover:bg-blue-700 transition border-y border-blue-700 ${isDone ? 'bg-emerald-600 hover:bg-emerald-700 border-emerald-700' : ''} ${isStart ? 'rounded-l border-l ml-1' : '-ml-px'} ${isEnd ? 'rounded-r border-r mr-1' : '-mr-px'} ${!isStart && !isEnd ? 'rounded-none' : ''}`}
      >
        {isStart && userRole !== 'technik' && (
          <button
            type="button"
            draggable
            onDragStart={e => {
              e.stopPropagation()
              e.dataTransfer.setData('application/json', JSON.stringify({ taskId: task.id, action: 'resize-start' }))
            }}
            onClick={e => e.stopPropagation()}
            title="Zmień datę rozpoczęcia"
            className="absolute left-0 top-0 h-full w-2 cursor-ew-resize rounded-l bg-white/10 hover:bg-white/30"
          />
        )}
        {isEnd && userRole !== 'technik' && (
          <button
            type="button"
            draggable
            onDragStart={e => {
              e.stopPropagation()
              e.dataTransfer.setData('application/json', JSON.stringify({ taskId: task.id, action: 'resize-end' }))
            }}
            onClick={e => e.stopPropagation()}
            title="Zmień datę zakończenia"
            className="absolute right-0 top-0 h-full w-2 cursor-ew-resize rounded-r bg-white/10 hover:bg-white/30"
          />
        )}
        <div className="flex items-center gap-1.5">
          <input
            type="checkbox"
            checked={isDone}
            onChange={e => handleToggleTaskDone(task, e.target.checked)}
            onClick={e => e.stopPropagation()}
            className="h-3.5 w-3.5 rounded border-white/70"
            title="Zrealizowane"
          />
          <div className="truncate leading-5">{getTaskCardTitle(task)}</div>
        </div>
        <div className="flex items-center gap-1.5 text-[9px] font-normal opacity-95">
          {cat && <span className="bg-blue-700 px-1 rounded truncate max-w-[70px]">{cat.name}</span>}
          {task.duration_hours && <span className="bg-blue-800/60 px-1 rounded shrink-0">⏱️ {task.duration_hours}h</span>}
          <span className="bg-blue-800/60 px-1 rounded truncate max-w-[86px]">{getTechnicianLabel(task, technicians)}</span>
          {task.ticket_number && (
            <a
              href={`https://servicedeskv5.exorigo-upos.pl/tickets/${task.ticket_number}`}
              target="_blank"
              rel="noreferrer"
              onClick={e => e.stopPropagation()}
              title={`Otwórz zgłoszenie SD #${task.ticket_number}`}
              className="bg-yellow-400 hover:bg-yellow-300 text-slate-900 px-2 py-0.5 rounded font-black text-[10px] tracking-wider transition shrink-0 shadow-sm flex items-center justify-center border border-yellow-500/20"
            >
              SD
            </a>
          )}
        </div>
      </div>
    )
  }

  const handleExportToExcel = () => {
    const currentMonthStr = `${year}-${String(month + 1).padStart(2, '0')}`
    const filteredTasks = tasks.filter(t => t.start_date.includes(currentMonthStr)).filter(isTaskVisible)
    const excelRows = filteredTasks.map(t => ({
      'ID (ServiceDesk)': t.ticket_number || '',
      'Klient': t.client_name || 'Brak',
      'Zadanie': t.title,
      'Lokalizacja': t.description || '',
      'Czasochłonność (h)': t.duration_hours || '',
      'Status': t.status || 'Do realizacji',
      'Start': t.start_date,
      'Koniec': t.end_date
    }))
    const worksheet = XLSX.utils.json_to_sheet(excelRows)
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Harmonogram')
    XLSX.writeFile(workbook, `Harmonogram_${currentMonthStr}.xlsx`)
  }

  const handleExcelImport = (e) => {
    const file = e.target.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = async (evt) => {
      try {
        const bstr = evt.target.result
        const wb = XLSX.read(bstr, { type: 'binary', cellDates: true })
        const ws = wb.Sheets[wb.SheetNames[0]]
        const rawData = XLSX.utils.sheet_to_json(ws)
        const tasksToInsert = rawData.map(row => {
          let formattedDate = row['Fixed Date'] instanceof Date ? formatDateLocal(row['Fixed Date']) : row['Fixed Date'].toString().split(' ')[0]
          const matchedClient = clients.find(c => c.name.toLowerCase().trim() === (row['Client'] || '').toString().toLowerCase().trim())
          return {
            title: row['Summary'] || '', ticket_number: (row['ID'] || '').toString().trim() || null, start_date: formattedDate, end_date: formattedDate, status: 'Do realizacji',
            client_id: matchedClient ? matchedClient.id : null, client_name: matchedClient ? matchedClient.name : (row['Client'] || null), description: row['Location'] || '', technician_ids: []
          }
        })
        await supabase.from('tasks').insert(tasksToInsert)
        fetchTasks()
      } catch { alert('Błąd pliku Excel.') }
    }
    reader.readAsBinaryString(file)
    e.target.value = null
  }

  // Generowanie komórek kalendarza
  const firstDayStr = new Date(year, month, 1)
  const lastDayStr = new Date(year, month + 1, 0)
  let offset = firstDayStr.getDay()
  if (offset === 0) offset = 7
  offset -= 1
  const gridCells = []
  for (let i = 0; i < offset; i++) gridCells.push(null)
  for (let d = 1; d <= lastDayStr.getDate(); d++) gridCells.push(new Date(year, month, d))
  while (gridCells.length % 7 !== 0) gridCells.push(null)

  const weekRows = []
  for (let i = 0; i < gridCells.length; i += 7) {
    weekRows.push(gridCells.slice(i, i + 7))
  }

  const monthNames = ["Styczeń", "Luty", "Marzec", "Kwiecień", "Maj", "Czerwiec", "Lipiec", "Sierpień", "Wrzesień", "Październik", "Listopad", "Grudzień"]

  return (
    <div className="grid grid-cols-1 xl:grid-cols-5 gap-4 sm:gap-6 items-start font-sans min-w-0">
      
      {/* PANEL FILTRÓW BOCZNYCH */}
      {userRole === 'pm' && (
      <div className="bg-white rounded-xl shadow-md border border-slate-200 xl:col-span-1 overflow-hidden select-none">
        <div className="p-4 bg-slate-900 text-white flex items-center space-x-2">
          <Building2 size={16} className="text-blue-400" />
          <h3 className="font-black text-xs uppercase tracking-wider">Struktura projektów</h3>
        </div>
        <div className="p-2 space-y-1">
          <div className="px-3 py-2 text-[11px] font-black uppercase tracking-wider text-slate-500">
            Mój widok klientów
          </div>
          <button onClick={() => setSelectedViewClientIds([])} className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-bold transition ${selectedViewClientIds.length === 0 ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-700 hover:bg-slate-100'}`}>
            <span>Wszystkie zadania</span><span className="text-[10px] px-2 py-0.5 rounded bg-blue-700 text-white">{tasks.length}</span>
          </button>
          {clients.map(c => (
            <label key={c.id} className={`flex items-center gap-2 px-2.5 py-2 rounded-lg text-xs font-bold transition cursor-pointer ${selectedViewClientIds.includes(c.id) ? 'bg-blue-50 text-blue-800' : 'text-slate-700 hover:bg-slate-100'}`}>
              <input
                type="checkbox"
                checked={selectedViewClientIds.includes(c.id)}
                onChange={() => toggleViewClient(c.id)}
                className="h-4 w-4 rounded border-slate-300"
              />
              <span className="truncate">{c.name}</span>
            </label>
          ))}
        </div>
      </div>
      )}

      {/* KALENDARZ */}
      <div className={`${userRole === 'pm' ? 'xl:col-span-4' : 'xl:col-span-5'} space-y-4 min-w-0`}>
        {userRole !== 'technik' && (
          <div className="bg-white p-4 rounded-xl shadow-md border border-slate-200 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between select-none">
            <div>
              <h4 className="text-sm font-black text-slate-900">Masowe ładowanie zgłoszeń</h4>
              <p className="text-[11px] text-slate-500">Przerzuć kafelek metodą przeciągnij i upuść (Drag&Drop) na dowolną komórkę kalendarza.</p>
            </div>
            <button type="button" onClick={() => fileInputRef.current.click()} className="px-4 py-2 bg-emerald-600 text-white font-bold text-xs rounded-lg shadow-sm">Wgraj plik</button>
            <input type="file" ref={fileInputRef} accept=".xlsx, .xls, .csv" onChange={handleExcelImport} className="hidden" />
          </div>
        )}

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between bg-white p-4 rounded-xl shadow-md border border-slate-200 select-none">
          <div>
            <h2 className="text-2xl font-black text-slate-900">{monthNames[month]} <span className="text-blue-600 font-normal">{year}</span></h2>
            <p className="text-[11px] font-bold text-slate-500">
              Zalogowany: {currentUser?.fullName || currentUser?.email || 'Użytkownik'} · {userRole}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {userRole !== 'technik' && <button type="button" onClick={handleExportToExcel} className="px-3 py-1.5 border bg-blue-50 text-blue-700 font-bold text-xs rounded-lg flex items-center space-x-1.5"><Download size={14} /><span>Eksportuj</span></button>}
            {userRole === 'pm' && <select value={activeTechFilterId} onChange={(e) => setActiveTechFilterId(e.target.value)} className="border rounded-lg px-2 py-1.5 text-xs font-bold text-slate-700 outline-none"><option value="">Wszyscy technicy</option>{technicians.map(t => <option key={t.id} value={t.id}>{t.full_name}</option>)}</select>}
            <div className="flex items-center space-x-1">
              <button type="button" onClick={() => setCurrentDate(new Date(year, month - 1, 1))} className="p-2 bg-slate-100 rounded-lg">◀</button>
              <button type="button" onClick={() => setCurrentDate(new Date())} className="px-3 py-1.5 bg-slate-100 text-xs font-bold rounded-lg">Dzisiaj</button>
              <button type="button" onClick={() => setCurrentDate(new Date(year, month + 1, 1))} className="p-2 bg-slate-100 rounded-lg">▶</button>
            </div>
          </div>
        </div>

        {/* SIATKA KALENDARZA */}
        <div className="bg-white rounded-xl shadow-md border border-slate-200 overflow-x-auto">
          <div className="min-w-[860px]">
          <div className="grid grid-cols-7 bg-slate-100 border-b text-center py-2 text-xs font-bold text-slate-600 uppercase select-none">
            {["Pn", "Wt", "Śr", "Cz", "Pt", "Sb", "Nd"].map((d, i) => <div key={i} className={i >= 5 ? "text-red-500" : ""}>{d}</div>)}
          </div>

          <div className="divide-y bg-slate-50">
            {weekRows.map((weekDays, weekIdx) => {
              const weekDateStrings = weekDays.map(day => day ? formatDateLocal(day) : null)
              const lanes = buildWeekLanes(weekDateStrings)

              return (
                <div key={weekIdx} className="grid grid-cols-7 divide-x bg-white">
                  {weekDays.map((day, idx) => {
                    if (!day) return <div key={idx} className="min-h-[142px] bg-slate-100/40" />
                    const dateStr = formatDateLocal(day)

                    return (
                      <div
                        key={idx}
                        onDragOver={e => e.preventDefault()}
                        onDrop={e => {
                          const payload = readDragPayload(e)
                          if (!payload) return
                          if (payload.action === 'resize-start') handleResizeTaskDate(payload.taskId, 'start', dateStr)
                          else if (payload.action === 'resize-end') handleResizeTaskDate(payload.taskId, 'end', dateStr)
                          else handleMoveTaskDate(payload.taskId, dateStr)
                        }}
                        className="group min-h-[142px] overflow-x-visible overflow-y-auto bg-white"
                      >
                        <div className="flex justify-between items-center p-1 h-6">
                          <span className="text-xs font-bold text-slate-400">{day.getDate()}</span>
                          {userRole !== 'technik' && (
                            <button type="button" onClick={() => handleOpenCreateModal(dateStr)} className="opacity-0 group-hover:opacity-100 p-0.5 bg-blue-600 text-white rounded shadow-sm">
                              <Plus size={12} />
                            </button>
                          )}
                        </div>
                        <div className="pb-1">
                          {lanes.map((lane, laneIdx) => {
                            const task = lane.find(item => taskCoversDate(item, dateStr))
                            return (
                              <div key={laneIdx} className="h-[52px] mb-1">
                                {task ? renderMonthTaskCard(task, dateStr) : <div className="h-12" />}
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )
            })}
          </div>
          </div>
        </div>
      </div>

      {/* KOMPONENT MODALU ZEWNĘTRZNEGO */}
      <TaskModal 
        isOpen={modalOpen}
        onClose={() => { setModalOpen(false); setCurrentActiveTask(null); }}
        selectedTask={currentActiveTask}
        userRole={userRole}
        currentUserId={currentUser?.id}
        clients={clients}
        technicians={technicians}
        clientCategories={clientCategories}
        onSave={handleSaveModal}
        onDelete={handleDeleteModal}
      />
    </div>
  )
}
