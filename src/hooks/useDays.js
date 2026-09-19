import { useRef, useState } from 'react'

// Manages the list of days (Día 1, Día 2...) for a plan/template editor.
// Returns everything the editor needs: the day list, which one is active,
// add/remove handlers, and the refs used to read each day's items on save.
export function useDays() {
  const [days, setDays] = useState([{ key: 1 }])
  const [activeKey, setActiveKey] = useState(1)
  const nextDayKey = useRef(2)
  const dayRefs = useRef({})

  function addDay() {
    const key = nextDayKey.current++
    setDays((prev) => [...prev, { key }])
    setActiveKey(key)
  }

  function removeDay(key) {
    if (days.length <= 1) return
    if (!confirm('¿Quitar este día? Se pierde lo que cargaste en él.')) return
    const index = days.findIndex((d) => d.key === key)
    const remaining = days.filter((d) => d.key !== key)
    setDays(remaining)
    if (activeKey === key) setActiveKey(remaining[Math.max(0, index - 1)].key)
  }

  // Items of every day in order, plus the index of the first day with no
  // items (-1 if none) — that day also becomes the active tab.
  function collectItems() {
    const itemsPerDay = days.map((d) => dayRefs.current[d.key]?.getCleanItems() ?? [])
    const emptyIndex = itemsPerDay.findIndex((items) => items.length === 0)
    if (emptyIndex !== -1) setActiveKey(days[emptyIndex].key)
    return { itemsPerDay, emptyIndex }
  }

  return { days, activeKey, setActiveKey, addDay, removeDay, dayRefs, collectItems }
}
