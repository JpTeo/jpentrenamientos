import { useMemo } from 'react'
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import { colorForActivity } from '../lib/activityColors'
import { monthGrid } from '../lib/weekActivity'

const WEEKDAYS = ['L', 'M', 'M', 'J', 'V', 'S', 'D']
const MAX_DOTS = 3

function capitalize(text) {
  return text.charAt(0).toUpperCase() + text.slice(1)
}

// Small month calendar for the student's activity: dots show what was done
// each day (green = musculación, other colors = each activity). Tapping a day
// selects it (and its whole week, highlighted); the parent decides what that
// selection drives. `dayIndex` maps 'YYYY-MM-DD' -> { strength, activities }.
export default function ActivityCalendar({
  year,
  month,
  onMonthChange,
  dayIndex,
  selectedIso,
  selectedWeek,
  onSelectDay,
  onAddForDay,
}) {
  const weeks = useMemo(() => monthGrid(year, month), [year, month])
  const monthLabel = capitalize(
    new Intl.DateTimeFormat('es-AR', { month: 'long', year: 'numeric' }).format(
      new Date(year, month, 1),
    ),
  )

  const totals = useMemo(() => {
    const prefix = `${year}-${String(month + 1).padStart(2, '0')}-`
    let sessions = 0
    let otherMinutes = 0
    let activeDays = 0
    for (const [iso, entry] of Object.entries(dayIndex)) {
      if (!iso.startsWith(prefix)) continue
      sessions += entry.strength.length
      otherMinutes += entry.activities.reduce((sum, a) => sum + (Number(a.durationMinutes) || 0), 0)
      if (entry.strength.length > 0 || entry.activities.length > 0) activeDays += 1
    }
    return { sessions, otherMinutes, activeDays }
  }, [dayIndex, year, month])

  const selected = selectedIso ? dayIndex[selectedIso] : null
  const selectedLabel = selectedIso
    ? new Intl.DateTimeFormat('es-AR', { weekday: 'long', day: 'numeric', month: 'long' }).format(
        new Date(`${selectedIso}T12:00:00`),
      )
    : ''

  return (
    <div className="mt-6 rounded-xl border border-border bg-background/40 p-4">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => onMonthChange(-1)}
          aria-label="Mes anterior"
          className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <ChevronLeft className="size-4" aria-hidden="true" />
        </button>
        <p className="text-sm font-semibold">{monthLabel}</p>
        <button
          type="button"
          onClick={() => onMonthChange(1)}
          aria-label="Mes siguiente"
          className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <ChevronRight className="size-4" aria-hidden="true" />
        </button>
      </div>

      <div className="mt-3 grid grid-cols-7 gap-1 text-center text-[10px] font-medium text-muted-foreground uppercase">
        {WEEKDAYS.map((d, i) => (
          <span key={i}>{d}</span>
        ))}
      </div>

      <div className="mt-1 flex flex-col gap-1">
        {weeks.map((week) => {
          const isSelectedWeek = week.some((d) => selectedWeek?.has(d.iso))
          return (
            <div
              key={week[0].iso}
              className={`grid grid-cols-7 gap-1 rounded-lg p-0.5 ${isSelectedWeek ? 'bg-primary/10' : ''}`}
            >
              {week.map((d) => {
                const entry = dayIndex[d.iso]
                const dots = []
                if (entry?.strength.length) dots.push('bg-primary')
                for (const a of entry?.activities ?? []) {
                  const color = colorForActivity(a.activity)
                  if (!dots.includes(color)) dots.push(color)
                }
                return (
                  <button
                    key={d.iso}
                    type="button"
                    onClick={() => onSelectDay(d.iso)}
                    aria-label={d.iso}
                    aria-pressed={selectedIso === d.iso}
                    className={`flex h-10 flex-col items-center justify-center gap-0.5 rounded-md text-xs transition-colors hover:bg-muted ${
                      d.inMonth ? 'text-foreground' : 'text-muted-foreground/40'
                    } ${selectedIso === d.iso ? 'ring-2 ring-primary' : ''} ${
                      d.isToday ? 'font-bold text-primary' : ''
                    }`}
                  >
                    <span>{d.day}</span>
                    <span className="flex h-1.5 items-center gap-0.5">
                      {dots.slice(0, MAX_DOTS).map((color) => (
                        <span key={color} className={`size-1.5 rounded-full ${color}`} />
                      ))}
                    </span>
                  </button>
                )
              })}
            </div>
          )
        })}
      </div>

      <p className="mt-3 text-xs text-muted-foreground">
        {totals.activeDays === 0
          ? 'Sin actividad registrada este mes.'
          : `${totals.activeDays} ${totals.activeDays === 1 ? 'día activo' : 'días activos'} · ${totals.sessions} ${totals.sessions === 1 ? 'sesión' : 'sesiones'} de musculación · ${totals.otherMinutes} min en otras actividades`}
      </p>

      {selectedIso && (
        <div className="mt-4 border-t border-border pt-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-semibold">{capitalize(selectedLabel)}</p>
            <button
              type="button"
              onClick={() => onAddForDay(selectedIso)}
              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-primary hover:bg-primary/10"
            >
              <Plus className="size-3.5" aria-hidden="true" /> Agregar
            </button>
          </div>
          {!selected || (selected.strength.length === 0 && selected.activities.length === 0) ? (
            <p className="mt-2 text-sm text-muted-foreground">No registraste actividad este día.</p>
          ) : (
            <ul className="mt-2 flex flex-col gap-1.5">
              {selected.strength.map((s) => (
                <li key={s.id} className="flex items-center gap-2 text-sm">
                  <span className="size-2 shrink-0 rounded-full bg-primary" aria-hidden="true" />
                  <span className="flex-1 truncate">Musculación</span>
                  <span className="truncate text-xs text-muted-foreground">{s.planTitle}</span>
                </li>
              ))}
              {selected.activities.map((a) => (
                <li key={a.id} className="flex items-center gap-2 text-sm">
                  <span
                    className={`size-2 shrink-0 rounded-full ${colorForActivity(a.activity)}`}
                    aria-hidden="true"
                  />
                  <span className="flex-1 truncate">{a.activity}</span>
                  <span className="text-xs text-muted-foreground">
                    {a.durationMinutes} min · {a.intensity}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
