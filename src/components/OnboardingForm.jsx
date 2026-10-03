import { useState } from 'react'
import { doc, serverTimestamp, updateDoc } from 'firebase/firestore'
import { db } from '../firebase/config'
import { todayIso } from '../lib/weekActivity'
import { validateProfileForm } from '../lib/studentProfile'

const inputClass =
  'h-11 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-primary'

// First-login questionnaire. Saving flips `onboardingDone` on the student's
// profile, which the layout watches to stop showing this screen.
export default function OnboardingForm({ uid, name, onSkip }) {
  const [form, setForm] = useState({ birthDate: '', height: '', weight: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    const result = validateProfileForm(form)
    if (result.error) {
      setError(result.error)
      return
    }
    setSaving(true)
    try {
      await updateDoc(doc(db, 'users', uid), {
        ...result.data,
        onboardingDone: true,
        onboardingAt: serverTimestamp(),
      })
    } catch {
      setError('No se pudieron guardar tus datos. Intentá de nuevo.')
      setSaving(false)
    }
  }

  const firstName = (name || '').split(' ')[0]

  return (
    <section className="mt-12 max-w-md">
      <p className="font-mono text-xs tracking-[0.2em] text-accent-foreground uppercase">
        Primer ingreso
      </p>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight">
        ¡Bienvenido{firstName ? `, ${firstName}` : ''}!
      </h1>
      <p className="mt-3 text-muted-foreground">
        Contanos un poco sobre vos para que tu profe pueda armar tu entrenamiento a tu medida.
      </p>

      <form
        onSubmit={handleSubmit}
        className="mt-8 flex flex-col gap-5 rounded-2xl border border-border bg-card p-5 sm:p-6"
      >
        <label className="flex flex-col gap-2 text-sm font-medium">
          Fecha de nacimiento
          <input
            required
            type="date"
            max={todayIso()}
            value={form.birthDate}
            onChange={(e) => setForm({ ...form, birthDate: e.target.value })}
            className={inputClass}
          />
        </label>
        <div className="grid grid-cols-2 gap-4">
          <label className="flex flex-col gap-2 text-sm font-medium">
            Altura (cm)
            <input
              required
              type="number"
              inputMode="numeric"
              min="100"
              max="250"
              value={form.height}
              onChange={(e) => setForm({ ...form, height: e.target.value })}
              placeholder="170"
              className={inputClass}
            />
          </label>
          <label className="flex flex-col gap-2 text-sm font-medium">
            Peso (kg)
            <input
              required
              type="number"
              inputMode="decimal"
              min="25"
              max="300"
              step="0.1"
              value={form.weight}
              onChange={(e) => setForm({ ...form, weight: e.target.value })}
              placeholder="68,5"
              className={inputClass}
            />
          </label>
        </div>

        {error && <p className="text-sm text-red-400">{error}</p>}

        <div className="flex flex-col gap-3">
          <button
            type="submit"
            disabled={saving}
            className="h-11 rounded-lg bg-primary text-sm font-medium text-primary-foreground hover:bg-primary/80 disabled:opacity-60"
          >
            {saving ? 'Guardando…' : 'Guardar y continuar'}
          </button>
          <button
            type="button"
            onClick={onSkip}
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            Completar más tarde
          </button>
        </div>
      </form>
    </section>
  )
}
