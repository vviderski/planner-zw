import { useState } from 'react'
import { Search } from 'lucide-react'
import { getTaskEndDate, getTaskStartDate, getTaskTechnicianIds } from '../utils/taskUtils'

const normalizeText = (value) => String(value || '')
  .toLowerCase()
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/\s+/g, ' ')
  .trim()

const getTechnicianNames = (task, technicians) => {
  const names = getTaskTechnicianIds(task)
    .map(id => technicians.find(tech => tech.id === id)?.full_name)
    .filter(Boolean)

  return names.length > 0 ? names.join(', ') : 'Brak'
}

export default function TaskSearch({ tasks, technicians, currentUserId, userRole = 'pm', onSelectTask }) {
  const [query, setQuery] = useState('')
  const normalizedQuery = normalizeText(query)

  const searchableTasks = tasks.filter(task => {
    if (userRole === 'technik' && currentUserId && !getTaskTechnicianIds(task).includes(currentUserId)) return false
    return true
  })

  const results = normalizedQuery.length < 2
    ? []
    : searchableTasks
      .filter(task => {
        const technicianNames = getTechnicianNames(task, technicians)
        const haystack = normalizeText([
          task.ticket_number,
          task.client_name,
          task.title,
          task.description,
          task.address,
          task.store_number,
          task.status,
          getTaskStartDate(task),
          getTaskEndDate(task),
          technicianNames,
        ].join(' '))
        return haystack.includes(normalizedQuery)
      })
      .slice(0, 12)

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
      <label className="relative block">
        <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
        <input
          type="search"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Szukaj zadania, klienta, numeru SD, technika..."
          className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-sm font-semibold text-slate-800 outline-none transition focus:border-blue-400 focus:bg-white focus:ring-2 focus:ring-blue-100"
        />
      </label>

      {normalizedQuery.length >= 2 && (
        <div className="mt-3 overflow-hidden rounded-lg border border-slate-200">
          {results.length > 0 ? results.map(task => {
            const technicianNames = getTechnicianNames(task, technicians)
            const isDone = task.status === 'Zrealizowane'
            const isCancelled = task.status === 'Anulowane'
            return (
              <button
                key={task.id}
                type="button"
                onClick={() => onSelectTask?.(task)}
                className="grid w-full grid-cols-1 gap-1 border-b border-slate-100 bg-white p-3 text-left text-xs transition last:border-b-0 hover:bg-blue-50 md:grid-cols-[1.2fr_1fr_160px_120px]"
              >
                <div className="min-w-0">
                  <div className="truncate font-black text-slate-900">{task.client_name || 'Brak klienta'} · {task.title || 'Brak nazwy'}</div>
                  <div className="mt-0.5 truncate font-semibold text-slate-500">SD: {task.ticket_number || 'Brak'}{task.store_number ? ` · Sklep: ${task.store_number}` : ''}</div>
                </div>
                <div className="truncate font-bold text-slate-600">{technicianNames}</div>
                <div className="font-bold text-slate-500">{getTaskStartDate(task)} - {getTaskEndDate(task)}</div>
                <div>
                  <span className={`inline-flex rounded-full px-2 py-0.5 font-black ${isCancelled ? 'bg-slate-200 text-slate-700' : isDone ? 'bg-emerald-100 text-emerald-800' : 'bg-blue-100 text-blue-800'}`}>
                    {task.status || 'Do realizacji'}
                  </span>
                </div>
              </button>
            )
          }) : (
            <div className="bg-white p-3 text-xs font-bold text-slate-400">Brak wyników.</div>
          )}
        </div>
      )}
    </div>
  )
}
