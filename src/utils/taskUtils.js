export const formatDateLocal = (dateObj) => {
  if (!dateObj) return ''
  const y = dateObj.getFullYear()
  const m = String(dateObj.getMonth() + 1).padStart(2, '0')
  const d = String(dateObj.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export const getTaskStartDate = (task) => task?.start_date?.split('T')[0] || ''

export const getTaskEndDate = (task) => (task?.end_date || task?.start_date || '').split('T')[0]

export const getTaskTechnicianIds = (task) => {
  if (!task) return []
  if (Array.isArray(task.technician_ids)) return task.technician_ids.filter(Boolean)
  if (Array.isArray(task.technik_ids)) return task.technik_ids.filter(Boolean)
  return task.technik_id ? [task.technik_id] : []
}

export const buildTechnicianPayload = (technicianIds) => {
  const uniqueIds = [...new Set((technicianIds || []).filter(Boolean))]
  return {
    technik_id: uniqueIds[0] || null,
    technician_ids: uniqueIds,
  }
}

export const getTechnicianLabel = (task, technicians) => {
  const ids = getTaskTechnicianIds(task)
  if (ids.length === 0) return 'Brak'

  const names = ids
    .map(id => technicians.find(tech => tech.id === id)?.full_name)
    .filter(Boolean)
    .map(name => name.split(' ')[0])

  return names.length > 0 ? names.join(', ') : 'Brak'
}

export const getTaskCardTitle = (task) => {
  const parts = []
  if (task?.client_name) parts.push(`[${task.client_name}]`)
  if (task?.description) parts.push(`[${task.description}]`)
  if (task?.title) parts.push(task.title)
  return parts.join(' ')
}

export const getTaskMutationErrorMessage = (error) => {
  const message = error?.message || ''

  if (message.includes('technician_ids')) {
    return 'Brakuje kolumny technician_ids w tabeli tasks. Uruchom plik supabase_add_technician_ids.sql w Supabase SQL Editor.'
  }

  return message || 'Nie udało się zapisać zlecenia.'
}
