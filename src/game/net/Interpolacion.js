// Interpolación de corredores remotos.
//
// Es EL módulo que decide si el juego se ve bien o se ve roto. La idea es la
// de siempre en los juegos de acción por internet:
//
//   - Nunca dibujamos "el presente" de un rival: dibujamos su pasado.
//   - Guardamos las últimas instantáneas que nos llegaron y renderizamos el
//     instante `tiempoRed - RETARDO` (≈100 ms), que casi siempre cae ENTRE dos
//     paquetes recibidos. Interpolar es exacto y suave; extrapolar es adivinar.
//   - Si un paquete se pierde y nos quedamos sin futuro, extrapolamos con la
//     velocidad, pero acotado (250 ms). Cuando llega el paquete que faltaba,
//     la corrección se disuelve suavemente en vez de dar un tirón.
//   - Sólo hay "snap" (teletransporte) si el error supera ~4 m: eso no es
//     lag, es un rescate de la grúa, una bala o un rayo.
//
// Sin dependencias: trabaja con objetos planos `{x,y,z}` y `{x,y,z,w}`, así
// que se puede importar y testear en Node.

/** Retardo de interpolación por defecto, en milisegundos. */
export const RETARDO_MS = 100

/** Tope de extrapolación, en milisegundos. */
export const MAX_EXTRAPOLACION_MS = 250

/** Error de posición a partir del cual se teletransporta, en metros. */
export const UMBRAL_SALTO_M = 4

/** Cuántas instantáneas se guardan por corredor. */
export const CAPACIDAD_BUFER = 12

const limitar = (v, a, b) => (v < a ? a : v > b ? b : v)
const mezclar = (a, b, t) => a + (b - a) * t
/** Suavizado independiente del framerate. */
const amortiguar = (a, b, lambda, dt) => mezclar(a, b, 1 - Math.exp(-lambda * dt))

/** Interpolación esférica de quaterniones planos, sin three. */
export function slerp(a, b, t, salida = {}) {
  let bx = b.x
  let by = b.y
  let bz = b.z
  let bw = b.w
  let coseno = a.x * bx + a.y * by + a.z * bz + a.w * bw
  if (coseno < 0) {
    coseno = -coseno
    bx = -bx
    by = -by
    bz = -bz
    bw = -bw
  }
  let s0
  let s1
  if (coseno > 0.9995) {
    // Casi paralelos: lineal + normalizado, evita dividir por casi cero.
    s0 = 1 - t
    s1 = t
  } else {
    const theta = Math.acos(limitar(coseno, -1, 1))
    const seno = Math.sin(theta)
    s0 = Math.sin((1 - t) * theta) / seno
    s1 = Math.sin(t * theta) / seno
  }
  let x = a.x * s0 + bx * s1
  let y = a.y * s0 + by * s1
  let z = a.z * s0 + bz * s1
  let w = a.w * s0 + bw * s1
  const n = Math.hypot(x, y, z, w) || 1
  salida.x = x / n
  salida.y = y / n
  salida.z = z / n
  salida.w = w / n
  return salida
}

function nuevoRegistro(id) {
  return {
    id,
    ranura: 0,
    instantaneas: [],
    // Estado listo para el render (se reutiliza, no se reasigna nunca).
    salida: {
      id,
      ranura: 0,
      valido: false,
      extrapolando: false,
      posicion: { x: 0, y: 0, z: 0 },
      quaternion: { x: 0, y: 0, z: 0, w: 1 },
      velocidad: { x: 0, y: 0, z: 0 },
      rapidez: 0,
      giroVisual: 0,
      enSuelo: true,
      derrapando: false,
      ladoDerrape: 0,
      nivelDerrape: 0,
      turbo: 0,
      estrella: 0,
      aplastado: 0,
      girando: 0,
      aturdido: 0,
      saltando: false,
      terminado: false,
      marchaAtras: false,
      s: 0,
      vuelta: 1,
      puesto: 0,
      monedas: 0,
      item: null,
    },
    // Corrección suave: desfase que se le suma al objetivo y se apaga solo.
    desfase: { x: 0, y: 0, z: 0 },
    objetivo: { x: 0, y: 0, z: 0 },
    tieneObjetivo: false,
    ultimoSello: 0,
    silencioMs: 0,
  }
}

