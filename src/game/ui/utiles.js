// Utilidades puras de la interfaz de Teo Kart.
// Nada de React acá: sólo funciones y tablas de texto.
import { formatearTiempo } from '../core/utils.js'

export { formatearTiempo }

/** Ordinal en español para el puesto: 1º, 2º, 3º… */
export function ordinal(n) {
  const v = Number(n)
  return Number.isFinite(v) && v > 0 ? `${Math.round(v)}º` : '—'
}

/** Recorta a 0..1 aunque llegue basura. */
export function aFraccion(v) {
  const n = Number(v)
  if (!Number.isFinite(n)) return 0
  return n < 0 ? 0 : n > 1 ? 1 : n
}

/** Milisegundos → texto de reloj, tolerante a undefined/NaN/0. */
export function tiempo(ms) {
  const n = Number(ms)
  if (!Number.isFinite(n) || n <= 0) return '--:--.---'
  return formatearTiempo(n)
}

/**
 * Normaliza un trazado `[{x, z}]` (coordenadas de mundo o ya normalizadas) a
 * puntos `{x, y}` dentro de un cuadrado 0..1, conservando la proporción y
 * centrando el resultado. Devuelve `[]` si el trazado no sirve.
 */
export function normalizarTrazado(puntos) {
  if (!Array.isArray(puntos) || puntos.length < 3) return []
  let minX = Infinity
  let maxX = -Infinity
  let minZ = Infinity
  let maxZ = -Infinity
  for (const p of puntos) {
    if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.z)) continue
    if (p.x < minX) minX = p.x
    if (p.x > maxX) maxX = p.x
    if (p.z < minZ) minZ = p.z
    if (p.z > maxZ) maxZ = p.z
  }
  if (!Number.isFinite(minX) || !Number.isFinite(minZ)) return []
  const ancho = maxX - minX
  const alto = maxZ - minZ
  const escala = Math.max(ancho, alto) || 1
  // Desplazamiento para centrar el eje más corto.
  const dx = (escala - ancho) / 2
  const dz = (escala - alto) / 2
  const salida = []
  for (const p of puntos) {
    if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.z)) continue
    salida.push({ x: (p.x - minX + dx) / escala, y: (p.z - minZ + dz) / escala })
  }
  return salida
}

/**
 * Convierte puntos normalizados en el atributo `d` de un `<path>` cerrado,
 * mapeado a un lienzo de `tam` unidades con `margen` de aire.
 */
export function trazadoADibujo(puntosNormalizados, tam = 100, margen = 8) {
  if (!puntosNormalizados.length) return ''
  const util = tam - margen * 2
  let d = ''
  for (let i = 0; i < puntosNormalizados.length; i++) {
    const p = puntosNormalizados[i]
    const x = (margen + p.x * util).toFixed(2)
    const y = (margen + p.y * util).toFixed(2)
    d += `${i === 0 ? 'M' : 'L'}${x} ${y}`
  }
  return `${d}Z`
}

/**
 * Punto sobre el trazado para un avance `t` (0..1), muestreado por longitud
 * de arco para que los corredores no se amontonen en las curvas cerradas.
 */
export function puntoEnTrazado(puntosNormalizados, t, tam = 100, margen = 8) {
  const n = puntosNormalizados.length
  if (!n) return { x: tam / 2, y: tam / 2 }
  const util = tam - margen * 2
  const avance = ((aFraccion(t) % 1) + 1) % 1
  // Longitudes acumuladas del polígono cerrado.
  let total = 0
  const acum = [0]
  for (let i = 0; i < n; i++) {
    const a = puntosNormalizados[i]
    const b = puntosNormalizados[(i + 1) % n]
    total += Math.hypot(b.x - a.x, b.y - a.y)
    acum.push(total)
  }
  if (total <= 0) {
    const p = puntosNormalizados[0]
    return { x: margen + p.x * util, y: margen + p.y * util }
  }
  const objetivo = avance * total
  let i = 0
  while (i < n && acum[i + 1] < objetivo) i++
  const a = puntosNormalizados[i % n]
  const b = puntosNormalizados[(i + 1) % n]
  const tramo = acum[i + 1] - acum[i] || 1
  const k = (objetivo - acum[i]) / tramo
  return {
    x: margen + (a.x + (b.x - a.x) * k) * util,
    y: margen + (a.y + (b.y - a.y) * k) * util,
  }
}

