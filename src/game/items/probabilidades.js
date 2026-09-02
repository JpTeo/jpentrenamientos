// Sorteo de ítems al estilo Mario Kart: lo que te toca depende de en qué puesto
// vas. Este módulo es puro (sin three, sin estado global) para poder testearlo.
//
// ---------------------------------------------------------------------------
// TABLA DE PROBABILIDADES (pesos en % — cada columna suma exactamente 100)
// ---------------------------------------------------------------------------
//
//                     1º   2º   3º   4º   5º   6º   7º   8º
//   banana            30   22   16   11    7    4    2    0
//   caparazonVerde    25   20   15   11    8    5    3    1
//   caparazonRojo      5   14   20   20   17   13    8    4
//   triple             0    3    6    9   11   11    9    6
//   hongo              3    8   12   15   16   15   13   10
//   hongoTriple        0    0    2    5    8   11   13   14
//   rayo               0    0    1    3    6   10   14   16
//   estrella           0    0    1    4    8   12   16   20
//   bomba              7    8    9    9    8    7    5    3
//   bala               0    0    0    0    2    6   13   24
//   monedas           30   25   18   13    9    6    4    2
//                    ---  ---  ---  ---  ---  ---  ---  ---
//                    100  100  100  100  100  100  100  100
//
// Lectura de la tabla:
//   · El líder sólo saca defensa (banana, verde, bomba) y monedas: 85% de sus
//     cajas. Rayo, bala y estrella tienen peso 0 y además están bloqueados por
//     regla dura, así que el 1º NUNCA los saca.
//   · El caparazón rojo es el ítem "de media tabla": pico en 3º y 4º (20%).
//   · Los ítems de remontada (rayo, bala, estrella, hongos triples) sólo se
//     vuelven habituales del 5º para atrás: el 8º saca bala 24% y estrella 20%.
//   · El hongo es el más parejo de todos (3%..16%): siempre hay algo de turbo.
//   · Las monedas son el "premio consuelo" del que va adelante (30% en 1º) y
//     casi no aparecen al fondo (2% en 8º).
//
// Ajustes que aplica `sortear`:
//   1. Interpolación por puesto cuando la carrera no tiene 8 corredores: el
//      puesto se normaliza a 0..1 y se interpola linealmente entre columnas.
//   2. Última vuelta: los ítems agresivos suben un 35% y los pasivos bajan un
//      30% (se renormaliza), para que el final sea más picante.
import { clamp, rng as crearRng } from '../core/utils.js'

/** Ítems en el orden de las filas de la tabla. */
export const ITEMS_SORTEABLES = [
  'banana',
  'caparazonVerde',
  'caparazonRojo',
  'triple',
  'hongo',
  'hongoTriple',
  'rayo',
  'estrella',
  'bomba',
  'bala',
  'monedas',
]

/** Cantidad de columnas de la tabla (puestos 1º..8º). */
export const PUESTOS_TABLA = 8

/**
 * Pesos por puesto. Cada array tiene 8 valores (1º..8º) y cada columna suma 100.
 * @type {Record<string, number[]>}
 */
export const TABLA_PROBABILIDADES = {
  banana: [30, 22, 16, 11, 7, 4, 2, 0],
  caparazonVerde: [25, 20, 15, 11, 8, 5, 3, 1],
  caparazonRojo: [5, 14, 20, 20, 17, 13, 8, 4],
  triple: [0, 3, 6, 9, 11, 11, 9, 6],
  hongo: [3, 8, 12, 15, 16, 15, 13, 10],
  hongoTriple: [0, 0, 2, 5, 8, 11, 13, 14],
  rayo: [0, 0, 1, 3, 6, 10, 14, 16],
  estrella: [0, 0, 1, 4, 8, 12, 16, 20],
  bomba: [7, 8, 9, 9, 8, 7, 5, 3],
  bala: [0, 0, 0, 0, 2, 6, 13, 24],
  monedas: [30, 25, 18, 13, 9, 6, 4, 2],
}

/** Ítems que el líder de la carrera no puede sacar jamás (regla dura). */
export const BLOQUEADOS_LIDER = ['rayo', 'bala', 'estrella']

/** Ítems considerados "de remontada": suben en la última vuelta. */
export const AGRESIVOS = ['caparazonRojo', 'triple', 'hongoTriple', 'rayo', 'estrella', 'bala']

/** Ítems "pasivos": bajan en la última vuelta. */
export const PASIVOS = ['banana', 'caparazonVerde', 'monedas']

/** Multiplicadores de la última vuelta. */
export const AJUSTE_ULTIMA_VUELTA = { agresivo: 1.35, pasivo: 0.7 }

/** Generador de reserva (determinista) por si nadie inyecta uno. */
const rngPorDefecto = crearRng(0xa17e)

/**
 * Convierte un puesto real a la posición 0..7 de la tabla.
 * Con 8 corredores es la identidad; con menos, estira la escala para que el
 * último de la carrera reciba siempre la columna del 8º.
 */