export class Interpolacion {
  /**
   * @param {object} opciones
   * @param {number} opciones.retardo         ms de retardo de interpolación
   * @param {number} opciones.maxExtrapolacion ms máximos de extrapolación
   * @param {number} opciones.umbralSalto     metros de error para teletransportar
   * @param {number} opciones.capacidad       instantáneas guardadas por corredor
   * @param {number} opciones.suavizado       lambda de la corrección suave
   */
  constructor({
    retardo = RETARDO_MS,
    maxExtrapolacion = MAX_EXTRAPOLACION_MS,
    umbralSalto = UMBRAL_SALTO_M,
    capacidad = CAPACIDAD_BUFER,
    suavizado = 8,
  } = {}) {
    this.retardo = retardo
    this.maxExtrapolacion = maxExtrapolacion
    this.umbralSalto = umbralSalto
    this.capacidad = capacidad
    this.suavizado = suavizado
    /** @type {Map<string, ReturnType<typeof nuevoRegistro>>} */
    this.corredores = new Map()
    this.tiempoRender = 0
  }

  /** Registro (lo crea si no existe). */
  _registro(id) {
    let r = this.corredores.get(id)
    if (!r) {
      r = nuevoRegistro(id)
      this.corredores.set(id, r)
    }
    return r
  }

  /**
   * Guarda una instantánea recibida por red.
   * @param {string} id id del corredor remoto
   * @param {object} estado resultado de `desempaquetarEstado`, con `.sello`
   *        en TIEMPO DE RED (ms), no en tiempo local.
   */
  agregar(id, estado) {
    const r = this._registro(id)
    const sello = Number(estado.sello ?? estado.t ?? 0)

    // Paquete viejo o repetido: por el canal no fiable llegan desordenados.
    const ultima = r.instantaneas[r.instantaneas.length - 1]
    if (ultima && sello <= ultima.sello) {
      if (r.instantaneas.length && sello <= r.instantaneas[0].sello) return
      // Llegó fuera de orden pero todavía es útil: lo insertamos donde va.
      const copia = this._clonar(estado, sello)
      let i = r.instantaneas.length - 1
      while (i >= 0 && r.instantaneas[i].sello > sello) i--
      if (i >= 0 && r.instantaneas[i].sello === sello) return
      r.instantaneas.splice(i + 1, 0, copia)
    } else {
      r.instantaneas.push(this._clonar(estado, sello))
    }

    while (r.instantaneas.length > this.capacidad) r.instantaneas.shift()
    r.ranura = estado.ranura ?? r.ranura
    r.salida.ranura = r.ranura
    r.ultimoSello = Math.max(r.ultimoSello, sello)
    r.silencioMs = 0
  }

  _clonar(e, sello) {
    const p = e.posicion || { x: 0, y: 0, z: 0 }
    const q = e.quaternion || { x: 0, y: 0, z: 0, w: 1 }
    const v = e.velocidad || { x: 0, y: 0, z: 0 }
    return {
      sello,
      px: p.x,
      py: p.y,
      pz: p.z,
      qx: q.x,
      qy: q.y,
      qz: q.z,
      qw: q.w,
      vx: v.x,
      vy: v.y,
      vz: v.z,
      rapidez: e.rapidez || 0,
      giroVisual: e.giroVisual || 0,
      s: e.s || 0,
      vuelta: e.vuelta || 1,
      puesto: e.puesto || 0,
      monedas: e.monedas || 0,
      item: e.item ?? null,
      enSuelo: !!e.enSuelo,
      derrapando: !!e.derrapando,
      ladoDerrape: e.ladoDerrape || 0,
      nivelDerrape: e.nivelDerrape || 0,
      turbo: e.turbo ? 1 : 0,
      estrella: e.estrella ? 1 : 0,
      aplastado: e.aplastado ? 1 : 0,
      girando: e.girando ? 1 : 0,
      aturdido: e.aturdido ? 1 : 0,
      saltando: !!e.saltando,
      terminado: !!e.terminado,
      marchaAtras: !!e.marchaAtras,
    }
  }

