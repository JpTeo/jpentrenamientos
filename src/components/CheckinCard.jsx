import { useState } from 'react'
import { doc, serverTimestamp, setDoc } from 'firebase/firestore'
import { Check, Dumbbell, X } from 'lucide-react'
import { db } from '../firebase/config'
import { todayIso } from '../lib/weekActivity'
import {
  CHECKIN_POINTS,
  QUICK_TRAININGS,
  checkinDocId,
  checkinLabel,
} from '../lib/checkins'

// "Hoy entrené" — for students who train in person with the coach. Tapping
// opens a small form (what did you train?) and saves one check-in per day,
// worth CHECKIN_POINTS. Once done today, it turns into a confirmation.
export default function CheckinCard({ uid, studentName, coachId, todayCheckin }) {
  const [open, setOpen] = useState(false)
  const [description, setDescription] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleSave(e) {
    e.preventDefault()
    setSaving(true)
    setError('')
    const date = todayIso()
    try {
      await setDoc(doc(db, 'trainingCheckins', checkinDocId(uid, date)), {
        studentId: uid,
        studentName: studentName || '',
        coachId,
        date,
        description: description.trim().slice(0, 100),
        points: CHECKIN_POINTS,
        read: false,
        createdAt: serverTimestamp(),
      })
      setOpen(false)
      setDescription('')
    } catch {
      setError('No se pudo registrar tu entrenamiento. Intentá de nuevo.')
    } finally {
      setSaving(false)
    }
  }

  if (todayCheckin) {
    return (
      <div className="mt-8 flex items-center gap-4 rounded-2xl border border-primary/30 bg-primary/5 p-4 sm:p-5">
        <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
          <Check className="size-5" aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-semibold">¡Hoy ya entrenaste!</p>
          <p className="truncate text-sm text-muted-foreground">{checkinLabel(todayCheckin)}</p>
        </div>
        <span className="font-mono text-sm font-semibold text-primary">+{todayCheckin.points}</span>
      </div>
    )
  }

  return (
    <div className="mt-8 rounded-2xl border border-border bg-card p-4 sm:p-5">
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="group flex w-full items-center gap-4 text-left"
        >
          <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <Dumbbell className="size-5" aria-hidden="true" />
          </div>
          <div className="flex-1">
            <p className="text-lg font-semibold">Hoy entrené</p>
            <p className="text-sm text-muted-foreground">
              Marcalo y sumá {CHECKIN_POINTS} puntos
            </p>
          </div>
          <span className="rounded-full bg-primary/15 px-3 py-1 text-sm font-semibold text-primary">
            +{CHECKIN_POINTS}
          </span>
        </button>
      ) : (
        <form onSubmit={handleSave}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-semibold">Hoy entrené</p>
              <p className="text-sm text-muted-foreground">¿Qué entrenaste hoy?</p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Cancelar"
              className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <X className="size-4" aria-hidden="true" />
            </button>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            {QUICK_TRAININGS.map((label) => (
              <button
                key={label}
                type="button"
                onClick={() => setDescription(label)}
                className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                  description === label
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border text-muted-foreground hover:border-primary/60'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={100}
            placeholder="Ej. Cadena posterior (opcional)"
            className="mt-3 h-11 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-primary"
          />
          {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
          <button
            type="submit"
            disabled={saving}
            className="mt-3 h-11 w-full rounded-lg bg-primary text-sm font-medium text-primary-foreground hover:bg-primary/80 disabled:opacity-60"
          >
            {saving ? 'Guardando…' : `Guardar y sumar ${CHECKIN_POINTS} puntos`}
          </button>
        </form>
      )}
    </div>
  )
}
