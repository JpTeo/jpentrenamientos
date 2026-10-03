import { useEffect, useState } from 'react'
import { Check, Dumbbell, Pause, Play, SkipForward, X } from 'lucide-react'
import { formatSeconds } from '../lib/restTime'
import { buildCircuitSteps, isTimedCircuit } from '../lib/circuitRunner'
import { beep, prepareAudio, vibrate } from '../lib/beep'

// Guided full-screen timer for timed circuits. Work phases split the screen
// (exercise on one side, green countdown on the other); rest phases turn the
// whole screen red. `steps` must be a stable array (see TimedCircuitStart).
export function CircuitRunner({ steps, circuitName, onClose, onFinish }) {
  const [index, setIndex] = useState(0)
  const [remaining, setRemaining] = useState(steps[0].seconds)
  const [paused, setPaused] = useState(false)
  const [finished, setFinished] = useState(false)
  const step = steps[index]
  const resting = !finished && step.type === 'rest'
  // Position of the current exercise within its round.
  const roundWork = steps.filter((s) => s.type === 'work' && s.round === step.round)
  const workNumber = roundWork.indexOf(step) + 1
  const workCount = roundWork.length

  // Keep the phone awake while the circuit runs.
  useEffect(() => {
    let lock = null
    navigator.wakeLock
      ?.request('screen')
      .then((l) => (lock = l))
      .catch(() => {})
    return () => {
      lock?.release().catch(() => {})
    }
  }, [])

  useEffect(() => {
    if (finished || paused) return
    if (remaining <= 0) {
      if (index + 1 < steps.length) {
        setIndex(index + 1)
        setRemaining(steps[index + 1].seconds)
        beep(steps[index + 1].type === 'work' ? 1040 : 520, 300)
        vibrate(200)
      } else {
        setFinished(true)
        beep(1040, 200)
        setTimeout(() => beep(1320, 350), 260)
        vibrate([200, 100, 200])
      }
      return
    }
    const t = setTimeout(() => setRemaining((r) => r - 1), 1000)
    return () => clearTimeout(t)
  }, [remaining, index, paused, finished, steps])

  useEffect(() => {
    if (!finished && !paused && remaining > 0 && remaining <= 3) beep(700, 90)
  }, [remaining, paused, finished])

  function handleClose() {
    if (finished || confirm('¿Salir del circuito? Se pierde el avance del cronómetro.')) onClose()
  }

  const controlClass = resting
    ? 'bg-white/20 text-white hover:bg-white/30'
    : 'bg-white/10 text-white hover:bg-white/20'
  const progress = step.seconds > 0 ? (remaining / step.seconds) * 100 : 0

  if (finished) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-5 bg-[#05080c] p-6 text-center text-white">
        <div className="flex size-20 items-center justify-center rounded-full bg-primary text-primary-foreground">
          <Check className="size-10" aria-hidden="true" />
        </div>
        <p className="text-3xl font-semibold">¡Circuito terminado!</p>
        <p className="text-sm text-white/70">{circuitName}</p>
        <button
          type="button"
          onClick={onFinish}
          className="rounded-lg bg-white px-6 py-2.5 text-sm font-medium text-black"
        >
          Listo
        </button>
      </div>
    )
  }

  return (
    <div
      data-phase={resting ? 'rest' : 'work'}
      className={`fixed inset-0 z-50 flex flex-col text-white transition-colors duration-300 ${
        resting ? 'bg-red-600' : 'bg-[#05080c]'
      }`}
    >
      <div className="flex items-center justify-between gap-3 px-5 pt-4">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{circuitName}</p>
          <p className="text-xs text-white/70">
            Ronda {step.round}/{step.rounds}
            {!resting && ` · Ejercicio ${workNumber}/${workCount}`}
          </p>
        </div>
        <button
          type="button"
          onClick={handleClose}
          aria-label="Salir del circuito"
          className={`rounded-full p-2 ${controlClass}`}
        >
          <X className="size-5" aria-hidden="true" />
        </button>
      </div>

      {resting ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
          <p className="text-sm font-semibold tracking-[0.35em] uppercase">Descanso</p>
          <p className="font-mono text-[26vw] leading-none font-bold tabular-nums landscape:text-[18vw]">
            {formatSeconds(remaining)}
          </p>
          {step.next && (
            <div className="mt-2 rounded-xl bg-black/20 px-5 py-3">
              <p className="text-xs tracking-wider text-white/80 uppercase">Sigue</p>
              <p className="text-xl font-semibold">{step.next.exercise.name}</p>
            </div>
          )}
        </div>
      ) : (
        <div className="grid min-h-0 flex-1 grid-rows-2 landscape:grid-cols-2 landscape:grid-rows-1">
          <div className="flex min-h-0 flex-col items-center justify-center gap-3 p-5 text-center">
            {step.exercise.imageUrl ? (
              <div className="flex max-h-[30vh] min-h-0 items-center justify-center rounded-2xl bg-white p-2 landscape:max-h-[55vh]">
                <img
                  src={step.exercise.imageUrl}
                  alt={step.exercise.name}
                  className="max-h-[28vh] rounded-xl object-contain landscape:max-h-[52vh]"
                />
              </div>
            ) : (
              <Dumbbell className="size-16 text-white/40" aria-hidden="true" />
            )}
            <p className="text-2xl font-semibold">{step.exercise.name}</p>
            {step.exercise.notes && (
              <p className="max-w-md text-sm text-white/70">{step.exercise.notes}</p>
            )}
          </div>
          <div className="flex flex-col items-center justify-center gap-4 border-t border-white/10 p-5 landscape:border-t-0 landscape:border-l">
            <p className="text-xs font-semibold tracking-[0.35em] text-primary uppercase">Acción</p>
            <p className="font-mono text-[24vw] leading-none font-bold text-primary tabular-nums landscape:text-[13vw]">
              {formatSeconds(remaining)}
            </p>
            <div className="h-2 w-3/4 overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-primary transition-[width] duration-1000 ease-linear"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center justify-center gap-3 px-5 pt-3 pb-6">
        <button
          type="button"
          onClick={() => setPaused((p) => !p)}
          className={`inline-flex h-11 items-center gap-2 rounded-full px-5 text-sm font-medium ${controlClass}`}
        >
          {paused ? (
            <>
              <Play className="size-4" aria-hidden="true" /> Seguir
            </>
          ) : (
            <>
              <Pause className="size-4" aria-hidden="true" /> Pausar
            </>
          )}
        </button>
        <button
          type="button"
          onClick={() => setRemaining(0)}
          className={`inline-flex h-11 items-center gap-2 rounded-full px-5 text-sm font-medium ${controlClass}`}
        >
          <SkipForward className="size-4" aria-hidden="true" /> Saltar
        </button>
      </div>
    </div>
  )
}

// "Iniciar" button for a timed circuit. Renders nothing for circuits that
// aren't fully time-based, so the rest of the circuit view is unchanged.
export function TimedCircuitStart({ block, onFinish }) {
  const [runSteps, setRunSteps] = useState(null)
  const steps = buildCircuitSteps(block)
  if (!isTimedCircuit(block, steps)) return null

  const totalSeconds = steps.reduce((sum, s) => sum + s.seconds, 0)

  return (
    <>
      <button
        type="button"
        onClick={() => {
          prepareAudio()
          setRunSteps(steps)
        }}
        className="mb-4 flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3 text-sm font-semibold text-primary-foreground hover:brightness-105"
      >
        <Play className="size-4" aria-hidden="true" /> Iniciar · {formatSeconds(totalSeconds)}
      </button>
      {runSteps && (
        <CircuitRunner
          steps={runSteps}
          circuitName={block.name || 'Circuito'}
          onClose={() => setRunSteps(null)}
          onFinish={() => {
            setRunSteps(null)
            onFinish()
          }}
        />
      )}
    </>
  )
}
