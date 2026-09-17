import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from 'firebase/firestore'
import { ArrowRight, Dumbbell, Pencil, Plus, Trash2, Trophy, Weight, X } from 'lucide-react'
import { db } from '../../firebase/config'
import { useAuth } from '../../contexts/useAuth'
import { groupPlansByTitle } from '../../lib/planGroups'
import { currentWeekDays, toIsoDate, todayIso } from '../../lib/weekActivity'
import { normalizeName } from '../../lib/normalizeName'

// No tracking a real session length for assigned workouts, so a completed
// plan contributes this many minutes to the day's bar — just enough to make
// strength days visible next to manually logged activities.
const STRENGTH_SESSION_MINUTES = 45
const CHART_HEIGHT = 96
const QUICK_ACTIVITIES = ['Running', 'Bici', 'HIIT', 'Natación']

const emptyActivityForm = { activity: '', duration: '', intensity: 'Moderada' }

// A few common activities get a fixed color; anything else gets a stable
// color picked from the fallback pool by hashing its name, so the same
// custom activity always renders the same way across the week.
const ACTIVITY_COLORS = {
  running: 'bg-orange-500',
  correr: 'bg-orange-500',
  bici: 'bg-sky-500',
  bicicleta: 'bg-sky-500',
  ciclismo: 'bg-sky-500',
  hiit: 'bg-rose-500',
  natacion: 'bg-cyan-500',
}
const FALLBACK_ACTIVITY_COLORS = [
  'bg-violet-500',
  'bg-amber-500',
  'bg-fuchsia-500',
  'bg-lime-500',
  'bg-teal-500',
  'bg-indigo-500',
]

function colorForActivity(name) {
  const key = normalizeName(name)
  if (ACTIVITY_COLORS[key]) return ACTIVITY_COLORS[key]
  let hash = 0
  for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) >>> 0
  return FALLBACK_ACTIVITY_COLORS[hash % FALLBACK_ACTIVITY_COLORS.length]
}

function barSegmentHeight(minutes, maxMinutes) {
  if (!minutes) return 0
  return Math.max(6, Math.round((minutes / maxMinutes) * CHART_HEIGHT))
}

