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

// The 7 days (Mon..Sun) of the week containing `refIso` ('YYYY-MM-DD'), or
// of the current week when omitted: [{ iso, label, isToday }]
export function weekDaysFor(refIso) {
  const ref = refIso ? new Date(`${refIso}T12:00:00`) : new Date()
  const monday = startOfWeek(ref)
  const today = todayIso()
  return Array.from({ length: 7 }, (_, i) => {
    const date = new Date(monday)
    date.setDate(monday.getDate() + i)
    const iso = toIsoDate(date)
    return { iso, label: DAY_LABELS[i], isToday: iso === today }
  })
}

export function currentWeekDays() {
  return weekDaysFor(null)
}

// Calendar grid for a month (month is 0-11): an array of weeks (Mon..Sun),
// each day { iso, day, inMonth, isToday }. Includes the leading/trailing days
// of neighbouring months so every row is a full week.
export function monthGrid(year, month) {
  const last = new Date(year, month + 1, 0)
  const cursor = startOfWeek(new Date(year, month, 1))
  const today = todayIso()
  const weeks = []
  do {
    const week = []
    for (let i = 0; i < 7; i++) {
      const iso = toIsoDate(cursor)
      week.push({
        iso,
        day: cursor.getDate(),
        inMonth: cursor.getMonth() === month,
        isToday: iso === today,
      })
      cursor.setDate(cursor.getDate() + 1)
    }
    weeks.push(week)
  } while (cursor <= last)
  return weeks
}
