import { normalizeName } from './normalizeName'

// A few common activities get a fixed color; anything else gets a stable
// color picked from the fallback pool by hashing its name, so the same
// custom activity always renders the same way everywhere.
const ACTIVITY_COLORS = {
  running: 'bg-orange-500',
  correr: 'bg-orange-500',
  bici: 'bg-sky-500',
  bicicleta: 'bg-sky-500',
  ciclismo: 'bg-sky-500',
  hiit: 'bg-rose-500',
  natacion: 'bg-cyan-500',
}
const FALLBACK_ACTIVITY_COLORS = [
  'bg-violet-500',
  'bg-amber-500',
  'bg-fuchsia-500',
  'bg-lime-500',
  'bg-teal-500',
  'bg-indigo-500',
]

export function colorForActivity(name) {
  const key = normalizeName(name)
  if (ACTIVITY_COLORS[key]) return ACTIVITY_COLORS[key]
  let hash = 0
  for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) >>> 0
  return FALLBACK_ACTIVITY_COLORS[hash % FALLBACK_ACTIVITY_COLORS.length]
}