export function filaDePuesto(puesto, total = PUESTOS_TABLA) {
  const n = Math.max(1, Math.floor(total) || 1)
  const p = clamp(Math.floor(puesto) || 1, 1, n)
  if (n === 1) return 0
  return ((p - 1) / (n - 1)) * (PUESTOS_TABLA - 1)
}

/**
 * Pesos crudos para una fila fraccionaria de la tabla (interpolación lineal).
 * @param {number} fila 0..7
 * @param {Record<string, number>} [salida] objeto reutilizable
 */
export function pesosEnFila(fila, salida = {}) {
  const f = clamp(fila, 0, PUESTOS_TABLA - 1)
  const i = Math.floor(f)
  const j = Math.min(i + 1, PUESTOS_TABLA - 1)
  const t = f - i
  for (const id of ITEMS_SORTEABLES) {
    const fila0 = TABLA_PROBABILIDADES[id]
    salida[id] = fila0[i] + (fila0[j] - fila0[i]) * t
  }
  return salida
}

/**
 * Pesos finales para un corredor concreto: fila interpolada + reglas duras +
 * ajuste de última vuelta. Los pesos salen normalizados a 100.
 *
 * @param {number} puesto 1..total
 * @param {number} total corredores en carrera
 * @param {number} vuelta vuelta actual (1..vueltas)
 * @param {object} [opciones]
 * @param {number} [opciones.vueltas=3] vueltas totales de la carrera
 * @param {Record<string, number>} [opciones.salida] objeto reutilizable
 */
export function pesosPara(puesto, total = PUESTOS_TABLA, vuelta = 1, opciones = {}) {
  const { vueltas = 3, salida = {} } = opciones
  const n = Math.max(1, Math.floor(total) || 1)
  const p = clamp(Math.floor(puesto) || 1, 1, n)
  pesosEnFila(filaDePuesto(p, n), salida)

  // Regla dura: el que va primero nunca recibe ítems de remontada.
  if (p === 1) for (const id of BLOQUEADOS_LIDER) salida[id] = 0

  // Última vuelta: se afila la pelea.
  const esUltima = vueltas > 0 && vuelta >= vueltas
  if (esUltima) {
    for (const id of AGRESIVOS) salida[id] *= AJUSTE_ULTIMA_VUELTA.agresivo
    for (const id of PASIVOS) salida[id] *= AJUSTE_ULTIMA_VUELTA.pasivo
    if (p === 1) for (const id of BLOQUEADOS_LIDER) salida[id] = 0
  }

  // Normalizamos a 100 para que la tabla se pueda leer como porcentajes.
  let suma = 0
  for (const id of ITEMS_SORTEABLES) suma += salida[id]
  if (suma <= 0) {
    // Caso imposible en la práctica, pero no dejamos al jugador sin ítem.
    for (const id of ITEMS_SORTEABLES) salida[id] = 0
    salida.banana = 100
    return salida
  }
  const k = 100 / suma
  for (const id of ITEMS_SORTEABLES) salida[id] *= k
  return salida
}

// Objeto reutilizado por `sortear` para no asignar en carrera.
const pesosTmp = {}

/**
 * Sortea un ítem. **Determinista**: usa el `generador` inyectado, nunca
 * `Math.random`.
 *
 * @param {number} puesto puesto actual del corredor (1 = líder)
 * @param {number} total corredores en carrera
 * @param {number} vuelta vuelta actual (1..vueltas)
 * @param {() => number} generador función que devuelve 0..1 (ver `rng` de utils)
 * @param {object} [opciones] `{ vueltas }`
 * @returns {string} id del ítem
 */
export function sortear(puesto, total = PUESTOS_TABLA, vuelta = 1, generador = rngPorDefecto, opciones = {}) {
  const azar = typeof generador === 'function' ? generador : rngPorDefecto
  pesosPara(puesto, total, vuelta, { ...opciones, salida: pesosTmp })
  let tirada = azar() * 100
  for (const id of ITEMS_SORTEABLES) {
    tirada -= pesosTmp[id]
    if (tirada <= 0) return id
  }
  return 'banana'
}

/**
 * Devuelve la tabla como texto alineado (para depurar en consola).
 * @param {object} [opciones] `{ vuelta, vueltas, total }`
 */
export function describirTabla(opciones = {}) {
  const { vuelta = 1, vueltas = 3, total = PUESTOS_TABLA } = opciones
  const ancho = Math.max(...ITEMS_SORTEABLES.map((s) => s.length)) + 2
  const cabecera = ' '.repeat(ancho) + Array.from({ length: total }, (_, i) => `${i + 1}º`.padStart(6)).join('')
  const filas = ITEMS_SORTEABLES.map((id) => {
    const celdas = []
    for (let p = 1; p <= total; p++) {
      const w = pesosPara(p, total, vuelta, { vueltas })[id]
      celdas.push(w.toFixed(1).padStart(6))
    }
    return id.padEnd(ancho) + celdas.join('')
  })
  return [cabecera, ...filas].join('\n')
}

export default { TABLA_PROBABILIDADES, sortear, pesosPara, describirTabla }
