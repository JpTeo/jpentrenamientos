// Orquestador del MVP: arma la escena, la parrilla y el estado de la carrera,
// y expone un resumen plano para que la interfaz lo dibuje.
import * as THREE from 'three'
import { Engine, PASO_FIJO_S } from '../core/Engine.js'
import { CamaraCarrera, MODO } from '../core/Camara.js'
import { Input, controlVacio } from '../core/Input.js'
import { CARRERA, VELOCIDAD } from '../core/constantes.js'
import { clamp01, formatearTiempo, rng } from '../core/utils.js'
import { FisicaKart } from '../physics/KartPhysics.js'
import { socio, SOCIOS } from '../characters/socios.js'
import { texturaCielo } from '../assets/texturas.js'
import { PALETA } from '../assets/paleta.js'
import { crearPista, META_PISTA } from './pista.js'
import { crearCorredor } from './karts3d.js'
import { ConductorIA } from './ia.js'

export const FASE = {
  CUENTA: 'cuenta',
  CORRIENDO: 'corriendo',
  FIN: 'fin',
}

/** Personalidad de cada socio cuando lo maneja la máquina. */
const PERSONALIDAD = { jp: 'agresivo', male: 'prolijo', keke: 'tramposo', mati: 'prolijo' }

export class Carrera {
  /**
   * @param {HTMLElement} contenedor
   * @param {object} cfg { personaje, vueltas, dificultad, sinEntrada }
   */
  constructor(contenedor, cfg = {}) {
    this.cfg = Object.assign(
      { personaje: 'jp', vueltas: META_PISTA.vueltas, dificultad: 'normal', semilla: 20260902 },
      cfg,
    )
    this.engine = new Engine(contenedor, { maxPixelRatio: 1.5, fov: 62 })
    this.input = cfg.sinEntrada ? null : new Input(window)
    this.rng = rng(this.cfg.semilla)

    this.fase = FASE.CUENTA
    this.cuenta = CARRERA.cuentaAtras
    this.tiempo = 0
    this.avisos = []
    this.corredores = []
    this.porId = new Map()

    this._armarEscena()
    this._armarParrilla()

    this.camara = new CamaraCarrera(this.engine.camara, this.pista)
    this.camara.seguir(this.jugador)
    this.camara.encajar()
    this.camara.modo = MODO.PERSECUCION

    this.trazado = this.pista.trazado(90)
    this.engine.registrar(this)
    this.engine.iniciar()

    // Gancho de desarrollo: permite inspeccionar la carrera desde la consola
    // del navegador y desde el arnés de capturas.
    if (import.meta.env && import.meta.env.DEV) window.__teokart = this
  }

  // -------------------------------------------------------------------------
  // Montaje
  // -------------------------------------------------------------------------

  _armarEscena() {
    const escena = this.engine.escena
    escena.fog = new THREE.Fog(PALETA.niebla, 220, 850)

    // Cielo: una esfera invertida con un degradado pintado a mano.
    const cielo = new THREE.Mesh(
      new THREE.SphereGeometry(1400, 24, 16),
      new THREE.MeshBasicMaterial({
        map: texturaCielo(PALETA.cieloCenit, PALETA.cieloDia, PALETA.cieloHorizonte),
        side: THREE.BackSide,
        fog: false,
      }),
    )
    escena.add(cielo)

    // Luz: una direccional que hace de sol, más relleno de cielo y suelo.
    const sol = new THREE.DirectionalLight(0xfff3d6, 2.4)
    sol.position.set(150, 220, 90)
    sol.castShadow = true
    sol.shadow.mapSize.set(1024, 1024)
    const c = sol.shadow.camera
    c.left = -90
    c.right = 90
    c.top = 90
    c.bottom = -90
    c.near = 40
    c.far = 520
    escena.add(sol)
    escena.add(sol.target)
    this.sol = sol
    escena.add(new THREE.HemisphereLight(0xbfe6ff, 0x4a7a35, 1.35))

    this.pista = crearPista({ semilla: this.cfg.semilla })
    escena.add(this.pista.grupo)
  }

