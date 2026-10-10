import { useEffect, useState } from 'react'
import { Activity, Check, Clock3, Dumbbell, Pencil, X } from 'lucide-react'
import { formatSeconds } from '../lib/restTime'
import { EXERCISE_MODES, formatModeValue, normalizeMode } from '../lib/planItems'

// Building blocks of the student workout view, shared by plans and
// challenges: exercise cards (with the per-set checklist and optional weight
// editing / comments), the rest timer, and the completion buttons.

export function RestBadge({ rest }) {
  return (
    <div className="mt-4 flex items-center justify-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2">
      <Clock3 className="size-3.5 text-primary" aria-hidden="true" />
      <span className="text-xs font-medium text-muted-foreground uppercase">Descanso</span>
      <span className="font-mono text-sm font-semibold text-primary">{rest}</span>
    </div>
  )
}

export function CompleteButton({ completed, onToggle, label }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`mt-6 w-full rounded-lg py-2.5 text-sm font-medium transition-colors ${
        completed
          ? 'bg-secondary text-secondary-foreground'
          : 'bg-primary text-primary-foreground hover:brightness-105'
      }`}
    >
      {completed ? (
        <span className="inline-flex items-center gap-1.5">
          <Check className="size-4" aria-hidden="true" /> {label} completado
        </span>
      ) : (
        `Terminé el ${label.toLowerCase()}`
      )}
    </button>
  )
}

export function ImageLightbox({ src, alt, onClose }) {
  useEffect(() => {
    function onKeyDown(e) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
      onClick={onClose}
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="Cerrar"
        className="absolute top-4 right-4 rounded-full bg-black/40 p-2 text-white hover:bg-black/60"
      >
        <X className="size-5" aria-hidden="true" />
      </button>
      <img
        src={src}
        alt={alt}
        onClick={(e) => e.stopPropagation()}
        className="max-h-full max-w-full rounded-lg object-contain"
      />
    </div>
  )
}

// Full-screen rest countdown. Remounted (via a fresh `key` from the caller)
// each time a new timer starts, so its own internal countdown always begins
// clean at `seconds`.
export function RestTimer({ seconds, label, onClose }) {
  const [remaining, setRemaining] = useState(seconds)

  useEffect(() => {
    if (remaining <= 0) {
      const t = setTimeout(onClose, 700)
      return () => clearTimeout(t)
    }
    const t = setTimeout(() => setRemaining((r) => r - 1), 1000)
    return () => clearTimeout(t)
  }, [remaining, onClose])

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-6 bg-black/85 p-6 text-white">
      <p className="text-xs font-medium tracking-[0.3em] text-white/60 uppercase">Descanso</p>
      {label && <p className="text-lg font-medium">{label}</p>}
      <p className="font-mono text-7xl font-bold tabular-nums">{formatSeconds(remaining)}</p>
      <button
        type="button"
        onClick={onClose}
        className="rounded-full border border-white/30 px-5 py-2 text-sm font-medium hover:bg-white/10"
      >
        Saltar
      </button>
    </div>
  )
}

