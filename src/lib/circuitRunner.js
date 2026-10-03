import { parseRestSeconds } from './restTime'

// Turns a timed circuit (every exercise in "Tiempo" mode) into the ordered
// list of phases the guided timer plays:
//   work(exercise, seconds) -> rest -> work -> rest -> ... -> work (end)
// Per round, each exercise runs for its own time for that round. The rest
// after an exercise is that exercise's own rest for the round; after the last
// exercise of a round it is the circuit's "descanso entre rondas" when set.
// Exercises with no usable time in a round are skipped for that round, and
// nothing follows the very last work phase.
export function buildCircuitSteps(block) {
  if (block?.type !== 'circuit') return []
  const circuitRest = parseRestSeconds(block.rest)
  const steps = []

  for (let round = 0; round < block.rounds; round++) {
    const work = block.exercises
      .map((exercise) => ({ exercise, seconds: parseRestSeconds(exercise.values?.[round]) }))
      .filter((w) => w.seconds)

    work.forEach((w, k) => {
      steps.push({
        type: 'work',
        seconds: w.seconds,
        exercise: w.exercise,
        round: round + 1,
        rounds: block.rounds,
      })

      const lastOfRound = k === work.length - 1
      const lastOfAll = lastOfRound && round === block.rounds - 1
      if (lastOfAll) return

      let rest = parseRestSeconds(w.exercise.rests?.[round])
      if (lastOfRound && circuitRest) rest = circuitRest
      if (rest) steps.push({ type: 'rest', seconds: rest, round: round + 1, rounds: block.rounds })
    })
  }

  // A rest phase previews whatever work comes right after it.
  steps.forEach((step, i) => {
    if (step.type !== 'rest') return
    step.next = steps.slice(i + 1).find((s) => s.type === 'work') ?? null
  })
  return steps
}

export function isTimedCircuit(block, steps) {
  return (
    block?.type === 'circuit' &&
    block.exercises.length > 0 &&
    block.exercises.every((ex) => ex.mode === 'time') &&
    steps.some((s) => s.type === 'work')
  )
}
