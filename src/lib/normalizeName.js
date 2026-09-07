const COMBINING_MARKS_RE = new RegExp(
  '[' + String.fromCharCode(0x300) + '-' + String.fromCharCode(0x36f) + ']',
  'g',
)

export function normalizeName(s) {
  return (s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(COMBINING_MARKS_RE, '')
    .trim()
    .replace(/\s+/g, ' ')
}
