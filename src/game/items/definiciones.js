// Fichas de los 11 ítems del juego.
//
// Este archivo es la ÚNICA fuente de verdad sobre qué hace cada ítem: nombre,
// texto para el HUD, color, si se puede arrastrar/mantener atrás, cuántos usos
// da y todos los números de balance (duraciones, radios, velocidades).
//
// La tabla de probabilidades por puesto vive en `probabilidades.js` y se
// re-exporta desde acá por comodidad (ver documentación al final).
//
// Convenciones:
//   - `tipo`     : 'trampa' | 'proyectil' | 'refuerzo' | 'global' | 'monturas'
//   - `arrastrable`: se puede MANTENER el botón para dejarlo colgando atrás
//                    como escudo; al soltar, se dispara.
//   - `usos`     : cuántas veces se puede apretar el botón antes de gastarlo.
//   - `orbita`   : el ítem gira alrededor del kart mientras quede stock.
//   - `golpe`    : tipo que se le pasa a `FisicaKart.golpear(tipo)`.
import { COLORES_ITEM } from '../assets/paleta.js'
import { VELOCIDAD } from '../core/constantes.js'
import { TABLA_PROBABILIDADES, describirTabla, sortear } from './probabilidades.js'

/** Duración de la ruleta al tomar una caja, en segundos. */
export const DURACION_RULETA = 1.2

/** Cada cuánto cambia el ítem que se muestra durante la ruleta (segundos). */
export const PASO_RULETA = 0.075

/** Segundos que tarda una caja de ítem en reaparecer después de ser tomada. */
export const REAPARICION_CAJA = 4

/** Radio (m) dentro del cual un kart toma una caja de ítem. */
export const RADIO_CAJA = 1.7

