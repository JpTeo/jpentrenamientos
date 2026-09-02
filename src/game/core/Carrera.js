// Orquestador de la carrera: junta pista, física, modelos, ítems, efectos,
// audio, IA, red y cámara, y expone un estado plano para que la UI lo dibuje.
import * as THREE from 'three'
import { CARRERA, VELOCIDAD } from './constantes.js'
import { clamp01, formatearTiempo } from './utils.js'
import { CamaraCarrera, MODO } from './Camara.js'
import { controlVacio } from './Input.js'
import { cargarPista } from '../world/tracks/index.js'
import { crearCielo } from '../world/Cielo.js'
import { FisicaKart } from '../physics/KartPhysics.js'
import { crearCorredor } from '../characters/CharacterFactory.js'
import { SistemaItems } from '../items/Items.js'
import { FX } from '../fx/FX.js'
import { crearPostProceso } from '../fx/PostProceso.js'
import { crearEstudio } from '../fx/Iluminacion.js'
import { ConductorIA } from '../ai/DriverIA.js'
import { RIVALES_CPU } from '../ai/nombres.js'
import { socio } from '../characters/socios.js'
import { rng } from './utils.js'

/** Fases de la carrera. */
export const FASE = {
  CARGANDO: 'cargando',
  PRESENTACION: 'presentacion',
  CUENTA: 'cuenta',
  CORRIENDO: 'corriendo',
  META: 'meta',
  RESULTADOS: 'resultados',
}

export class Carrera {
  /**
   * @param {object} cfg
   * @param {import('./Engine.js').Engine} cfg.engine
   * @param {string} cfg.idPista
   * @param {Array} cfg.jugadores  [{ id, nombre, personaje, tipo:'local'|'remoto'|'cpu' }]
   * @param {object} cfg.opciones  { calidad, vueltas, dificultad, semilla }
   * @param {object} [cfg.red]     instancia de Red o RedLocal
   * @param {object} [cfg.audio]
   * @param {Function} [cfg.alCambiarFase]
   */
  constructor(cfg) {
    this.engine = cfg.engine
    this.idPista = cfg.idPista
    this.configJugadores = cfg.jugadores
    this.opciones = Object.assign(
      { calidad: 'alta', vueltas: CARRERA.vueltasPorDefecto, dificultad: 'normal', semilla: 20260902 },
      cfg.opciones || {},
    )
    this.red = cfg.red || null
    this.audio = cfg.audio || null
    this.alCambiarFase = cfg.alCambiarFase || (() => {})
    this.input = cfg.input || null

    this.rng = rng(this.opciones.semilla)
    this.fase = FASE.CARGANDO
    this.tiempoFase = 0
    this.tiempoCarrera = 0
    this.cuenta = CARRERA.cuentaAtras

    /** @type {Map<string, Corredor>} */
    this.corredores = new Map()
    this.orden = []
    this.avisos = []
    this.idLocal = (cfg.jugadores.find((j) => j.tipo === 'local') || cfg.jugadores[0]).id

    this.pista = null
    this.cielo = null
    this.fx = null
    this.items = null
    this.camara = null
    this.listo = false
    this._controlVacio = controlVacio()
  }

  // -------------------------------------------------------------------------
  // Carga
  // -------------------------------------------------------------------------

