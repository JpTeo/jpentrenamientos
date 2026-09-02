// Línea de carrera ("trazada") de una pista, y la velocidad a la que se puede
// tomar cada punto.
//
// CÓMO SE CALCULA
// ---------------
// 1. Se muestrea el eje central de la pista cada `paso` metros con
//    `pista.puntoEn(s)`. De cada muestra se guarda posición, tangente y
//    semiancho de calzada.
// 2. Cada punto de la trazada se representa como un desplazamiento lateral
//    `d[i]` sobre la normal derecha del eje. Empezamos con `d = 0` (eje puro).
// 3. Relajación iterativa de minimización de curvatura: en cada pasada, cada
//    punto se mueve hacia la proyección lateral del punto medio de sus
//    vecinos. Usamos DOS estenciles (vecinos ±1 y ±2) porque el de ±1 solo
//    converge a la trayectoria más corta (pegada al interior) mientras que
//    mezclarlo con el ancho estira los radios y produce la trazada clásica
//    exterior → vértice interior → exterior. En cada paso se recorta `d` al
//    ancho útil, así que la línea nunca se sale de la calzada.
// 4. Con la línea ya suave se calcula la curvatura con signo (curvatura de
//    Menger sobre tres puntos consecutivos) y de ahí la velocidad de paso:
//    `v = sqrt(aLateralMax / |k|)`.
// 5. Dos pasadas más (hacia atrás y hacia adelante, cíclicas) limitan esa
//    velocidad por lo que se puede frenar y acelerar entre punto y punto. El
//    resultado es que `velObjetivo[i]` ya incluye "acá tenés que venir frenando
//    porque en 40 m hay una horquilla".
//
// Todo son `Float32Array` de números planos: este módulo no importa three, así
// que se puede correr en Node sin escena.
import { FISICA, VELOCIDAD, ANCHO_PISTA } from '../core/constantes.js'
import { clamp } from '../core/utils.js'

/** Opciones por defecto del cálculo. */
export const OPCIONES_TRAZADA = Object.freeze({
  /** Separación entre muestras del eje central, en metros. */
  paso: 3.5,
  /** Pasadas de relajación. 200 alcanza y sobra para 400-500 puntos. */
  iteraciones: 200,
  /** Cuánto se mueve un punto por pasada (0..1). Bajo = converge suave. */
  alfa: 0.34,
  /** Mezcla del estencil ancho (±2). Más alto = radios más grandes. */
  mezclaAncha: 0.38,
  /** Metros que la trazada se mantiene lejos del borde de la calzada. */
  margen: 1.35,
  /** Fracción del semiancho que como máximo se usa (evita ir siempre al filo). */
  usoDelAncho: 0.94,
  /**
   * Aceleración lateral máxima, en g de la gravedad arcade. 1 = el agarre
   * nominal del asfalto. Un poco más de 1 porque en curva cerrada se derrapa.
   */
  factorLateral: 1.08,
  /** Desaceleración de frenado usada para la pasada hacia atrás (m/s²). */
  frenado: 17,
  /** Aceleración media usada para la pasada hacia adelante (m/s²). */
  aceleracion: 9.5,
  /** Tope superior de la velocidad objetivo (m/s). */
  velocidadMax: VELOCIDAD.base * 1.12,
  /** Piso: por muy cerrada que sea la curva, la IA no va a paso de hombre. */
  velocidadMin: 7.5,
})

/** Resultado reutilizable de `muestrearTrazada` / `puntoAdelante`. */
export function crearMuestraTrazada() {
  return {
    indice: 0,
    x: 0,
    y: 0,
    z: 0,
    tx: 0,
    tz: 0,
    lateral: 0,
    ancho: ANCHO_PISTA.normal,
    curvatura: 0,
    velObjetivo: VELOCIDAD.base,
  }
}

/**
 * Calcula la trazada de una pista. No cachea: usá `trazadaDe()` salvo que
 * quieras probar parámetros distintos.
 * @param {object} pista PistaRuntime (necesita `longitud` y `puntoEn`)
 * @param {Partial<typeof OPCIONES_TRAZADA>} [opciones]
 */
