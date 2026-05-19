import { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'
import { Plus, X, Save, ChevronLeft, ChevronRight } from 'lucide-react'
import { buildTechnicianPayload, getTaskCardTitle, getTaskMutationErrorMessage, getTaskTechnicianIds } from '../utils/taskUtils'

export default function SchedulerView() {
  const [tasks, setTasks] = useState([])
  const [technicians, setTechnicians] = useState([])
  const [clients, setClients] = useState([])
  const [clientCategories, setClientCategories] = useState([])

  const [currentDate, setCurrentDate] = useState(new Date())

  const [showModal, setShowModal] = useState(false)
  const [selectedTask, setSelectedTask] = useState(null)
  const [contextMenu, setContextMenu] = useState(null)

  const [title, setTitle] = useState('')
  const [clientId, setClientId] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [selectedTechIds, setSelectedTechIds] = useState([])
  const [taskDate, setTaskDate] = useState('')
  const [description, setDescription] = useState('')
  const [ticketNumber, setTicketNumber] = useState('')
  const [durationHours, setDurationHours] = useState('')

  const [filteredCategoriesForForm, setFilteredCategoriesForForm] = useState([])

  const getWeekNumber = (d) => {
    const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
    const dayNum = date.getUTCDay() || 7
    date.setUTCDate(date.getUTCDate() + 4 - dayNum)
    const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1))
    return Math.ceil((((date - yearStart) / 86400000) + 1) / 7)
  }

  const getWeekDaysLocal = (baseDate) => {
    const current = new Date(baseDate)
    const day = current.getDay()
    const diff = current.getDate() - day + (day === 0 ? -6 : 1) 
    const monday = new Date(current.setDate(diff))
    
    const week = []
    for (let i = 0; i < 7; i++) {
      const d = new Date(monday)
      d.setDate(monday.getDate() + i)
      
      const year = d.getFullYear()
      const month = String(d.getMonth() + 1).padStart(2, '0')
      const dayStr = String(d.getDate()).padStart(2, '0')
      week.push(`${year}-${month}-${dayStr}`)
    }
    return week
  }
  
  const weekDays = getWeekDaysLocal(currentDate)
  const currentWeekNumber = getWeekNumber(currentDate)

  const isWeekend = (dateStr) => {
    const d = new Date(dateStr)
    const day = d.getDay()
    return day === 0 || day === 6
  }

  const handlePrevWeek = () => {
    const newDate = new Date(currentDate)
    newDate.setDate(currentDate.getDate() - 7)
    setCurrentDate(newDate)
  }

  const handleNextWeek = () => {
    const newDate = new Date(currentDate)
    newDate.setDate(currentDate.getDate() + 7)
    setCurrentDate(newDate)
  }

  useEffect(() => {
    fetchTasks()
    fetchTechnicians()
    fetchClients()
    fetchClientCategories()

    const tasksChannel = supabase
      .channel('workload-realtime-v5')
      .on('postgres_changes', { event: '*', scheme: 'public', table: 'tasks' }, () => fetchTasks())
      .subscribe()

    const handleGlobalClick = () => setContextMenu(null)
    window.addEventListener('click', handleGlobalClick)
    return () => { supabase.removeChannel(tasksChannel); window.removeEventListener('click', handleGlobalClick); }
  }, [])

  useEffect(() => {
    if (clientId) {
      setFilteredCategoriesForForm(clientCategories.filter(c => c.client_id === Number(clientId)))
    } else {
      setFilteredCategoriesForForm([])
      setCategoryId('')
      setDurationHours('')
    }
  }, [clientId, clientCategories])

  const handleCategoryChange = (catId) => {
    setCategoryId(catId)
    if (catId) {
      const selectedCat = clientCategories.find(c => c.id === Number(catId))
      if (selectedCat) setDurationHours(selectedCat.default_hours.toString())
    } else {
      setDurationHours('')
    }
  }

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

  // 🟢 WYWOŁYWANE PRZY KLIKNIĘCIU W KOMÓRKĘ SIATKI
  const handleOpenCreateModal = (dateStr, initialTechId = '') => {
    setTitle('')
    setClientId('')
    setCategoryId('')
    setTicketNumber('')
    setDurationHours('')
    setTaskDate(dateStr)
    setSelectedTechIds(initialTechId ? [initialTechId] : [])
    setShowModal(true)
  }

  const handleOpenDetails = (task) => {
    setSelectedTask(task)
    setTitle(task.title)
    setClientId(task.client_id ? task.client_id.toString() : '')
    setCategoryId(task.category_id ? task.category_id.toString() : '')
    setSelectedTechIds(getTaskTechnicianIds(task))
    setTaskDate(task.start_date.split('T')[0])
    setDescription(task.description || '')
    setTicketNumber(task.ticket_number || '')
    setDurationHours(task.duration_hours ? task.duration_hours.toString() : '')
  }

  const handleCreateTask = async (e) => {
    e.preventDefault()
    const { error } = await supabase.from('tasks').insert([
      {
        title, client_id: clientId ? Number(clientId) : null, category_id: categoryId ? Number(categoryId) : null,
        ...buildTechnicianPayload(selectedTechIds), start_date: taskDate, end_date: taskDate,
        client_name: clientId ? clients.find(c => c.id === Number(clientId))?.name : null, description,
        ticket_number: ticketNumber.trim() || null, duration_hours: durationHours ? Number(durationHours) : null
      }
    ])
    if (error) {
      alert(getTaskMutationErrorMessage(error))
      return
    }
    setShowModal(false)
    fetchTasks()
  }

  const handleUpdateTask = async (e) => {
    e.preventDefault()
    const { error } = await supabase.from('tasks').update({
      title, client_id: clientId ? Number(clientId) : null, category_id: categoryId ? Number(categoryId) : null,
      ...buildTechnicianPayload(selectedTechIds), start_date: taskDate, end_date: taskDate,
      client_name: clientId ? clients.find(c => c.id === Number(clientId))?.name : null, description,
      ticket_number: ticketNumber.trim() || null, duration_hours: durationHours ? Number(durationHours) : null
    }).eq('id', selectedTask.id)
    if (error) {
      alert(getTaskMutationErrorMessage(error))
      return
    }
    setSelectedTask(null)
    fetchTasks()
  }

  const handleDeleteTask = async (id) => {
    if (!window.confirm("Usunąć to zlecenie?")) return
    const { error } = await supabase.from('tasks').delete().eq('id', id)
    if (!error) { setSelectedTask(null); fetchTasks(); }
  }

  const handleDuplicateTask = async (task) => {
    const { error } = await supabase.from('tasks').insert([{
      title: task.title + ' (Kopia)', client_id: task.client_id, category_id: task.category_id, ...buildTechnicianPayload(getTaskTechnicianIds(task)), start_date: task.start_date, end_date: task.end_date, client_name: task.client_name, description: task.description, ticket_number: task.ticket_number, duration_hours: task.duration_hours
    }])
    if (error) {
      alert(getTaskMutationErrorMessage(error))
      return
    }
    fetchTasks()
  }

  const handleMoveTask = async (taskId, newTechId, newDate) => {
    const { error } = await supabase.from('tasks').update({ ...buildTechnicianPayload(newTechId === 'unassigned' ? [] : [newTechId]), start_date: newDate, end_date: newDate }).eq('id', taskId)
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

  const toggleTechnician = (technicianId) => {
    setSelectedTechIds(prev => (
      prev.includes(technicianId)
        ? prev.filter(id => id !== technicianId)
        : [...prev, technicianId]
    ))
  }

  const renderTaskCard = (task) => {
    const cat = clientCategories.find(c => c.id === task.category_id)
    const isDone = task.status === 'Zrealizowane'
    return (
      <div draggable onDragStart={e => e.dataTransfer.setData('text/plain', task.id)} onClick={(e) => { e.stopPropagation(); handleOpenDetails(task); }} onContextMenu={e => { e.preventDefault(); e.stopPropagation(); setContextMenu({ x: e.clientX, y: e.clientY, task }) }} className={`${isDone ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-blue-600 hover:bg-blue-700'} text-white text-xs p-2 rounded shadow font-bold cursor-grab active:cursor-grabbing text-left space-y-1.5 transition`}>
        <div className="flex items-center gap-1.5">
          <input
            type="checkbox"
            checked={isDone}
            onChange={e => handleToggleTaskDone(task, e.target.checked)}
            onClick={e => e.stopPropagation()}
            className="h-3.5 w-3.5 rounded border-white/70"
            title="Zrealizowane"
          />
          <div className="truncate">{getTaskCardTitle(task)}</div>
        </div>
        <div className="flex items-center gap-1.5 text-[9px] font-normal opacity-95">
          {cat && <span className="bg-blue-700 px-1 rounded truncate max-w-[70px]">{cat.name}</span>}
          {task.duration_hours && <span className="bg-blue-800/60 px-1 rounded shrink-0">⏱️ {task.duration_hours}h</span>}
          {task.ticket_number && (
            <a href={`https://servicedeskv5.exorigo-upos.pl/tickets/${task.ticket_number}`} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()} title={`Otwórz zgłoszenie SD #${task.ticket_number}`} className="bg-yellow-400 hover:bg-yellow-300 text-slate-900 px-2 py-0.5 rounded font-black text-[10px] tracking-wider transition shrink-0 shadow-sm flex items-center justify-center border border-yellow-500/20">
              SD
            </a>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-white p-4 rounded-xl shadow-md border border-slate-200">
        <div>
          <div className="flex items-center space-x-3">
            <h2 className="text-2xl font-bold text-slate-900">Obciążenie Tygodniowe</h2>
            <span className="px-2.5 py-0.5 bg-blue-100 text-blue-800 rounded-full text-xs font-black uppercase tracking-wider">
              Tydzień {currentWeekNumber}
            </span>
          </div>
          <p className="text-sm text-slate-500">Przełączaj tygodnie, aby planować obsadę z wyprzedzeniem</p>
        </div>
        
        <div className="flex items-center space-x-2 w-full sm:w-auto justify-end">
          <button onClick={handlePrevWeek} className="p-2 bg-slate-100 hover:bg-slate-200 rounded-lg text-slate-700 transition"><ChevronLeft size={18} /></button>
          <button onClick={() => setCurrentDate(new Date())} className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 rounded-lg text-sm font-bold text-slate-700 transition">Bieżący tydzień</button>
          <button onClick={handleNextWeek} className="p-2 bg-slate-100 hover:bg-slate-200 rounded-lg text-slate-700 transition"><ChevronRight size={18} /></button>
          <button onClick={() => handleOpenCreateModal(weekDays[0], '')} className="ml-2 px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-bold shadow-sm transition">
            + Nowe zadanie
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-md border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-100 border-b text-xs font-semibold uppercase">
                <th className="p-3 w-48 border-r text-slate-700">Obsada zespołu</th>
                {weekDays.map((d, i) => {
                  const isTodayStr = new Date().toISOString().split('T')[0] === d
                  const isEnd = isWeekend(d)
                  return (
                    <th key={i} className={`p-3 text-center border-r min-w-[130px] ${isTodayStr ? 'bg-blue-50 text-blue-700 font-black' : 'text-slate-600'} ${isEnd && !isTodayStr ? 'bg-slate-100 text-red-600 font-bold' : ''}`}>
                      {d} {isTodayStr && '📍'} {isEnd && '⛺'}
                    </th>
                  )
                })}
              </tr>
            </thead>
            <tbody className="divide-y text-sm">
              {/* RZĘDY TECHNIKÓW */}
              {technicians.map(tech => (
                <tr key={tech.id} className="hover:bg-slate-50/30 transition">
                  <td className="p-3 font-medium text-slate-900 bg-slate-50 border-r">{tech.full_name}</td>
                  {weekDays.map((dateStr, idx) => {
                    const task = tasks.find(t => getTaskTechnicianIds(t).includes(tech.id) && t.start_date.startsWith(dateStr))
                    const isEnd = isWeekend(dateStr)
                    return (
                      <td 
                        key={idx} 
                        onClick={() => { if(!task) handleOpenCreateModal(dateStr, tech.id) }} // KLIKNIĘCIE W TŁO KOMÓRKI OTWUERA MODAL
                        onDragOver={e => e.preventDefault()} 
                        onDrop={e => { e.stopPropagation(); const id = e.dataTransfer.getData('text/plain'); if(id) handleMoveTask(id, tech.id, dateStr) }} 
                        className={`p-2 border-r text-center h-24 transition duration-200 relative group cursor-pointer ${isEnd ? 'bg-slate-100/60' : 'bg-slate-50/5'} hover:bg-blue-50/40`}
                      >
                        {task ? renderTaskCard(task) : (
                          <div className="opacity-0 group-hover:opacity-100 absolute top-1 right-1 transition duration-150">
                            <span className="p-0.5 bg-blue-600 text-white rounded block"><Plus size={10}/></span>
                          </div>
                        )}
                      </td>
                    )
                  })}
                </tr>
              ))}
              
              {/* RZĄD: NIEPRZYPISANE ZADANIA */}
              <tr className="bg-orange-50/50 border-t-2 border-slate-300">
                <td className="p-3 font-black text-orange-700 bg-orange-100/60 border-r">⚠️ Nieprzypisane</td>
                {weekDays.map((dateStr, idx) => {
                  const dayUnassignedTasks = tasks.filter(t => getTaskTechnicianIds(t).length === 0 && t.start_date.startsWith(dateStr))
                  const isEnd = isWeekend(dateStr)
                  return (
                    <td 
                      key={idx} 
                      onClick={() => handleOpenCreateModal(dateStr, '')} // KLIKNIĘCIE W TŁO NIEPRZYPISANYCH
                      onDragOver={e => e.preventDefault()} 
                      onDrop={e => { e.stopPropagation(); const id = e.dataTransfer.getData('text/plain'); if(id) handleMoveTask(id, 'unassigned', dateStr) }} 
                      className={`p-2 border-r text-center h-24 vertical-align-top relative group cursor-pointer ${isEnd ? 'bg-orange-100/20' : 'bg-orange-50/10'} hover:bg-orange-100/40`}
                    >
                      <div className="space-y-1 h-full overflow-y-auto">
                        {dayUnassignedTasks.map(task => renderTaskCard(task))}
                        {dayUnassignedTasks.length === 0 && (
                          <div className="opacity-0 group-hover:opacity-100 absolute top-1 right-1 transition duration-150">
                            <span className="p-0.5 bg-orange-600 text-white rounded block"><Plus size={10}/></span>
                          </div>
                        )}
                      </div>
                    </td>
                  )
                })}
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {contextMenu && (
        <div className="fixed bg-white border shadow-xl rounded-lg py-1 z-50 min-w-[150px]" style={{ top: contextMenu.y, left: contextMenu.x }} onClick={e => e.stopPropagation()}>
          <button onClick={() => { handleDuplicateTask(contextMenu.task); setContextMenu(null); }} className="w-full text-left px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 flex items-center space-x-2"><span>Zduplikuj</span></button>
          <button onClick={() => { handleDeleteTask(contextMenu.task.id); setContextMenu(null); }} className="w-full text-left px-4 py-2 text-xs font-bold text-red-600 hover:bg-red-50 flex items-center space-x-2 border-t"><span>Usuń</span></button>
        </div>
      )}

      {/* FORMULARZ MODALU */}
      {(showModal || selectedTask) ? (
        <div className="fixed inset-0 bg-slate-900/60 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 space-y-4 relative">
            <button onClick={() => { setShowModal(false); setSelectedTask(null); }} className="absolute top-4 right-4 text-slate-400"><X size={20} /></button>
            <h3 className="text-base font-black text-slate-900 border-b pb-2">{selectedTask ? 'Modyfikacja zlecenia' : 'Nowe zlecenie'}</h3>
            <form onSubmit={selectedTask ? handleUpdateTask : handleCreateTask} className="space-y-3">
              <div><label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">Nazwa zadania / System</label><input type="text" required value={title} onChange={e => setTitle(e.target.value)} className="w-full p-2 border rounded text-sm" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">Klient</label>
                  <select value={clientId} onChange={e => { setClientId(e.target.value); setCategoryId(''); setDurationHours(''); }} className="w-full p-2 border bg-white rounded text-sm"><option value="">-- Brak --</option>{clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">Kategoria</label>
                  <select value={categoryId} onChange={e => handleCategoryChange(e.target.value)} disabled={!clientId} className="w-full p-2 border bg-white rounded text-sm">{filteredCategoriesForForm.map(cat => <option key={cat.id} value={cat.id}>{cat.name}</option>)}</select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">Numer ticketu SD</label><input type="text" value={ticketNumber} onChange={e => setTicketNumber(e.target.value)} className="w-full p-2 border rounded text-sm" placeholder="np. 5053052" /></div>
                <div><label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">Czasochłonność (h)</label><input type="number" min="1" value={durationHours} onChange={e => setDurationHours(e.target.value)} className="w-full p-2 border rounded text-sm" /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">Data</label><input type="date" required value={taskDate} onChange={e => setTaskDate(e.target.value)} className="w-full p-2 border rounded text-sm" /></div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">Przypisz techników</label>
                  <div className="grid grid-cols-1 gap-1 max-h-24 overflow-y-auto border rounded p-2 bg-white">
                    {technicians.map(t => (
                      <label key={t.id} className="flex items-center gap-2 text-xs font-semibold text-slate-700">
                        <input
                          type="checkbox"
                          checked={selectedTechIds.includes(t.id)}
                          onChange={() => toggleTechnician(t.id)}
                          className="h-4 w-4 rounded border-slate-300"
                        />
                        <span className="truncate">{t.full_name}</span>
                      </label>
                    ))}
                    {technicians.length === 0 && <span className="text-xs text-slate-400">Brak techników w bazie.</span>}
                  </div>
                </div>
              </div>
              <div><label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">Uwagi</label><textarea value={description} onChange={e => setDescription(e.target.value)} rows="2" className="w-full p-2 border rounded text-sm" /></div>
              <div className="flex justify-end space-x-2 pt-2 border-t">
                {selectedTask && <button type="button" onClick={() => handleDeleteTask(selectedTask.id)} className="mr-auto px-3 py-2 bg-red-50 text-red-600 rounded text-xs font-bold">Usuń</button>}
                <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded text-xs font-bold"><Save size={14} /> <span>Zapisz</span></button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  )
}
