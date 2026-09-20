import { resizeValues } from './planItems'
import { normalizeName } from './normalizeName'

export { normalizeName }

const DAY_RE = /^d[íi]a\b/i
const CIRCUIT_RE = /^circuito\b/i
const DASH_SETS_RE = /^(.*\S)\s+(\d+(?:-\d+){1,})\s*:?\s*$/
const X_SETS_RE = /^(.*\S)\s+(\d+)\s*[xX]\s*(\d+)\s*:?\s*$/

// Time-based exercises: an amount with a unit — seconds (30”, 30", 30s,
// 30 seg) or minutes (10 min) — optionally repeated (x3) or listed per round
// (30”-40”-50”). Quote characters are written as escapes so they survive
// editors that "smarten" or mangle punctuation.
const TIME_NUM = '\\d+(?:[.,]\\d+)?'
const TIME_MIN = 'min(?:utos?|s)?(?![a-wyz\\u00e1-\\u00fa])'
const TIME_SEC =
  "(?:(?:seg(?:undos?|s)?|s)(?![a-wyz\\u00e1-\\u00fa])|\\u201d|\\u201c|\\u2033|\"|''|\\u2019\\u2019)"
const TIME_TOKEN = `${TIME_NUM}\\s*(?:${TIME_MIN}|${TIME_SEC})`
const TIME_LINE_RE = new RegExp(
  `^(.*\\S)\\s+(${TIME_TOKEN}(?:\\s*-\\s*${TIME_TOKEN})*)\\s*(?:[xX\\u00d7]\\s*(\\d+))?\\s*:?\\s*$`,
  'i',
)
const TIME_TOKEN_RE = new RegExp(TIME_TOKEN, 'gi')

function formatTimeToken(token) {
  const amount = token.match(/\d+(?:[.,]\d+)?/)[0].replace(',', '.')
  return /min/i.test(token) ? `${amount} min` : `${amount}s`
}

// Pulls every "(...)" out of the line: they become the exercise's comment.
function extractNotes(line) {
  const notes = []
  const text = line
    .replace(/\(([^()]*)\)/g, (_, inner) => {
      if (inner.trim()) notes.push(inner.trim())
      return ' '
    })
    .replace(/\s+/g, ' ')
    .trim()
  return { text, notes: notes.join('. ') }
}

function parseExerciseLine(line) {
  const original = line.trim()
  const { text, notes } = extractNotes(original)
  if (!text) return { name: original, sets: 1, values: [''], mode: 'reps', notes: '', matched: false }

  const timeMatch = text.match(TIME_LINE_RE)
  if (timeMatch) {
    const tokens = timeMatch[2].match(TIME_TOKEN_RE).map(formatTimeToken)
    const repeat = Math.max(1, parseInt(timeMatch[3], 10) || 1)
    const values = tokens.length > 1 ? tokens : Array.from({ length: repeat }, () => tokens[0])
    return { name: timeMatch[1].trim(), sets: values.length, values, mode: 'time', notes, matched: true }
  }

  const dashMatch = text.match(DASH_SETS_RE)
  if (dashMatch) {
    const values = dashMatch[2].split('-').map((v) => v.trim())
    return { name: dashMatch[1].trim(), sets: values.length, values, mode: 'reps', notes, matched: true }
  }

  const xMatch = text.match(X_SETS_RE)
  if (xMatch) {
    const reps = xMatch[2]
    const sets = Math.max(1, parseInt(xMatch[3], 10) || 1)
    return {
      name: xMatch[1].trim(),
      sets,
      values: Array.from({ length: sets }, () => reps),
      mode: 'reps',
      notes,
      matched: true,
    }
  }

  return { name: text, sets: 1, values: [''], mode: 'reps', notes, matched: false }
}

// Parses free-form text describing one or more training days into an
// intermediate structure: [{ title, blocks }], where each block is either
// { type: 'circuit', name, exercises: [{ name, sets, values, matched }] }
// or { type: 'exercise', name, sets, values, matched }.
export function parsePlanText(text) {
  const lines = (text || '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)

  const days = []
  let currentDay = null
  let currentCircuit = null

  function ensureDay(title) {
    currentDay = { title, blocks: [] }
    days.push(currentDay)
    currentCircuit = null
  }

  for (const line of lines) {
    if (DAY_RE.test(line)) {
      ensureDay(line)
      continue
    }
    if (CIRCUIT_RE.test(line)) {
      if (!currentDay) ensureDay('Día 1')
      currentCircuit = { type: 'circuit', name: line, exercises: [] }
      currentDay.blocks.push(currentCircuit)
      continue
    }

    if (!currentDay) ensureDay('Día 1')
    const parsed = parseExerciseLine(line)
    if (currentCircuit) {
      currentCircuit.exercises.push(parsed)
    } else {
      currentDay.blocks.push({ type: 'exercise', ...parsed })
    }
  }

  return days
}

export function collectExerciseNames(days) {
  const names = new Set()
  for (const day of days) {
    for (const block of day.blocks) {
      if (block.type === 'circuit') {
        for (const ex of block.exercises) names.add(ex.name)
      } else {
        names.add(block.name)
      }
    }
  }
  return names
}

function resolveExercise(name, nameToExercise) {
  const found = nameToExercise.get(normalizeName(name))
  return {
    exerciseId: found?.id ?? null,
    name: found?.name ?? name,
    imageUrl: found?.imageUrl ?? null,
  }
}

// Builds Firestore-ready `items` for one parsed day, resolving each exercise
// name against nameToExercise (Map of normalizeName(name) -> { id, name, imageUrl }).
export function buildDayItems(day, nameToExercise) {
  return day.blocks.map((block) => {
    if (block.type === 'circuit') {
      const rounds = Math.max(1, ...block.exercises.map((ex) => ex.sets || 1))
      return {
        type: 'circuit',
        name: block.name || 'Circuito',
        rounds,
        rest: '',
        notes: '',
        exercises: block.exercises.map((ex) => {
          const resolved = resolveExercise(ex.name, nameToExercise)
          return {
            ...resolved,
            mode: ex.mode || 'reps',
            values: resizeValues(ex.values, rounds),
            weights: resizeValues([], rounds),
            rests: resizeValues([], rounds),
            tempo: '',
            notes: ex.notes || '',
          }
        }),
      }
    }

    const resolved = resolveExercise(block.name, nameToExercise)
    return {
      type: 'exercise',
      ...resolved,
      mode: block.mode || 'reps',
      sets: block.sets,
      values: block.values,
      weights: resizeValues([], block.sets),
      rests: resizeValues([], block.sets),
      tempo: '',
      notes: block.notes || '',
    }
  })
}
