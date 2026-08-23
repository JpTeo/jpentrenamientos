import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { signInWithEmailAndPassword } from 'firebase/auth'
import { Eye, EyeOff } from 'lucide-react'
import { auth } from '../firebase/config'
import { useAuth } from '../contexts/useAuth'
import logo from '../assets/jp-palacios-logo.png'

export default function Login() {
  const { user, profile, loading } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [mounted, setMounted] = useState(false)

  useEffect(() => setMounted(true), [])

  if (!loading && user && profile) {
    return <Navigate to={profile.role === 'coach' ? '/coach' : '/alumno'} replace />
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password)
    } catch {
      setError('Email o contraseña incorrectos.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="login-app px-4 py-6 sm:px-6 lg:px-10">
      <div
        className={`mx-auto flex min-h-[calc(100vh-3rem)] w-full max-w-5xl overflow-hidden rounded-3xl border border-border bg-card shadow-2xl shadow-black/30 transition-all duration-700 ${
          mounted ? 'scale-100 opacity-100' : 'scale-95 opacity-0'
        }`}
      >
        <section className="hidden w-[42%] flex-col bg-black p-6 md:flex">
          <div className="flex items-center justify-between">
            <span className="font-mono text-xs font-semibold tracking-[0.3em] text-primary uppercase">
              JP Palacios
            </span>
          </div>
          <div className="flex flex-1 items-center justify-center py-8">
            <img src={logo} alt="JP Palacios Personal Trainer" className="h-auto w-full max-w-[390px] object-contain" />
          </div>
          <p className="text-center font-mono text-[10px] tracking-[0.28em] text-white/45 uppercase">
            Disciplina. Movimiento. Progreso.
          </p>
        </section>

        <section className="flex w-full flex-col justify-center px-6 py-8 sm:px-12 lg:w-[58%] lg:px-16">
          <div className="mb-8 flex justify-center md:hidden">
            <img src={logo} alt="JP Palacios Personal Trainer" className="h-auto w-full max-w-[250px] object-contain" />
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <input
              type="email"
              placeholder="Correo electrónico"
              aria-label="Correo electrónico"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="auth-input"
            />
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                placeholder="Contraseña"
                aria-label="Contraseña"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="auth-input pr-12"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                className="absolute top-1/2 right-4 -translate-y-1/2 text-muted-foreground transition-colors hover:text-primary"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            {error && <p className="text-sm text-red-400">{error}</p>}
            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-xl bg-primary py-3 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/20 transition-all hover:-translate-y-0.5 hover:brightness-105 active:translate-y-0 disabled:opacity-60"
            >
              {submitting ? 'Ingresando…' : 'Iniciar sesión'}
            </button>
          </form>
          <p className="mt-8 text-center text-xs leading-5 text-muted-foreground">
            ¿No tenés cuenta? Pedile a tu profe que te la cree.
          </p>
        </section>
      </div>
    </main>
  )
}
