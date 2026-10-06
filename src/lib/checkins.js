// "Hoy entrené": in-person students tap a button on the home screen, say what
// they trained, and earn a fixed number of points once per day.
//
// NOTE: the same number is enforced in firestore.rules (`points == 30`),
// so change both together.
export const CHECKIN_POINTS = 30

export const DEFAULT_CHECKIN_LABEL = 'Entrenamiento presencial'

export const QUICK_TRAININGS = ['Cadena posterior', 'Cadena anterior', 'Tren superior', 'Full body']

// One check-in per student per calendar day: the doc id enforces it.
export function checkinDocId(uid, dateIso) {
  return `${uid}_${dateIso}`
}

export function checkinLabel(checkin) {
  return checkin?.description?.trim() || DEFAULT_CHECKIN_LABEL
}
