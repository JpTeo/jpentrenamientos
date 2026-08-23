import { useState } from 'react'
import {
  emptyExercise,
  emptyCircuit,
  emptyCircuitExercise,
  resizeValues,
  repeatFirst,
} from '../lib/planItems'

export function usePlanItems(initialItems) {
  const [items, setItems] = useState(initialItems ?? [emptyExercise()])

  function addExercise() {
    setItems((prev) => [...prev, emptyExercise()])
  }
  function addCircuit() {
    setItems((prev) => [...prev, emptyCircuit()])
  }
  function removeBlock(index) {
    setItems((prev) => prev.filter((_, i) => i !== index))
  }

  function updateExerciseBlock(index, patch) {
    setItems((prev) =>
      prev.map((b, i) => {
        if (i !== index) return b
        const next = { ...b, ...patch }
        if (patch.sets !== undefined) {
          const count = Math.max(1, Number(patch.sets) || 1)
          next.sets = count
          next.values = resizeValues(b.values, count)
          next.weights = resizeValues(b.weights, count)
          next.rests = resizeValues(b.rests, count)
        }
        return next
      }),
    )
  }
  function updateExerciseValue(index, setIndex, value) {
    setItems((prev) =>
      prev.map((b, i) => {
        if (i !== index) return b
        const values = b.values.slice()
        values[setIndex] = value
        return { ...b, values }
      }),
    )
  }
  function repeatExerciseValues(index) {
    setItems((prev) => prev.map((b, i) => (i === index ? { ...b, values: repeatFirst(b.values) } : b)))
  }
  function updateExerciseWeight(index, setIndex, value) {
    setItems((prev) =>
      prev.map((b, i) => {
        if (i !== index) return b
        const weights = b.weights.slice()
        weights[setIndex] = value
        return { ...b, weights }
      }),
    )
  }
  function repeatExerciseWeights(index) {
    setItems((prev) =>
      prev.map((b, i) => (i === index ? { ...b, weights: repeatFirst(b.weights) } : b)),
    )
  }
  function updateExerciseRest(index, setIndex, value) {
    setItems((prev) =>
      prev.map((b, i) => {
        if (i !== index) return b
        const rests = b.rests.slice()
        rests[setIndex] = value
        return { ...b, rests }
      }),
    )
  }
  function repeatExerciseRests(index) {
    setItems((prev) => prev.map((b, i) => (i === index ? { ...b, rests: repeatFirst(b.rests) } : b)))
  }
  function pickExercise(index, exercise) {
    updateExerciseBlock(index, {
      exerciseId: exercise?.id ?? '',
      name: exercise?.name ?? '',
      imageUrl: exercise?.imageUrl ?? null,
    })
  }

  function updateCircuitField(index, patch) {
    setItems((prev) => prev.map((b, i) => (i === index ? { ...b, ...patch } : b)))
  }
  function updateCircuitRounds(index, roundsRaw) {
    const rounds = Math.max(1, Number(roundsRaw) || 1)
    setItems((prev) =>
      prev.map((b, i) => {
        if (i !== index) return b
        return {
          ...b,
          rounds,
          exercises: b.exercises.map((ex) => ({
            ...ex,
            values: resizeValues(ex.values, rounds),
            weights: resizeValues(ex.weights, rounds),
            rests: resizeValues(ex.rests, rounds),
          })),
        }
      }),
    )
  }
  function addCircuitExercise(index) {
    setItems((prev) =>
      prev.map((b, i) =>
        i === index ? { ...b, exercises: [...b.exercises, emptyCircuitExercise(b.rounds)] } : b,
      ),
    )
  }
  function removeCircuitExercise(index, exIndex) {
    setItems((prev) =>
      prev.map((b, i) =>
        i === index ? { ...b, exercises: b.exercises.filter((_, j) => j !== exIndex) } : b,
      ),
    )
  }
  function updateCircuitExercise(index, exIndex, patch) {
    setItems((prev) =>
      prev.map((b, i) => {
        if (i !== index) return b
        return {
          ...b,
          exercises: b.exercises.map((ex, j) => (j === exIndex ? { ...ex, ...patch } : ex)),
        }
      }),
    )
  }
  function updateCircuitExerciseValue(index, exIndex, setIndex, value) {
    setItems((prev) =>
      prev.map((b, i) => {
        if (i !== index) return b
        return {
          ...b,
          exercises: b.exercises.map((ex, j) => {
            if (j !== exIndex) return ex
            const values = ex.values.slice()
            values[setIndex] = value
            return { ...ex, values }
          }),
        }
      }),
    )
  }
  function repeatCircuitExerciseValues(index, exIndex) {
    setItems((prev) =>
      prev.map((b, i) => {
        if (i !== index) return b
        return {
          ...b,
          exercises: b.exercises.map((ex, j) =>
            j === exIndex ? { ...ex, values: repeatFirst(ex.values) } : ex,
          ),
        }
      }),
    )
  }
  function updateCircuitExerciseWeight(index, exIndex, setIndex, value) {
    setItems((prev) =>
      prev.map((b, i) => {
        if (i !== index) return b
        return {
          ...b,
          exercises: b.exercises.map((ex, j) => {
            if (j !== exIndex) return ex
            const weights = ex.weights.slice()
            weights[setIndex] = value
            return { ...ex, weights }
          }),
        }
      }),
    )
  }
  function repeatCircuitExerciseWeights(index, exIndex) {
    setItems((prev) =>
      prev.map((b, i) => {
        if (i !== index) return b
        return {
          ...b,
          exercises: b.exercises.map((ex, j) =>
            j === exIndex ? { ...ex, weights: repeatFirst(ex.weights) } : ex,
          ),
        }
      }),
    )
  }
  function updateCircuitExerciseRest(index, exIndex, setIndex, value) {
    setItems((prev) =>
      prev.map((b, i) => {
        if (i !== index) return b
        return {
          ...b,
          exercises: b.exercises.map((ex, j) => {
            if (j !== exIndex) return ex
            const rests = ex.rests.slice()
            rests[setIndex] = value
            return { ...ex, rests }
          }),
        }
      }),
    )
  }
  function repeatCircuitExerciseRests(index, exIndex) {
    setItems((prev) =>
      prev.map((b, i) => {
        if (i !== index) return b
        return {
          ...b,
          exercises: b.exercises.map((ex, j) =>
            j === exIndex ? { ...ex, rests: repeatFirst(ex.rests) } : ex,
          ),
        }
      }),
    )
  }
  function pickCircuitExercise(index, exIndex, exercise) {
    updateCircuitExercise(index, exIndex, {
      exerciseId: exercise?.id ?? '',
      name: exercise?.name ?? '',
      imageUrl: exercise?.imageUrl ?? null,
    })
  }

  function buildCleanItems() {
    return items
      .map((block) => {
        if (block.type === 'circuit') {
          const exs = block.exercises
            .filter((ex) => ex.name.trim())
            .map((ex) => ({
              exerciseId: ex.exerciseId || null,
              name: ex.name.trim(),
              imageUrl: ex.imageUrl ?? null,
              mode: ex.mode,
              values: ex.values,
              weights: ex.weights,
              rests: ex.rests,
              tempo: ex.tempo,
              notes: ex.notes,
            }))
          if (exs.length === 0) return null
          return {
            type: 'circuit',
            name: block.name.trim() || 'Circuito',
            rounds: block.rounds,
            rest: block.rest,
            notes: block.notes,
            exercises: exs,
          }
        }
        if (!block.name.trim()) return null
        return {
          type: 'exercise',
          exerciseId: block.exerciseId || null,
          name: block.name.trim(),
          imageUrl: block.imageUrl ?? null,
          mode: block.mode,
          sets: block.sets,
          values: block.values,
          weights: block.weights,
          rests: block.rests,
          tempo: block.tempo,
          notes: block.notes,
        }
      })
      .filter(Boolean)
  }

  return {
    items,
    setItems,
    addExercise,
    addCircuit,
    removeBlock,
    updateExerciseBlock,
    updateExerciseValue,
    repeatExerciseValues,
    updateExerciseWeight,
    repeatExerciseWeights,
    updateExerciseRest,
    repeatExerciseRests,
    pickExercise,
    updateCircuitField,
    updateCircuitRounds,
    addCircuitExercise,
    removeCircuitExercise,
    updateCircuitExercise,
    updateCircuitExerciseValue,
    repeatCircuitExerciseValues,
    updateCircuitExerciseWeight,
    repeatCircuitExerciseWeights,
    updateCircuitExerciseRest,
    repeatCircuitExerciseRests,
    pickCircuitExercise,
    buildCleanItems,
  }
}
