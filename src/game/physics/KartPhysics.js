// FisicaKart — modelo de conducción arcade estilo Mario Kart 8.
//
// No es un simulador: no hay ruedas, ni neumáticos, ni transferencia de carga.
// Hay una caja que avanza, un ángulo de guiñada, y un montón de curvas de
// respuesta afinadas para que se sienta bien. Las decisiones de diseño:
//
//  • La velocidad se guarda en el marco LOCAL del kart: `rapidez` (hacia el
//    frente) y `desliz` (hacia su derecha). Cuando el kart gira, las dos
//    componentes se rotan; la fricción lateral se come `desliz`. De ahí sale
//    gratis el subviraje a alta velocidad y el derrape.
//  • El derrape es el corazón del juego: hop, ángulo de contraderrape
//    modulable, carga escalonada y mini-turbo al soltar.
//  • Todo lo vertical es una suspensión de resorte-amortiguador contra la
//    altura que devuelve `pista.muestrear()`; no hay raycast real.
//  • `step()` no asigna memoria: todos los vectores son temporales de módulo.
//
// SISTEMA DE COORDENADAS: Y arriba, el kart avanza hacia su -Z local, por lo
// que su frente es (-sin yaw, 0, -cos yaw) y su derecha (cos yaw, 0, -sin yaw).
// `giro` positivo = derecha, y girar a la derecha RESTA yaw.
import * as THREE from 'three'
import {
  KART,
  VELOCIDAD,
  CARRERA,
  DERRAPE,
  FISICA,
  PENALIZACION_SUPERFICIE,
} from '../core/constantes.js'
import { clamp, clamp01, damp, lerp, smoothstep, TAU } from '../core/utils.js'
import { parametrosDe, parametrosDeEstadisticas } from './params.js'
import { resolverEmpujeKarts, rebotar, crearResultadoContacto } from './collision.js'

// --- Constantes de sensación (viven acá porque son puro tacto de conducción) ---

/** Agarre lateral por tipo de superficie (multiplica la fricción lateral). */
export const AGARRE_SUPERFICIE = Object.freeze({
  asfalto: FISICA.agarreAsfalto,
  bordillo: FISICA.agarreBordillo,
  turbo: FISICA.agarreAsfalto,
  rampa: FISICA.agarreAsfalto,
  cesped: FISICA.agarreCesped,
  tierra: FISICA.agarreTierra,
  arena: FISICA.agarreArena,
  agua: 0.42,
  lava: 0.5,
  vacio: 1,
})

/** Superficies que disparan el rescate de la grúa. */
const SUPERFICIES_MORTALES = { lava: true, agua: true, vacio: true }

/** Velocidad con la que se recupera el agarre lateral en asfalto (1/s). */
const LAMBDA_LATERAL = 13
/** El derrape rota la guiñada más rápido que un giro normal. */
const MULT_YAW_DERRAPE = 1.28
/** Apertura del derrape: 0.45 = derrape abierto, 1.3 = cerrado sobre el vértice. */
const DERRAPE_ABIERTO = 0.45
const DERRAPE_CERRADO = 1.3
/** Impulso vertical del saltito de entrada al derrape. */
const IMPULSO_HOP = FISICA.fuerzaSalto * 0.46
/** Turbo que regala un truco bien hecho en el aire. */
const TURBO_TRUCO = 0.55
/** Fracción del recorrido que hay que haber cubierto para validar una vuelta. */
const FRACCION_CHECKPOINTS = 0.8
/** Turbo automático de los paneles de la pista. */
const TURBO_PANEL = 1.2

const CONTROL_NEUTRO = Object.freeze({
  acelerar: 0,
  frenar: 0,
  giro: 0,
  derrape: false,
  derrapeAbajo: false,
  item: false,
  mirarAtras: false,
  pausa: false,
})

// --- Temporales de módulo (cero asignaciones dentro del bucle) ---
const EJE_Y = new THREE.Vector3(0, 1, 0)
const _normalObjetivo = new THREE.Vector3(0, 1, 0)
const _qYaw = new THREE.Quaternion()
const _qAlinear = new THREE.Quaternion()
const _qExtra = new THREE.Quaternion()
const _qObjetivo = new THREE.Quaternion()
const _euler = new THREE.Euler(0, 0, 0, 'YXZ')
const _vel2 = [0, 0]
const _contacto = crearResultadoContacto()

