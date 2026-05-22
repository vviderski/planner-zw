import { supabase } from '../supabaseClient'
import { getTaskEndDate, getTaskStartDate, getTaskTechnicianIds } from './taskUtils'

const getActorName = (currentUser) => (
  currentUser?.fullName
  || currentUser?.full_name
  || currentUser?.email
  || 'System'
)

const sameIds = (left, right) => {
  const leftSorted = [...new Set(left || [])].sort()
  const rightSorted = [...new Set(right || [])].sort()
  return leftSorted.length === rightSorted.length && leftSorted.every((id, index) => id === rightSorted[index])
}

export const getTechnicianNames = (ids, technicians) => {
  const names = (ids || [])
    .map(id => technicians.find(tech => tech.id === id)?.full_name)
    .filter(Boolean)
  return names.length ? names.join(', ') : 'Brak'
}

export const logTaskHistory = async ({ taskId, currentUser, action, details = '' }) => {
  if (!taskId || !action) return

  const { error } = await supabase.from('task_history').insert([{
    task_id: taskId,
    actor_id: currentUser?.id || null,
    actor_name: getActorName(currentUser),
    action,
    details,
  }])

  if (error) {
    console.warn('Nie zapisano historii kafelki:', error.message)
  }
}

export const getTaskChangeHistoryEntries = ({ before, after, technicians = [] }) => {
  if (!before || !after) return []

  const entries = []
  const beforeStart = getTaskStartDate(before)
  const beforeEnd = getTaskEndDate(before)
  const afterStart = after.start_date || beforeStart
  const afterEnd = after.end_date || afterStart
  const beforeTechIds = getTaskTechnicianIds(before)
  const afterTechIds = getTaskTechnicianIds(after)

  if (beforeStart !== afterStart || beforeEnd !== afterEnd) {
    entries.push({
      action: 'Zmiana daty',
      details: `${beforeStart} - ${beforeEnd} -> ${afterStart} - ${afterEnd}`,
    })
  }

  if (!sameIds(beforeTechIds, afterTechIds)) {
    entries.push({
      action: 'Zmiana techników',
      details: `${getTechnicianNames(beforeTechIds, technicians)} -> ${getTechnicianNames(afterTechIds, technicians)}`,
    })
  }

  if ((before.status || 'Do realizacji') !== (after.status || 'Do realizacji')) {
    entries.push({
      action: 'Zmiana statusu',
      details: `${before.status || 'Do realizacji'} -> ${after.status || 'Do realizacji'}`,
    })
  }

  const trackedFields = ['title', 'client_id', 'category_id', 'client_name', 'description', 'address', 'ticket_number', 'duration_hours']
  const hasGeneralEdit = trackedFields.some(field => String(before[field] ?? '') !== String(after[field] ?? ''))
  if (hasGeneralEdit) {
    entries.push({
      action: 'Edycja kafelki',
      details: 'Zmieniono dane kafelki.',
    })
  }

  return entries
}
