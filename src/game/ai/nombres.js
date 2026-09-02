// Los ocho rivales CPU de Teo Kart.
//
// Los cuatro socios de verdad son Jp, Male, Keke y Mati (`characters/socios.js`).
// Estos ocho son relleno: cuando faltan humanos, la parrilla se completa con
// gente de la cooperativa que se tomó el campeonato demasiado en serio. Cada
// uno reutiliza el modelo de un socio (`personaje`) y aporta su propia
// personalidad al volante y su color de chapa para el HUD.
//
// `personalidad` ∈ 'agresivo' | 'prolijo' | 'tramposo' | 'torpe'  (ver DriverIA.js)
// `personaje`    ∈ 'jp' | 'male' | 'keke' | 'mati'

/** @typedef {'agresivo'|'prolijo'|'tramposo'|'torpe'} Personalidad */

/**
 * Rivales CPU en el orden en que se usan para completar la parrilla.
 * El orden importa: los primeros salen en más carreras, así que arriba van
 * los más carismáticos y con personalidades variadas.
 */
export const RIVALES_CPU = [
  {
    id: 'tesorero',
    nombre: 'Tesorero Turbo',
    nombreCorto: 'Tesorero',
    personaje: 'jp',
    personalidad: 'agresivo',
    color: 0xff8a1f,
    lema: 'La caja cierra y la curva también.',
  },
  {
    id: 'auditora',
    nombre: 'Auditora Veloz',
    nombreCorto: 'Auditora',
    personaje: 'male',
    personalidad: 'prolijo',
    color: 0x9b5cff,
    lema: 'Cada vuelta, con comprobante.',
  },
  {
    id: 'delegado',
    nombre: 'Delegado Derrape',
    nombreCorto: 'Delegado',
    personaje: 'keke',
    personalidad: 'tramposo',
    color: 0x00d6a4,
    lema: 'El atajo también es una moción.',
  },
  {
    id: 'vocala',
    nombre: 'Vocala Volantazo',
    nombreCorto: 'Vocala',
    personaje: 'mati',
    personalidad: 'torpe',
    color: 0xffd166,
    lema: 'Yo venía derecho, lo juro.',
  },
  {
    id: 'sindico',
    nombre: 'Síndico Sónico',
    nombreCorto: 'Síndico',
    personaje: 'jp',
    personalidad: 'prolijo',
    color: 0x3d7bff,
    lema: 'Control de gestión a 90 por hora.',
  },
  {
    id: 'prosecre',
    nombre: 'Prosecre Nitro',
    nombreCorto: 'Prosecre',
    personaje: 'male',
    personalidad: 'agresivo',
    color: 0xff4d6d,
    lema: 'Levanto el acta después de pasarte.',
  },
  {
    id: 'revisora',
    nombre: 'Revisora de Curvas',
    nombreCorto: 'Revisora',
    personaje: 'keke',
    personalidad: 'prolijo',
    color: 0x7ee081,
    lema: 'Reviso cuentas y también apexes.',
  },
  {
    id: 'asambleista',
    nombre: 'Asambleísta Bólido',
    nombreCorto: 'Asambleísta',
    personaje: 'mati',
    personalidad: 'tramposo',
    color: 0xc86bff,
    lema: 'Mociono acelerar y se aprueba solo.',
  },
]

/** Índice por id, para buscar rápido desde el HUD o la red. */
export const RIVALES_POR_ID = Object.fromEntries(RIVALES_CPU.map((r) => [r.id, r]))

/** Ids en orden (útil para tests y para sembrar la parrilla). */
export const IDS_RIVALES = RIVALES_CPU.map((r) => r.id)

/** Ficha de un rival por id; si no existe, devuelve el primero. */
export function rivalCPU(id) {
  return RIVALES_POR_ID[id] || RIVALES_CPU[0]
}

/**
 * Los primeros `cantidad` rivales, ya listos para la parrilla.
 * Si `evitarPersonajes` trae ids de socios ya usados por humanos, se prefieren
 * los rivales cuyo personaje base todavía no está en pista (nada más que por
 * variedad visual: si no alcanzan, se repite sin drama).
 * @param {number} cantidad
 * @param {Iterable<string>} [evitarPersonajes]
 */
export function rivalesCPU(cantidad = RIVALES_CPU.length, evitarPersonajes = null) {
  const n = Math.max(0, Math.min(cantidad, RIVALES_CPU.length))
  if (!evitarPersonajes) return RIVALES_CPU.slice(0, n)
  const usados = new Set(evitarPersonajes)
  const libres = RIVALES_CPU.filter((r) => !usados.has(r.personaje))
  const repetidos = RIVALES_CPU.filter((r) => usados.has(r.personaje))
  return [...libres, ...repetidos].slice(0, n)
}

export default RIVALES_CPU
