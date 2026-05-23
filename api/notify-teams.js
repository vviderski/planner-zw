/* global process */

const buildMapsUrl = (address) => {
  if (!address) return null
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}`
}

const buildServiceDeskUrl = (ticketNumber) => {
  if (!ticketNumber) return null
  return `https://servicedeskv5.exorigo-upos.pl/tickets/${encodeURIComponent(ticketNumber)}`
}

const getNotificationMeta = (notificationType) => {
  if (notificationType === 'reopened') {
    return {
      title: 'Zadanie wróciło do realizacji',
      color: 'Attention',
      actorLabel: 'Przywrócił',
    }
  }

  return {
    title: 'Zadanie zrealizowane',
    color: 'Good',
    actorLabel: 'Technik',
  }
}

const buildTeamsCard = ({ task, actorName, notificationType }) => {
  const meta = getNotificationMeta(notificationType)
  const mapsUrl = buildMapsUrl(task.address)
  const serviceDeskUrl = buildServiceDeskUrl(task.ticket_number)
  const facts = [
    { title: 'Klient', value: task.client_name || 'Brak' },
    { title: 'Lokalizacja', value: task.description || 'Brak' },
    { title: 'Zadanie', value: task.title || 'Brak nazwy' },
    { title: meta.actorLabel, value: actorName || task.technician_name || 'Brak' },
    { title: 'Data', value: task.end_date || task.start_date || 'Brak' },
    { title: 'Status', value: task.status || 'Brak' },
  ]

  if (task.ticket_number) facts.push({ title: 'SD', value: String(task.ticket_number) })
  if (task.address) facts.push({ title: 'Adres', value: task.address })

  const actions = []
  if (serviceDeskUrl) actions.push({ type: 'Action.OpenUrl', title: 'Otwórz SD', url: serviceDeskUrl })
  if (mapsUrl) actions.push({ type: 'Action.OpenUrl', title: 'Trasa Google Maps', url: mapsUrl })

  return {
    type: 'message',
    attachments: [
      {
        contentType: 'application/vnd.microsoft.card.adaptive',
        contentUrl: null,
        content: {
          $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
          type: 'AdaptiveCard',
          version: '1.2',
          body: [
            {
              type: 'TextBlock',
              text: meta.title,
              weight: 'Bolder',
              size: 'Large',
              color: meta.color,
            },
            {
              type: 'FactSet',
              facts,
            },
          ],
          actions,
        },
      },
    ],
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const webhookUrl = process.env.TEAMS_WEBHOOK_URL
  if (!webhookUrl) {
    return res.status(500).json({ error: 'Missing TEAMS_WEBHOOK_URL environment variable' })
  }

  const { task, completedBy, actorName, notificationType } = req.body || {}
  if (!task?.id) {
    return res.status(400).json({ error: 'Missing task payload' })
  }

  const teamsResponse = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(buildTeamsCard({ task, actorName: actorName || completedBy, notificationType })),
  })

  if (!teamsResponse.ok) {
    const responseText = await teamsResponse.text()
    return res.status(502).json({
      error: 'Teams webhook rejected notification',
      status: teamsResponse.status,
      details: responseText,
    })
  }

  return res.status(200).json({ ok: true })
}