export function ExerciseCard({
  exercise,
  valueLabel,
  completed,
  footer,
  onSendComment,
  onSaveWeights,
  checkedSets,
  onToggleSet,
}) {
  const modeInfo = EXERCISE_MODES[normalizeMode(exercise.mode)]
  const [imageOpen, setImageOpen] = useState(false)
  const [editing, setEditing] = useState(false)
  const [weightDrafts, setWeightDrafts] = useState(exercise.weights)
  const [comment, setComment] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [saveError, setSaveError] = useState('')
  const canEdit = Boolean(onSaveWeights || onSendComment)

  function startEditing() {
    setWeightDrafts(exercise.weights)
    setComment('')
    setSaved(false)
    setSaveError('')
    setEditing(true)
  }

  function updateWeightDraft(i, value) {
    setWeightDrafts((prev) => prev.map((w, wi) => (wi === i ? value : w)))
  }

  async function handleSave() {
    setSaving(true)
    setSaveError('')
    try {
      const weightsChanged = weightDrafts.some((w, i) => w !== exercise.weights[i])
      if (weightsChanged && onSaveWeights) await onSaveWeights(weightDrafts)
      if (comment.trim() && onSendComment) await onSendComment(comment.trim())
      setEditing(false)
      setSaved(true)
    } catch {
      setSaveError('No se pudo guardar. Probá de nuevo.')
    } finally {
      setSaving(false)
    }
  }

  const gridCols = 'grid-cols-[68px_1fr_1fr_1fr] sm:grid-cols-[84px_1fr_1fr_1fr]'

  return (
    <article
      className={`relative rounded-2xl border bg-card p-5 transition-colors sm:p-6 ${
        completed ? 'border-primary/50' : 'border-border'
      }`}
    >
      <div className="flex items-center gap-4">
        {exercise.imageUrl ? (
          <>
            <button
              type="button"
              onClick={() => setImageOpen(true)}
              aria-label={`Ver imagen de ${exercise.name} en grande`}
              className="flex size-16 shrink-0 items-center justify-center rounded-2xl bg-white ring-2 ring-border sm:size-20"
            >
              <img
                src={exercise.imageUrl}
                alt={`Demostración de ${exercise.name}`}
                className="size-full cursor-pointer rounded-2xl object-contain p-1"
              />
            </button>
            {imageOpen && (
              <ImageLightbox
                src={exercise.imageUrl}
                alt={`Demostración de ${exercise.name}`}
                onClose={() => setImageOpen(false)}
              />
            )}
          </>
        ) : (
          <div className="flex size-16 shrink-0 items-center justify-center rounded-2xl bg-muted ring-2 ring-border sm:size-20">
            <Dumbbell className="size-6 text-muted-foreground" aria-hidden="true" />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <h2 className="text-lg leading-tight font-semibold sm:text-xl">{exercise.name}</h2>
          {exercise.notes && (
            <p className="mt-2 text-sm leading-6 text-muted-foreground">{exercise.notes}</p>
          )}
        </div>
        {canEdit && (
          <button
            type="button"
            onClick={() => (editing ? setEditing(false) : startEditing())}
            aria-label="Editar pesos y dejar un comentario"
            className={`shrink-0 rounded-full p-2 hover:bg-muted ${
              editing ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Pencil className="size-4" aria-hidden="true" />
          </button>
        )}
      </div>

      {exercise.tempo && (
        <div className="mt-6 flex items-center gap-3 border-y border-border/70 py-4 text-primary">
          <Activity className="size-5" aria-hidden="true" />
          <span className="text-sm font-medium">Ritmo: {exercise.tempo}</span>
        </div>
      )}

      <div
        className={`mt-5 grid ${gridCols} gap-3 text-center text-xs font-medium tracking-wider text-muted-foreground uppercase sm:gap-4`}
      >
        <span className="text-left">{valueLabel}</span>
        <span>{modeInfo.label}</span>
        <span>Descanso</span>
        <span>Kg</span>
      </div>
      <div className="mt-3 flex flex-col gap-3">
        {exercise.values.map((v, i) => {
          const isChecked = Boolean(checkedSets?.[i])
          return (
            <div key={i} className={`grid ${gridCols} items-center gap-3 sm:gap-4`}>
              <button
                type="button"
                onClick={() => onToggleSet?.(i)}
                aria-label={`${valueLabel} ${i + 1}${isChecked ? ', hecha' : ''}`}
                className={`flex h-12 items-center justify-center rounded-xl text-lg font-semibold transition-colors ${
                  isChecked
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-foreground hover:bg-muted/70'
                }`}
              >
                {isChecked ? <Check className="size-5" aria-hidden="true" /> : i + 1}
              </button>
              <div className="flex h-12 items-center justify-center rounded-xl border border-border font-mono text-lg">
                {v ? formatModeValue(exercise.mode, v) : '—'}
              </div>
              <div className="flex h-12 items-center justify-center rounded-xl border border-border font-mono text-lg">
                {exercise.rests[i] || '—'}
              </div>
              <div className="flex h-12 items-center justify-center rounded-xl border border-border font-mono text-lg">
                {editing ? (
                  <input
                    value={weightDrafts[i] ?? ''}
                    onChange={(e) => updateWeightDraft(i, e.target.value)}
                    placeholder="Kg"
                    className="h-full w-full rounded-lg bg-transparent text-center outline-none"
                  />
                ) : (
                  exercise.weights[i] || '—'
                )}
              </div>
            </div>
          )
        })}
      </div>

      {editing && (
        <div className="mt-5 space-y-2 border-t border-border/70 pt-4">
          <label className="text-xs font-medium tracking-wider text-muted-foreground uppercase">
            Mensaje para tu profe (opcional)
          </label>
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            rows={3}
            placeholder="Contale a tu profe algo sobre este ejercicio..."
            className="w-full rounded-lg border border-border bg-background px-2 py-1.5 text-sm outline-none focus:border-primary"
          />
          {saveError && <p className="text-xs text-red-500">{saveError}</p>}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="rounded-lg px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-60"
            >
              {saving ? 'Guardando…' : 'Guardar'}
            </button>
          </div>
        </div>
      )}
      {saved && !editing && <p className="mt-2 text-right text-[11px] text-primary">Guardado ✓</p>}

      {footer}
    </article>
  )
}
