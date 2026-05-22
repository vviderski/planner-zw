import { useState, useEffect } from 'react'
import { MapPin, X } from 'lucide-react'
import { supabase } from '../supabaseClient'
import { buildTechnicianPayload, getMapsDirectionsUrl, getTaskTechnicianIds } from '../utils/taskUtils'

export default function TaskModal({ 
  isOpen, 
  onClose, 
  selectedTask, 
  userRole, 
  currentUserId,
  clients, 
  technicians, 
  clientCategories, 
  onSave, 
  onDelete 
}) {
  const [title, setTitle] = useState('')
  const [clientId, setClientId] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [selectedTechIds, setSelectedTechIds] = useState([])
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [description, setDescription] = useState('')
  const [address, setAddress] = useState('')
  const [ticketNumber, setTicketNumber] = useState('')
  const [durationHours, setDurationHours] = useState('')
  const [taskStatus, setTaskStatus] = useState('Do realizacji')
  const [history, setHistory] = useState([])

  const [filteredCategoriesForForm, setFilteredCategoriesForForm] = useState([])

  useEffect(() => {
    if (isOpen) {
      const isNewTechnicianTask = userRole === 'technik' && !selectedTask?.id
      setTitle(selectedTask?.title || '')
      setClientId(selectedTask?.client_id ? selectedTask.client_id.toString() : '')
      setCategoryId(selectedTask?.category_id ? selectedTask.category_id.toString() : '')
      setSelectedTechIds(isNewTechnicianTask && currentUserId ? [currentUserId] : getTaskTechnicianIds(selectedTask))
      setStartDate(selectedTask?.start_date ? selectedTask.start_date.split('T')[0] : '')
      setEndDate(selectedTask?.end_date ? selectedTask.end_date.split('T')[0] : (selectedTask?.start_date ? selectedTask.start_date.split('T')[0] : ''))
      setDescription(selectedTask?.description || '')
      setAddress(selectedTask?.address || '')
      setTicketNumber(selectedTask?.ticket_number || '')
      setDurationHours(selectedTask?.duration_hours ? selectedTask.duration_hours.toString() : '')
      setTaskStatus(selectedTask?.status || 'Do realizacji')
    }
  }, [isOpen, selectedTask, userRole, currentUserId])

  useEffect(() => {
    const fetchHistory = async () => {
      if (!isOpen || !selectedTask?.id) {
        setHistory([])
        return
      }

      const { data, error } = await supabase
        .from('task_history')
        .select('*')
        .eq('task_id', selectedTask.id)
        .order('created_at', { ascending: false })
        .limit(20)

      if (!error && data) setHistory(data)
      else setHistory([])
    }

    fetchHistory()
  }, [isOpen, selectedTask?.id])

  useEffect(() => {
    if (clientId && clientCategories) {
      setFilteredCategoriesForForm(clientCategories.filter(c => Number(c.client_id) === Number(clientId)))
    } else {
      setFilteredCategoriesForForm([])
    }
  }, [clientId, clientCategories])

  if (!isOpen) return null
  const isTechnician = userRole === 'technik'
  const isExistingTask = !!selectedTask?.id

  const toggleTechnician = (technicianId) => {
    setSelectedTechIds(prev => (
      prev.includes(technicianId)
        ? prev.filter(id => id !== technicianId)
        : [...prev, technicianId]
    ))
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    onSave({
      title,
      client_id: clientId ? Number(clientId) : null,
      category_id: categoryId ? Number(categoryId) : null,
      ...buildTechnicianPayload(selectedTechIds),
      start_date: startDate,
      end_date: endDate,
      description,
      address,
      ticket_number: ticketNumber.trim() || null,
      duration_hours: durationHours ? Number(durationHours) : null,
      status: taskStatus
    })
  }

  return (
    <div className="fixed inset-0 bg-slate-900/60 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md max-h-[92vh] overflow-y-auto p-6 space-y-4 relative">
        <button type="button" onClick={onClose} className="absolute top-4 right-4 text-slate-400 hover:text-slate-600"><X size={20} /></button>
        <h3 className="text-base font-black text-slate-900 border-b pb-2">{selectedTask?.id ? 'Karta szczegółów zlecenia' : 'Nowe zlecenie'}</h3>
        
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="bg-slate-100 p-3 rounded-lg border border-slate-200">
            <label className="flex items-center gap-2 text-xs font-black text-slate-700 uppercase">
              <input
                type="checkbox"
                checked={taskStatus === 'Zrealizowane'}
                onChange={e => setTaskStatus(e.target.checked ? 'Zrealizowane' : 'Do realizacji')}
                className="h-4 w-4 rounded border-slate-300"
              />
              <span>Zrealizowane</span>
            </label>
          </div>

          {userRole === 'technik' && selectedTask?.id ? (
            <div className="bg-blue-50 p-3 rounded-lg border border-blue-100 space-y-1.5 text-xs text-slate-700 font-medium">
              <p className="font-bold text-blue-800">📋 Szczegóły (Tylko odczyt):</p>
              <div><span className="text-slate-400">Temat:</span> {title}</div>
              <div><span className="text-slate-400">Numer SD:</span> #{ticketNumber || 'Brak'}</div>
              <div><span className="text-slate-400">Lokalizacja:</span> {description || 'Brak'}</div>
              <div><span className="text-slate-400">Adres:</span> {address || 'Brak'}</div>
              {address && (
                <a href={getMapsDirectionsUrl(address)} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-2 text-xs font-black text-white">
                  <MapPin size={14} />
                  Trasa Google Maps
                </a>
              )}
              <div><span className="text-slate-400">Termin:</span> {startDate} do {endDate}</div>
            </div>
          ) : (
            <div className="space-y-3">
              <div><label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">Nazwa zadania / Opis</label><input type="text" required value={title} onChange={e => setTitle(e.target.value)} className="w-full p-2 border rounded text-sm" /></div>
              {!isTechnician && (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div><label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">Klient</label><select value={clientId} onChange={e => setClientId(e.target.value)} className="w-full p-2 border bg-white rounded text-sm"><option value="">-- Brak --</option>{clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
                    <div><label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">Kategoria</label><select value={categoryId} onChange={e => setCategoryId(e.target.value)} disabled={!clientId} className="w-full p-2 border bg-white rounded text-sm"><option value="">-- Brak --</option>{filteredCategoriesForForm.map(cat => <option key={cat.id} value={cat.id}>{cat.name}</option>)}</select></div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div><label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">Numer ticketu SD</label><input type="text" value={ticketNumber} onChange={e => setTicketNumber(e.target.value)} className="w-full p-2 border rounded text-sm" /></div>
                    <div><label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">Czasochłonność (h)</label><input type="number" min="1" value={durationHours} onChange={e => setDurationHours(e.target.value)} className="w-full p-2 border rounded text-sm" /></div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                    <div><label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">Data rozpoczęcia</label><input type="date" required value={startDate} onChange={e => setStartDate(e.target.value)} className="w-full p-2 border bg-white rounded text-sm font-semibold" /></div>
                    <div><label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">Data zakończenia</label><input type="date" required min={startDate} value={endDate} onChange={e => setEndDate(e.target.value)} className="w-full p-2 border bg-white rounded text-sm font-semibold" /></div>
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">Przypisz techników</label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-32 overflow-y-auto border rounded p-2 bg-white">
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
                </>
              )}
              {isTechnician && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-slate-50 p-2.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-600">
                  <div>
                    <span className="block text-[11px] font-bold uppercase text-slate-500">Termin</span>
                    {startDate} do {endDate}
                  </div>
                  <div>
                    <span className="block text-[11px] font-bold uppercase text-slate-500">Przypisanie</span>
                    {isExistingTask ? 'Bez edycji' : 'Twoje zadanie'}
                  </div>
                </div>
              )}
              <div><label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">Miejscowość / Lokalizacja</label><input type="text" value={description} onChange={e => setDescription(e.target.value)} className="w-full p-2 border rounded text-sm" /></div>
              <div><label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">Adres dojazdu</label><input type="text" value={address} onChange={e => setAddress(e.target.value)} className="w-full p-2 border rounded text-sm" placeholder="Ulica, numer, miejscowość" /></div>
            </div>
          )}

          {selectedTask?.id && (
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <div className="mb-2 text-[11px] font-black uppercase tracking-wider text-slate-500">Historia kafelki</div>
              <div className="space-y-2">
                {history.length > 0 ? history.map(item => (
                  <div key={item.id} className="rounded border border-slate-200 bg-white p-2 text-xs text-slate-600">
                    <div className="font-black text-slate-800">{item.action}</div>
                    <div>{item.details || 'Brak szczegółów'}</div>
                    <div className="mt-1 text-[10px] font-bold text-slate-400">
                      {item.actor_name || 'System'} · {item.created_at ? new Date(item.created_at).toLocaleString('pl-PL') : ''}
                    </div>
                  </div>
                )) : (
                  <div className="text-xs font-semibold text-slate-400">Brak zapisanej historii.</div>
                )}
              </div>
            </div>
          )}

          <div className="flex justify-end space-x-2 pt-2 border-t">
            {selectedTask?.id && userRole !== 'technik' && <button type="button" onClick={() => onDelete(selectedTask.id)} className="mr-auto px-3 py-2 bg-red-50 text-red-600 rounded text-xs font-bold">Usuń</button>}
            <button type="submit" className="px-5 py-2 bg-blue-600 text-white font-bold rounded-lg text-xs">Zapisz</button>
          </div>
        </form>
      </div>
    </div>
  )
}