export class FisicaKart {
  /**
   * @param {object} pista PistaRuntime (ver CONTRATOS.md §2)
   * @param {{id?:string, personaje?:string, estadisticas?:object}} opciones
   */
  constructor(pista, opciones = {}) {
    this.pista = pista
    this.params = opciones.estadisticas
      ? parametrosDeEstadisticas(opciones.estadisticas)
      : parametrosDe(opciones.personaje)

    // --- Estado interno (no forma parte del contrato) ---
    this.yaw = 0
    this.rapidez = 0 // componente longitudinal, m/s (negativa = marcha atrás)
    this.desliz = 0 // componente lateral en el marco del kart, m/s
    this.velY = 0
    this.chasis = FISICA.alturaSuspension // altura del chasis sobre el eje
    this.velChasis = 0
    this.normalSuave = new THREE.Vector3(0, 1, 0)
    this.intensidadDerrape = 1
    this.fuerzaTurbo = 0
    this.tiempoAire = 0
    this.ySueloAnterior = 0
    this.pendienteSuelo = 0
    this.sentidoTrompo = 1
    this.contraMano = 0
    this.tiempo = 0
    this.cronometroActivo = true
    this.sSeguro = 0
    this._fx = 0
    this._fz = -1
    this._dx = 1
    this._dz = 0
    this._vx = 0
    this._vz = 0
    this._vibra = 0

    // Vueltas y checkpoints
    const n = Math.max(1, pista && pista.puntosControl ? pista.puntosControl : 8)
    this.totalCheckpoints = n
    this.checkpoints = new Uint8Array(n)
    this.visitados = 0
    this.tAnterior = 0
    this.tContinuo = 0
    this.nivelAnterior = 0
    this.nivelOtorgado = 0
    this.vueltasCompletadas = 0
    this.tiempoVueltaAnterior = 0

    // Objetos reutilizables para las consultas a la pista.
    this._sup = {
      y: 0,
      normal: new THREE.Vector3(0, 1, 0),
      tipo: 'asfalto',
      enPista: true,
      distanciaCentro: 0,
      anchoAqui: 11,
    }
    this._prog = {
      s: 0,
      t: 0,
      lateral: 0,
      tangente: new THREE.Vector3(0, 0, -1),
      indice: 0,
    }
    this._col = {
      golpe: false,
      correccion: new THREE.Vector3(),
      normal: new THREE.Vector3(),
    }
    this._punto = {
      posicion: new THREE.Vector3(),
      tangente: new THREE.Vector3(0, 0, -1),
      normal: new THREE.Vector3(0, 1, 0),
      ancho: 11,
    }

    /** @type {object} Estado público. `step` sólo muta esto; el render lo lee. */
    this.estado = {
      id: opciones.id ?? 'kart',
      personaje: opciones.personaje ?? 'jp',
      posicion: new THREE.Vector3(),
      quaternion: new THREE.Quaternion(),
      velocidad: new THREE.Vector3(),
      rapidez: 0,
      rapidezMax: this.params.velocidadMax,
      rapidezNorm: 0,
      giroVisual: 0,
      enSuelo: true,
      superficie: 'asfalto',
      saltando: false,
      derrapando: false,
      ladoDerrape: 0,
      cargaDerrape: 0,
      nivelDerrape: 0,
      turbo: 0,
      estrella: 0,
      aplastado: 0,
      girando: 0,
      aturdido: 0,
      vueltasRueda: 0,
      balanceo: 0,
      cabeceo: 0,
      progreso: this._prog,
      vuelta: 1,
      puesto: 1,
      terminado: false,
      tiempoTotal: 0,
      tiempos: [],
      monedas: 0,

      // --- Extras (fuera del mínimo del contrato) que consumen FX/HUD/audio ---
      masa: this.params.masa,
      enPista: true,
      marchaAtras: false,
      fueraDePista: 0, // segundos seguidos fuera de la calzada
      polvo: 0, // 0..1 intensidad de partículas de suelo
      sacudida: 0, // 0..1 golpe/vibración para la cámara
      rescatando: 0, // segundos restantes de grúa (0 = normal)
      invulnerable: 0,
      turboOtorgado: 0, // pulso de un cuadro: fuerza del turbo recién dado
      nivelTurboOtorgado: 0, // nivel de mini-turbo del pulso (0..3)
      golpeMuro: 0, // 0..1, decae
      golpeKart: 0,
      aterrizaje: 0,
      saltoRecien: false,
      truco: 0, // progreso 0..1 de la acrobacia aérea
      trucoTipo: 0,
      anguloDerrape: 0,
      deslizamiento: 0,
      alturaChasis: FISICA.alturaSuspension,
      compresion: 0, // 0..1 cuánto está hundida la suspensión
    }
  }

  // ---------------------------------------------------------------- colocar
  /** Coloca el kart (parrilla de salida o reinicio) y limpia el estado dinámico. */
  colocarEn(posicion, rotacionY = 0) {
    const e = this.estado
    e.posicion.copy(posicion)
    this.yaw = rotacionY
    this.rapidez = 0
    this.desliz = 0
    this.velY = 0
    this.chasis = FISICA.alturaSuspension
    this.velChasis = 0
    this.normalSuave.set(0, 1, 0)
    this.tiempoAire = 0
    this.fuerzaTurbo = 0
    this.intensidadDerrape = 1
    _qYaw.setFromAxisAngle(EJE_Y, this.yaw)
    e.quaternion.copy(_qYaw)
    e.velocidad.set(0, 0, 0)
    e.rapidez = 0
    e.enSuelo = true
    e.derrapando = false
    e.ladoDerrape = 0
    e.cargaDerrape = 0
    e.nivelDerrape = 0
    e.turbo = 0
    e.girando = 0
    e.aturdido = 0
    e.aplastado = 0
    e.rescatando = 0
    e.truco = 0
    e.fueraDePista = 0

    const sup = this._muestrear(e.posicion.x, e.posicion.z)
    this.ySueloAnterior = sup.y
    e.posicion.y = sup.y
    const p = this._progresoPista(e.posicion.x, e.posicion.z)
    this.sSeguro = p.s
    this.tAnterior = p.t
    this.tContinuo = p.t
    this.nivelAnterior = Math.floor(this.tContinuo)
    this.nivelOtorgado = this.nivelAnterior
    this._reiniciarCheckpoints()
    return this
  }

  /** Reinicia vueltas y cronómetro (largada). */
  reiniciarCarrera() {
    const e = this.estado
    this.tiempo = 0
    this.tiempoVueltaAnterior = 0
    this.vueltasCompletadas = 0
    e.vuelta = 1
    e.terminado = false
    e.tiempoTotal = 0
    e.tiempos.length = 0
    e.monedas = 0
    this._reiniciarCheckpoints()
    return this
  }

