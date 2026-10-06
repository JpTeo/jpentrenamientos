import { Medal } from 'lucide-react'

const MEDAL_COLORS = ['text-amber-400', 'text-slate-300', 'text-orange-400']

// Ranked list of students with their points; `meId` highlights the viewer.
export default function RankingList({ rows, meId }) {
  return (
    <ol className="mt-4 flex flex-col gap-2">
      {rows.map((r) => {
        const isMe = r.id === meId
        return (
          <li
            key={r.id}
            className={`flex items-center gap-3 rounded-xl border px-4 py-3 ${
              isMe ? 'border-primary/50 bg-primary/5' : 'border-border bg-card'
            }`}
          >
            <span className="flex w-8 shrink-0 justify-center">
              {r.rank <= 3 && r.points > 0 ? (
                <Medal
                  className={`size-5 ${MEDAL_COLORS[r.rank - 1]}`}
                  aria-label={`Puesto ${r.rank}`}
                />
              ) : (
                <span className="font-mono text-sm text-muted-foreground">{r.rank}</span>
              )}
            </span>
            <span className="min-w-0 flex-1 truncate font-medium">
              {r.name}
              {isMe && (
                <span className="ml-2 rounded-full bg-primary/15 px-2 py-0.5 text-xs font-semibold text-primary">
                  Vos
                </span>
              )}
            </span>
            <span className="font-mono text-sm font-semibold text-primary">{r.points} pts</span>
          </li>
        )
      })}
    </ol>
  )
}
