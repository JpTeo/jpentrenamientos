// Traducción de las estadísticas de cada socio (enteros 1..5) a los números
// reales que consume `FisicaKart`. Es el único lugar donde se decide qué tan
// distinto se siente cada personaje: la física no vuelve a mirar `estadisticas`.
//
// FÓRMULA
// -------
// Toda estadística `e` (1..5) se normaliza a
//
//     n = (e - 3) / 2        →  -1 (mínimo) | 0 (medio) | +1 (máximo)
//
// y cada parámetro se obtiene con una recta sobre su valor base:
//
//     valor = base * (1 + rango * n)
//
// donde `rango` es la fracción que el parámetro puede moverse hacia arriba o
// hacia abajo respecto del socio medio. Algunos parámetros dependen de dos
// estadísticas (por ejemplo la aceleración también la castiga el peso): en ese
// caso se multiplican las dos rectas. Los rangos son chicos a propósito —
// estilo Mario Kart, donde ningún personaje es objetivamente injugable— y
// están elegidos para que ninguna combinación rompa las reglas del derrape
// (ver `tasaDerrape`).
import { KART, VELOCIDAD, DERRAPE } from '../core/constantes.js'
import { SOCIOS_POR_ID } from '../characters/socios.js'
import { clamp } from '../core/utils.js'

/** Estadísticas del socio medio, usadas cuando faltan datos. */
export const ESTADISTICAS_MEDIAS = Object.freeze({
  velocidad: 3,
  aceleracion: 3,
  peso: 3,
  manejo: 3,
  traccion: 3,
})

/**
 * Valores del kart "medio" (todas las estadísticas en 3). Cualquier personaje
 * es una desviación de esta base.
 */
export const PARAMS_BASE = Object.freeze({
  /** Tope de velocidad en asfalto, sin turbo ni monedas (m/s). */
  velocidadMax: VELOCIDAD.base,
  /** Constante de la aceleración asintótica `v += (vMax - v) * k * dt` (1/s). */
  aceleracion: 1.15,
  /** Ídem para la marcha atrás (más floja: el kart no es un auto de rally). */
  aceleracionAtras: 0.9,
  /** Tope de marcha atrás (m/s). */
  velocidadAtras: VELOCIDAD.marchaAtras,
  /** Desaceleración del freno de pie (m/s²). */
  freno: 21,
  /** Masa del conjunto kart + piloto (kg). Sólo se usa para empujones. */
  masa: KART.masaBase,
  /** Velocidad angular de guiñada máxima (rad/s) a velocidad de trabajo. */
  giroMax: 2.05,
  /** Multiplicador de la fricción lateral (1 = agarre de referencia). */
  agarre: 1,
  /** Fracción del agarre que queda mientras se derrapa. */
  agarreDerrape: 0.34,
  /** Segundos de carga de mini-turbo por segundo de derrape. */
  tasaDerrape: 1,
  /** Multiplica la duración del mini-turbo otorgado (`DERRAPE.turboNivel`). */
  factorMiniTurbo: 1,
  /** Cuánto cuesta desplazar a este kart en un choque (1 = referencia). */
  resistenciaEmpuje: 1,
})

/**
 * Rango (± fracción) que cada parámetro se mueve con su estadística principal.
 * Cambiar acá cambia el "spread" del roster entero.
 */
export const RANGOS = Object.freeze({
  velocidad: 0.1, // velocidad ↑  →  tope ±10 %
  aceleracion: 0.3, // aceleración ↑ → constante k ±30 %
  aceleracionPorPeso: 0.07, // peso ↑ → arranca peor
  velocidadAtrasPorVelocidad: 0.08,
  frenoPorTraccion: 0.15,
  masa: 0.28, // peso ↑ → masa ±28 %
  giroPorManejo: 0.2, // manejo ↑ → gira más cerrado
  giroPorPeso: 0.05, // peso ↑ → gira un pelín peor
  agarrePorTraccion: 0.2,
  derrapePorManejo: 0.12, // manejo ↑ → carga el mini-turbo antes
  miniTurboPorTraccion: 0.1,
  empujePorPeso: 0.35, // peso ↑ → te empujan menos
})

/** Normaliza una estadística 1..5 al rango -1..1. */
export function normalizar(e) {
  return clamp((Number(e) || 3) - 3, -2, 2) / 2
}

