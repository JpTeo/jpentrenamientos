import { todayIso } from './weekActivity'

// A challenge's deadline is a 'YYYY-MM-DD' string (or empty/null for none).
// It stays open through the whole end date.
export function isExpired(endDate) {
  return Boolean(endDate) && endDate < todayIso()
}

export function formatShortDate(iso) {
  if (!iso) return ''
  return new Intl.DateTimeFormat('es-AR', { day: 'numeric', month: 'short' }).format(
    new Date(`${iso}T12:00:00`),
  )
}

export function formatTimestampDate(ts) {
  if (!ts?.seconds) return ''
  return new Date(ts.seconds * 1000).toLocaleDateString('es-AR', {
    day: '2-digit',
    month: '2-digit',
  })
}

// A finished challenge is sent as 'pending' and only earns its points once the
// coach approves it. Completions saved before approvals existed have no
// status and count as approved.
export function isPending(completion) {
  return completion?.status === 'pending'
}

// Adds up points; anything still waiting for the coach's OK doesn't count.
export function totalPoints(completions) {
  return completions.reduce((sum, c) => sum + (isPending(c) ? 0 : Number(c.points) || 0), 0)
}

export function pointsLabel(points) {
  return `${points} ${Number(points) === 1 ? 'punto' : 'puntos'}`
}