  // ------------------------------------------------------------------- step
  /**
   * Avanza la simulación un paso fijo.
   * @param {number} dt segundos (el Engine usa 1/60)
   * @param {object} control ver `Control` en CONTRATOS.md §3
   * @param {{karts?:Array, gravedad?:number}} mundo
   */
  step(dt, control, mundo) {
    if (!(dt > 0)) return this.estado
    if (dt > 0.05) dt = 0.05
    const e = this.estado
    const P = this.params
    const c = control || CONTROL_NEUTRO

    this._decaer(dt)
    if (this.cronometroActivo && !e.terminado) {
      this.tiempo += dt
      e.tiempoTotal = this.tiempo * 1000
    }

    // 1. Suelo: muestreo, gravedad, suspensión y aterrizaje.
    const sup = this._muestrear(e.posicion.x, e.posicion.z)
    e.superficie = sup.tipo || 'asfalto'
    e.enPista = sup.enPista !== false
    this._resolverSuelo(dt, sup, mundo)

    // 2. Superficies especiales (paneles de turbo, lava/agua/vacío).
    if (e.rescatando > 0) return this._pasoRescate(dt, sup)
    this._superficiesEspeciales(dt, sup)

    // 3. Entrada efectiva: los castigos anulan el control.
    const sinControl = e.girando > 0 || e.aturdido > 0
    const acel = sinControl ? 0 : clamp01(c.acelerar)
    const freno = sinControl ? 0 : clamp01(c.frenar)
    const giro = sinControl ? 0 : clamp(c.giro || 0, -1, 1)

    // 4. Derrape (entrada, modulación, carga y salida).
    this._derrape(dt, c, giro, sinControl)

    // 5. Longitudinal.
    const vMax = this._velocidadMaxima()
    e.rapidezMax = vMax
    this._longitudinal(dt, acel, freno, vMax)

    // 6. Guiñada.
    this._girar(dt, giro, sinControl)

    // 7. Deriva lateral (agarre).
    this._deriva(dt, sup)

    // 8. Integración en XZ.
    const vx = this._fx * this.rapidez + this._dx * this.desliz
    const vz = this._fz * this.rapidez + this._dz * this.desliz
    this._vx = vx
    this._vz = vz
    e.posicion.x += vx * dt
    e.posicion.z += vz * dt

    // 9. Colisiones.
    this._colisionMuros()
    if (mundo && mundo.karts) this._colisionKarts(mundo.karts)

    // 10. Progreso, vueltas y sentido de marcha.
    this._progreso(dt, sup)

    // 11. Presentación (orientación, inclinaciones, ruedas).
    this._visual(dt, giro, sup)

    // 12. Volcado final al estado público.
    e.velocidad.set(this._vx, this.velY, this._vz)
    e.rapidez = this.rapidez
    e.rapidezNorm = clamp01(Math.abs(this.rapidez) / P.velocidadMax)
    e.deslizamiento = this.desliz
    e.saltando = !e.enSuelo
    e.anguloDerrape = this.anguloDerrapeActual || 0
    return e
  }

  // ------------------------------------------------------------- sub-pasos
  _decaer(dt) {
    const e = this.estado
    e.turbo = Math.max(0, e.turbo - dt)
    if (e.turbo === 0) this.fuerzaTurbo = 0
    e.estrella = Math.max(0, e.estrella - dt)
    e.aplastado = Math.max(0, e.aplastado - dt)
    e.girando = Math.max(0, e.girando - dt)
    e.aturdido = Math.max(0, e.aturdido - dt)
    e.invulnerable = Math.max(0, e.invulnerable - dt)
    e.sacudida = Math.max(0, e.sacudida - dt * 2.2)
    e.golpeMuro = Math.max(0, e.golpeMuro - dt * 4)
    e.golpeKart = Math.max(0, e.golpeKart - dt * 4)
    e.aterrizaje = Math.max(0, e.aterrizaje - dt * 3)
    e.turboOtorgado = 0
    e.nivelTurboOtorgado = 0
    e.saltoRecien = false
  }

  _muestrear(x, z) {
    const s = this.pista && this.pista.muestrear ? this.pista.muestrear(x, z, this._sup) : null
    return s || this._sup
  }

  _progresoPista(x, z) {
    const p = this.pista && this.pista.progreso ? this.pista.progreso(x, z, this._prog) : null
    return p || this._prog
  }

  /** Gravedad, contacto con el suelo, aterrizajes y suspensión. */
  _resolverSuelo(dt, sup, mundo) {
    const e = this.estado
    const ySuelo = sup.y || 0
    this.pendienteSuelo = dt > 0 ? (ySuelo - this.ySueloAnterior) / dt : 0
    this.ySueloAnterior = ySuelo

    const gBase = mundo && mundo.gravedad ? mundo.gravedad : null
    const g = gBase || (this.velY <= 0 ? FISICA.gravedadCaida : FISICA.gravedad)
    this.velY -= g * dt
    e.posicion.y += this.velY * dt

    const estaba = e.enSuelo
    if (e.posicion.y <= ySuelo + 1e-3) {
      e.posicion.y = ySuelo
      if (!estaba) this._aterrizar(-this.velY)
      // Al subir una rampa el suelo empuja: conservamos su velocidad vertical
      // para que al llegar al borde el kart salga volando de verdad.
      this.velY = Math.max(0, this.pendienteSuelo)
      e.enSuelo = true
      this.tiempoAire = 0
    } else {
      e.enSuelo = false
      this.tiempoAire += dt
    }

    // Suspensión: resorte-amortiguador puramente visual sobre `alturaChasis`.
    const objetivo = e.enSuelo ? FISICA.alturaSuspension : FISICA.alturaSuspension * 1.06
    this.velChasis +=
      ((objetivo - this.chasis) * FISICA.rigidezSuspension - this.velChasis * FISICA.amortiguacion) *
      dt
    this.chasis += this.velChasis * dt
    if (this.chasis < 0.06) {
      this.chasis = 0.06
      if (this.velChasis < 0) this.velChasis = 0
    }
    e.alturaChasis = this.chasis
    e.compresion = clamp01((FISICA.alturaSuspension - this.chasis) / FISICA.alturaSuspension)
  }