export default function Home() {
  const { user, profile } = useAuth()
  const navigate = useNavigate()
  const [planCount, setPlanCount] = useState(0)
  const [lastRecord, setLastRecord] = useState(null)
  const [recordCount, setRecordCount] = useState(0)
  const [completions, setCompletions] = useState([])
  const [activities, setActivities] = useState([])
  const [formDate, setFormDate] = useState(null)
  const [activityForm, setActivityForm] = useState(emptyActivityForm)
  const [editingActivityId, setEditingActivityId] = useState(null)
  const [activitySaving, setActivitySaving] = useState(false)
  const [activityError, setActivityError] = useState('')

  useEffect(() => {
    const q = query(collection(db, 'plans'), where('studentId', '==', user.uid))
    const unsub = onSnapshot(q, (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
      setPlanCount(groupPlansByTitle(list).length)
    })
    return unsub
  }, [user.uid])

  useEffect(() => {
    const q = query(collection(db, 'personalRecords'), where('studentId', '==', user.uid))
    const unsub = onSnapshot(q, (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
      list.sort((a, b) => (b.date || '').localeCompare(a.date || ''))
      setRecordCount(list.length)
      setLastRecord(list[0] ?? null)
    })
    return unsub
  }, [user.uid])

  useEffect(() => {
    const q = query(collection(db, 'planCompletions'), where('studentId', '==', user.uid))
    const unsub = onSnapshot(q, (snap) => {
      setCompletions(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    })
    return unsub
  }, [user.uid])

  useEffect(() => {
    const q = query(collection(db, 'activityLogs'), where('studentId', '==', user.uid))
    const unsub = onSnapshot(q, (snap) => {
      setActivities(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    })
    return unsub
  }, [user.uid])

  const weekDays = useMemo(() => currentWeekDays(), [])

  const dayData = useMemo(() => {
    return weekDays.map((day) => {
      const dayCompletions = completions.filter(
        (c) => c.completedAt?.seconds && toIsoDate(new Date(c.completedAt.seconds * 1000)) === day.iso,
      )
      const dayActivities = activities.filter((a) => a.date === day.iso)

      const groupsByKey = {}
      dayActivities.forEach((a) => {
        const key = normalizeName(a.activity)
        if (!groupsByKey[key]) {
          groupsByKey[key] = { name: a.activity, color: colorForActivity(a.activity), minutes: 0 }
        }
        groupsByKey[key].minutes += Number(a.durationMinutes) || 0
      })
      const activityGroups = Object.values(groupsByKey)

      const strengthMinutes = dayCompletions.length * STRENGTH_SESSION_MINUTES
      const otherMinutes = activityGroups.reduce((sum, g) => sum + g.minutes, 0)
      return {
        ...day,
        strengthCount: dayCompletions.length,
        strengthMinutes,
        otherMinutes,
        totalMinutes: strengthMinutes + otherMinutes,
        activityGroups,
      }
    })
  }, [weekDays, completions, activities])

  const maxMinutes = Math.max(STRENGTH_SESSION_MINUTES, ...dayData.map((d) => d.totalMinutes))
  const weekTotalMinutes = dayData.reduce((sum, d) => sum + d.totalMinutes, 0)

  const weekLegend = useMemo(() => {
    const map = new Map()
    dayData.forEach((day) => {
      day.activityGroups.forEach((g) => {
        const key = normalizeName(g.name)
        if (!map.has(key)) map.set(key, { name: g.name, color: g.color })
      })
    })
    return Array.from(map.values())
  }, [dayData])

  function openActivityForm(iso) {
    setFormDate(iso)
    setActivityForm(emptyActivityForm)
    setEditingActivityId(null)
    setActivityError('')
  }

  function closeActivityPanel() {
    setFormDate(null)
    setEditingActivityId(null)
  }

  function startEditActivity(entry) {
    setFormDate(entry.date)
    setActivityForm({
      activity: entry.activity,
      duration: String(entry.durationMinutes ?? ''),
      intensity: entry.intensity || 'Moderada',
    })
    setEditingActivityId(entry.id)
    setActivityError('')
  }

  async function handleSaveActivity(e) {
    e.preventDefault()
    if (!activityForm.activity.trim() || !activityForm.duration) return
    setActivitySaving(true)
    setActivityError('')
    try {
      if (editingActivityId) {
        await updateDoc(doc(db, 'activityLogs', editingActivityId), {
          activity: activityForm.activity.trim(),
          durationMinutes: Number(activityForm.duration),
          intensity: activityForm.intensity,
        })
      } else {
        await addDoc(collection(db, 'activityLogs'), {
          studentId: user.uid,
          activity: activityForm.activity.trim(),
          durationMinutes: Number(activityForm.duration),
          intensity: activityForm.intensity,
          date: formDate,
          createdAt: serverTimestamp(),
        })
      }
      closeActivityPanel()
    } catch {
      setActivityError('No se pudo guardar. Intentá de nuevo.')
    } finally {
      setActivitySaving(false)
    }
  }

  async function handleDeleteActivity(id) {
    if (!confirm('¿Eliminar este entrenamiento?')) return
    try {
      await deleteDoc(doc(db, 'activityLogs', id))
      if (editingActivityId === id) closeActivityPanel()
    } catch {
      setActivityError('No se pudo eliminar. Intentá de nuevo.')
    }
  }

  const firstName = (profile?.name || '').split(' ')[0]

  return (
    <section className="mt-16 max-w-4xl">
      <p className="font-mono text-xs tracking-[0.2em] text-accent-foreground uppercase">
        Mi espacio
      </p>
      <h1 className="mt-4 max-w-xl text-4xl font-semibold tracking-tight text-balance sm:text-6xl">
        Hola, {firstName}
        <span className="text-muted-foreground">.</span>
      </h1>
      <p className="mt-5 max-w-lg text-base leading-7 text-muted-foreground">
        Todo listo para que sigas avanzando. Revisá tu planificación y llevá el registro de tus
        marcas.
      </p>

      <div className="mt-10 rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="font-mono text-xs tracking-[0.18em] text-accent-foreground uppercase">
              Resumen de la semana
            </p>
            <h2 className="mt-2 text-xl font-semibold tracking-tight">Actividad física</h2>
          </div>
          <button
            type="button"
            onClick={() => openActivityForm(todayIso())}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/80"
          >
            <Plus className="size-4" aria-hidden="true" /> Agregar entrenamiento
          </button>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-primary" aria-hidden="true" /> Musculación
          </span>
          {weekLegend.map((item) => (
            <span key={item.name} className="flex items-center gap-1.5">
              <span className={`size-2 rounded-full ${item.color}`} aria-hidden="true" /> {item.name}
            </span>
          ))}
        </div>

        <div className="mt-6 grid grid-cols-7 items-end gap-2 sm:gap-4">
          {dayData.map((day) => {
            const strengthPx = barSegmentHeight(day.strengthMinutes, maxMinutes)
            return (
              <button
                key={day.iso}
                type="button"
                onClick={() => openActivityForm(day.iso)}
                className="group flex flex-col items-center gap-2"
                title={`Agregar entrenamiento del ${day.label}`}
              >
                <div
                  className="flex w-full flex-col justify-end overflow-hidden rounded-t-lg bg-muted/50 transition-colors group-hover:bg-muted"
                  style={{ height: `${CHART_HEIGHT}px` }}
                >
                  {day.activityGroups.map((g) => {
                    const px = barSegmentHeight(g.minutes, maxMinutes)
                    return px > 0 ? (
                      <div key={g.name} className={`w-full ${g.color}`} style={{ height: `${px}px` }} title={g.name} />
                    ) : null
                  })}
                  {strengthPx > 0 && (
                    <div className="w-full bg-primary" style={{ height: `${strengthPx}px` }} />
                  )}
                </div>
                <span
                  className={`text-xs font-medium ${day.isToday ? 'text-primary' : 'text-muted-foreground'}`}
                >
                  {day.label}
                </span>
              </button>
            )
          })}
        </div>

        {formDate && (
          <div className="mt-6 rounded-xl border border-primary/20 bg-primary/5 p-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-semibold">
                  {editingActivityId ? 'Editar' : 'Agregar'} entrenamiento ·{' '}
                  {new Intl.DateTimeFormat('es-AR', { day: 'numeric', month: 'short' }).format(
                    new Date(`${formDate}T12:00:00`),
                  )}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Para actividades que no son tu musculación asignada: correr, bici, HIIT, etc.
                </p>
              </div>
              <button
                type="button"
                aria-label="Cerrar"
                onClick={closeActivityPanel}
                className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <X className="size-4" aria-hidden="true" />
              </button>
            </div>

            {activities.filter((a) => a.date === formDate).length > 0 && (
              <div className="mt-4 flex flex-col gap-2">
                {activities
                  .filter((a) => a.date === formDate)
                  .map((entry) => (
                    <div
                      key={entry.id}
                      className={`flex items-center gap-3 rounded-lg border px-3 py-2 ${
                        editingActivityId === entry.id
                          ? 'border-primary bg-primary/10'
                          : 'border-border bg-card'
                      }`}
                    >
                      <span className={`size-2 shrink-0 rounded-full ${colorForActivity(entry.activity)}`} aria-hidden="true" />
                      <span className="flex-1 truncate text-sm font-medium">{entry.activity}</span>
                      <span className="text-xs text-muted-foreground">
                        {entry.durationMinutes} min · {entry.intensity}
                      </span>
                      <button
                        type="button"
                        onClick={() => startEditActivity(entry)}
                        aria-label={`Editar ${entry.activity}`}
                        className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                      >
                        <Pencil className="size-3.5" aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteActivity(entry.id)}
                        aria-label={`Eliminar ${entry.activity}`}
                        className="rounded-md p-1.5 text-muted-foreground hover:bg-red-500/10 hover:text-red-400"
                      >
                        <Trash2 className="size-3.5" aria-hidden="true" />
                      </button>
                    </div>
                  ))}
              </div>
            )}

            <form onSubmit={handleSaveActivity} className="mt-4 border-t border-primary/20 pt-4">
            <div className="flex flex-wrap gap-2">
              {QUICK_ACTIVITIES.map((label) => {
                const selected = activityForm.activity === label
                return (
                  <button
                    key={label}
                    type="button"
                    onClick={() => setActivityForm((f) => ({ ...f, activity: label }))}
                    className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                      selected
                        ? `${colorForActivity(label)} border-transparent text-white`
                        : 'border-border text-muted-foreground hover:border-primary/60'
                    }`}
                  >
                    {label}
                  </button>
                )
              })}
            </div>

            <div className="mt-4 grid gap-4 sm:grid-cols-3">
              <label className="flex flex-col gap-2 text-sm font-medium">
                Entrenamiento
                <input
                  required
                  value={activityForm.activity}
                  onChange={(e) => setActivityForm((f) => ({ ...f, activity: e.target.value }))}
                  placeholder="Ej. Running"
                  className="h-10 rounded-lg border border-border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary"
                />
              </label>
              <label className="flex flex-col gap-2 text-sm font-medium">
                Duración (min)
                <input
                  required
                  type="number"
                  min="1"
                  value={activityForm.duration}
                  onChange={(e) => setActivityForm((f) => ({ ...f, duration: e.target.value }))}
                  placeholder="45"
                  className="h-10 rounded-lg border border-border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary"
                />
              </label>
              <label className="flex flex-col gap-2 text-sm font-medium">
                Intensidad
                <select
                  value={activityForm.intensity}
                  onChange={(e) => setActivityForm((f) => ({ ...f, intensity: e.target.value }))}
                  className="h-10 rounded-lg border border-border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  <option>Suave</option>
                  <option>Moderada</option>
                  <option>Alta</option>
                </select>
              </label>
            </div>
            {activityError && <p className="mt-3 text-sm text-red-400">{activityError}</p>}
            <div className="mt-4 flex items-center gap-3">
              <button
                type="submit"
                disabled={activitySaving}
                className="inline-flex h-9 items-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/80 disabled:opacity-60"
              >
                {activitySaving ? 'Guardando…' : editingActivityId ? 'Guardar cambios' : 'Guardar actividad'}
              </button>
              {editingActivityId && (
                <button
                  type="button"
                  onClick={() => {
                    setActivityForm(emptyActivityForm)
                    setEditingActivityId(null)
                  }}
                  className="text-sm font-medium text-muted-foreground hover:text-foreground"
                >
                  Cancelar edición
                </button>
              )}
            </div>
            </form>
          </div>
        )}

        <div className="mt-6 flex items-center justify-between border-t border-border pt-4 text-xs text-muted-foreground sm:text-sm">
          <span>
            Total semana: <strong className="text-foreground">{weekTotalMinutes} min</strong>
          </span>
          <span>
            Sesiones de musculación:{' '}
            <strong className="text-primary">
              {dayData.reduce((sum, d) => sum + d.strengthCount, 0)}
            </strong>
          </span>
        </div>
      </div>

      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        <button
          onClick={() => navigate('/alumno/planificaciones')}
          className="group flex min-h-48 flex-col justify-between rounded-2xl bg-primary p-6 text-left text-primary-foreground transition-transform hover:-translate-y-1"
        >
          <div className="flex items-start justify-between">
            <Dumbbell className="size-6" aria-hidden="true" />
            <ArrowRight
              className="size-5 transition-transform group-hover:translate-x-1"
              aria-hidden="true"
            />
          </div>
          <div>
            <p className="text-2xl font-semibold">Planificaciones</p>
            <p className="mt-1 text-sm text-primary-foreground/65">
              {planCount} {planCount === 1 ? 'planificación asignada' : 'planificaciones asignadas'}
            </p>
          </div>
        </button>
        <button
          onClick={() => navigate('/alumno/marcas')}
          className="group flex min-h-48 flex-col justify-between rounded-2xl border border-border bg-card p-6 text-left transition-transform hover:-translate-y-1 hover:bg-muted"
        >
          <div className="flex items-start justify-between">
            <Weight className="size-6" aria-hidden="true" />
            <ArrowRight
              className="size-5 text-muted-foreground transition-transform group-hover:translate-x-1"
              aria-hidden="true"
            />
          </div>
          <div>
            <p className="text-2xl font-semibold">Pesos máximos</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {recordCount > 0 ? `${recordCount} marcas registradas` : 'Registrá tus marcas'}
            </p>
          </div>
        </button>
      </div>

      {lastRecord && (
        <div className="mt-16 flex items-center gap-4 border-t border-border/60 pt-5 text-sm text-muted-foreground">
          <Trophy className="size-4 text-accent-foreground" aria-hidden="true" />
          <span>
            Último registro:{' '}
            <strong className="font-medium text-foreground">
              {lastRecord.exercise} — {lastRecord.weight}kg × {lastRecord.reps}
            </strong>
          </span>
        </div>
      )}
    </section>
  )
}
