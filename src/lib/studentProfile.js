// Helpers for the first-login questionnaire (birth date, height, weight).

// Whole years between a 'YYYY-MM-DD' birth date and today (null if invalid).
export function ageFromBirthDate(iso, now = new Date()) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso || '')) return null
  const [y, m, d] = iso.split('-').map(Number)
  let age = now.getFullYear() - y
  const hadBirthday =
    now.getMonth() + 1 > m || (now.getMonth() + 1 === m && now.getDate() >= d)
  if (!hadBirthday) age -= 1
  return age
}

// Accepts "68,5" or "68.5"; returns a number or NaN.
export function parseDecimal(value) {
  return Number(String(value ?? '').trim().replace(',', '.'))
}

// Validates the form and returns { error } or { data } ready to store.
export function validateProfileForm({ birthDate, height, weight }, now = new Date()) {
  const age = ageFromBirthDate(birthDate, now)
  if (age === null || age < 8 || age > 100) {
    return { error: 'Revisá la fecha de nacimiento.' }
  }
  const heightCm = parseDecimal(height)
  if (!Number.isFinite(heightCm) || heightCm < 100 || heightCm > 250) {
    return { error: 'La altura tiene que estar en centímetros (entre 100 y 250).' }
  }
  const weightKg = parseDecimal(weight)
  if (!Number.isFinite(weightKg) || weightKg < 25 || weightKg > 300) {
    return { error: 'El peso tiene que estar en kilos (entre 25 y 300).' }
  }
  return {
    data: {
      birthDate,
      heightCm: Math.round(heightCm),
      weightKg: Math.round(weightKg * 10) / 10,
    },
  }
}

const numberFormat = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 1 })

// "27 años · 170 cm · 68,5 kg" from whatever of the profile is filled in.
export function describeProfile(student) {
  const parts = []
  const age = ageFromBirthDate(student?.birthDate)
  if (age !== null) parts.push(`${age} años`)
  if (student?.heightCm) parts.push(`${student.heightCm} cm`)
  if (student?.weightKg) parts.push(`${numberFormat.format(student.weightKg)} kg`)
  return parts.join(' · ')
}