  _armarParrilla() {
    // El jugador arranca último: así la carrera tiene sentido desde el vamos.
    const rivales = SOCIOS.map((s) => s.id).filter((id) => id !== this.cfg.personaje)
    const orden = [...rivales, this.cfg.personaje]

    orden.forEach((id, i) => {
      const p = this.pista.puestosSalida[i]
      const s = socio(id)
      const fisica = new FisicaKart(this.pista, { id, personaje: id })
      fisica.colocarEn(p.posicion, p.rotacionY)
      const modelo = crearCorredor(id)
      this.engine.escena.add(modelo.grupo)

      const esJugador = id === this.cfg.personaje
      const c = {
        id,
        nombre: s.nombre,
        nombreCompleto: s.nombreCompleto,
        color: `#${s.colores.principal.toString(16).padStart(6, '0')}`,
        esJugador,
        fisica,
        estado: fisica.estado,
        modelo,
        control: controlVacio(),
        ia: esJugador
          ? null
          : new ConductorIA(this.pista, {
              personalidad: PERSONALIDAD[id],
              dificultad: this.cfg.dificultad,
              rng: rng(this.cfg.semilla + i * 977),
            }),
      }
      c.estado.puesto = i + 1
      this.corredores.push(c)
      this.porId.set(id, c)
      if (esJugador) this.jugador = c
    })
    this.orden = [...this.corredores]
  }

  // -------------------------------------------------------------------------
  // Bucle
  // -------------------------------------------------------------------------

  fixedUpdate(dt) {
    if (this.fase === FASE.CUENTA) {
      const antes = Math.ceil(this.cuenta)
      this.cuenta -= dt
      if (Math.ceil(this.cuenta) !== antes) this._aviso('cuenta')
      // Sólo se registra el acelerador: quien lo pise en el momento justo se
      // lleva el turbo de largada.
      for (const c of this.corredores) {
        const acel = c.esJugador
          ? this.input
            ? this.input.leer(dt).acelerar
            : 0
          : this.rng() < 0.02
            ? 1
            : c._acelIA || 0
        c._acelIA = acel
        c._cargaLargada = Math.max(0, (c._cargaLargada || 0) + (acel > 0.5 ? dt : -dt * 2))
      }
      if (this.cuenta <= 0) this._largar()
      return
    }

    this.tiempo += dt
    const mundo = { karts: this.corredores.map((c) => c.estado) }

    for (const c of this.corredores) {
      if (c.esJugador) {
        const leido = this.input ? this.input.leer(dt) : this.controlExterno || controlVacio()
        Object.assign(c.control, leido)
        if (c.estado.terminado) {
          c.control.acelerar = 0.6
          c.control.giro = 0
          c.control.derrape = false
        }
      } else {
        Object.assign(c.control, c.ia.pensar(dt, c.estado))
      }
      const vueltaAntes = c.estado.vuelta
      c.fisica.step(dt, c.control, mundo)
      if (c.esJugador && c.estado.vuelta !== vueltaAntes) {
        this._aviso(c.estado.vuelta === this.cfg.vueltas ? 'ultimaVuelta' : 'vuelta')
      }
      if (c.estado.vuelta > this.cfg.vueltas && !c.estado.terminado) {
        c.estado.terminado = true
        c.estado.tiempoTotal = this.tiempo * 1000
        if (c.esJugador) {
          this.fase = FASE.FIN
          this.tiempoFin = 0
          this.camara.iniciarPodio()
        }
      }
    }

    this._ordenar()
    if (this.fase === FASE.FIN) this.tiempoFin = (this.tiempoFin || 0) + dt
  }

  _largar() {
    this.fase = FASE.CORRIENDO
    this.cuenta = 0
    for (const c of this.corredores) {
      const t = c._cargaLargada || 0
      // Ventana buena: haber empezado a acelerar poco antes del "¡YA!".
      if (t > 0.25 && t < 0.95) {
        c.fisica.darTurbo(1.3, 1.2)
        if (c.esJugador) this._aviso('turboLargada')
      } else if (t >= 1.4) {
        // Acelerar demasiado pronto ahoga el motor.
        c.estado.aturdido = Math.max(c.estado.aturdido, 0.8)
        if (c.esJugador) this._aviso('largadaQuemada')
      }
      c._cargaLargada = 0
    }
  }

