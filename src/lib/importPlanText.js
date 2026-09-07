import { resizeValues } from './planItems'
import { normalizeName } from './normalizeName'

export { normalizeName }

const DAY_RE = /^d[íi]a\b/i
const CIRCUIT_RE = /^circuito\b/i
const DASH_SETS_RE = /^(.*\S)\s+(\d+(?:-\d+){1,})\s*:?\s*$/
const X_SETS_RE = /^(.*\S)\s+(\d+)\s*[xX]\s*(\d+)\s*:?\s*$/

function parseExerciseLine(line) {
  const trimmed = line.trim()

  const dashMatch = trimmed.match(DASH_SETS_RE)
  if (dashMatch) {
    const values = dashMatch[2].split('-').map((v) => v.trim())
    return { name: dashMatch[1].trim(), sets: values.length, values, matched: true }
  }

  const xMatch = trimmed.match(X_SETS_RE)
  if (xMatch) {
    const reps = xMatch[2]
    const sets = Math.max(1, parseInt(xMatch[3], 10) || 1)
    return { name: xMatch[1].trim(), sets, values: Array.from({ length: sets }, () => reps), matched: true }
  }

  return { name: trimmed, sets: 1, values: [''], matched: false }
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
            mode: 'reps',
            values: resizeValues(ex.values, rounds),
            weights: resizeValues([], rounds),
            rests: resizeValues([], rounds),
            tempo: '',
            notes: '',
          }
        }),
      }
    }

    const resolved = resolveExercise(block.name, nameToExercise)
    return {
      type: 'exercise',
      ...resolved,
      mode: 'reps',
      sets: block.sets,
      values: block.values,
      weights: resizeValues([], block.sets),
      rests: resizeValues([], block.sets),
      tempo: '',
      notes: '',
    }
  })
}