export function calcularTrazada(pista, opciones = {}) {
  const o = { ...OPCIONES_TRAZADA, ...opciones }
  if (!pista || typeof pista.puntoEn !== 'function' || !(pista.longitud > 0)) {
    throw new Error('trazada: la pista necesita `longitud` y `puntoEn(s)`')
  }

  const longitud = pista.longitud
  const n = Math.max(24, Math.round(longitud / o.paso))
  const paso = longitud / n

  // --- 1. Muestreo del eje central -------------------------------------
  const cx = new Float32Array(n)
  const cy = new Float32Array(n)
  const cz = new Float32Array(n)
  const rx = new Float32Array(n) // normal derecha del eje, unitaria en XZ
  const rz = new Float32Array(n)
  const anchoUtil = new Float32Array(n)
  const anchoCalzada = new Float32Array(n)

  const tmp = {
    posicion: { x: 0, y: 0, z: 0 },
    tangente: { x: 0, y: 0, z: -1 },
    normal: { x: 0, y: 1, z: 0 },
    ancho: ANCHO_PISTA.normal,
  }

  for (let i = 0; i < n; i++) {
    const p = pista.puntoEn(i * paso, tmp) || tmp
    const pos = p.posicion || tmp.posicion
    const tan = p.tangente || tmp.tangente
    cx[i] = pos.x
    cy[i] = pos.y || 0
    cz[i] = pos.z
    // derecha = tangente × arriba  →  (-tz, 0, tx)
    let dx = -tan.z
    let dz = tan.x
    const largo = Math.hypot(dx, dz) || 1
    dx /= largo
    dz /= largo
    rx[i] = dx
    rz[i] = dz
    const semiancho = Math.max(2, p.ancho || ANCHO_PISTA.normal)
    anchoCalzada[i] = semiancho
    anchoUtil[i] = Math.max(0.4, semiancho * o.usoDelAncho - o.margen)
  }

  // --- 2-3. Relajación con restricción de ancho ------------------------
  const d = new Float32Array(n)
  const alfa = clamp(o.alfa, 0.02, 0.9)
  const mezcla = clamp(o.mezclaAncha, 0, 0.9)
  for (let it = 0; it < o.iteraciones; it++) {
    for (let i = 0; i < n; i++) {
      const objetivo =
        (1 - mezcla) * _lateralDelMedio(i, 1, cx, cz, rx, rz, d, n) +
        mezcla * _lateralDelMedio(i, 2, cx, cz, rx, rz, d, n)
      const lim = anchoUtil[i]
      d[i] = clamp(d[i] + (objetivo - d[i]) * alfa, -lim, lim)
    }
  }

  // Suavizado final (kernel 1-2-1) para matar el rizado numérico.
  const suave = new Float32Array(n)
  for (let pasada = 0; pasada < 3; pasada++) {
    for (let i = 0; i < n; i++) {
      const a = d[(i - 1 + n) % n]
      const b = d[i]
      const c = d[(i + 1) % n]
      suave[i] = clamp(a * 0.25 + b * 0.5 + c * 0.25, -anchoUtil[i], anchoUtil[i])
    }
    d.set(suave)
  }

  // --- Puntos finales de la trazada ------------------------------------
  const x = new Float32Array(n)
  const y = new Float32Array(n)
  const z = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    x[i] = cx[i] + rx[i] * d[i]
    y[i] = cy[i]
    z[i] = cz[i] + rz[i] * d[i]
  }

  // Tangentes y longitudes de tramo de la propia trazada.
  const tx = new Float32Array(n)
  const tz = new Float32Array(n)
  const largoSeg = new Float32Array(n)
  let largoTotal = 0
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n
    const ex = x[j] - x[i]
    const ez = z[j] - z[i]
    const l = Math.hypot(ex, ez) || 1e-4
    largoSeg[i] = l
    largoTotal += l
    tx[i] = ex / l
    tz[i] = ez / l
  }

  // --- 4. Curvatura con signo (+ = la pista dobla a la derecha) --------
  const curvatura = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    const a = (i - 1 + n) % n
    const b = (i + 1) % n
    const ax = x[i] - x[a]
    const az = z[i] - z[a]
    const bx = x[b] - x[i]
    const bz = z[b] - z[i]
    const cxx = x[b] - x[a]
    const czz = z[b] - z[a]
    const la = Math.hypot(ax, az)
    const lb = Math.hypot(bx, bz)
    const lc = Math.hypot(cxx, czz)
    const denom = la * lb * lc
    curvatura[i] = denom < 1e-6 ? 0 : (2 * (ax * bz - az * bx)) / denom
  }
  // Suavizado de la curvatura: sin esto la velocidad objetivo tirita.
  const kSuave = new Float32Array(n)
  for (let pasada = 0; pasada < 2; pasada++) {
    for (let i = 0; i < n; i++) {
      kSuave[i] =
        curvatura[(i - 2 + n) % n] * 0.12 +
        curvatura[(i - 1 + n) % n] * 0.23 +
        curvatura[i] * 0.3 +
        curvatura[(i + 1) % n] * 0.23 +
        curvatura[(i + 2) % n] * 0.12
    }
    curvatura.set(kSuave)
  }

  // --- Velocidad de paso por curvatura ---------------------------------
  const aLateral = FISICA.gravedad * FISICA.agarreAsfalto * o.factorLateral
  const velObjetivo = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    const k = Math.abs(curvatura[i])
    const v = k < 1e-5 ? o.velocidadMax : Math.sqrt(aLateral / k)
    velObjetivo[i] = clamp(v, o.velocidadMin, o.velocidadMax)
  }

  // --- 5. Frenado (hacia atrás) y aceleración (hacia adelante) ---------
  // Se repite el par de pasadas porque el circuito es cerrado: la primera
  // vuelta propaga la información y la segunda cierra la costura.
  for (let vuelta = 0; vuelta < 3; vuelta++) {
    for (let i = n - 1; i >= 0; i--) {
      const j = (i + 1) % n
      const posible = Math.sqrt(velObjetivo[j] * velObjetivo[j] + 2 * o.frenado * largoSeg[i])
      if (posible < velObjetivo[i]) velObjetivo[i] = posible
    }
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n
      const posible = Math.sqrt(velObjetivo[i] * velObjetivo[i] + 2 * o.aceleracion * largoSeg[i])
      if (posible < velObjetivo[j]) velObjetivo[j] = posible
    }
  }

  const trazada = {
    id: pista.id || 'pista',
    n,
    paso,
    longitud,
    largoTrazada: largoTotal,
    x,
    y,
    z,
    tx,
    tz,
    lateral: d,
    ancho: anchoCalzada,
    anchoUtil,
    curvatura,
    velObjetivo,
    largoSeg,
    ejeX: cx,
    ejeZ: cz,
    derechaX: rx,
    derechaZ: rz,
  }

  // Métodos (funciones sueltas atadas al objeto: nada de `this` mágico).
  trazada.indiceDeS = (s) => indiceDeS(trazada, s)
  trazada.muestrear = (indice, out) => muestrearTrazada(trazada, indice, out)
  trazada.adelante = (indice, distancia, out) => puntoAdelante(trazada, indice, distancia, out)
  trazada.curvaturaMedia = (indice, distancia) => curvaturaMedia(trazada, indice, distancia)
  trazada.indiceMasCercano = (px, pz, pista_) => indiceMasCercano(trazada, px, pz, pista_)
  return trazada
}

