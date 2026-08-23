import { useEffect, useState } from 'react'
import {
  collection,
  query,
  where,
  onSnapshot,
  getDocs,
  writeBatch,
  doc,
} from 'firebase/firestore'
import { db } from '../../firebase/config'
import { createStudentAccount } from '../../firebase/createStudent'
import { useAuth } from '../../contexts/useAuth'

function generatePassword() {
  return Math.random().toString(36).slice(-8)
}

function StudentRow({ student, onDelete }) {
  const [showPassword, setShowPassword] = useState(false)
  const [copied, setCopied] = useState(false)
  const [deleting, setDeleting] = useState(false)

  async function handleCopy() {
    const message = `¡Hola ${student.name}! Ya podés entrar a ver tus planificaciones:\n${window.location.origin}\n\nUsuario: ${student.email}\nContraseña: ${student.tempPassword ?? '(no disponible)'}`
    await navigator.clipboard.writeText(message)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  async function handleDelete() {
    if (
      !confirm(
        `¿Eliminar a ${student.name}? Va a perder el acceso a la app y se van a borrar sus planificaciones asignadas.`,
      )
    )
      return
    setDeleting(true)
    try {
      await onDelete(student)
    } finally {
      setDeleting(false)
    }
  }

  return (
    <li className="flex flex-wrap items-center justify-between gap-3 py-3">
      <div>
        <p className="font-medium text-slate-900">{student.name}</p>
        <p className="text-sm text-slate-500">{student.email}</p>
        {student.tempPassword && (
          <p className="mt-0.5 font-mono text-sm text-slate-500">
            {showPassword ? student.tempPassword : '••••••••'}{' '}
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="ml-1 font-sans text-xs font-medium text-slate-400 hover:text-slate-600"
            >
              {showPassword ? 'ocultar' : 'ver'}
            </button>
          </p>
        )}
      </div>
      <div className="flex items-center gap-2">
        {student.tempPassword && (
          <button
            type="button"
            onClick={handleCopy}
            className="rounded-lg px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100"
          >
            {copied ? 'Copiado ✓' : 'Copiar para WhatsApp'}
          </button>
        )}
        <button
          type="button"
          onClick={handleDelete}
          disabled={deleting}
          className="rounded-lg px-3 py-1.5 text-sm font-medium text-red-500 hover:bg-red-50 disabled:opacity-60"
        >
          {deleting ? 'Eliminando…' : 'Eliminar'}
        </button>
      </div>
    </li>
  )
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

  async function handleDeleteStudent(student) {
    setError('')
    try {
      const plansQuery = query(
        collection(db, 'plans'),
        where('studentId', '==', student.id),
        where('coachId', '==', user.uid),
      )
      const plansSnap = await getDocs(plansQuery)
      const batch = writeBatch(db)
      plansSnap.forEach((planDoc) => batch.delete(planDoc.ref))
      batch.delete(doc(db, 'users', student.id))
      await batch.commit()
    } catch {
      setError('No se pudo eliminar al alumno. Intentá de nuevo.')
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
              <StudentRow key={s.id} student={s} onDelete={handleDeleteStudent} />
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
