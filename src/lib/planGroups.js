// Plans created from a multi-day import/template are titled like
// "Full Body - Día 1", "Full Body - Día 2"... This groups a student's flat
// list of plans back into one card per real-world "planificación", with its
// days as children, purely by parsing that trailing "- Día N" suffix — no
// schema change needed, and it works retroactively on existing plans.
const DAY_SUFFIX_RE = /^(.*?)\s*-\s*(d[ií]a\s+(\d+))\s*$/i

export function splitPlanTitle(title) {
  const match = (title || '').match(DAY_SUFFIX_RE)
  if (!match) return { groupTitle: title || '', dayLabel: null, dayNumber: null }
  return {
    groupTitle: match[1].trim(),
    dayLabel: `Día ${match[3]}`,
    dayNumber: Number(match[3]),
  }
}

// Groups a list of plans (each needs at least {id, title}) by their derived
// groupTitle. Returns [{ groupTitle, plans: [{ ...plan, dayLabel, dayNumber }] }],
// with each group's plans sorted by day number.
export function groupPlansByTitle(plans) {
  const map = new Map()
  for (const plan of plans) {
    const { groupTitle, dayLabel, dayNumber } = splitPlanTitle(plan.title)
    const key = groupTitle.toLowerCase()
    if (!map.has(key)) map.set(key, { groupTitle, plans: [] })
    map.get(key).plans.push({ ...plan, dayLabel, dayNumber })
  }
  const groups = Array.from(map.values())
  for (const group of groups) {
    group.plans.sort((a, b) => (a.dayNumber ?? 0) - (b.dayNumber ?? 0))
  }
  return groups
}