  /** Un aterrizaje fuerte hunde la suspensión, sacude y roba velocidad. */
  _aterrizar(caida) {
    const e = this.estado
    const impacto = Math.max(0, caida)
    this.velChasis = -Math.min(impacto * 0.55, 5)
    // Cuanto más "de punta" viene la velocidad respecto del suelo, más se pierde.
    const total = Math.hypot(Math.abs(this.rapidez), impacto)
    const inclinacion = total > 0.5 ? impacto / total : 0
    const perdida = clamp01((impacto - 6) / 18) * clamp01(inclinacion * 1.4)
    if (perdida > 0) this.rapidez *= 1 - 0.4 * perdida
    e.aterrizaje = clamp01(impacto / 14)
    e.sacudida = Math.max(e.sacudida, clamp01(impacto / 16))
    // Un truco iniciado en el aire se cobra al tocar el suelo.
    if (e.truco > 0) {
      if (e.truco > 0.35) this.darTurbo(TURBO_TRUCO, 1)
      e.truco = 0
    }
  }

  /** Paneles de turbo y superficies que exigen rescate. */
  _superficiesEspeciales(dt, sup) {
    const e = this.estado
    const tipo = e.superficie
    if (e.enSuelo && tipo === 'turbo' && e.turbo < TURBO_PANEL * 0.85) {
      this.darTurbo(TURBO_PANEL, 1.15)
    }
    if (SUPERFICIES_MORTALES[tipo] || e.posicion.y < (sup.y || 0) - 12) {
      this._iniciarRescate()
      return
    }
    // Fuera de pista sostenido: lentitud (ya está en la penalización), polvo y
    // vibración para que se note en pantalla y en el volante.
    if (e.enSuelo && !e.enPista) {
      e.fueraDePista += dt
      const intensidad = clamp01(Math.abs(this.rapidez) / 12) * clamp01(e.fueraDePista / 0.35)
      e.polvo = Math.max(e.polvo, intensidad)
      e.sacudida = Math.max(e.sacudida, intensidad * 0.45)
    } else {
      e.fueraDePista = Math.max(0, e.fueraDePista - dt * 2)
      e.polvo = damp(e.polvo, e.derrapando && e.enSuelo ? 0.35 : 0, 6, dt)
    }
  }

  _iniciarRescate() {
    const e = this.estado
    if (e.rescatando > 0) return
    e.rescatando = CARRERA.tiempoRescate
    this.rapidez = 0
    this.desliz = 0
    this.velY = 0
    this._vx = 0
    this._vz = 0
    e.velocidad.set(0, 0, 0)
    e.turbo = 0
    this.fuerzaTurbo = 0
    e.sacudida = 1
    this._cancelarDerrape()
  }

  /** Mientras la grúa te levanta el kart no responde y no avanza. */
  _pasoRescate(dt, sup) {
    const e = this.estado
    e.rescatando = Math.max(0, e.rescatando - dt)
    this.rapidez = 0
    this.desliz = 0
    this.velY = 0
    e.velocidad.set(0, 0, 0)
    e.rapidez = 0
    e.rapidezNorm = 0
    // Se lo lleva hacia arriba para que el efecto de grúa tenga dónde dibujarse.
    e.posicion.y = damp(e.posicion.y, (sup.y || 0) + 2.4, 3, dt)
    e.enSuelo = false
    e.saltando = true
    if (e.rescatando <= 0) this.reubicar()
    return e
  }

  /** Todo el ciclo del derrape: hop, modulación, carga y mini-turbo. */
  _derrape(dt, c, giro, sinControl) {
    const e = this.estado
    const P = this.params
    const quiere = !!c.derrape && !sinControl

    // --- Truco en el aire: `derrape` justo al despegar ---
    if (!e.enSuelo && c.derrapeAbajo && this.tiempoAire < 0.3 && e.truco === 0 && !sinControl) {
      e.truco = 0.001
      e.trucoTipo = (e.trucoTipo + 1) % 4
    }
    if (e.truco > 0) {
      e.truco = clamp01(e.truco + dt * 1.9)
      if (e.enSuelo) {
        if (e.truco > 0.35) this.darTurbo(TURBO_TRUCO, 1)
        e.truco = 0
      }
    }

    // --- Entrada: hop + fijación del lado ---
    if (
      !e.derrapando &&
      quiere &&
      c.derrapeAbajo &&
      e.enSuelo &&
      Math.abs(giro) > 0.12 &&
      this.rapidez > VELOCIDAD.minimaParaDerrapar
    ) {
      this.velY = IMPULSO_HOP
      e.posicion.y += 0.02
      e.enSuelo = false
      e.saltoRecien = true
      e.derrapando = true
      e.ladoDerrape = giro > 0 ? 1 : -1
      e.cargaDerrape = 0
      e.nivelDerrape = 0
      this.intensidadDerrape = 1
      this.tiempoAire = 0
    }

    if (!e.derrapando) {
      this.anguloDerrapeActual = damp(this.anguloDerrapeActual || 0, 0, 7, dt)
      return
    }

    // --- Cancelaciones ---
    const contrario = giro * e.ladoDerrape < -0.55
    const muyLento = this.rapidez < VELOCIDAD.minimaParaDerrapar * 0.5
    if (contrario || muyLento || c.frenar > 0.5 || sinControl) {
      this._cancelarDerrape()
      return
    }

    // --- Modulación: el giro abre o cierra el derrape ---
    const mod = clamp(giro * e.ladoDerrape, -1, 1)
    const objetivo = lerp(DERRAPE_ABIERTO, DERRAPE_CERRADO, (mod + 1) * 0.5)
    this.intensidadDerrape = damp(this.intensidadDerrape, objetivo, 8, dt)

    // --- Carga escalonada (manejo alto carga antes) ---
    if (e.enSuelo || this.tiempoAire < 0.45) {
      e.cargaDerrape += dt * P.tasaDerrape * (0.85 + 0.25 * clamp01(this.intensidadDerrape))
    }
    e.nivelDerrape =
      e.cargaDerrape >= DERRAPE.umbralNivel3
        ? 3
        : e.cargaDerrape >= DERRAPE.umbralNivel2
          ? 2
          : e.cargaDerrape >= DERRAPE.umbralNivel1
            ? 1
            : 0

    // --- Ángulo de contraderrape ---
    const anguloMeta =
      e.ladoDerrape * DERRAPE.anguloMax * clamp(this.intensidadDerrape, 0.35, 1.05)
    this.anguloDerrapeActual = damp(this.anguloDerrapeActual || 0, anguloMeta, 6, dt)

    // --- Salida: se soltó el botón ---
    if (!quiere) this._soltarDerrape()
  }

