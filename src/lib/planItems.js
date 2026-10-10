// How an exercise is measured: repetitions, time, or distance in meters.
// `label` heads the column the student sees; `perSet` names the coach's input
// ("<perSet> por serie"); `placeholder` is the example shown in that input.
export const EXERCISE_MODES = {
  reps: { optionLabel: 'Reps', label: 'Reps', perSet: 'Repeticiones', placeholder: '12' },
  time: { optionLabel: 'Tiempo', label: 'Tiempo', perSet: 'Tiempo', placeholder: '30s' },
  distance: { optionLabel: 'Metros', label: 'Metros', perSet: 'Metros', placeholder: '200' },
}

export function normalizeMode(mode) {
  return typeof mode === 'string' && Object.hasOwn(EXERCISE_MODES, mode) ? mode : 'reps'
}

// Distances are typed as a bare number ("200"); show them with their unit.
// Anything else the coach wrote ("1 km", "200m") is shown untouched.
export function formatModeValue(mode, value) {
  if (mode === 'distance' && /^\d+(?:[.,]\d+)?$/.test(String(value ?? '').trim())) {
    return `${String(value).trim()} m`
  }
  return value
}

export function resizeValues(values, count) {
  const next = (values || []).slice(0, count)
  while (next.length < count) next.push('')
  return next
}

export function emptyExercise() {
  return {
    type: 'exercise',
    exerciseId: '',
    name: '',
    imageUrl: null,
    mode: 'reps',
    sets: 1,
    values: [''],
    weights: [''],
    rests: [''],
    tempo: '',
    notes: '',
  }
}

export function emptyCircuitExercise(valueCount = 1) {
  return {
    exerciseId: '',
    name: '',
    imageUrl: null,
    mode: 'reps',
    values: resizeValues([], valueCount),
    weights: resizeValues([], valueCount),
    rests: resizeValues([], valueCount),
    tempo: '',
    notes: '',
  }
}

export function emptyCircuit() {
  return {
    type: 'circuit',
    name: '',
    rounds: 3,
    rest: '',
    notes: '',
    exercises: [emptyCircuitExercise(3)],
  }
}

export function repeatFirst(values) {
  return values.map(() => values[0])
}

function toWeightsArray(raw, count) {
  if (Array.isArray(raw.weights)) return resizeValues(raw.weights, count)
  if (raw.weight) return Array.from({ length: count }, () => raw.weight)
  return resizeValues([], count)
}

// Accepts both the current block shape and the older flat shape
// ({ exerciseId, name, imageUrl, sets, reps, weight, notes }) used before
// circuits / per-set reps existed, so old plans keep working.
export function normalizeItem(raw) {
  if (!raw) return emptyExercise()

  if (raw.type === 'circuit') {
    const rounds = Number(raw.rounds) || (raw.exercises?.[0]?.values?.length ?? 3)
    return {
      type: 'circuit',
      name: raw.name || '',
      rounds,
      rest: raw.rest || '',
      notes: raw.notes || '',
      exercises: (raw.exercises || []).map((ex) => ({
        exerciseId: ex.exerciseId || '',
        name: ex.name || '',
        imageUrl: ex.imageUrl ?? null,
        mode: normalizeMode(ex.mode),
        values: resizeValues(ex.values, rounds),
        weights: toWeightsArray(ex, rounds),
        rests: resizeValues(ex.rests, rounds),
        tempo: ex.tempo || '',
        notes: ex.notes || '',
      })),
    }
  }

  if (Array.isArray(raw.values)) {
    const sets = Number(raw.sets) || raw.values.length || 1
    return {
      type: 'exercise',
      exerciseId: raw.exerciseId || '',
      name: raw.name || '',
      imageUrl: raw.imageUrl ?? null,
      mode: normalizeMode(raw.mode),
      sets,
      values: resizeValues(raw.values, sets),
      weights: toWeightsArray(raw, sets),
      rests: resizeValues(raw.rests, sets),
      tempo: raw.tempo || '',
      notes: raw.notes || '',
    }
  }

  // Legacy shape from before this feature.
  const sets = Number(raw.sets) || 1
  return {
    type: 'exercise',
    exerciseId: raw.exerciseId || '',
    name: raw.name || '',
    imageUrl: raw.imageUrl ?? null,
    mode: 'reps',
    sets,
    values: Array.from({ length: sets }, () => raw.reps || ''),
    weights: Array.from({ length: sets }, () => raw.weight || ''),
    rests: Array.from({ length: sets }, () => ''),
    tempo: '',
    notes: raw.notes || '',
  }
}

export function countExercises(items) {
  return (items || []).reduce(
    (sum, block) => sum + (block?.type === 'circuit' ? (block.exercises?.length ?? 0) : 1),
    0,
  )
}
