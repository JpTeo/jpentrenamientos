import { useEffect, useState } from 'react'
import { collection, query, where, onSnapshot } from 'firebase/firestore'
import { db } from '../../firebase/config'
import { createStudentAccount } from '../../firebase/createStudent'
import { useAuth } from '../../contexts/useAuth'

function generatePassword() {
  return Math.random().toString(36).slice(-8)
}

export default function Students() {
  const { user } = useAuth()
  const [students, setStudents] = useState([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState({ name: '', email: '' })
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')
  const [lastCreated, setLastCreated] = useState(null)

  useEffect(() => {
    const q = query(
      collection(db, 'users'),
      where('role', '==', 'student'),
      where('createdBy', '==', user.uid),
    )
    const unsub = onSnapshot(q, (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
      list.sort((a, b) => (a.name || '').localeCompare(b.name || ''))
      setStudents(list)
      setLoading(false)
    })
    return unsub
  }, [user.uid])

  async function handleCreate(e) {
    e.preventDefault()
    setError('')
    setLastCreated(null)
    if (!form.name.trim() || !form.email.trim()) return
    setCreating(true)
    const password = generatePassword()
    try {
      await createStudentAccount({
        name: form.name.trim(),
        email: form.email.trim(),
        password,
        coachUid: user.uid,
      })
      setLastCreated({ email: form.email.trim(), password })
      setForm({ name: '', email: '' })
    } catch (err) {
      if (err.code === 'auth/email-already-in-use') {
        setError('Ya existe una cuenta con ese email.')
      } else {
        setError('No se pudo crear el alumno. Intentá de nuevo.')
      }
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-lg font-semibold text-slate-900">Nuevo alumno</h2>
        <form onSubmit={handleCreate} className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1">
            <label className="mb-1 block text-sm font-medium text-slate-700">Nombre</label>
            <input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              required
              className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-slate-500"
            />
          </div>
          <div className="flex-1">
            <label className="mb-1 block text-sm font-medium text-slate-700">Email</label>
            <input
              type="email"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              required
              className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-slate-500"
            />
          </div>
          <button
            type="submit"
            disabled={creating}
            className="rounded-lg bg-slate-900 px-4 py-2 font-medium text-white hover:bg-slate-800 disabled:opacity-60"
          >
            {creating ? 'Creando…' : 'Crear alumno'}
          </button>
        </form>
        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
        {lastCreated && (
          <div className="mt-4 rounded-lg bg-emerald-50 p-4 text-sm text-emerald-900">
            <p className="font-medium">Alumno creado. Pasale estos datos para que ingrese:</p>
            <p className="mt-1">
              Email: <span className="font-mono">{lastCreated.email}</span>
            </p>
            <p>
              Contraseña provisoria: <span className="font-mono">{lastCreated.password}</span>
            </p>
          </div>
        )}
      </div>

      <div className="rounded-2xl bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-lg font-semibold text-slate-900">Tus alumnos</h2>
        {loading ? (
          <p className="text-sm text-slate-500">Cargando…</p>
        ) : students.length === 0 ? (
          <p className="text-sm text-slate-500">Todavía no creaste ningún alumno.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {students.map((s) => (
              <li key={s.id} className="flex items-center justify-between py-3">
                <div>
                  <p className="font-medium text-slate-900">{s.name}</p>
                  <p className="text-sm text-slate-500">{s.email}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
