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

export const getMapsDirectionsUrl = (address) => {
  if (!address) return '#'
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}`
}

export const getIsoWeekNumber = (dateValue) => {
  const source = dateValue instanceof Date ? dateValue : new Date(`${dateValue}T12:00:00`)
  const date = new Date(Date.UTC(source.getFullYear(), source.getMonth(), source.getDate()))
  const dayNum = date.getUTCDay() || 7
  date.setUTCDate(date.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1))
  return Math.ceil((((date - yearStart) / 86400000) + 1) / 7)
}

export const getTaskMutationErrorMessage = (error) => {
  const message = error?.message || ''

  if (message.includes('technician_ids')) {
    return 'Brakuje kolumny technician_ids w tabeli tasks. Uruchom plik supabase_add_technician_ids.sql w Supabase SQL Editor.'
  }

  if (message.includes('address')) {
    return 'Brakuje kolumny address w tabeli tasks. Uruchom plik supabase_required_columns.sql w Supabase SQL Editor.'
  }

  if (message.includes('store_number') || message.includes('external_key')) {
    return 'Brakuje kolumn store_number/external_key w tabeli tasks. Uruchom plik supabase_add_import_update_fields.sql w Supabase SQL Editor.'
  }

  if (message.includes('tasks_status_check')) {
    return 'Status Anulowane nie jest jeszcze dopuszczony w bazie. Uruchom plik supabase_add_import_update_fields.sql w Supabase SQL Editor.'
  }

  return message || 'Nie udało się zapisać zlecenia.'
}