  async cargar(alProgreso = () => {}) {
    const escena = this.engine.escena
    alProgreso(0.05, 'Preparando el circuito…')

    this.pista = await cargarPista(this.idPista, {
      escena,
      calidad: this.opciones.calidad,
      semilla: this.opciones.semilla,
    })
    escena.add(this.pista.grupo)
    alProgreso(0.4, 'Levantando el cielo…')

    this.cielo = crearCielo(escena, this.pista.tema || {}, { calidad: this.opciones.calidad })
    this.estudio = crearEstudio(escena, this.pista.tema || {})
    alProgreso(0.55, 'Encendiendo los motores…')

    this.fx = new FX(this.engine, { calidad: this.opciones.calidad })
    this.engine.post = crearPostProceso(this.engine, { calidad: this.opciones.calidad })
    alProgreso(0.7, 'Armando la parrilla…')

    this._crearCorredores()
    alProgreso(0.88, 'Repartiendo cajas de ítems…')

    this.items = new SistemaItems({
      escena,
      pista: this.pista,
      corredores: this.corredores,
      fx: this.fx,
      audio: this.audio,
      esAnfitrion: !this.red || this.red.esAnfitrion !== false,
      rng: rng(this.opciones.semilla + 7),
    })
    this.items.alImpacto = (id, tipo, origen) => this._alImpacto(id, tipo, origen)
    this.items.alRecogerCaja = (id) => this._aviso(id, 'caja')

    this.camara = new CamaraCarrera(this.engine.camara, this.pista)
    const local = this.corredores.get(this.idLocal)
    if (local) this.camara.seguir(local)

    this.engine.registrar(this, 0)
    this.listo = true
    alProgreso(1, '¡Listo!')
    this._cambiarFase(FASE.PRESENTACION)
    this.camara.iniciarPresentacion(this.opciones.presentacion === false ? 0.01 : 5.5)
    return this
  }

  _crearCorredores() {
    const puestos = this.pista.puestosSalida
    const lista = this._parrillaCompleta()
    lista.forEach((j, i) => {
      const p = puestos[Math.min(i, puestos.length - 1)]
      const fisica = new FisicaKart(this.pista, {
        id: j.id,
        personaje: j.personaje,
        vueltas: this.opciones.vueltas,
      })
      fisica.colocarEn(p.posicion, p.rotacionY)
      const modelo = crearCorredor(j.personaje, { calidad: this.opciones.calidad })
      modelo.grupo.position.copy(p.posicion)
      this.engine.escena.add(modelo.grupo)

      const corredor = {
        id: j.id,
        nombre: j.nombre,
        personaje: j.personaje,
        tipo: j.tipo,
        esLocal: j.tipo === 'local',
        fisica,
        estado: fisica.estado,
        modelo,
        control: controlVacio(),
        ia:
          j.tipo === 'cpu'
            ? new ConductorIA(this.pista, {
                personalidad: j.personalidad || 'prolijo',
                dificultad: this.opciones.dificultad,
                rng: rng(this.opciones.semilla + i * 31),
              })
            : null,
        colorUI: `#${socio(j.personaje).colores.principal.toString(16).padStart(6, '0')}`,
        puestoSalida: i + 1,
      }
      corredor.estado.puesto = i + 1
      this.corredores.set(j.id, corredor)
    })
    this.orden = [...this.corredores.values()]
  }

  /** Completa la parrilla con rivales CPU hasta `CARRERA.corredores`. */
  _parrillaCompleta() {
    const lista = this.configJugadores.slice(0, CARRERA.corredores)
    const usados = new Set(lista.map((j) => j.personaje))
    let i = 0
    while (lista.length < CARRERA.corredores && i < RIVALES_CPU.length) {
      const r = RIVALES_CPU[i++]
      lista.push({
        id: `cpu_${r.id}`,
        nombre: r.nombre,
        personaje: r.personaje,
        personalidad: r.personalidad,
        tipo: 'cpu',
      })
      usados.add(r.personaje)
    }
    return lista
  }

  // -------------------------------------------------------------------------
  // Bucle
  // -------------------------------------------------------------------------

  fixedUpdate(dt) {
    if (!this.listo) return
    this.tiempoFase += dt

    if (this.fase === FASE.PRESENTACION) {
      if (this.camara.modo !== MODO.PRESENTACION) this._cambiarFase(FASE.CUENTA)
      return
    }

    if (this.fase === FASE.CUENTA) {
      const antes = Math.ceil(this.cuenta)
      this.cuenta -= dt
      const ahora = Math.ceil(this.cuenta)
      if (ahora !== antes && ahora >= 0 && this.audio) {
        this.audio.sonido(ahora === 0 ? 'largada' : 'cuenta')
      }
      // Turbo de largada: acelerar en el momento justo da un empujón.
      this._leerControles(dt, true)
      if (this.cuenta <= 0) {
        this._largar()
        this._cambiarFase(FASE.CORRIENDO)
      }
      return
    }

    if (this.fase === FASE.CORRIENDO || this.fase === FASE.META) {
      this.tiempoCarrera += dt
      this._leerControles(dt, false)
      this._pasoFisica(dt)
      this.items.actualizar(dt, this.tiempoCarrera)
      this._ordenar()
      this._revisarFinal()
    }
  }

