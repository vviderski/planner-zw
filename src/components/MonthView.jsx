import { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'
import { Plus, Building2, ChevronLeft, ChevronRight, CalendarDays, Clock, MapPin } from 'lucide-react'
import TaskModal from './TaskModal'
import { buildTechnicianPayload, formatDateLocal, getIsoWeekNumber, getMapsDirectionsUrl, getTaskCardTitle, getTaskEndDate, getTaskMutationErrorMessage, getTaskStartDate, getTaskTechnicianIds, getTechnicianLabel } from '../utils/taskUtils'
import { getTaskChangeHistoryEntries, logTaskHistory } from '../utils/taskHistory'

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
  const [contextMenu, setContextMenu] = useState(null)

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
    const handleGlobalClick = () => setContextMenu(null)
    window.addEventListener('click', handleGlobalClick)
    return () => window.removeEventListener('click', handleGlobalClick)
  }, [])

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
      if (!result?.error) {
        const historyEntries = getTaskChangeHistoryEntries({ before: currentActiveTask, after: { ...currentActiveTask, ...updateData }, technicians })
        for (const entry of historyEntries) {
          await logTaskHistory({ taskId: currentActiveTask.id, currentUser, ...entry })
        }
      }
    } else {
      // Dodawanie nowego zlecenia
      const clientName = payload.client_id ? clients.find(c => Number(c.id) === payload.client_id)?.name : 'Brak'
      const insertData = userRole === 'technik'
        ? {
            title: payload.title,
            description: payload.description,
            address: payload.address,
            status: payload.status,
            start_date: payload.start_date,
            end_date: payload.end_date,
            client_name: 'Brak',
            technik_id: currentUser?.id || null,
            technician_ids: currentUser?.id ? [currentUser.id] : [],
          }
        : { ...payload, client_name: clientName }
      result = await supabase.from('tasks').insert([insertData]).select('id').single()
      if (!result?.error && result?.data?.id) {
        await logTaskHistory({ taskId: result.data.id, currentUser, action: 'Utworzenie kafelki', details: 'Dodano nową kafelkę.' })
      }
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

  const handleDuplicateTask = async (task) => {
    if (userRole === 'technik') return

    const { data, error } = await supabase.from('tasks').insert([{
      title: `${task.title || 'Zadanie'} (Kopia)`,
      client_id: task.client_id,
      category_id: task.category_id,
      ...buildTechnicianPayload(getTaskTechnicianIds(task)),
      start_date: task.start_date,
      end_date: task.end_date,
      client_name: task.client_name,
      description: task.description,
      address: task.address,
      ticket_number: task.ticket_number,
      duration_hours: task.duration_hours,
      status: task.status || 'Do realizacji',
    }]).select('id').single()

    if (error) {
      alert(getTaskMutationErrorMessage(error))
      return
    }

    if (data?.id) {
      await logTaskHistory({ taskId: data.id, currentUser, action: 'Utworzenie kafelki', details: `Zduplikowano z kafelki #${task.id}.` })
    }

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
    await logTaskHistory({
      taskId,
      currentUser,
      action: 'Zmiana daty',
      details: `${getTaskStartDate(task)} - ${getTaskEndDate(task)} -> ${formatDateLocal(newStart)} - ${formatDateLocal(newEnd)}`,
    })
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
    await logTaskHistory({
      taskId,
      currentUser,
      action: 'Zmiana daty',
      details: `${currentStart} - ${currentEnd} -> ${updateData.start_date || currentStart} - ${updateData.end_date || currentEnd}`,
    })
    fetchTasks()
  }

  const handleBoundaryDrop = async (direction, event) => {
    event.preventDefault()
    const payload = readDragPayload(event)
    if (!payload) return

    const targetDate = direction === 'previous'
      ? formatDateLocal(new Date(year, month, 0))
      : formatDateLocal(new Date(year, month + 1, 1))

    if (payload.action === 'resize-start') await handleResizeTaskDate(payload.taskId, 'start', targetDate)
    else if (payload.action === 'resize-end') await handleResizeTaskDate(payload.taskId, 'end', targetDate)
    else await handleMoveTaskDate(payload.taskId, targetDate)

    setCurrentDate(new Date(year, direction === 'previous' ? month - 1 : month + 1, 1))
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

    await logTaskHistory({
      taskId: task.id,
      currentUser,
      action: 'Zmiana statusu',
      details: `${task.status || 'Do realizacji'} -> ${checked ? 'Zrealizowane' : 'Do realizacji'}`,
    })
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

  const formatMonthDayLabel = (dateStr) => {
    const date = new Date(`${dateStr}T12:00:00`)
    return date.toLocaleDateString('pl-PL', { weekday: 'long', day: '2-digit', month: '2-digit' })
  }

  const getTechnicianTasksForDate = (dateStr) => tasks
    .filter(isTaskVisible)
    .filter(task => taskCoversDate(task, dateStr))
    .sort((a, b) => {
      if ((a.status === 'Zrealizowane') !== (b.status === 'Zrealizowane')) return a.status === 'Zrealizowane' ? 1 : -1
      return getTaskStartDate(a).localeCompare(getTaskStartDate(b)) || String(a.title || '').localeCompare(String(b.title || ''))
    })

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
        onContextMenu={e => {
          e.preventDefault()
          e.stopPropagation()
          if (userRole !== 'technik') setContextMenu({ x: e.clientX, y: e.clientY, task })
        }}
        className={`relative h-12 bg-blue-600 text-white text-xs px-2 py-1 shadow font-bold cursor-grab active:cursor-grabbing text-left hover:bg-blue-700 transition border-y border-blue-700 ${isDone ? 'bg-emerald-600 hover:bg-emerald-700 border-emerald-700' : ''} ${isStart ? 'rounded-l border-l ml-1' : '-ml-px'} ${isEnd ? 'rounded-r border-r mr-1' : '-mr-px'} ${!isStart && !isEnd ? 'rounded-none' : ''}`}
      >
        {isStart && userRole !== 'technik' && (
          <button
            type="button"
            draggable
            onDragStart={e => {
              e.stopPropagation()
              e.dataTransfer.setData('application/json', JSON.stringify({ taskId: task.id, action: 'resize-start' }))
              e.dataTransfer.setData('text/plain', task.id)
            }}
            onClick={e => e.stopPropagation()}
            title="Zmień datę rozpoczęcia"
            className="absolute left-0 top-0 h-full w-3 cursor-ew-resize rounded-l bg-white/10 hover:bg-white/30"
          />
        )}
        {isEnd && userRole !== 'technik' && (
          <button
            type="button"
            draggable
            onDragStart={e => {
              e.stopPropagation()
              e.dataTransfer.setData('application/json', JSON.stringify({ taskId: task.id, action: 'resize-end' }))
              e.dataTransfer.setData('text/plain', task.id)
            }}
            onClick={e => e.stopPropagation()}
            title="Zmień datę zakończenia"
            className="absolute right-0 top-0 h-full w-3 cursor-ew-resize rounded-r bg-white/10 hover:bg-white/30"
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
          {task.address && (
            <a
              href={getMapsDirectionsUrl(task.address)}
              target="_blank"
              rel="noreferrer"
              onClick={e => e.stopPropagation()}
              title="Wyznacz trasę w Google Maps"
              className="bg-white/90 hover:bg-white text-blue-800 px-2 py-0.5 rounded font-black text-[10px] tracking-wider transition shrink-0 shadow-sm flex items-center justify-center"
            >
              MAPA
            </a>
          )}
        </div>
      </div>
    )
  }

  const renderTechnicianMonthCard = (task) => {
    const isDone = task.status === 'Zrealizowane'
    const start = getTaskStartDate(task)
    const end = getTaskEndDate(task) || start

    return (
      <button
        key={task.id}
        type="button"
        onClick={(e) => handleOpenDetails(task, e)}
        className={`w-full rounded-xl border p-3 text-left shadow-sm transition ${isDone ? 'border-emerald-200 bg-emerald-50' : 'border-blue-200 bg-white active:bg-blue-50'}`}
      >
        <div className="flex items-start gap-3">
          <input
            type="checkbox"
            checked={isDone}
            onChange={e => handleToggleTaskDone(task, e.target.checked)}
            onClick={e => e.stopPropagation()}
            className="mt-1 h-5 w-5 rounded border-slate-300"
            title="Zrealizowane"
          />
          <div className="min-w-0 flex-1">
            <div className={`text-sm font-black leading-snug ${isDone ? 'text-emerald-900 line-through decoration-emerald-500/70' : 'text-slate-900'}`}>
              {getTaskCardTitle(task)}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] font-bold text-slate-500">
              <span className={`rounded-full px-2 py-0.5 ${isDone ? 'bg-emerald-100 text-emerald-800' : 'bg-blue-100 text-blue-800'}`}>
                {isDone ? 'Zrealizowane' : 'Do realizacji'}
              </span>
              {start !== end && <span className="rounded-full bg-slate-100 px-2 py-0.5">{start} - {end}</span>}
              {task.duration_hours && <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5"><Clock size={12} /> {task.duration_hours}h</span>}
              {task.description && <span className="inline-flex max-w-full items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5"><MapPin size={12} /> <span className="truncate">{task.description}</span></span>}
              {task.address && (
                <a href={getMapsDirectionsUrl(task.address)} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()} className="inline-flex items-center gap-1 rounded-full bg-blue-600 px-2 py-0.5 text-white">
                  <MapPin size={12} />
                  Trasa
                </a>
              )}
            </div>
          </div>
          {task.ticket_number && (
            <a
              href={`https://servicedeskv5.exorigo-upos.pl/tickets/${task.ticket_number}`}
              target="_blank"
              rel="noreferrer"
              onClick={e => e.stopPropagation()}
              className="rounded-lg bg-yellow-300 px-2 py-1 text-xs font-black text-slate-900"
            >
              SD
            </a>
          )}
        </div>
      </button>
    )
  }

  // Generowanie komórek kalendarza
  const firstDayStr = new Date(year, month, 1)
  const lastDayStr = new Date(year, month + 1, 0)
  let offset = firstDayStr.getDay()
  if (offset === 0) offset = 7
  offset -= 1
  const gridCells = []
  for (let i = 0; i < offset; i++) gridCells.push(new Date(year, month, i - offset + 1))
  for (let d = 1; d <= lastDayStr.getDate(); d++) gridCells.push(new Date(year, month, d))
  let nextMonthDay = 1
  while (gridCells.length % 7 !== 0) {
    gridCells.push(new Date(year, month + 1, nextMonthDay))
    nextMonthDay += 1
  }

  const weekRows = []
  for (let i = 0; i < gridCells.length; i += 7) {
    weekRows.push(gridCells.slice(i, i + 7))
  }

  const monthNames = ["Styczeń", "Luty", "Marzec", "Kwiecień", "Maj", "Czerwiec", "Lipiec", "Sierpień", "Wrzesień", "Październik", "Listopad", "Grudzień"]
  const monthDateStrings = gridCells.filter(day => day.getMonth() === month).map(day => formatDateLocal(day))

  if (userRole === 'technik') {
    const monthTasks = tasks
      .filter(isTaskVisible)
      .filter(task => getTaskStartDate(task) <= monthDateStrings[monthDateStrings.length - 1] && getTaskEndDate(task) >= monthDateStrings[0])
    const uniqueTasks = [...new Map(monthTasks.map(task => [task.id, task])).values()]
    const openTaskCount = uniqueTasks.filter(task => task.status !== 'Zrealizowane').length
    const todayStr = formatDateLocal(new Date())

    return (
      <div className="mx-auto max-w-3xl space-y-4 pb-20">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-blue-700">
                <CalendarDays size={15} />
                Mój kalendarz
              </div>
              <h2 className="mt-1 text-2xl font-black text-slate-900">{monthNames[month]} <span className="font-normal text-blue-600">{year}</span></h2>
              <p className="text-sm font-semibold text-slate-500">{uniqueTasks.length} zadań, {openTaskCount} do realizacji</p>
            </div>
            <button onClick={() => handleOpenCreateModal(todayStr)} className="rounded-xl bg-blue-600 px-3 py-2 text-sm font-black text-white shadow-sm active:bg-blue-700">
              + Dodaj
            </button>
          </div>
          <div className="mt-4 grid grid-cols-3 gap-2">
            <button type="button" onClick={() => setCurrentDate(new Date(year, month - 1, 1))} className="rounded-xl bg-slate-100 px-3 py-3 text-sm font-black text-slate-700 active:bg-slate-200"><ChevronLeft size={18} className="mx-auto" /></button>
            <button type="button" onClick={() => setCurrentDate(new Date())} className="rounded-xl bg-slate-100 px-3 py-3 text-sm font-black text-slate-700 active:bg-slate-200">Dzisiaj</button>
            <button type="button" onClick={() => setCurrentDate(new Date(year, month + 1, 1))} className="rounded-xl bg-slate-100 px-3 py-3 text-sm font-black text-slate-700 active:bg-slate-200"><ChevronRight size={18} className="mx-auto" /></button>
          </div>
        </div>

        <div className="grid grid-cols-7 gap-1 rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
          {["Pn", "Wt", "Śr", "Cz", "Pt", "Sb", "Nd"].map(day => <div key={day} className="py-1 text-center text-[10px] font-black uppercase text-slate-400">{day}</div>)}
          {gridCells.map((day) => {
            const dateStr = formatDateLocal(day)
            const dayTasks = getTechnicianTasksForDate(dateStr)
            const isToday = dateStr === todayStr
            const isCurrentMonth = day.getMonth() === month
            return (
              <button
                key={dateStr}
                type="button"
                onClick={() => handleOpenCreateModal(dateStr)}
                className={`aspect-square rounded-lg border text-center text-xs font-black ${isToday ? 'border-blue-500 bg-blue-50 text-blue-700' : isCurrentMonth ? 'border-slate-100 bg-white text-slate-600' : 'border-slate-100 bg-slate-50 text-slate-300'}`}
              >
                <span>{day.getDate()}</span>
                {dayTasks.length > 0 && <span className={`mx-auto mt-1 block h-1.5 w-1.5 rounded-full ${dayTasks.some(task => task.status !== 'Zrealizowane') ? 'bg-blue-600' : 'bg-emerald-500'}`} />}
              </button>
            )
          })}
        </div>

        <div className="space-y-3">
          {monthDateStrings.map(dateStr => {
            const dayTasks = getTechnicianTasksForDate(dateStr)
            const isToday = dateStr === todayStr

            return (
              <section key={dateStr} className={`rounded-2xl border bg-white p-3 shadow-sm ${isToday ? 'border-blue-300 ring-2 ring-blue-100' : 'border-slate-200'}`}>
                <div className="mb-3 flex items-center justify-between gap-2">
                  <div>
                    <h3 className={`text-sm font-black capitalize ${isToday ? 'text-blue-700' : 'text-slate-900'}`}>{formatMonthDayLabel(dateStr)}</h3>
                    <p className="text-[11px] font-bold text-slate-400">{dayTasks.length ? `${dayTasks.length} zad.` : 'Brak zadań'}</p>
                  </div>
                  <button type="button" onClick={() => handleOpenCreateModal(dateStr)} className="rounded-lg bg-slate-100 px-3 py-2 text-xs font-black text-slate-700 active:bg-slate-200">
                    <Plus size={14} />
                  </button>
                </div>
                <div className="space-y-2">
                  {dayTasks.length > 0 ? dayTasks.map(renderTechnicianMonthCard) : (
                    <button type="button" onClick={() => handleOpenCreateModal(dateStr)} className="w-full rounded-xl border border-dashed border-slate-200 bg-slate-50 px-3 py-4 text-center text-sm font-bold text-slate-400">
                      Dodaj własne zadanie
                    </button>
                  )}
                </div>
              </section>
            )
          })}
        </div>

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
        {/*
          <div className="bg-white p-4 rounded-xl shadow-md border border-slate-200 space-y-3 select-none">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <h4 className="text-sm font-black text-slate-900">Import / eksport harmonogramu</h4>
                <p className="text-[11px] text-slate-500">Eksport obejmuje zadania nachodzące na wybrany zakres dat.</p>
              </div>
              <div className="flex flex-wrap items-end gap-2">
                <label className="text-[11px] font-bold uppercase text-slate-500">
                  Od
                  <input type="date" value={exportStartDate} onChange={e => setExportStartDate(e.target.value)} className="block mt-1 border rounded-lg px-2 py-1.5 text-xs font-bold text-slate-700" />
                </label>
                <label className="text-[11px] font-bold uppercase text-slate-500">
                  Do
                  <input type="date" value={exportEndDate} onChange={e => setExportEndDate(e.target.value)} className="block mt-1 border rounded-lg px-2 py-1.5 text-xs font-bold text-slate-700" />
                </label>
                <button type="button" onClick={() => fileInputRef.current.click()} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-lg shadow-sm flex items-center gap-1.5">
                  <Upload size={14} />
                  <span>Importuj</span>
                </button>
                <button type="button" onClick={handleExportToExcel} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-lg shadow-sm flex items-center gap-1.5">
                  <Download size={14} />
                  <span>Eksportuj</span>
                </button>
              </div>
            </div>
            <div className="border-t pt-3">
              <div className="mb-2 text-[11px] font-black uppercase tracking-wider text-slate-500">Klienci do eksportu</div>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => setExportClientIds([])} className={`px-3 py-1.5 rounded-lg text-xs font-bold border ${exportClientIds.length === 0 ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-700 border-slate-200'}`}>
                  Wszyscy
                </button>
                {clients.map(client => (
                  <label key={client.id} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border cursor-pointer ${exportClientIds.includes(client.id) ? 'bg-blue-50 text-blue-800 border-blue-200' : 'bg-white text-slate-700 border-slate-200'}`}>
                    <input
                      type="checkbox"
                      checked={exportClientIds.includes(client.id)}
                      onChange={() => toggleExportClient(client.id)}
                      className="h-3.5 w-3.5 rounded border-slate-300"
                    />
                    <span>{client.name}</span>
                  </label>
                ))}
              </div>
            </div>
            <input type="file" ref={fileInputRef} accept=".xlsx, .xls, .csv" onChange={handleExcelImport} className="hidden" />
          </div>
        */}

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between bg-white p-4 rounded-xl shadow-md border border-slate-200 select-none">
          <div>
            <h2 className="text-2xl font-black text-slate-900">{monthNames[month]} <span className="text-blue-600 font-normal">{year}</span></h2>
            <p className="text-[11px] font-bold text-slate-500">
              Zalogowany: {currentUser?.fullName || currentUser?.email || 'Użytkownik'} · {userRole}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {userRole === 'pm' && <select value={activeTechFilterId} onChange={(e) => setActiveTechFilterId(e.target.value)} className="border rounded-lg px-2 py-1.5 text-xs font-bold text-slate-700 outline-none"><option value="">Wszyscy technicy</option>{technicians.map(t => <option key={t.id} value={t.id}>{t.full_name}</option>)}</select>}
            <div className="flex items-center space-x-1">
              <button type="button" onClick={() => setCurrentDate(new Date(year, month - 1, 1))} onDragOver={e => e.preventDefault()} onDrop={e => handleBoundaryDrop('previous', e)} className="p-2 bg-slate-100 rounded-lg">◀</button>
              <button type="button" onClick={() => setCurrentDate(new Date())} className="px-3 py-1.5 bg-slate-100 text-xs font-bold rounded-lg">Dzisiaj</button>
              <button type="button" onClick={() => setCurrentDate(new Date(year, month + 1, 1))} onDragOver={e => e.preventDefault()} onDrop={e => handleBoundaryDrop('next', e)} className="p-2 bg-slate-100 rounded-lg">▶</button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <div onDragOver={e => e.preventDefault()} onDrop={e => handleBoundaryDrop('previous', e)} className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-3 text-center text-xs font-black uppercase tracking-wider text-slate-500">
            Upuść tutaj, żeby przenieść lub rozszerzyć na poprzedni miesiąc
          </div>
          <div onDragOver={e => e.preventDefault()} onDrop={e => handleBoundaryDrop('next', e)} className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-3 text-center text-xs font-black uppercase tracking-wider text-slate-500">
            Upuść tutaj, żeby przenieść lub rozszerzyć na kolejny miesiąc
          </div>
        </div>

        {/* SIATKA KALENDARZA */}
        <div className="bg-white rounded-xl shadow-md border border-slate-200 overflow-x-auto">
          <div className="min-w-[920px]">
          <div className="grid grid-cols-[48px_repeat(7,minmax(0,1fr))] bg-slate-100 border-b text-center py-2 text-xs font-bold text-slate-600 uppercase select-none">
            <div className="text-slate-400">Tydz.</div>
            {["Pn", "Wt", "Śr", "Cz", "Pt", "Sb", "Nd"].map((d, i) => <div key={i} className={i >= 5 ? "text-red-500" : ""}>{d}</div>)}
          </div>

          <div className="divide-y bg-slate-50">
            {weekRows.map((weekDays, weekIdx) => {
              const weekDateStrings = weekDays.map(day => formatDateLocal(day))
              const lanes = buildWeekLanes(weekDateStrings)

              return (
                <div key={weekIdx} className="grid grid-cols-[48px_repeat(7,minmax(0,1fr))] divide-x bg-white">
                  <div className="flex min-h-[142px] items-start justify-center bg-slate-100/80 pt-2 text-xs font-black text-slate-500">
                    {getIsoWeekNumber(weekDays[0])}
                  </div>
                  {weekDays.map((day, idx) => {
                    const dateStr = formatDateLocal(day)
                    const isCurrentMonth = day.getMonth() === month

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
                        className={`group min-h-[142px] overflow-x-visible overflow-y-auto ${isCurrentMonth ? 'bg-white' : 'bg-slate-50'}`}
                      >
                        <div className="flex justify-between items-center p-1 h-6">
                          <span className={`text-xs font-bold ${isCurrentMonth ? 'text-slate-400' : 'text-slate-300'}`}>{day.getDate()}</span>
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
      {contextMenu && (
        <div className="fixed bg-white border shadow-xl rounded-lg py-1 z-50 min-w-[150px]" style={{ top: contextMenu.y, left: contextMenu.x }} onClick={e => e.stopPropagation()}>
          <button type="button" onClick={() => { handleDuplicateTask(contextMenu.task); setContextMenu(null); }} className="w-full text-left px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50">
            Zduplikuj
          </button>
          <button type="button" onClick={() => { handleDeleteModal(contextMenu.task.id); setContextMenu(null); }} className="w-full text-left px-4 py-2 text-xs font-bold text-red-600 hover:bg-red-50 border-t">
            Usuń
          </button>
        </div>
      )}

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
