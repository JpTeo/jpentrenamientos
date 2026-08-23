import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  where,
} from 'firebase/firestore'
import { CalendarDays, ChevronLeft, History, Plus, X } from 'lucide-react'
import { db } from '../../firebase/config'
import { useAuth } from '../../contexts/useAuth'

function todayIso() {
  return new Date().toISOString().slice(0, 10)
}

function dateLabel(dateStr) {
  return new Intl.DateTimeFormat('es-AR', { day: 'numeric', month: 'short', year: 'numeric' }).format(
    new Date(`${dateStr}T12:00:00`),
  )
}

const emptyForm = { exercise: '', reps: '', weight: '', date: todayIso() }

export default function Maxes() {
  const { user } = useAuth()
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const q = query(collection(db, 'personalRecords'), where('studentId', '==', user.uid))
    const unsub = onSnapshot(q, (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
      list.sort((a, b) => (b.date || '').localeCompare(a.date || ''))
      setRecords(list)
      setLoading(false)
    })
    return unsub
  }, [user.uid])

  async function handleAdd(e) {
    e.preventDefault()
    setError('')
    if (!form.exercise || !form.reps || !form.weight || !form.date) return
    setSaving(true)
    try {
      await addDoc(collection(db, 'personalRecords'), {
        studentId: user.uid,
        exercise: form.exercise.trim(),
        reps: form.reps,
        weight: form.weight,
        date: form.date,
        createdAt: serverTimestamp(),
      })
      setForm(emptyForm)
      setShowForm(false)
    } catch {
      setError('No se pudo guardar el registro. Intentá de nuevo.')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id) {
    try {
      await deleteDoc(doc(db, 'personalRecords', id))
    } catch {
      setError('No se pudo eliminar el registro.')
    }
  }

  return (
    <section className="mt-12 max-w-4xl">
      <Link
        to="/alumno"
        className="mb-8 flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="size-4" aria-hidden="true" /> Volver al resumen
      </Link>
      <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
        <div>
          <p className="font-mono text-xs tracking-[0.2em] text-accent-foreground uppercase">
            Registro personal
          </p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight">Pesos máximos</h1>
          <p className="mt-3 text-muted-foreground">
            Guardá tus mejores marcas y mirá cómo evolucionan.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowForm((v) => !v)}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/80"
        >
          <Plus className="size-4" aria-hidden="true" /> Nuevo registro
        </button>
      </div>

      {showForm && (
        <form
          onSubmit={handleAdd}
          className="mt-8 rounded-2xl border border-border bg-card p-5 sm:p-6"
        >
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            <label className="flex flex-col gap-2 text-sm font-medium lg:col-span-2">
              Ejercicio
              <input
                required
                value={form.exercise}
                onChange={(e) => setForm({ ...form, exercise: e.target.value })}
                placeholder="Ej. Press militar"
                className="h-11 rounded-lg border border-border bg-background px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-primary"
              />
            </label>
            <label className="flex flex-col gap-2 text-sm font-medium">
              Repeticiones
              <input
                required
                type="number"
                min="1"
                value={form.reps}
                onChange={(e) => setForm({ ...form, reps: e.target.value })}
                placeholder="5"
                className="h-11 rounded-lg border border-border bg-background px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-primary"
              />
            </label>
            <label className="flex flex-col gap-2 text-sm font-medium">
              Peso (kg)
              <input
                required
                type="number"
                min="0"
                step="0.5"
                value={form.weight}
                onChange={(e) => setForm({ ...form, weight: e.target.value })}
                placeholder="60"
                className="h-11 rounded-lg border border-border bg-background px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-primary"
              />
            </label>
            <label className="flex flex-col gap-2 text-sm font-medium">
              Fecha
              <input
                required
                type="date"
                value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
                className="h-11 rounded-lg border border-border bg-background px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-primary"
              />
            </label>
          </div>
          {error && <p className="mt-3 text-sm text-red-400">{error}</p>}
          <div className="mt-6 flex items-center gap-3">
            <button
              type="submit"
              disabled={saving}
              className="inline-flex h-9 items-center rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/80 disabled:opacity-60"
            >
              {saving ? 'Guardando…' : 'Guardar marca'}
            </button>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <X className="size-4" aria-hidden="true" /> Cancelar
            </button>
          </div>
        </form>
      )}

      <div className="mt-10 overflow-hidden rounded-2xl border border-border bg-card">
        <div className="flex items-center gap-3 border-b border-border px-5 py-4">
          <History className="size-4 text-muted-foreground" aria-hidden="true" />
          <h2 className="font-medium">Historial de marcas</h2>
          <span className="ml-auto text-xs text-muted-foreground">
            {loading ? '…' : `${records.length} registros`}
          </span>
        </div>
        {!loading && records.length === 0 ? (
          <p className="px-5 py-6 text-sm text-muted-foreground">
            Todavía no registraste ninguna marca.
          </p>
        ) : (
          <div className="divide-y divide-border">
            {records.map((record) => (
              <div
                key={record.id}
                className="grid grid-cols-[1fr_auto] items-center gap-3 px-5 py-4 sm:grid-cols-[1fr_100px_120px_130px_auto]"
              >
                <div>
                  <p className="font-medium">{record.exercise}</p>
                  <p className="mt-1 text-xs text-muted-foreground sm:hidden">
                    {record.reps} repeticiones
                  </p>
                </div>
                <span className="hidden text-sm text-muted-foreground sm:block">
                  {record.reps} reps
                </span>
                <span className="font-mono text-sm">{record.weight} kg</span>
                <span className="hidden items-center justify-end gap-2 text-sm text-muted-foreground sm:flex">
                  <CalendarDays className="size-3.5" aria-hidden="true" />
                  {dateLabel(record.date)}
                </span>
                <button
                  type="button"
                  onClick={() => handleDelete(record.id)}
                  className="justify-self-end text-xs text-muted-foreground hover:text-red-400"
                >
                  Eliminar
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}