/** Proyección lateral del punto medio entre los vecinos a distancia `salto`. */
function _lateralDelMedio(i, salto, cx, cz, rx, rz, d, n) {
  const a = (i - salto + n) % n
  const b = (i + salto) % n
  const ax = cx[a] + rx[a] * d[a]
  const az = cz[a] + rz[a] * d[a]
  const bx = cx[b] + rx[b] * d[b]
  const bz = cz[b] + rz[b] * d[b]
  const mx = (ax + bx) * 0.5 - cx[i]
  const mz = (az + bz) * 0.5 - cz[i]
  return mx * rx[i] + mz * rz[i]
}

/** Índice de la trazada correspondiente a una `s` del eje central. */
export function indiceDeS(trazada, s) {
  const n = trazada.n
  let i = Math.round(s / trazada.paso)
  i %= n
  if (i < 0) i += n
  return i
}

/** Distancia (con signo, envuelta) en índices entre dos puntos de la trazada. */
export function deltaIndice(trazada, a, b) {
  const n = trazada.n
  let d = (b - a) % n
  if (d > n / 2) d -= n
  if (d < -n / 2) d += n
  return d
}

/** Copia el punto `indice` de la trazada en `out`. */
export function muestrearTrazada(trazada, indice, out) {
  const o = out || crearMuestraTrazada()
  const n = trazada.n
  let i = Math.round(indice) % n
  if (i < 0) i += n
  o.indice = i
  o.x = trazada.x[i]
  o.y = trazada.y[i]
  o.z = trazada.z[i]
  o.tx = trazada.tx[i]
  o.tz = trazada.tz[i]
  o.lateral = trazada.lateral[i]
  o.ancho = trazada.ancho[i]
  o.curvatura = trazada.curvatura[i]
  o.velObjetivo = trazada.velObjetivo[i]
  return o
}

/**
 * Punto de la trazada situado `distancia` metros por delante de `indice`,
 * medido sobre la propia trazada. Interpola entre muestras.
 */