  /** Soltar el derrape entrega el mini-turbo del nivel alcanzado. */
  _soltarDerrape() {
    const e = this.estado
    const nivel = e.nivelDerrape
    if (nivel >= 1) {
      const segundos = DERRAPE.turboNivel[nivel] * this.params.factorMiniTurbo
      this.darTurbo(segundos, DERRAPE.fuerzaNivel[nivel])
      e.nivelTurboOtorgado = nivel
    }
    this._cancelarDerrape()
  }

  /** Corta el derrape sin premio. */
  _cancelarDerrape() {
    const e = this.estado
    e.derrapando = false
    e.ladoDerrape = 0
    e.cargaDerrape = 0
    e.nivelDerrape = 0
    this.intensidadDerrape = 1
  }

  /** Tope de velocidad de este cuadro: superficie × monedas × turbo × castigos. */
  _velocidadMaxima() {
    const e = this.estado
    const P = this.params
    let penal = e.enSuelo ? (PENALIZACION_SUPERFICIE[e.superficie] ?? 1) : 1
    // Un turbo activo te cruza el pasto casi sin castigo (como el hongo en MK).
    if (e.turbo > 0 || e.estrella > 0) penal = Math.max(penal, 0.92)

    let v = P.velocidadMax * penal
    v *= 1 + 0.007 * e.monedas // 10 monedas ≈ +7 % de punta
    if (e.turbo > 0) {
      const f = clamp(this.fuerzaTurbo, 0, 1.5)
      const techo = P.escala * (VELOCIDAD.base + (VELOCIDAD.turbo - VELOCIDAD.base) * f) * penal
      if (techo > v) v = techo
    }
    if (e.estrella > 0) {
      const techo = P.escala * VELOCIDAD.estrella * penal
      if (techo > v) v = techo
    }
    if (e.aplastado > 0) v *= 0.6
    if (e.derrapando) v *= 0.985
    return v
  }

  /** Acelerador, freno motor, freno de pie y marcha atrás. */
  _longitudinal(dt, acel, freno, vMax) {
    const e = this.estado
    const P = this.params
    const enSuelo = e.enSuelo
    const traccion = enSuelo ? 1 : 0.12

    if (freno > 0.05 && this.rapidez <= 0.5) {
      // Marcha atrás: lenta y sin gracia, como debe ser.
      const objetivo = -P.velocidadAtras * freno
      this.rapidez += (objetivo - this.rapidez) * P.aceleracionAtras * dt * traccion
    } else if (freno > 0.05) {
      this.rapidez -= P.freno * freno * dt * (enSuelo ? 1 : 0.25)
      if (this.rapidez < 0) this.rapidez = 0
    } else if (acel > 0.02) {
      const k =
        P.aceleracion *
        (e.turbo > 0 ? 1.7 : 1) *
        (e.estrella > 0 ? 1.3 : 1) *
        (e.aplastado > 0 ? 0.8 : 1) *
        traccion
      const objetivo = vMax * acel
      if (this.rapidez < objetivo) {
        // Curva asintótica: golpe de par al arrancar, casi nada cerca del tope.
        this.rapidez += (objetivo - this.rapidez) * k * dt
      } else {
        this.rapidez = damp(this.rapidez, objetivo, 2.2, dt)
      }
    } else {
      // Freno motor al soltar el acelerador.
      this.rapidez = damp(this.rapidez, 0, FISICA.frenoMotor * (enSuelo ? 1 : 0.3), dt)
    }

    // Arrastre por deslizamiento lateral: derrapar cuesta punta.
    const slip = Math.abs(this.desliz)
    if (slip > 1 && this.rapidez > 0) {
      this.rapidez -= Math.min(slip * 0.09, 2.4) * dt
      if (this.rapidez < 0) this.rapidez = 0
    }

    // Techo: nunca por encima del tope; si el turbo se apagó, decae suave.
    if (this.rapidez > vMax) this.rapidez = damp(this.rapidez, vMax, 3.2, dt)
    const topeAtras = -P.velocidadAtras
    if (this.rapidez < topeAtras) this.rapidez = topeAtras
  }