  _leerControles(dt, soloAcelerador) {
    for (const c of this.corredores.values()) {
      if (c.esLocal) {
        const leido = this.input ? this.input.leer(dt) : this._controlVacio
        Object.assign(c.control, leido)
      } else if (c.ia) {
        const ctrl = c.ia.pensar(dt, c.estado, {
          karts: this.orden.map((o) => o.estado),
          items: this.items,
          fase: this.fase,
        })
        Object.assign(c.control, ctrl)
      } else if (c.controlRemoto) {
        Object.assign(c.control, c.controlRemoto)
      }
      if (soloAcelerador) {
        // Durante la cuenta atrás sólo se registra el acelerador (para el
        // turbo de largada): nada de moverse antes de tiempo.
        c.control.giro = 0
        c.control.frenar = 0
        c.acumuladorLargada = (c.acumuladorLargada || 0) + (c.control.acelerar > 0.5 ? dt : -dt * 2)
        c.acumuladorLargada = Math.max(0, c.acumuladorLargada)
      }
    }
  }

  /** Aplica el turbo de largada según cuánto tiempo se aceleró antes del "¡YA!". */
  _largar() {
    for (const c of this.corredores.values()) {
      const t = c.acumuladorLargada || 0
      // Ventana perfecta: haber empezado a acelerar entre 0,3 y 0,9 s antes.
      if (t > 0.28 && t < 0.95) {
        c.fisica.darTurbo(1.4, 1.25)
        this.fx.destello(0xffffff, 0.12)
        if (c.esLocal) this._aviso(c.id, 'turboLargada')
      } else if (t >= 1.35) {
        // Acelerar demasiado pronto recalienta el motor: arranque penalizado.
        c.fisica.golpear('empuje')
        c.estado.aturdido = Math.max(c.estado.aturdido, 0.9)
      }
      c.acumuladorLargada = 0
    }
    if (this.audio) this.audio.musica('carrera')
  }

  _pasoFisica(dt) {
    const mundo = { karts: this.orden.map((o) => o.estado) }
    for (const c of this.corredores.values()) {
      if (c.tipo === 'remoto' && !c.esLocal) continue // los remotos vienen interpolados
      const vueltaAntes = c.estado.vuelta
      c.fisica.step(dt, c.control, mundo)
      if (c.estado.vuelta !== vueltaAntes) this._alCompletarVuelta(c)

      if (c.control.item && this.items) {
        this.items.usar(c.id, null, c.control.frenar > 0.5)
      }
    }
  }

  _alCompletarVuelta(c) {
    if (c.esLocal && this.audio) {
      const ultima = c.estado.vuelta === this.opciones.vueltas
      this.audio.sonido(ultima ? 'ultimaVuelta' : 'vuelta')
      this._aviso(c.id, ultima ? 'ultimaVuelta' : 'vuelta')
      if (ultima && this.audio.acelerarMusica) this.audio.acelerarMusica(1.12)
    }
  }