export function puntoAdelante(trazada, indice, distancia, out) {
  const o = out || crearMuestraTrazada()
  const n = trazada.n
  let i = Math.round(indice) % n
  if (i < 0) i += n
  let resta = Math.max(0, distancia)
  let pasos = 0
  while (resta > trazada.largoSeg[i] && pasos < n) {
    resta -= trazada.largoSeg[i]
    i = (i + 1) % n
    pasos++
  }
  const j = (i + 1) % n
  const t = trazada.largoSeg[i] > 1e-4 ? resta / trazada.largoSeg[i] : 0
  o.indice = i
  o.x = trazada.x[i] + (trazada.x[j] - trazada.x[i]) * t
  o.y = trazada.y[i] + (trazada.y[j] - trazada.y[i]) * t
  o.z = trazada.z[i] + (trazada.z[j] - trazada.z[i]) * t
  o.tx = trazada.tx[i]
  o.tz = trazada.tz[i]
  o.lateral = trazada.lateral[i]
  o.ancho = trazada.ancho[i]
  o.curvatura = trazada.curvatura[i]
  o.velObjetivo = trazada.velObjetivo[i]
  return o
}

/**
 * Velocidad más alta con la que se puede pasar por `indice` sin llegar
 * demasiado rápido a ninguna de las curvas de los próximos `distancia` metros,
 * dado un frenado de `frenado` m/s². Es lo que usa la IA para decidir si pisa
 * el freno: la trazada ya trae su propia versión, pero cada conductor frena
 * con más o menos margen según su personalidad.
 */
export function velocidadSegura(trazada, indice, distancia, frenado) {
  const n = trazada.n
  let i = Math.round(indice) % n
  if (i < 0) i += n
  let recorrido = 0
  let limite = Infinity
  let pasos = 0
  while (recorrido < distancia && pasos < n) {
    const posible = Math.sqrt(
      trazada.velObjetivo[i] * trazada.velObjetivo[i] + 2 * frenado * recorrido,
    )
    if (posible < limite) limite = posible
    recorrido += trazada.largoSeg[i]
    i = (i + 1) % n
    pasos++
  }
  return limite === Infinity ? trazada.velObjetivo[indice] : limite
}

/** Curvatura media con signo en los próximos `distancia` metros. */
export function curvaturaMedia(trazada, indice, distancia) {
  const n = trazada.n
  let i = Math.round(indice) % n
  if (i < 0) i += n
  let recorrido = 0
  let suma = 0
  let cuenta = 0
  let pasos = 0
  while (recorrido < distancia && pasos < n) {
    suma += trazada.curvatura[i]
    cuenta++
    recorrido += trazada.largoSeg[i]
    i = (i + 1) % n
    pasos++
  }
  return cuenta ? suma / cuenta : 0
}

/** Curvatura absoluta máxima en los próximos `distancia` metros. */
export function curvaturaMaxima(trazada, indice, distancia) {
  const n = trazada.n
  let i = Math.round(indice) % n
  if (i < 0) i += n
  let recorrido = 0
  let max = 0
  let pasos = 0
  while (recorrido < distancia && pasos < n) {
    const k = Math.abs(trazada.curvatura[i])
    if (k > max) max = k
    recorrido += trazada.largoSeg[i]
    i = (i + 1) % n
    pasos++
  }
  return max
}

/**
 * Índice de la trazada más cercano a un punto del mundo. Si la pista sabe
 * calcular progreso (lo normal) se usa eso, que es O(1); si no, se hace una
 * búsqueda lineal de respaldo.
 */
export function indiceMasCercano(trazada, px, pz, pista) {
  if (pista && typeof pista.progreso === 'function') {
    const p = pista.progreso(px, pz)
    if (p && typeof p.s === 'number') return indiceDeS(trazada, p.s)
  }
  let mejor = 0
  let mejorD = Infinity
  for (let i = 0; i < trazada.n; i++) {
    const dx = trazada.x[i] - px
    const dz = trazada.z[i] - pz
    const d = dx * dx + dz * dz
    if (d < mejorD) {
      mejorD = d
      mejor = i
    }
  }
  return mejor
}

// --- Cache por pista ---------------------------------------------------

const CACHE = new WeakMap()

/**
 * Trazada cacheada de una pista. La misma pista con las mismas opciones
 * devuelve siempre el MISMO objeto (los ocho rivales comparten el cálculo).
 * @param {object} pista
 * @param {Partial<typeof OPCIONES_TRAZADA>} [opciones]
 */
export function trazadaDe(pista, opciones = {}) {
  let porOpciones = CACHE.get(pista)
  if (!porOpciones) {
    porOpciones = new Map()
    CACHE.set(pista, porOpciones)
  }
  const clave = JSON.stringify({ ...OPCIONES_TRAZADA, ...opciones })
  let t = porOpciones.get(clave)
  if (!t) {
    t = calcularTrazada(pista, opciones)
    porOpciones.set(clave, t)
  }
  return t
}

/** Borra la cache (sólo para tests y para recargar una pista en caliente). */
export function limpiarCacheTrazada(pista) {
  if (pista) CACHE.delete(pista)
}

export default trazadaDe