  /**
   * Guiñada. El radio de giro depende de la velocidad: nulo parado, mínimo
   * alrededor del 35 % del tope y se abre progresivamente en punta.
   */
  _girar(dt, giro, sinControl) {
    const e = this.estado
    const P = this.params
    let delta = 0

    if (e.girando > 0) {
      // Trompo: dos vueltas en 1.4 s, sin control.
      delta = this.sentidoTrompo * 4.6 * dt
    } else if (!sinControl) {
      const vNorm = clamp01(Math.abs(this.rapidez) / P.velocidadMax)
      const arranque = Math.sin(clamp01(vNorm / 0.35) * Math.PI * 0.5)
      const apertura = lerp(1, 0.55, smoothstep((vNorm - 0.35) / 0.65))
      let omega = P.giroMax * arranque * apertura
      if (!e.enSuelo) omega *= 0.42 // en el aire apenas se orienta
      if (e.derrapando) {
        delta = -e.ladoDerrape * omega * MULT_YAW_DERRAPE * this.intensidadDerrape * dt
      } else {
        const sentido = this.rapidez < -0.2 ? -1 : 1
        delta = -giro * omega * sentido * dt
      }
    }

    if (delta !== 0) {
      this.yaw += delta
      if (this.yaw > Math.PI) this.yaw -= TAU
      else if (this.yaw < -Math.PI) this.yaw += TAU
      // La velocidad no gira con el kart: se re-expresa en el marco nuevo, y
      // esa diferencia es exactamente el deslizamiento lateral.
      const cs = Math.cos(delta)
      const sn = Math.sin(delta)
      const r0 = this.rapidez
      const d0 = this.desliz
      this.rapidez = r0 * cs - d0 * sn
      this.desliz = r0 * sn + d0 * cs
    }

    this._fx = -Math.sin(this.yaw)
    this._fz = -Math.cos(this.yaw)
    this._dx = Math.cos(this.yaw)
    this._dz = -Math.sin(this.yaw)
  }

  /** Fricción lateral: cuánto "muerde" el kart de costado. */
  _deriva(dt, sup) {
    const e = this.estado
    const P = this.params
    const agarreSup = AGARRE_SUPERFICIE[e.superficie] ?? FISICA.agarreAsfalto
    let lambda = LAMBDA_LATERAL * agarreSup * P.agarre
    if (e.derrapando) lambda *= P.agarreDerrape
    if (!e.enSuelo) lambda *= 0.1
    if (e.girando > 0) lambda *= 0.4

    let objetivo = 0
    if (e.derrapando && e.enSuelo) {
      // El derrape mantiene un ángulo de contraderrape estable.
      const ang = this.anguloDerrapeActual || 0
      objetivo = -Math.sign(ang || e.ladoDerrape) * Math.abs(this.rapidez) * Math.tan(Math.abs(ang))
      lambda = Math.max(lambda, 5.5)
    }
    this.desliz = damp(this.desliz, objetivo, lambda, dt)

    // Fuera del asfalto el kart patina y vibra: micro-ruido determinista.
    if (e.enSuelo && agarreSup < 0.8 && Math.abs(this.rapidez) > 4) {
      this._vibra += dt * 37
      const amplitud = (1 - agarreSup) * clamp01(Math.abs(this.rapidez) / 16)
      this.desliz += Math.sin(this._vibra) * amplitud * 3.2 * dt
    }
  }

  /** Rebote arcade contra los muros del escenario. */
  _colisionMuros() {
    const e = this.estado
    if (!this.pista || !this.pista.colisionar) return
    const r = this.pista.colisionar(e.posicion, KART.radioColision, this._col) || this._col
    if (!r.golpe) return
    if (r.correccion) e.posicion.add(r.correccion)

    const n = r.normal
    let nx = n ? n.x : 0
    let nz = n ? n.z : 0
    const largo = Math.hypot(nx, nz)
    if (largo < 1e-5) return
    nx /= largo
    nz /= largo

    const frontalidad = rebotar(this._vx, this._vz, nx, nz, _vel2, 0.32, 0.58)
    if (frontalidad <= 0) return
    this._vx = _vel2[0]
    this._vz = _vel2[1]
    this.rapidez = this._vx * this._fx + this._vz * this._fz
    this.desliz = this._vx * this._dx + this._vz * this._dz
    e.golpeMuro = Math.max(e.golpeMuro, frontalidad)
    e.sacudida = Math.max(e.sacudida, frontalidad * 0.8)
    if (frontalidad > 0.3) {
      this._cancelarDerrape()
      if (frontalidad > 0.75) e.aturdido = Math.max(e.aturdido, 0.18)
    }
  }

  /**
   * Empuje entre karts: cilindros en XZ, reparto por masa. Cada kart resuelve
   * su propia mitad leyendo el estado ajeno (nunca lo escribe), así el par
   * queda consistente sin depender del orden de actualización.
   */
  _colisionKarts(karts) {
    const e = this.estado
    const P = this.params
    const radio = KART.radioColision * (e.aplastado > 0 ? 0.7 : 1)
    for (let i = 0; i < karts.length; i++) {
      const o = karts[i]
      if (!o || o === e || o.id === e.id || !o.posicion) continue
      if (Math.abs(o.posicion.y - e.posicion.y) > 2.2) continue
      const dx = e.posicion.x - o.posicion.x
      const dz = e.posicion.z - o.posicion.z
      const alcance = radio + KART.radioColision
      if (dx * dx + dz * dz > alcance * alcance) continue

      const ovx = o.velocidad ? o.velocidad.x : 0
      const ovz = o.velocidad ? o.velocidad.z : 0
      const con = resolverEmpujeKarts(
        e.posicion.x,
        e.posicion.z,
        this._vx,
        this._vz,
        P.masa,
        o.posicion.x,
        o.posicion.z,
        ovx,
        ovz,
        o.masa || KART.masaBase,
        alcance * 0.5,
        _contacto,
      )
      if (!con.golpe) continue

      e.posicion.x += con.nx * con.desplazo
      e.posicion.z += con.nz * con.desplazo

      const imp = con.impulso / P.resistenciaEmpuje
      const ix = con.nx * imp
      const iz = con.nz * imp
      this.desliz += ix * this._dx + iz * this._dz
      this.rapidez += (ix * this._fx + iz * this._fz) * 0.35
      this._vx = this._fx * this.rapidez + this._dx * this.desliz
      this._vz = this._fz * this.rapidez + this._dz * this.desliz

      // Encontronazo fuerte: te saca del derrape y te sacude.
      if (con.cierre > 6) {
        e.golpeKart = 1
        e.sacudida = Math.max(e.sacudida, 0.55)
        if (e.derrapando) this._cancelarDerrape()
      } else {
        e.golpeKart = Math.max(e.golpeKart, clamp01(con.cierre / 6) * 0.5)
      }
    }
  }

