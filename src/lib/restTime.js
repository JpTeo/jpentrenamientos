// Parses a free-form "descanso" field (e.g. "60s", "1 min 30 s", "90",
// `60"`) into a whole number of seconds, or null if it holds no usable
// duration. Used to trigger the rest countdown timer.
export function parseRestSeconds(raw) {
  if (raw == null) return null
  const str = String(raw).trim().toLowerCase()
  if (!str) return null

  let total = 0
  let matchedAny = false

  const minMatch = str.match(/(\d+(?:[.,]\d+)?)\s*(?:min|m(?![a-z]))/)
  if (minMatch) {
    total += parseFloat(minMatch[1].replace(',', '.')) * 60
    matchedAny = true
  }

  const secMatch = str.match(/(\d+(?:[.,]\d+)?)\s*(?:s|seg|segundos|")/)
  if (secMatch) {
    total += parseFloat(secMatch[1].replace(',', '.'))
    matchedAny = true
  }

  if (!matchedAny) {
    const bare = str.match(/^(\d+(?:[.,]\d+)?)$/)
    if (bare) {
      total = parseFloat(bare[1].replace(',', '.'))
      matchedAny = true
    }
  }

  if (!matchedAny) return null
  const seconds = Math.round(total)
  return seconds > 0 ? seconds : null
}

export function formatSeconds(totalSeconds) {
  const s = Math.max(0, Math.round(totalSeconds))
  const mm = String(Math.floor(s / 60)).padStart(2, '0')
  const ss = String(s % 60).padStart(2, '0')
  return `${mm}:${ss}`
}
