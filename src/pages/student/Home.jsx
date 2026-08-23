import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { collection, query, where, onSnapshot } from 'firebase/firestore'
import { ArrowRight, Dumbbell, Trophy, Weight } from 'lucide-react'
import { db } from '../../firebase/config'
import { useAuth } from '../../contexts/useAuth'

export default function Home() {
  const { user, profile } = useAuth()
  const navigate = useNavigate()
  const [planCount, setPlanCount] = useState(0)
  const [lastRecord, setLastRecord] = useState(null)
  const [recordCount, setRecordCount] = useState(0)

  useEffect(() => {
    const q = query(collection(db, 'plans'), where('studentId', '==', user.uid))
    const unsub = onSnapshot(q, (snap) => setPlanCount(snap.size))
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

      <div className="mt-12 grid gap-4 sm:grid-cols-2">
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