  /** Progreso sobre el trazado, checkpoints, vueltas y sentido de marcha. */
  _progreso(dt, sup) {
    const e = this.estado
    const p = this._progresoPista(e.posicion.x, e.posicion.z)
    e.progreso = p

    // Sentido contrario: comparamos la velocidad con la tangente de la pista.
    const tg = p.tangente
    if (tg) {
      const vLon = this._vx * tg.x + this._vz * tg.z
      this.contraMano = damp(this.contraMano, vLon < -1.5 ? 1 : 0, 4, dt)
      e.marchaAtras = this.contraMano > 0.5
    }

    // Último punto seguro para el rescate.
    if (e.enSuelo && e.enPista && e.rescatando <= 0) this.sSeguro = p.s

    // Checkpoints de la vuelta en curso.
    if (this.pista && this.pista.checkpointEn) {
      const idx = this.pista.checkpointEn(p.s) | 0
      if (idx >= 0 && idx < this.totalCheckpoints && !this.checkpoints[idx]) {
        this.checkpoints[idx] = 1
        this.visitados++
      }
    }

    // Progreso continuo sin saltos en la costura 1 → 0.
    let d = p.t - this.tAnterior
    if (d > 0.5) d -= 1
    else if (d < -0.5) d += 1
    this.tContinuo += d
    this.tAnterior = p.t

    const nivel = Math.floor(this.tContinuo)
    if (nivel > this.nivelAnterior) {
      // Cruce de meta hacia adelante.
      const minimo = Math.ceil(this.totalCheckpoints * FRACCION_CHECKPOINTS)
      const valido = this.visitados >= minimo && !e.marchaAtras
      this._reiniciarCheckpoints()
      if (valido) {
        this.nivelOtorgado = nivel
        this._registrarVuelta()
      }
    } else if (nivel < this.nivelAnterior) {
      // Cruzó la meta al revés: se le quita la vuelta y hay que rehacerla.
      this._reiniciarCheckpoints()
      if (this.nivelOtorgado > nivel) {
        this.nivelOtorgado = nivel
        this._quitarVuelta()
      }
    }
    this.nivelAnterior = nivel
  }

  _reiniciarCheckpoints() {
    this.checkpoints.fill(0)
    this.visitados = 0
  }

  _registrarVuelta() {
    const e = this.estado
    if (e.terminado) return
    const total = this.tiempo * 1000
    e.tiempos.push(total - this.tiempoVueltaAnterior)
    this.tiempoVueltaAnterior = total
    this.vueltasCompletadas++
    const vueltasCarrera = (this.pista && this.pista.vueltas) || CARRERA.vueltasPorDefecto
    if (this.vueltasCompletadas >= vueltasCarrera) {
      e.terminado = true
      e.vuelta = vueltasCarrera
      e.tiempoTotal = total
    } else {
      e.vuelta = this.vueltasCompletadas + 1
    }
  }

  _quitarVuelta() {
    const e = this.estado
    if (this.vueltasCompletadas <= 0) return
    this.vueltasCompletadas--
    if (e.tiempos.length) {
      e.tiempos.pop()
      this.tiempoVueltaAnterior = e.tiempos.reduce((a, b) => a + b, 0)
    }
    e.vuelta = Math.max(1, this.vueltasCompletadas + 1)
    e.terminado = false
  }

  /** Orientación del chasis, inclinaciones y ruedas. Sólo presentación. */
  _visual(dt, giro, sup) {
    const e = this.estado

    // Normal del suelo suavizada: nunca un cambio instantáneo.
    if (e.enSuelo && sup.normal) _normalObjetivo.set(sup.normal.x, sup.normal.y, sup.normal.z)
    else _normalObjetivo.set(0, 1, 0)
    if (_normalObjetivo.lengthSq() < 1e-6) _normalObjetivo.set(0, 1, 0)
    this.normalSuave.lerp(_normalObjetivo, 1 - Math.exp(-9 * dt))
    if (this.normalSuave.lengthSq() < 1e-6) this.normalSuave.set(0, 1, 0)
    this.normalSuave.normalize()

    // Giro visual: durante el derrape apunta al lado del derrape.
    const objetivoGiro = e.derrapando
      ? clamp(e.ladoDerrape * this.intensidadDerrape * 0.85, -1, 1)
      : giro
    e.giroVisual = damp(e.giroVisual, objetivoGiro, 10, dt)

    // Balanceo y cabeceo (roll/pitch de carrocería).
    const carga = clamp01(Math.abs(this.rapidez) / this.params.velocidadMax)
    const balanceoMeta = -e.giroVisual * 0.2 * (0.35 + 0.65 * carga) - this.desliz * 0.012
    const cabeceoMeta = clamp(e.compresion * 0.14 - clamp01(this.rapidez / 40) * 0.05, -0.2, 0.2)
    e.balanceo = damp(e.balanceo, clamp(balanceoMeta, -0.32, 0.32), 8, dt)
    e.cabeceo = damp(e.cabeceo, cabeceoMeta, 6, dt)

    _qYaw.setFromAxisAngle(EJE_Y, this.yaw)
    _qAlinear.setFromUnitVectors(EJE_Y, this.normalSuave)
    _qObjetivo.multiplyQuaternions(_qAlinear, _qYaw)

    // Contraderrape: el chasis apunta hacia adentro de la curva.
    const extraYaw = -(this.anguloDerrapeActual || 0) * 0.75
    _euler.set(e.cabeceo, extraYaw, e.balanceo, 'YXZ')
    _qExtra.setFromEuler(_euler)
    _qObjetivo.multiply(_qExtra)

    // Acrobacia aérea: giro completo alrededor de un eje según el tipo.
    let lambdaQ = 12
    if (e.truco > 0) {
      const a = e.truco * TAU
      switch (e.trucoTipo) {
        case 1:
          _euler.set(0, 0, a, 'YXZ')
          break
        case 2:
          _euler.set(-a, 0, 0, 'YXZ')
          break
        case 3:
          _euler.set(0, a, 0, 'YXZ')
          break
        default:
          _euler.set(a, 0, 0, 'YXZ')
      }
      _qExtra.setFromEuler(_euler)
      _qObjetivo.multiply(_qExtra)
      lambdaQ = 22
    }

    e.quaternion.slerp(_qObjetivo, 1 - Math.exp(-lambdaQ * dt))
    e.vueltasRueda += (this.rapidez / KART.radioRueda) * dt
  }

