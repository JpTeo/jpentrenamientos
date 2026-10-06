// Comunidad JP ranking: one row per registered student with the points they
// earned from challenges and "Hoy entrené" check-ins.
//
// profiles:    [{ id, name }]                      (directory of students)
// completions: [{ studentId, studentName, points }] (challengeCompletions)
// checkins:    [{ studentId, studentName, points }] (trainingCheckins)
//
// Students tied on points share the same rank (1, 2, 2, 4…). Anyone who has
// points but is missing from the directory still shows up, so nothing earned
// is ever hidden.
export function buildRanking(profiles, completions, checkins) {
  const byId = new Map()
  const entry = (id, name) => {
    if (!byId.has(id)) byId.set(id, { id, name: name || 'Alumno', challengePoints: 0, checkinPoints: 0 })
    const row = byId.get(id)
    if (name && row.name === 'Alumno') row.name = name
    return row
  }

  for (const p of profiles) entry(p.id, p.name)
  for (const c of completions) entry(c.studentId, c.studentName).challengePoints += Number(c.points) || 0
  for (const c of checkins) entry(c.studentId, c.studentName).checkinPoints += Number(c.points) || 0

  const rows = [...byId.values()].map((r) => ({ ...r, points: r.challengePoints + r.checkinPoints }))
  rows.sort((a, b) => b.points - a.points || a.name.localeCompare(b.name, 'es'))
  return rows.map((r) => ({ ...r, rank: 1 + rows.filter((o) => o.points > r.points).length }))
}
