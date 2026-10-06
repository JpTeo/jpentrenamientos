import { Link } from 'react-router-dom'
import { ChevronLeft, Users } from 'lucide-react'
import { useAuth } from '../../contexts/useAuth'
import { useCommunityRanking } from '../../hooks/useCommunityRanking'
import { pointsLabel } from '../../lib/challenges'
import RankingList from '../../components/RankingList'

export default function Community() {
  const { user, profile } = useAuth()
  const { rows, loading, error } = useCommunityRanking(profile?.createdBy)
  const mine = rows.find((r) => r.id === user.uid)

  return (
    <section className="mt-12 max-w-3xl">
      <Link
        to="/alumno"
        className="mb-8 flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="size-4" aria-hidden="true" /> Volver al resumen
      </Link>
      <p className="font-mono text-xs tracking-[0.2em] text-accent-foreground uppercase">
        Todos juntos
      </p>
      <h1 className="mt-3 text-4xl font-semibold tracking-tight">Comunidad JP</h1>
      <p className="mt-3 text-muted-foreground">
        Los puntos que suma cada alumno con los desafíos y sus entrenamientos presenciales.
      </p>

      {mine && (
        <div className="mt-8 flex items-center gap-4 rounded-2xl border border-primary/30 bg-primary/5 p-5">
          <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-primary font-mono text-lg font-bold text-primary-foreground">
            {mine.rank}°
          </div>
          <div>
            <p className="text-xs font-medium tracking-wider text-muted-foreground uppercase">
              Tu lugar
            </p>
            <p className="font-semibold">
              {pointsLabel(mine.points)}{' '}
              <span className="font-normal text-muted-foreground">· de {rows.length} alumnos</span>
            </p>
          </div>
        </div>
      )}

      <h2 className="mt-10 flex items-center gap-2 text-sm font-medium tracking-wider text-muted-foreground uppercase">
        <Users className="size-4" aria-hidden="true" /> Ranking
      </h2>

      {loading || !profile ? (
        <p className="mt-4 text-sm text-muted-foreground">Cargando…</p>
      ) : error ? (
        <p className="mt-4 text-sm text-red-400">
          No se pudo cargar la comunidad. Probá de nuevo en un rato.
        </p>
      ) : rows.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">Todavía no hay alumnos en la comunidad.</p>
      ) : (
        <RankingList rows={rows} meId={user.uid} />
      )}
    </section>
  )
}