  // -------------------------------------------------------------- API públic
  /**
   * Turbo. `fuerza` 1 = mini-turbo azul, 1.4 = rosa / hongo.
   * Además del techo más alto, da un empujón inmediato: en MK el turbo se
   * siente en el primer cuadro.
   */
  darTurbo(segundos, fuerza = 1) {
    if (!(segundos > 0)) return
    const e = this.estado
    e.turbo = Math.max(e.turbo, segundos)
    this.fuerzaTurbo = Math.max(this.fuerzaTurbo, fuerza)
    e.turboOtorgado = Math.max(e.turboOtorgado, fuerza)
    this.rapidez += 2.2 * fuerza
    e.aturdido = 0
  }

  /**
   * Castigos de ítems.
   * @param {'giro'|'aplastar'|'volcar'|'empuje'} tipo
   * @returns {boolean} false si el kart era inmune
   */
  golpear(tipo) {
    const e = this.estado
    if (e.estrella > 0 || e.invulnerable > 0) return false
    if (tipo !== 'empuje') {
      e.monedas = Math.max(0, e.monedas - 3)
      e.turbo = 0
      this.fuerzaTurbo = 0
    }
    this._cancelarDerrape()
    switch (tipo) {
      case 'giro':
        e.girando = 1.4
        this.sentidoTrompo = this.desliz >= 0 ? 1 : -1
        this.rapidez *= 0.25
        this.desliz *= 0.3
        e.sacudida = 1
        break
      case 'volcar':
        e.girando = 1.8
        e.aturdido = 1.8
        this.sentidoTrompo = this.desliz >= 0 ? -1 : 1
        this.velY = Math.max(this.velY, 9)
        this.rapidez *= 0.2
        this.desliz = 0
        e.enSuelo = false
        e.posicion.y += 0.05
        e.sacudida = 1
        break
      case 'aplastar':
        e.aplastado = 6
        this.rapidez *= 0.5
        e.sacudida = 0.8
        break
      case 'empuje':
      default:
        e.aturdido = Math.max(e.aturdido, 0.18)
        this.desliz += (this.desliz >= 0 ? 1 : -1) * 3.5
        this.rapidez *= 0.9
        e.sacudida = Math.max(e.sacudida, 0.4)
        break
    }
    e.invulnerable = Math.max(e.invulnerable, 0.35)
    return true
  }

  /** Impulso instantáneo en coordenadas de mundo (m/s). */
  aplicarImpulso(vector) {
    if (!vector) return
    this.rapidez += vector.x * this._fx + vector.z * this._fz
    this.desliz += vector.x * this._dx + vector.z * this._dz
    this.velY += vector.y || 0
    if (this.velY > 0.5) this.estado.enSuelo = false
  }

  /** Devuelve el kart al último punto válido del trazado (grúa / rescate). */
  reubicar() {
    const e = this.estado
    const punto =
      this.pista && this.pista.puntoEn ? this.pista.puntoEn(this.sSeguro, this._punto) : null
    if (punto && punto.posicion) {
      e.posicion.copy(punto.posicion)
      const tg = punto.tangente
      if (tg) this.yaw = Math.atan2(-tg.x, -tg.z)
    }
    const sup = this._muestrear(e.posicion.x, e.posicion.z)
    e.posicion.y = (sup.y || 0) + 0.05
    this.ySueloAnterior = sup.y || 0
    this.velY = 0
    this.desliz = 0
    // Penalización: se vuelve casi parado.
    this.rapidez = this.params.velocidadMax * 0.22
    this.chasis = FISICA.alturaSuspension
    this.velChasis = 0
    this.normalSuave.set(0, 1, 0)
    this._cancelarDerrape()
    e.rescatando = 0
    e.enSuelo = true
    e.saltando = false
    e.girando = 0
    e.aturdido = 0
    e.truco = 0
    e.fueraDePista = 0
    e.invulnerable = Math.max(e.invulnerable, 1.5)
    _qYaw.setFromAxisAngle(EJE_Y, this.yaw)
    e.quaternion.copy(_qYaw)
    const p = this._progresoPista(e.posicion.x, e.posicion.z)
    this.tAnterior = p.t
    return e
  }

  /** Suma monedas (tope 10). Cada moneda vale ~0.7 % de velocidad punta. */
  agregarMoneda(n = 1) {
    const e = this.estado
    e.monedas = clamp(e.monedas + n, 0, 10)
    return e.monedas
  }

  /** Invencibilidad de estrella. */
  darEstrella(segundos = 7.5) {
    const e = this.estado
    e.estrella = Math.max(e.estrella, segundos)
    e.girando = 0
    e.aturdido = 0
    e.aplastado = 0
  }
}

export default FisicaKart
