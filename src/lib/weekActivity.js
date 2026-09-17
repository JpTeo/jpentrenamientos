const DAY_LABELS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']

function dateOnly(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

export function toIsoDate(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function todayIso() {
  return toIsoDate(new Date())
}

// Monday (local time) of the week containing `date`.
function startOfWeek(date) {
  const d = dateOnly(date)
  const day = d.getDay() // 0 = Sunday
  const diff = day === 0 ? -6 : 1 - day
  d.setDate(d.getDate() + diff)
  return d
}

// The 7 days (Mon..Sun) of the current week: [{ iso, label, isToday }]
export function currentWeekDays() {
  const monday = startOfWeek(new Date())
  const today = todayIso()
  return Array.from({ length: 7 }, (_, i) => {
    const date = new Date(monday)
    date.setDate(monday.getDate() + i)
    const iso = toIsoDate(date)
    return { iso, label: DAY_LABELS[i], isToday: iso === today }
  })
}