  /** Ordena la parrilla por vuelta y progreso; los que llegaron mandan por tiempo. */
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
        if (c.esLocal) this._aviso(c.id, nuevo < c.estado.puesto ? 'adelantaste' : 'tePasaron')
        c.estado.puesto = nuevo
      }
    }
  }

  _revisarFinal() {
    for (const c of this.corredores.values()) {
      if (!c.estado.terminado && c.estado.vuelta > this.opciones.vueltas) {
        c.estado.terminado = true
        c.estado.tiempoTotal = this.tiempoCarrera * 1000
        if (c.esLocal) {
          this._cambiarFase(FASE.META)
          if (this.audio) this.audio.sonido('meta')
          this.camara.iniciarPodio()
        }
      }
    }
    if (this.fase === FASE.META && this.tiempoFase > 4.5) {
      this._cambiarFase(FASE.RESULTADOS)
      if (this.audio) this.audio.musica('final')
    }
  }

  update(dt) {
    if (!this.listo) return
    const local = this.corredores.get(this.idLocal)

    // Modelos
    for (const c of this.corredores.values()) {
      const e = c.estado
      c.modelo.grupo.position.copy(e.posicion)
      c.modelo.grupo.quaternion.copy(e.quaternion)
      c.modelo.actualizar(dt, {
        giro: e.giroVisual,
        rapidez: e.rapidez,
        rapidezNorm: clamp01(Math.abs(e.rapidez) / VELOCIDAD.base),
        derrapando: e.derrapando,
        nivelDerrape: e.nivelDerrape,
        turbo: e.turbo,
        enSuelo: e.enSuelo,
        aturdido: e.aturdido,
        girando: e.girando,
        aplastado: e.aplastado,
        estrella: e.estrella,
        vueltasRueda: e.vueltasRueda,
        puesto: e.puesto,
        terminado: e.terminado,
        festejo: e.terminado && e.puesto <= 3,
        dt,
      })
      this._efectosDe(c, dt)
    }

    if (this.cielo && this.cielo.actualizar) {
      this.cielo.actualizar(dt, this.engine.tiempo, local ? local.estado.posicion : null)
    }
    this.pista.actualizar(dt, this.engine.tiempo, this.engine.camara)
    this.fx.actualizar(dt, this.engine.tiempo)

    // Cámara: la sacudida la calcula FX, la cámara sólo la suma.
    if (this.fx.desplazamientoCamara) this.camara.sacudidaPos.copy(this.fx.desplazamientoCamara)
    if (this.fx.rotacionCamara) this.camara.sacudidaRot.copy(this.fx.rotacionCamara)
    this.camara.actualizar(dt, local ? local.control : null)

    // Post-proceso reactivo a la velocidad del jugador.
    if (this.engine.post && this.engine.post.establecerVelocidad && local) {
      const e = local.estado
      const v = clamp01((Math.abs(e.rapidez) - VELOCIDAD.base * 0.55) / (VELOCIDAD.turbo * 0.6))
      this.engine.post.establecerVelocidad(e.turbo > 0 ? Math.max(v, 0.55) : v * 0.65)
    }

    // Audio de motores.
    if (this.audio) {
      for (const c of this.corredores.values()) {
        this.audio.motor(c.id, {
          rpm: Math.abs(c.estado.rapidez) / VELOCIDAD.base,
          carga: c.control.acelerar,
          activo: this.fase === FASE.CORRIENDO || this.fase === FASE.META,
          posicion: c.esLocal ? null : c.estado.posicion,
        })
      }
      if (this.audio.escucha) this.audio.escucha(this.engine.camara)
    }
  }

  _efectosDe(c, dt) {
    const e = c.estado
    if (e.derrapando && e.nivelDerrape > 0 && e.enSuelo) {
      this.fx.chispasDerrape(e.posicion, e.velocidad, e.nivelDerrape)
    }
    if (e.enSuelo && Math.abs(e.rapidez) > 4) {
      const fuera = e.superficie !== 'asfalto' && e.superficie !== 'bordillo' && e.superficie !== 'turbo'
      if (fuera) this.fx.polvo(e.posicion, e.superficie, clamp01(Math.abs(e.rapidez) / VELOCIDAD.base))
    }
    this.fx.estela(c.id, e.turbo > 0 || e.estrella > 0, e.estrella > 0 ? 0xffffff : undefined)
    if (e.estrella > 0 && this.fx.arcoiris) this.fx.arcoiris(c.id, e.estrella)
    void dt
  }

  _alImpacto(id, tipo, origen) {
    const c = this.corredores.get(id)
    if (!c) return
    c.fisica.golpear(tipo)
    this.fx.impacto(c.estado.posicion, 0xffffff)
    if (c.esLocal) {
      this.fx.sacudirCamara(0.55, 0.35)
      this._aviso(id, 'golpe')
    }
    if (this.audio) this.audio.sonido('choque', { posicion: c.estado.posicion })
    void origen
  }

  _aviso(id, tipo) {
    if (id !== this.idLocal) return
    this.avisos.push({ tipo, t: this.engine.tiempo })
    if (this.avisos.length > 6) this.avisos.shift()
  }

  _cambiarFase(f) {
    this.fase = f
    this.tiempoFase = 0
    this.alCambiarFase(f, this)
  }

  // -------------------------------------------------------------------------
  // Estado para la interfaz
  // -------------------------------------------------------------------------

  estadoHUD() {
    const local = this.corredores.get(this.idLocal)
    if (!local) return null
    const e = local.estado
    return {
      fase: this.fase,
      cuenta: Math.max(0, Math.ceil(this.cuenta)),
      cuentaExacta: Math.max(0, this.cuenta),
      puesto: e.puesto,
      totalCorredores: this.orden.length,
      vuelta: Math.min(e.vuelta, this.opciones.vueltas),
      vueltas: this.opciones.vueltas,
      ultimaVuelta: e.vuelta === this.opciones.vueltas,
      velocidad: Math.round(Math.abs(e.rapidez) * 3.6),
      turbo: e.turbo > 0,
      estrella: e.estrella > 0,
      monedas: e.monedas,
      item: this.items ? this.items.itemDe(this.idLocal) : null,
      ruleta: this.items ? this.items.estadoRuleta(this.idLocal) : null,
      tiempoTotal: this.tiempoCarrera * 1000,
      tiempoVuelta: (this.tiempoCarrera - (e.tiempos.reduce((a, b) => a + b, 0) / 1000)) * 1000,
      tiempos: e.tiempos,
      mejorVuelta: e.tiempos.length ? Math.min(...e.tiempos) : 0,
      textoTiempo: formatearTiempo(this.tiempoCarrera * 1000),
      sentidoContrario: !!e.marchaAtras,
      avisos: this.avisos,
      tabla: this.orden.map((c) => ({
        id: c.id,
        nombre: c.nombre,
        personaje: c.personaje,
        puesto: c.estado.puesto,
        vuelta: Math.min(c.estado.vuelta, this.opciones.vueltas),
        color: c.colorUI,
        esJugador: c.esLocal,
        terminado: c.estado.terminado,
        tiempo: c.estado.tiempoTotal,
      })),
      minimapa: this.orden.map((c) => ({
        id: c.id,
        t: c.estado.progreso.t,
        color: c.colorUI,
        esJugador: c.esLocal,
      })),
      pista: { id: this.pista.id, nombre: this.pista.nombre },
      fps: Math.round(this.engine.fps),
    }
  }

  /** Trazado normalizado para el minimapa de la UI. */
  trazadoMinimapa(muestras = 120) {
    const pts = []
    const L = this.pista.longitud
    const tmp = {}
    for (let i = 0; i < muestras; i++) {
      const p = this.pista.puntoEn((i / muestras) * L, tmp)
      pts.push({ x: p.posicion.x, z: p.posicion.z })
    }
    const xs = pts.map((p) => p.x)
    const zs = pts.map((p) => p.z)
    const minX = Math.min(...xs)
    const maxX = Math.max(...xs)
    const minZ = Math.min(...zs)
    const maxZ = Math.max(...zs)
    const esc = Math.max(maxX - minX, maxZ - minZ) || 1
    return pts.map((p) => ({
      x: (p.x - minX) / esc,
      z: (p.z - minZ) / esc,
    }))
  }

  destruir() {
    this.engine.quitar(this)
    for (const c of this.corredores.values()) {
      if (c.modelo && c.modelo.destruir) c.modelo.destruir()
      if (c.modelo) this.engine.escena.remove(c.modelo.grupo)
    }
    this.corredores.clear()
    if (this.items) this.items.destruir()
    if (this.fx) this.fx.destruir()
    if (this.pista) {
      this.engine.escena.remove(this.pista.grupo)
      this.pista.destruir()
    }
    if (this.cielo && this.cielo.destruir) this.cielo.destruir()
  }
}

export const VECTOR_CERO = new THREE.Vector3()
export default Carrera