/** Textos de los avisos centrales del HUD, por tipo. */
export const TEXTO_AVISO = {
  caja: '¡ÍTEM!',
  vuelta: '¡NUEVA VUELTA!',
  ultimaVuelta: '¡ÚLTIMA VUELTA!',
  turboLargada: '¡TURBO DE LARGADA!',
  adelantaste: '¡LO PASASTE!',
  tePasaron: '¡TE PASARON!',
  golpe: '¡AY!',
  // Tipos extra que la carrera puede empezar a emitir sin romper el HUD.
  miniTurbo: '¡MINI-TURBO!',
  vueltaRapida: '¡VUELTA RÁPIDA!',
  cuidado: '¡CUIDADO!',
  sentidoContrario: '¡SENTIDO CONTRARIO!',
}

/** Variante visual de cada aviso. */
export const ESTILO_AVISO = {
  caja: 'tk-aviso--turbo',
  vuelta: 'tk-aviso--rapida',
  ultimaVuelta: 'tk-aviso--peligro',
  turboLargada: 'tk-aviso--turbo',
  adelantaste: 'tk-aviso--rapida',
  tePasaron: 'tk-aviso--malo',
  golpe: 'tk-aviso--malo',
  miniTurbo: 'tk-aviso--turbo',
  vueltaRapida: 'tk-aviso--rapida',
  cuidado: 'tk-aviso--peligro',
  sentidoContrario: 'tk-aviso--contrario',
}

/** Consejos de conducción para la pantalla de carga. */
export const CONSEJOS = [
  'Mantené el derrape hasta que las chispas se pongan rosas: ese mini-turbo es el más largo.',
  'Soltá el acelerador un toque antes de la curva y entrá derrapando. Frenar es de cobardes.',
  'Las cajas de ítem del carril de afuera suelen estar libres: nadie las agarra.',
  'Si venís último, la ruleta se pone generosa. Aguantá el rayo para el momento justo.',
  'La banana también sirve de escudo: mantené el botón y la llevás colgando atrás.',
  'El césped te frena, pero la tierra menos. Si te salís, buscá el camino más corto de vuelta.',
  'Guardá el hongo para la recta larga, no para la curva.',
  'Mirá el minimapa: el punto rojo que se te acerca por atrás casi siempre es un caparazón.',
  'Saltar en las rampas justo en el borde te da un impulso extra al aterrizar.',
  'Diez monedas es la velocidad máxima. Perdés dos por cada golpe, así que esquivá.',
  'Mati tiene tracción total: fuera del asfalto pierde mucho menos que el resto.',
  'Male acelera como nadie: si te chocan, ella vuelve al ritmo antes que vos.',
  'Keke es el más equilibrado. Si no sabés qué elegir, elegí Keke.',
  'Jp aguanta los empujones: en la largada, metete en el montón sin miedo.',
  'El caparazón rojo se come las paredes: si escuchás el pitido, buscá una curva cerrada.',
  'La estrella no sólo te hace invencible: también te deja empujar a todos.',
]

/** Frases del chat rápido del lobby (una sola tecla, cero teclado). */
export const FRASES_CHAT = [
  '¡Vamos!',
  '¡Listo!',
  'Esperen un toque',
  '¿Arrancamos?',
  '¡Buena esa!',
  '¡Uy, perdón!',
  '¡Revancha!',
  'Me quedé sin nafta',
  '¡Se viene el rayo!',
  'Aguante teo',
]

/** Devuelve la clase de calidad de conexión según el ping en ms. */
export function calidadPing(ping) {
  const n = Number(ping)
  if (!Number.isFinite(n) || n <= 0) return { clase: 'tk-ping--buena', barras: 3 }
  if (n < 80) return { clase: 'tk-ping--buena', barras: 3 }
  if (n < 170) return { clase: 'tk-ping--media', barras: 2 }
  return { clase: 'tk-ping--mala', barras: 1 }
}

/** Elige un elemento al azar de una lista, tolerante a listas vacías. */
export function alAzar(lista, porDefecto = null) {
  if (!Array.isArray(lista) || !lista.length) return porDefecto
  return lista[Math.floor(Math.random() * lista.length)]
}

/** Callback de sonido seguro: nunca explota si no se lo pasan. */
export function sonar(onSonido, nombre = 'ui') {
  if (typeof onSonido === 'function') {
    try {
      onSonido(nombre)
    } catch {
      /* el audio nunca puede romper la interfaz */
    }
  }
}
