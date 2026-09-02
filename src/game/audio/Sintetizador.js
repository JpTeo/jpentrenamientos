// Bloques reutilizables de síntesis sobre WebAudio.
//
// Este módulo NO crea ningún `AudioContext` al importarse: sólo define
// funciones y una clase que recibe el contexto ya creado. Eso permite
// importarlo en Node (tests, herramientas) sin tocar el navegador.
//
// Todo lo caro (buffers de ruido, respuestas de impulso, curvas de
// distorsión) está cacheado por contexto y por clave, así que pedir el mismo
// recurso mil veces cuesta una búsqueda en un Map.

/** Frecuencia de una nota MIDI (69 = La4 = 440 Hz). */
export function frecuenciaMidi(midi) {
  return 440 * Math.pow(2, (midi - 69) / 12)
}

const SEMITONOS = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }

/**
 * Convierte un nombre de nota tipo `'C4'`, `'F#3'` o `'Bb5'` a número MIDI.
 * Devuelve `null` si no se entiende (para que el llamador lo detecte).
 */
export function notaMidi(nombre) {
  if (typeof nombre === 'number') return nombre
  const m = /^([A-Ga-g])([#b]?)(-?\d+)$/.exec(String(nombre).trim())
  if (!m) return null
  const base = SEMITONOS[m[1].toUpperCase()]
  const alteracion = m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0
  return (Number(m[3]) + 1) * 12 + base + alteracion
}

/** Atajo: nombre de nota → frecuencia en Hz. */
export function frecuenciaNota(nombre) {
  const midi = notaMidi(nombre)
  return midi === null ? 440 : frecuenciaMidi(midi)
}

/**
 * Crea un `AudioContext` nuevo. Es la ÚNICA función del módulo que toca el
 * navegador, y sólo se llama desde `Audio.desbloquear()`.
 */
export function crearContexto(opciones = {}) {
  const Ctor =
    (typeof globalThis !== 'undefined' && (globalThis.AudioContext || globalThis.webkitAudioContext)) ||
    null
  if (!Ctor) return null
  try {
    return new Ctor({ latencyHint: 'interactive', ...opciones })
  } catch {
    return null
  }
}

/** ¿Hay WebAudio disponible en este entorno? (no crea nada). */
export function hayWebAudio() {
  return !!(
    typeof globalThis !== 'undefined' &&
    (globalThis.AudioContext || globalThis.webkitAudioContext)
  )
}

/** Envolvente ADSR por defecto. */
export const ADSR_POR_DEFECTO = Object.freeze({
  ataque: 0.008,
  decaimiento: 0.09,
  sostenido: 0.65,
  liberacion: 0.18,
  pico: 1,
})

const CASI_CERO = 0.0001

/**
 * Generador pseudoaleatorio determinista propio del sintetizador. Se usa para
 * que el ruido y las respuestas de impulso sean siempre iguales (mismo timbre
 * en cada partida) sin depender de `Math.random`.
 */
function ruleta(semilla = 0x9e3779b9) {
  let a = semilla >>> 0
  return function () {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * Caja de herramientas de síntesis atada a un `AudioContext`.
 * Todos los nodos que devuelve están sueltos: los conecta el llamador.
 */
export class Sintetizador {
  /** @param {BaseAudioContext} ctx */
  constructor(ctx) {
    this.ctx = ctx
    /** Cache de recursos caros: buffers, curvas, respuestas de impulso. */
    this.cache = new Map()
  }

  /** Momento actual del reloj de audio. */
  get ahora() {
    return this.ctx.currentTime
  }

  /** Recurso cacheado bajo `clave`; se construye la primera vez. */
  recurso(clave, construir) {
    let v = this.cache.get(clave)
    if (v === undefined) {
      v = construir()
      this.cache.set(clave, v)
    }
    return v
  }

  // --- Nodos básicos --------------------------------------------------

  /** Nodo de ganancia con valor inicial. */
  ganancia(valor = 1) {
    const g = this.ctx.createGain()
    g.gain.value = valor
    return g
  }

  /**
   * Oscilador. `tipo` ∈ 'sine' | 'square' | 'sawtooth' | 'triangle'.
   * Queda sin arrancar: el llamador hace `start()`.
   */
  osc(tipo = 'sawtooth', frecuencia = 220, desafine = 0) {
    const o = this.ctx.createOscillator()
    o.type = tipo
    o.frequency.value = frecuencia
    if (desafine) o.detune.value = desafine
    return o
  }

  /** Filtro biquad genérico. */
  filtro(tipo = 'lowpass', frecuencia = 1000, q = 1, ganancia = 0) {
    const f = this.ctx.createBiquadFilter()
    f.type = tipo
    f.frequency.value = frecuencia
    f.Q.value = q
    if (ganancia) f.gain.value = ganancia
    return f
  }

  /** Panorámica estéreo simple (-1..1). Barata: para sonidos de UI. */
  paneo(valor = 0) {
    if (!this.ctx.createStereoPanner) return this.ganancia(1)
    const p = this.ctx.createStereoPanner()
    p.pan.value = valor
    return p
  }

  /** Panner 3D con HRTF: lo usan los motores rivales y los ítems del mundo. */
  panner({ refDistancia = 8, maxDistancia = 140, rolloff = 1.1 } = {}) {
    const p = this.ctx.createPanner()
    p.panningModel = 'HRTF'
    p.distanceModel = 'inverse'
    p.refDistance = refDistancia
    p.maxDistance = maxDistancia
    p.rolloffFactor = rolloff
    return p
  }

  // --- Ruido ----------------------------------------------------------

  /**
   * Buffer de ruido cacheado. `tipo` ∈ 'blanco' | 'rosa' | 'marron'.
   * Dura 3 s en mono y está pensado para reproducirse en bucle.
   */
  bufferRuido(tipo = 'blanco', segundos = 3) {
    return this.recurso(`ruido:${tipo}:${segundos}`, () => {
      const tasa = this.ctx.sampleRate
      const largo = Math.max(1, Math.floor(tasa * segundos))
      const buffer = this.ctx.createBuffer(1, largo, tasa)
      const d = buffer.getChannelData(0)
      const azar = ruleta(tipo === 'rosa' ? 0x51ed270b : tipo === 'marron' ? 0x2545f491 : 0x1b873593)
      if (tipo === 'rosa') {
        // Filtro de Paul Kellet: ruido rosa (-3 dB/octava) muy barato.
        let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0
        for (let i = 0; i < largo; i++) {
          const blanco = azar() * 2 - 1
          b0 = 0.99886 * b0 + blanco * 0.0555179
          b1 = 0.99332 * b1 + blanco * 0.0750759
          b2 = 0.969 * b2 + blanco * 0.153852
          b3 = 0.8665 * b3 + blanco * 0.3104856
          b4 = 0.55 * b4 + blanco * 0.5329522
          b5 = -0.7616 * b5 - blanco * 0.016898
          d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + blanco * 0.5362) * 0.11
          b6 = blanco * 0.115926
        }
      } else if (tipo === 'marron') {
        // Ruido marrón (-6 dB/octava): la base del traqueteo y los truenos.
        let ultimo = 0
        for (let i = 0; i < largo; i++) {
          const blanco = azar() * 2 - 1
          ultimo = (ultimo + 0.02 * blanco) / 1.02
          d[i] = ultimo * 3.5
        }
      } else {
        for (let i = 0; i < largo; i++) d[i] = azar() * 2 - 1
      }
      // Costura suave para que el bucle no chasquee.
      const cruce = Math.min(1024, largo >> 2)
      for (let i = 0; i < cruce; i++) {
        const k = i / cruce
        d[i] = d[i] * k + d[largo - cruce + i] * (1 - k)
      }
      return buffer
    })
  }

  /** Fuente de ruido lista para arrancar (bucle por defecto). */
  ruido(tipo = 'blanco', { bucle = true, velocidad = 1 } = {}) {
    const f = this.ctx.createBufferSource()
    f.buffer = this.bufferRuido(tipo)
    f.loop = bucle
    if (velocidad !== 1) f.playbackRate.value = velocidad
    return f
  }

  /** Fuente sobre un buffer cualquiera. */
  fuente(buffer, { bucle = false, velocidad = 1 } = {}) {
    const f = this.ctx.createBufferSource()
    f.buffer = buffer
    f.loop = bucle
    if (velocidad !== 1) f.playbackRate.value = velocidad
    return f
  }

  /**
   * Buffer sintetizado a mano y cacheado. `generar(izq, der, tasa, largo)`
   * escribe las muestras. Es la vía para bucles melódicos (la estrella) y
   * para cualquier textura que no convenga programar nota a nota.
   */
  bufferSintetico(clave, segundos, generar, canales = 2) {
    return this.recurso(`buf:${clave}`, () => {
      const tasa = this.ctx.sampleRate
      const largo = Math.max(1, Math.floor(tasa * segundos))
      const buffer = this.ctx.createBuffer(canales, largo, tasa)
      const izq = buffer.getChannelData(0)
      const der = canales > 1 ? buffer.getChannelData(1) : izq
      generar(izq, der, tasa, largo)
      return buffer
    })
  }

  // --- Procesadores ---------------------------------------------------

  /**
   * Distorsión por `WaveShaper`. `cantidad` 0..1 (0.25 = calidez, 0.9 = fuzz).
   * La curva está cacheada porque construirla son 4096 `Math.tan`.
   */
  distorsion(cantidad = 0.4) {
    const k = Math.max(0, Math.min(1, cantidad))
    const paso = Math.round(k * 20) / 20
    const curva = this.recurso(`curva:${paso}`, () => {
      const n = 4096
      const c = new Float32Array(n)
      const dureza = 1 + paso * 120
      for (let i = 0; i < n; i++) {
        const x = (i * 2) / (n - 1) - 1
        c[i] = ((1 + dureza) * x) / (1 + dureza * Math.abs(x))
      }
      return c
    })
    const w = this.ctx.createWaveShaper()
    w.curve = curva
    w.oversample = '2x'
    return w
  }

  /**
   * Delay con realimentación. Devuelve `{ entrada, salida, delay, realim }`
   * para que el llamador pueda automatizar el tiempo.
   */
  delay({ tiempo = 0.24, realimentacion = 0.32, corte = 3200 } = {}) {
    const entrada = this.ganancia(1)
    const salida = this.ganancia(1)
    const d = this.ctx.createDelay(2)
    d.delayTime.value = tiempo
    const realim = this.ganancia(realimentacion)
    const tapa = this.filtro('lowpass', corte, 0.7)
    entrada.connect(d)
    d.connect(tapa)
    tapa.connect(realim)
    realim.connect(d)
    d.connect(salida)
    return { entrada, salida, delay: d, realim }
  }

  /**
   * Respuesta de impulso generada proceduralmente: ruido con caída
   * exponencial y un pasa-bajos que se cierra con el tiempo (la cola oscurece,
   * como en una sala real). Cacheada por parámetros.
   */
  respuestaImpulso({ segundos = 2.1, decaimiento = 2.6, brillo = 0.55, semilla = 0x27d4eb2f } = {}) {
    const clave = `ir:${segundos}:${decaimiento}:${brillo}:${semilla}`
    return this.recurso(clave, () => {
      const tasa = this.ctx.sampleRate
      const largo = Math.max(1, Math.floor(tasa * segundos))
      const buffer = this.ctx.createBuffer(2, largo, tasa)
      for (let c = 0; c < 2; c++) {
        const d = buffer.getChannelData(c)
        const azar = ruleta(semilla + c * 7919)
        let lp = 0
        // Pequeño retardo inicial: da sensación de tamaño de sala.
        const preDelay = Math.floor(tasa * 0.012)
        for (let i = 0; i < largo; i++) {
          if (i < preDelay) {
            d[i] = 0
            continue
          }
          const t = (i - preDelay) / (largo - preDelay)
          const caida = Math.pow(1 - t, decaimiento)
          // Coeficiente del pasa-bajos: se cierra a medida que la cola muere.
          const coef = brillo * (1 - t * 0.85) + 0.03
          lp += coef * ((azar() * 2 - 1) - lp)
          d[i] = lp * caida
        }
        // Primeras reflexiones dispersas, para que no suene a ruido plano.
        for (let r = 0; r < 9; r++) {
          const pos = preDelay + Math.floor(azar() * tasa * 0.09) + r * 137
          if (pos < largo) d[pos] += (azar() * 2 - 1) * 0.42 * Math.pow(0.72, r)
        }
      }
      return buffer
    })
  }

  /** Convolución lista para usar como retorno de reverb. */
  reverb(opciones = {}) {
    const c = this.ctx.createConvolver()
    c.normalize = true
    c.buffer = this.respuestaImpulso(opciones)
    return c
  }

  /** Compresor maestro: pega el mix y evita que los picos saturen. */
  compresorMaestro({ umbral = -14, rodilla = 22, ratio = 6, ataque = 0.004, liberacion = 0.22 } = {}) {
    const c = this.ctx.createDynamicsCompressor()
    c.threshold.value = umbral
    c.knee.value = rodilla
    c.ratio.value = ratio
    c.attack.value = ataque
    c.release.value = liberacion
    return c
  }

  // --- Envolventes ----------------------------------------------------

  /**
   * Envolvente ADSR sobre un `AudioParam`. Devuelve el instante en que el
   * sonido termina del todo (útil para programar el `stop()`).
   */
  adsr(param, t0, duracion = 0.2, env = ADSR_POR_DEFECTO) {
    const e = env === ADSR_POR_DEFECTO ? env : { ...ADSR_POR_DEFECTO, ...env }
    const pico = Math.max(CASI_CERO, e.pico)
    const sostenido = Math.max(CASI_CERO, pico * e.sostenido)
    const tAtaque = t0 + Math.max(0.001, e.ataque)
    const tDecaimiento = tAtaque + Math.max(0.001, e.decaimiento)
    const tSuelta = Math.max(tDecaimiento, t0 + duracion)
    param.cancelScheduledValues(t0)
    param.setValueAtTime(CASI_CERO, t0)
    param.linearRampToValueAtTime(pico, tAtaque)
    param.exponentialRampToValueAtTime(sostenido, tDecaimiento)
    param.setValueAtTime(sostenido, tSuelta)
    param.exponentialRampToValueAtTime(CASI_CERO, tSuelta + Math.max(0.01, e.liberacion))
    return tSuelta + Math.max(0.01, e.liberacion)
  }

  /** Envolvente percusiva: golpe instantáneo y caída exponencial. */
  golpe(param, t0, pico = 1, caida = 0.2, ataque = 0.002) {
    param.cancelScheduledValues(t0)
    param.setValueAtTime(CASI_CERO, t0)
    param.linearRampToValueAtTime(Math.max(CASI_CERO, pico), t0 + ataque)
    param.exponentialRampToValueAtTime(CASI_CERO, t0 + ataque + caida)
    return t0 + ataque + caida
  }

  /** Rampa exponencial segura (nunca apunta a 0 exacto). */
  rampa(param, valor, t) {
    param.exponentialRampToValueAtTime(Math.max(CASI_CERO, valor), t)
  }

  /** Barrido de un parámetro entre dos valores, exponencial. */
  barrido(param, desde, hasta, t0, duracion) {
    param.cancelScheduledValues(t0)
    param.setValueAtTime(Math.max(CASI_CERO, desde), t0)
    param.exponentialRampToValueAtTime(Math.max(CASI_CERO, hasta), t0 + duracion)
  }

  /** Suelta la cache (los nodos ya conectados los libera el propio contexto). */
  liberar() {
    this.cache.clear()
  }
}

export default Sintetizador
