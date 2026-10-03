import { useState } from 'react'
import { parseRestSeconds } from '../lib/restTime'

// Progress state for a workout screen (plans and challenges): which blocks
// are marked done, which individual sets/rounds are checked, and the rest
// timer that starts when a set (or a full circuit round) is checked.
export function useWorkoutProgress() {
  const [completed, setCompleted] = useState(new Set())
  const [checkedSets, setCheckedSets] = useState({})
  const [timer, setTimer] = useState(null)

  function toggleComplete(key) {
    setCompleted((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function startTimer(seconds, label) {
    setTimer({ id: Date.now(), seconds, label })
  }

  // For a standalone exercise (exIndex === null), `block` is the exercise
  // itself and its own per-set rest kicks off the timer right away. Inside a
  // circuit, `block` is the circuit and the timer only fires once every
  // exercise has that same round checked — using the circuit's shared
  // "descanso entre rondas".
  function toggleSet(blockIndex, exIndex, setIndex, block) {
    const key = exIndex === null ? `b${blockIndex}` : `b${blockIndex}-e${exIndex}`
    setCheckedSets((prev) => {
      const nextArr = [...(prev[key] || [])]
      nextArr[setIndex] = !nextArr[setIndex]
      const updated = { ...prev, [key]: nextArr }

      if (nextArr[setIndex]) {
        if (exIndex === null) {
          const seconds = parseRestSeconds(block.rests?.[setIndex])
          if (seconds) startTimer(seconds, block.name)
        } else {
          const roundComplete = block.exercises.every((_, j) =>
            Boolean((updated[`b${blockIndex}-e${j}`] || [])[setIndex]),
          )
          if (roundComplete) {
            const seconds = parseRestSeconds(block.rest)
            if (seconds) startTimer(seconds, block.name || 'Circuito')
          }
        }
      }
      return updated
    })
  }

  return {
    completed,
    checkedSets,
    timer,
    closeTimer: () => setTimer(null),
    toggleComplete,
    toggleSet,
  }
}