/** Orden canónico de los ítems: define el orden de la ruleta y de las tablas. */
export const ORDEN_ITEMS = [
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

/**
 * Ficha completa de cada ítem.
 * @type {Record<string, object>}
 */
export const ITEMS = {
  banana: {
    id: 'banana',
    nombre: 'Banana',
    descripcion: 'Cáscara traicionera. Se deja atrás o se arrastra como escudo; el que la pisa hace un trompo.',
    icono: '🍌',
    color: COLORES_ITEM.banana,
    colorSecundario: 0x8a5a2c,
    tipo: 'trampa',
    arrastrable: true,
    usos: 1,
    orbita: false,
    // Física del objeto una vez soltado.
    radio: 0.62,
    vida: 40, // segundos en pista antes de desaparecer
    velocidadLanzada: 16, // m/s si se tira hacia adelante
    golpe: 'giro',
    duracionGolpe: 1.05,
    sonidoUso: 'banana',
    sonidoImpacto: 'banana',
    efectoImpacto: 'impacto',
    escalaModelo: 1,
  },

  caparazonVerde: {
    id: 'caparazonVerde',
    nombre: 'Caparazón verde',
    descripcion: 'Sale disparado en línea recta y rebota hasta 4 veces en los muros. Puntería propia.',
    icono: '🐢',
    color: COLORES_ITEM.caparazonVerde,
    colorSecundario: 0xf2efe0,
    tipo: 'proyectil',
    arrastrable: true,
    usos: 1,
    orbita: false,
    radio: 0.55,
    vida: 9,
    velocidad: 34,
    rebotesMax: 4,
    golpe: 'volcar',
    duracionGolpe: 1.15,
    sonidoUso: 'caparazon',
    sonidoImpacto: 'choque',
    efectoImpacto: 'impacto',
    escalaModelo: 1,
  },

  caparazonRojo: {
    id: 'caparazonRojo',
    nombre: 'Caparazón rojo',
    descripcion: 'Persigue al rival de adelante siguiendo la curva de la pista. Se rompe si se come un muro.',
    icono: '🎯',
    color: COLORES_ITEM.caparazonRojo,
    colorSecundario: 0xf2efe0,
    tipo: 'proyectil',
    arrastrable: true,
    usos: 1,
    orbita: false,
    radio: 0.55,
    vida: 8.5,
    velocidad: 32,
    velocidadBusqueda: 3.4, // m/s de corrección lateral hacia el objetivo
    alcanceBusqueda: 190, // metros de pista por delante donde busca víctima
    golpe: 'volcar',
    duracionGolpe: 1.25,
    sonidoUso: 'caparazon',
    sonidoImpacto: 'choque',
    efectoImpacto: 'impacto',
    escalaModelo: 1,
  },

  triple: {
    id: 'triple',
    nombre: 'Caparazones triples',
    descripcion: 'Tres caparazones rojos orbitando el kart. Protegen mientras giran y se disparan de a uno.',
    icono: '🔴',
    color: COLORES_ITEM.triple,
    colorSecundario: 0xf2efe0,
    tipo: 'proyectil',
    arrastrable: false,
    usos: 3,
    orbita: true,
    base: 'caparazonRojo', // qué proyectil dispara cada uso
    radioOrbita: 1.85,
    velocidadOrbita: 2.6, // rad/s
    alturaOrbita: 0.55,
    golpe: 'volcar',
    sonidoUso: 'caparazon',
    escalaModelo: 0.8,
  },

  hongo: {
    id: 'hongo',
    nombre: 'Hongo',
    descripcion: 'Turbo instantáneo de 1,6 s. Sirve para cortar camino por el pasto sin perder velocidad.',
    icono: '🍄',
    color: COLORES_ITEM.hongo,
    colorSecundario: 0xfff0d0,
    tipo: 'refuerzo',
    arrastrable: false,
    usos: 1,
    orbita: false,
    duracion: 1.6,
    fuerza: 1.25,
    sonidoUso: 'turbo',
    escalaModelo: 1,
  },

  hongoTriple: {
    id: 'hongoTriple',
    nombre: 'Hongos triples',
    descripcion: 'Tres hongos orbitando. Tres turbos guardados para encadenar atajos.',
    icono: '🍄',
    color: COLORES_ITEM.hongoTriple,
    colorSecundario: 0xfff0d0,
    tipo: 'refuerzo',
    arrastrable: false,
    usos: 3,
    orbita: true,
    base: 'hongo',
    duracion: 1.6,
    fuerza: 1.25,
    radioOrbita: 1.7,
    velocidadOrbita: 3.1,
    alturaOrbita: 0.7,
    sonidoUso: 'turbo',
    escalaModelo: 0.75,
  },

  rayo: {
    id: 'rayo',
    nombre: 'Rayo',
    descripcion: 'Fulmina a TODOS los rivales: los encoge, los frena y les hace perder monedas. A vos no te toca.',
    icono: '⚡',
    color: COLORES_ITEM.rayo,
    colorSecundario: 0xfff7a8,
    tipo: 'global',
    arrastrable: false,
    usos: 1,
    orbita: false,
    duracionAplastado: 6.5,
    monedasRobadas: 3,
    frenado: 0.42, // se conserva este porcentaje de la velocidad
    duracionDestello: 0.55,
    golpe: 'aplastar',
    sonidoUso: 'rayo',
    escalaModelo: 1,
  },

  estrella: {
    id: 'estrella',
    nombre: 'Estrella',
    descripcion: '7,5 s de invencibilidad, más velocidad y atropellás a todo el que toques.',
    icono: '⭐',
    color: COLORES_ITEM.estrella,
    colorSecundario: 0xffffff,
    tipo: 'refuerzo',
    arrastrable: false,
    usos: 1,
    orbita: false,
    duracion: 7.5,
    fuerza: 1.12,
    radioAtropello: 2.1,
    golpe: 'volcar',
    sonidoUso: 'estrella',
    escalaModelo: 1,
  },

  bomba: {
    id: 'bomba',
    nombre: 'Bomba',
    descripcion: 'Se tira o se deja atrás. Explota por proximidad o a los 3 s, y se lleva puesto a todo el que esté cerca.',
    icono: '💣',
    color: COLORES_ITEM.bomba,
    colorSecundario: 0xff8a00,
    tipo: 'trampa',
    arrastrable: true,
    usos: 1,
    orbita: false,
    radio: 0.5,
    mecha: 3,
    radioProximidad: 3.2,
    radioExplosion: 6.8,
    velocidad: 22,
    vida: 12,
    golpe: 'volcar',
    duracionGolpe: 1.4,
    sonidoUso: 'item',
    sonidoImpacto: 'explosion',
    efectoImpacto: 'ondaExpansiva',
    escalaModelo: 1,
  },

  bala: {
    id: 'bala',
    nombre: 'Bala',
    descripcion: '7 s de piloto automático a toda velocidad por el eje de la pista, invencible y llevándose a todos puestos.',
    icono: '🚀',
    color: COLORES_ITEM.bala,
    colorSecundario: 0x9aa4b2,
    tipo: 'monturas',
    arrastrable: false,
    usos: 1,
    orbita: false,
    duracion: 7,
    velocidad: VELOCIDAD.bala,
    radioAtropello: 2.4,
    suavizadoLateral: 3.5,
    golpe: 'volcar',
    sonidoUso: 'turbo',
    escalaModelo: 1,
  },

  monedas: {
    id: 'monedas',
    nombre: 'Monedas',
    descripcion: 'Tres monedas al bolsillo y un empujoncito. Poco glamoroso, pero suma velocidad punta.',
    icono: '🪙',
    color: COLORES_ITEM.monedas,
    colorSecundario: 0xfff3b0,
    tipo: 'refuerzo',
    arrastrable: false,
    usos: 1,
    orbita: false,
    cantidad: 3,
    duracion: 0.45, // empujoncito
    fuerza: 0.55,
    sonidoUso: 'moneda',
    escalaModelo: 1,
  },
}

/** Tope de monedas de un corredor (coincide con `EstadoKart.monedas`). */
export const MAX_MONEDAS = 10

/** @returns {boolean} true si `id` es uno de los 11 ítems válidos. */
export const esItem = (id) => Object.prototype.hasOwnProperty.call(ITEMS, id)

/** Ficha del ítem, o `null` si no existe. */
export const definicion = (id) => (esItem(id) ? ITEMS[id] : null)

/** Cantidad de usos que otorga el ítem (1 o 3). */
export const usosDe = (id) => (esItem(id) ? ITEMS[id].usos : 0)

/** true si el ítem se puede mantener colgando atrás como escudo. */
export const esArrastrable = (id) => !!(esItem(id) && ITEMS[id].arrastrable)

/** true si el ítem orbita el kart mientras quede stock (triples). */
export const esOrbital = (id) => !!(esItem(id) && ITEMS[id].orbita)

/** Color del ítem para HUD, partículas y luces. */
export const colorDe = (id) => (esItem(id) ? ITEMS[id].color : 0xffffff)

/** Índice del ítem dentro de `ORDEN_ITEMS` (útil para serializar en red). */
export const indiceDe = (id) => ORDEN_ITEMS.indexOf(id)

/** Ítem a partir de su índice (inverso de `indiceDe`). */
export const itemPorIndice = (i) => ORDEN_ITEMS[i] ?? null

// ---------------------------------------------------------------------------
// Documentación de la tabla de probabilidades
// ---------------------------------------------------------------------------
//
// La tabla completa está en `probabilidades.js` (`TABLA_PROBABILIDADES`) y son
// pesos en porcentaje, uno por puesto de 1º a 8º. Resumen de la intención:
//
//   1º  banana 30 · verde 25 · monedas 30 · bomba 7 · rojo 5 · hongo 3
//       → sólo defensa y monedas. Nunca rayo, bala ni estrella.
//   2º  entra el rojo (14) y aparece el triple (3). Sigue sin ítems de remontada.
//   3º-4º zona de transición: el rojo manda, asoman estrella y rayo con cuentagotas.
//   5º-6º ítems de pelea: triple, hongos triples, estrella y rayo suben fuerte.
//   7º-8º remontada pura: bala (13/24), estrella (16/20), rayo (14/16).
//
// `sortear(puesto, total, vuelta, rng)` interpola la fila cuando la carrera
// tiene menos (o más) de 8 corredores, y en la última vuelta sube un ~35% el
// peso de los ítems agresivos y baja un ~30% el de los pasivos.
export { TABLA_PROBABILIDADES, describirTabla, sortear }

export default ITEMS