  /**
   * Avanza la interpolación un cuadro.
   * @param {number} dt segundos del cuadro
   * @param {number} tiempoRed reloj común (ms) — `Red.ahora()`
   */
  actualizar(dt, tiempoRed) {
    this.tiempoRender = tiempoRed - this.retardo
    for (const r of this.corredores.values()) {
      r.silencioMs += dt * 1000
      this._resolver(r, dt)
    }
  }

  _resolver(r, dt) {
    const buf = r.instantaneas
    const salida = r.salida
    if (buf.length === 0) {
      salida.valido = false
      return
    }
    const t = this.tiempoRender
    const primera = buf[0]
    const ultima = buf[buf.length - 1]

    let ox
    let oy
    let oz
    let extrapolando = false
    /** Instantánea de referencia para los campos discretos. */
    let ref = ultima

    if (t <= primera.sello) {
      // Todavía no llegó el pasado que queremos: nos plantamos en el más viejo.
      ox = primera.px
      oy = primera.py
      oz = primera.pz
      salida.quaternion.x = primera.qx
      salida.quaternion.y = primera.qy
      salida.quaternion.z = primera.qz
      salida.quaternion.w = primera.qw
      salida.rapidez = primera.rapidez
      salida.giroVisual = primera.giroVisual
      salida.s = primera.s
      ref = primera
    } else if (t >= ultima.sello) {
      // Nos quedamos sin futuro: extrapolamos con la última velocidad, acotado.
      const avance = Math.min(t - ultima.sello, this.maxExtrapolacion) / 1000
      extrapolando = avance > 0.001
      ox = ultima.px + ultima.vx * avance
      oy = ultima.py + ultima.vy * avance
      oz = ultima.pz + ultima.vz * avance
      salida.quaternion.x = ultima.qx
      salida.quaternion.y = ultima.qy
      salida.quaternion.z = ultima.qz
      salida.quaternion.w = ultima.qw
      salida.rapidez = ultima.rapidez
      salida.giroVisual = ultima.giroVisual
      salida.s = ultima.s + ultima.rapidez * avance
      ref = ultima
    } else {
      // Caso normal: interpolamos entre las dos instantáneas que lo rodean.
      let i = buf.length - 1
      while (i > 0 && buf[i - 1].sello > t) i--
      const b = buf[i]
      const a = buf[i - 1] || b
      const rango = b.sello - a.sello
      const k = rango > 0 ? limitar((t - a.sello) / rango, 0, 1) : 1
      ox = mezclar(a.px, b.px, k)
      oy = mezclar(a.py, b.py, k)
      oz = mezclar(a.pz, b.pz, k)
      slerp(
        { x: a.qx, y: a.qy, z: a.qz, w: a.qw },
        { x: b.qx, y: b.qy, z: b.qz, w: b.qw },
        k,
        salida.quaternion,
      )
      salida.rapidez = mezclar(a.rapidez, b.rapidez, k)
      salida.giroVisual = mezclar(a.giroVisual, b.giroVisual, k)
      // `s` puede dar la vuelta al cruzar la meta: si retrocede, no mezclamos.
      salida.s = b.s < a.s ? b.s : mezclar(a.s, b.s, k)
      ref = k < 0.5 ? a : b
      salida.velocidad.x = mezclar(a.vx, b.vx, k)
      salida.velocidad.y = mezclar(a.vy, b.vy, k)
      salida.velocidad.z = mezclar(a.vz, b.vz, k)
    }

    if (t >= ultima.sello || t <= primera.sello) {
      salida.velocidad.x = ref.vx
      salida.velocidad.y = ref.vy
      salida.velocidad.z = ref.vz
    }

    // --- corrección suave --------------------------------------------------
    // Predecimos dónde "debería" estar el objetivo si nada hubiera cambiado y
    // medimos el salto. Si es chico, lo absorbemos en `desfase` y lo apagamos
    // de a poco; si es grande, es un teletransporte legítimo y saltamos.
    if (r.tieneObjetivo) {
      const px = r.objetivo.x + salida.velocidad.x * dt
      const py = r.objetivo.y + salida.velocidad.y * dt
      const pz = r.objetivo.z + salida.velocidad.z * dt
      const ex = px - ox
      const ey = py - oy
      const ez = pz - oz
      const error = Math.hypot(ex, ey, ez)
      if (error > this.umbralSalto) {
        r.desfase.x = 0
        r.desfase.y = 0
        r.desfase.z = 0
      } else if (error > 0.02) {
        r.desfase.x += ex
        r.desfase.y += ey
        r.desfase.z += ez
        // El desfase nunca puede ser mayor que el umbral de salto.
        const d = Math.hypot(r.desfase.x, r.desfase.y, r.desfase.z)
        if (d > this.umbralSalto) {
          const k = this.umbralSalto / d
          r.desfase.x *= k
          r.desfase.y *= k
          r.desfase.z *= k
        }
      }
    }
    r.objetivo.x = ox
    r.objetivo.y = oy
    r.objetivo.z = oz
    r.tieneObjetivo = true

    r.desfase.x = amortiguar(r.desfase.x, 0, this.suavizado, dt)
    r.desfase.y = amortiguar(r.desfase.y, 0, this.suavizado, dt)
    r.desfase.z = amortiguar(r.desfase.z, 0, this.suavizado, dt)

    salida.posicion.x = ox + r.desfase.x
    salida.posicion.y = oy + r.desfase.y
    salida.posicion.z = oz + r.desfase.z

    // Campos discretos: se toman tal cual de la instantánea de referencia.
    salida.enSuelo = ref.enSuelo
    salida.derrapando = ref.derrapando
    salida.ladoDerrape = ref.ladoDerrape
    salida.nivelDerrape = ref.nivelDerrape
    salida.turbo = ref.turbo
    salida.estrella = ref.estrella
    salida.aplastado = ref.aplastado
    salida.girando = ref.girando
    salida.aturdido = ref.aturdido
    salida.saltando = ref.saltando
    salida.terminado = ref.terminado
    salida.marchaAtras = ref.marchaAtras
    salida.vuelta = ref.vuelta
    salida.puesto = ref.puesto
    salida.monedas = ref.monedas
    salida.item = ref.item
    salida.extrapolando = extrapolando
    salida.valido = true
  }

  /**
   * Estado listo para el render de un corredor remoto.
   * OJO: el objeto se reutiliza cuadro a cuadro; no lo guardes, copialo.
   * @returns {object|null}
   */
  estadoInterpolado(id) {
    const r = this.corredores.get(id)
    if (!r || !r.salida.valido) return null
    return r.salida
  }

  /** Milisegundos sin recibir nada de ese corredor. */
  silencio(id) {
    const r = this.corredores.get(id)
    return r ? r.silencioMs : Infinity
  }

  /** ¿Estamos adivinando su posición ahora mismo? */
  extrapolando(id) {
    const r = this.corredores.get(id)
    return !!(r && r.salida.extrapolando)
  }

  ids() {
    return [...this.corredores.keys()]
  }

  quitar(id) {
    this.corredores.delete(id)
  }

  limpiar() {
    this.corredores.clear()
  }
}

export default Interpolacion