  _ordenar() {
    this.orden.sort((a, b) => {
      const ea = a.estado
      const eb = b.estado
      if (ea.terminado !== eb.terminado) return ea.terminado ? -1 : 1
      if (ea.terminado && eb.terminado) return ea.tiempoTotal - eb.tiempoTotal
      if (ea.vuelta !== eb.vuelta) return eb.vuelta - ea.vuelta
      return eb.progreso.s - ea.progreso.s
    })
    for (let i = 0; i < this.orden.length; i++) {
      const c = this.orden[i]
      const nuevo = i + 1
      if (c.estado.puesto !== nuevo) {
        if (c.esJugador && this.fase === FASE.CORRIENDO) {
          this._aviso(nuevo < c.estado.puesto ? 'adelantaste' : 'tePasaron')
        }
        c.estado.puesto = nuevo
      }
    }
  }

  update(dt) {
    for (const c of this.corredores) {
      const e = c.estado
      c.modelo.grupo.position.copy(e.posicion)
      c.modelo.grupo.quaternion.copy(e.quaternion)
      c.modelo.actualizar(dt, {
        giro: e.giroVisual,
        rapidez: e.rapidez,
        rapidezNorm: clamp01(Math.abs(e.rapidez) / VELOCIDAD.base),
        derrapando: e.derrapando,
        ladoDerrape: e.ladoDerrape,
        nivelDerrape: e.nivelDerrape,
        turbo: e.turbo,
        girando: e.girando,
        aplastado: e.aplastado,
        vueltasRueda: e.vueltasRueda,
        aceleracion: c.control.acelerar,
        frenado: c.control.frenar,
        alturaSuelo: e.posicion.y,
      })
    }

    // La sombra del sol acompaña al jugador para no gastar mapa de sombras.
    const p = this.jugador.estado.posicion
    this.sol.position.set(p.x + 120, p.y + 180, p.z + 70)
    this.sol.target.position.copy(p)
    this.sol.target.updateMatrixWorld()

    this.camara.actualizar(dt, this.jugador.control)
  }

  // -------------------------------------------------------------------------
  // Estado para la interfaz
  // -------------------------------------------------------------------------

  _aviso(tipo) {
    this.avisos.push({ tipo, t: this.tiempo, id: this.avisos.length })
    if (this.avisos.length > 5) this.avisos.shift()
  }

  estadoHUD() {
    const e = this.jugador.estado
    const acumulado = e.tiempos.reduce((a, b) => a + b, 0)
    return {
      fase: this.fase,
      cuenta: Math.max(0, Math.ceil(this.cuenta)),
      puesto: e.puesto,
      total: this.corredores.length,
      vuelta: Math.min(e.vuelta, this.cfg.vueltas),
      vueltas: this.cfg.vueltas,
      ultimaVuelta: e.vuelta === this.cfg.vueltas,
      velocidad: Math.round(Math.abs(e.rapidez) * 3.6),
      turbo: e.turbo > 0,
      derrape: e.nivelDerrape,
      terminado: e.terminado,
      sentidoContrario: !!e.marchaAtras,
      tiempoTotal: this.tiempo * 1000,
      textoTotal: formatearTiempo(this.tiempo * 1000),
      textoVuelta: formatearTiempo(this.tiempo * 1000 - acumulado),
      mejorVuelta: e.tiempos.length ? formatearTiempo(Math.min(...e.tiempos)) : '--:--.---',
      tiempos: e.tiempos,
      avisos: this.avisos,
      tabla: this.orden.map((c) => ({
        id: c.id,
        nombre: c.nombre,
        color: c.color,
        puesto: c.estado.puesto,
        esJugador: c.esJugador,
        terminado: c.estado.terminado,
        tiempo: c.estado.terminado ? formatearTiempo(c.estado.tiempoTotal) : null,
      })),
      minimapa: this.orden.map((c) => ({
        id: c.id,
        t: c.estado.progreso.t,
        color: c.color,
        esJugador: c.esJugador,
      })),
      trazado: this.trazado,
      pista: META_PISTA.nombre,
      fps: Math.round(this.engine.fps),
    }
  }

  pausar(v) {
    this.engine.pausado = v
  }

  destruir() {
    if (this.input) this.input.destruir()
    for (const c of this.corredores) c.modelo.destruir()
    this.pista.destruir()
    this.engine.destruir()
  }
}

export const PASO = PASO_FIJO_S
export default Carrera
