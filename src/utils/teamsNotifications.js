import { getTaskEndDate, getTaskStartDate, getTaskTechnicianIds } from './taskUtils'

const getActorName = (currentUser) => (
  currentUser?.fullName
  || currentUser?.full_name
  || currentUser?.email
  || 'Technik'
)

export const getTechnicianFullNames = (task, technicians = []) => {
  const names = getTaskTechnicianIds(task)
    .map(id => technicians.find(tech => tech.id === id)?.full_name)
    .filter(Boolean)

  return names.join(', ')
}

export const notifyTeamsTaskCompleted = async ({ task, currentUser, technicians = [] }) => {
  if (!task?.id) return

  const response = await fetch('/api/notify-teams', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      completedBy: getActorName(currentUser),
      task: {
        id: task.id,
        title: task.title,
        client_name: task.client_name,
        description: task.description,
        address: task.address,
        ticket_number: task.ticket_number,
        start_date: getTaskStartDate(task),
        end_date: getTaskEndDate(task),
        technician_name: getTechnicianFullNames(task, technicians),
      },
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(errorText || 'Nie udało się wysłać powiadomienia Teams.')
  }
}