const recta = (base, rango, n) => base * (1 + rango * n)

/**
 * Calcula los parámetros reales a partir de un objeto de estadísticas.
 * @param {{velocidad,aceleracion,peso,manejo,traccion}} estadisticas 1..5 cada una
 * @returns {typeof PARAMS_BASE & {escala:number, radioGiroMin:number}}
 */
export function parametrosDeEstadisticas(estadisticas) {
  const e = estadisticas || ESTADISTICAS_MEDIAS
  const nVel = normalizar(e.velocidad)
  const nAce = normalizar(e.aceleracion)
  const nPeso = normalizar(e.peso)
  const nMan = normalizar(e.manejo)
  const nTra = normalizar(e.traccion)

  const velocidadMax = recta(PARAMS_BASE.velocidadMax, RANGOS.velocidad, nVel)
  const giroMax =
    recta(PARAMS_BASE.giroMax, RANGOS.giroPorManejo, nMan) * (1 - RANGOS.giroPorPeso * nPeso)

  const p = {
    velocidadMax,
    aceleracion:
      recta(PARAMS_BASE.aceleracion, RANGOS.aceleracion, nAce) *
      (1 - RANGOS.aceleracionPorPeso * nPeso),
    aceleracionAtras: recta(PARAMS_BASE.aceleracionAtras, RANGOS.aceleracion * 0.5, nAce),
    velocidadAtras: recta(
      PARAMS_BASE.velocidadAtras,
      RANGOS.velocidadAtrasPorVelocidad,
      nVel,
    ),
    freno: recta(PARAMS_BASE.freno, RANGOS.frenoPorTraccion, nTra),
    masa: recta(PARAMS_BASE.masa, RANGOS.masa, nPeso),
    giroMax,
    agarre: recta(PARAMS_BASE.agarre, RANGOS.agarrePorTraccion, nTra),
    agarreDerrape: PARAMS_BASE.agarreDerrape,
    tasaDerrape: recta(PARAMS_BASE.tasaDerrape, RANGOS.derrapePorManejo, nMan),
    factorMiniTurbo: recta(PARAMS_BASE.factorMiniTurbo, RANGOS.miniTurboPorTraccion, nTra),
    resistenciaEmpuje: recta(PARAMS_BASE.resistenciaEmpuje, RANGOS.empujePorPeso, nPeso),
    // Derivados útiles para HUD / IA / cámara.
    escala: velocidadMax / VELOCIDAD.base,
    // Radio de giro más cerrado alcanzable (a la velocidad donde el giro es máximo).
    radioGiroMin: (velocidadMax * 0.35) / giroMax,
    // Segundos de derrape necesarios para cada chispa, ya corregidos por manejo.
    tiempoNivel: [
      0,
      DERRAPE.umbralNivel1 / recta(1, RANGOS.derrapePorManejo, nMan),
      DERRAPE.umbralNivel2 / recta(1, RANGOS.derrapePorManejo, nMan),
      DERRAPE.umbralNivel3 / recta(1, RANGOS.derrapePorManejo, nMan),
    ],
    estadisticas: {
      velocidad: e.velocidad ?? 3,
      aceleracion: e.aceleracion ?? 3,
      peso: e.peso ?? 3,
      manejo: e.manejo ?? 3,
      traccion: e.traccion ?? 3,
    },
  }
  return Object.freeze(p)
}

const CACHE = new Map()

/**
 * Parámetros de un socio registrado. El resultado está cacheado y congelado:
 * es seguro guardarlo por referencia.
 * @param {'jp'|'male'|'keke'|'mati'|string} idPersonaje
 */
export function parametrosDe(idPersonaje) {
  const id = idPersonaje || 'jp'
  const cacheado = CACHE.get(id)
  if (cacheado) return cacheado
  const socio = SOCIOS_POR_ID[id]
  const p = parametrosDeEstadisticas(socio ? socio.estadisticas : ESTADISTICAS_MEDIAS)
  CACHE.set(id, p)
  return p
}

/** Tabla completa (para el HUD de selección de personaje). */
export function tablaParametros() {
  const t = {}
  for (const id of Object.keys(SOCIOS_POR_ID)) t[id] = parametrosDe(id)
  return t
}

export default { PARAMS_BASE, RANGOS, parametrosDe, parametrosDeEstadisticas, tablaParametros }
