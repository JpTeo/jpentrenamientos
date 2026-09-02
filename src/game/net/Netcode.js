// Netcode de Teo Kart — CONTRATOS.md §7.
//
// Topología: MALLA COMPLETA. Con 4 socios son 6 conexiones WebRTC (n·(n-1)/2).
// Cada par habla directo con cada par: nadie reenvía paquetes ajenos, así que
// la latencia entre dos jugadores es su RTT real y no la suma de dos saltos.
//
// Por cada par se abren DOS RTCDataChannel "negociados" (los dos lados los
// crean con el mismo id, sin esperar `ondatachannel`):
//
//   id 0  "estado"   ordered:false, maxRetransmits:0   -> binario, ~20 Hz
//   id 1  "eventos"  ordered:true,  fiable             -> binario + JSON de control
//
// AUTORIDAD: el anfitrión manda. Él sortea los ítems, dictamina los impactos,
// fija el orden de llegada y el instante de largada. Los demás mandan su
// propio estado (nadie puede mover el kart de otro) y aplican lo que dicta.
//
// MIGRACIÓN DE AUTORIDAD: si se cae el anfitrión, el nuevo anfitrión es el
// jugador conectado con el **id más bajo en orden lexicográfico** (los uid de
// Firebase son cadenas). Todos los pares calculan lo mismo sin negociar nada,
// así que no hace falta una elección: es determinista.
//
// Todos los imports de Firebase son perezosos (viven dentro de Senalizacion),
// por eso este módulo se puede importar en Node sin entorno.

import {
  VERSION_PROTOCOLO,
  empaquetarLote,
  desempaquetarLote,
  empaquetarEvento,
  desempaquetarEvento,
  saludo,
  verificarSaludo,
} from './protocolo.js'
import { Senalizacion, SERVIDORES_HIELO, hayRed, normalizarCodigo } from './Senalizacion.js'

/** Frecuencia de envío del estado propio, en Hz. */
export const HZ_ESTADO = 20

/** Cada cuánto se mide el ping, en ms. */
export const INTERVALO_PING = 2000

/** Sin noticias de un par por este tiempo, lo damos por caído (ms). */
export const TIEMPO_CAIDA = 6000

/** Nombres de evento que emite `Red.on()`. */
export const EVENTOS_RED = [
  'jugadores', // cambió la lista de jugadores del lobby
  'estado', // llegó el estado de un kart remoto
  'evento', // llegó un evento fiable de juego
  'comenzar', // arranca la carrera (con tArranque en tiempo de red)
  'error', // algo falló
  'salir', // un par se desconectó: su kart lo toma la IA
  'entrar', // un par terminó de conectarse
  'autoridad', // cambió el anfitrión (migración)
]

const DOS32 = 4294967296

/** Sello de red comprimido a uint32 (módulo 2^32). */
function comprimirSello(t) {
  return t >>> 0
}

/** Reconstruye el sello completo eligiendo el ciclo más cercano a `referencia`. */
function expandirSello(sello, referencia) {
  const base = Math.floor(referencia / DOS32) * DOS32
  let mejor = base + sello
  const opciones = [mejor - DOS32, mejor, mejor + DOS32]
  let dist = Infinity
  for (const o of opciones) {
    const d = Math.abs(o - referencia)
    if (d < dist) {
      dist = d
      mejor = o
    }
  }
  return mejor
}

// ---------------------------------------------------------------------------
// Emisor de eventos minimalista (no queremos dependencias)
// ---------------------------------------------------------------------------

class Emisor {
  constructor() {
    this._oyentes = new Map()
  }

  /** Suscribe. Devuelve la función para darse de baja. */
  on(evento, cb) {
    if (!this._oyentes.has(evento)) this._oyentes.set(evento, new Set())
    this._oyentes.get(evento).add(cb)
    return () => this.off(evento, cb)
  }

  off(evento, cb) {
    const s = this._oyentes.get(evento)
    if (s) s.delete(cb)
  }

  _emitir(evento, ...args) {
    const s = this._oyentes.get(evento)
    if (!s) return
    for (const cb of s) {
      try {
        cb(...args)
      } catch (e) {
        if (evento !== 'error') this._emitir('error', e)
        else console.error('[red]', e)
      }
    }
  }
}

// ---------------------------------------------------------------------------
// class Red — partida en línea por WebRTC + Firestore
// ---------------------------------------------------------------------------

export class Red extends Emisor {
  /**
   * @param {object} cfg
   * @param {object} [cfg.db]      Firestore ya inicializado (opcional: si no,
   *                               se carga perezosamente `src/firebase/config.js`)
   * @param {object} [cfg.auth]    Auth de Firebase (idem)
   * @param {string} [cfg.id]      forzar un id (sólo para tests)
   * @param {string} [cfg.nombre]  nombre visible del jugador
   */
  constructor({ db = null, auth = null, id = null, nombre = 'Socio' } = {}) {
    super()
    this.modo = 'red'
    this.id = id
    this.nombre = nombre
    this.esAnfitrion = false
    this.codigo = null
    this.pista = null
    this.estadoSala = 'lobby' // 'lobby' | 'corriendo' | 'terminada'
    /** @type {Array<{id,nombre,personaje,listo,ping,esAnfitrion}>} */
    this.jugadores = []

    this.senal = new Senalizacion({ db, auth, version: VERSION_PROTOCOLO })
    /** @type {Map<string, object>} pares de la malla */
    this.pares = new Map()

    this.personaje = null
    this.listo = false
    this.tArranque = 0

    /** Orden de la parrilla: ranura -> id (incluye a los karts de la IA). */
    this.parrilla = []
    this._ranuraPorId = new Map()

    this.offsetReloj = 0 // ms para pasar de reloj local a reloj de red
    this._estadoPendiente = null
    this._temporizadorEstado = null
    this._temporizadorPing = null
    this._temporizadorVigia = null
    this._cerrada = false
    this._datosSala = null
  }

  // -------------------------------------------------------------------------
  // Reloj de red
  // -------------------------------------------------------------------------

  /**
   * Reloj común a toda la sala, en ms. La referencia es el reloj del
   * anfitrión: cada par estima su desfase con muestras tipo NTP sobre el
   * canal fiable y se corrige. Es el tiempo con el que se sella el estado y
   * con el que interpola `Interpolacion`.
   */
  ahora() {
    return Date.now() + this.offsetReloj
  }

  /** Ping medido contra un par (ms). Sin argumento, el promedio de la malla. */
  ping(id) {
    if (id) {
      const p = this.pares.get(id)
      return p ? Math.round(p.ping) : 0
    }
    let suma = 0
    let n = 0
    for (const p of this.pares.values()) {
      if (p.ping > 0) {
        suma += p.ping
        n++
      }
    }
    return n ? Math.round(suma / n) : 0
  }

  // -------------------------------------------------------------------------
  // Parrilla / ranuras
  // -------------------------------------------------------------------------

  /**
   * Fija el orden de la parrilla (ranura -> id). Lo llama la carrera con la
   * lista completa (humanos + CPU) para que las ranuras del protocolo binario
   * signifiquen lo mismo en todas las máquinas. Si sos el anfitrión, se
   * reparte al resto por el canal fiable.
   */
  definirParrilla(ids, difundir = true) {
    this.parrilla = [...ids]
    this._ranuraPorId = new Map(this.parrilla.map((v, i) => [v, i]))
    if (difundir && this.esAnfitrion) {
      this._enviarControl({ c: 'parrilla', ids: this.parrilla })
    }
  }

  ranuraDe(id) {
    const r = this._ranuraPorId.get(id)
    return r === undefined ? 255 : r
  }

  idDeRanura(ranura) {
    return this.parrilla[ranura] ?? null
  }

  /** Ranuras por defecto: los humanos ordenados por id (todos calculan igual). */
  _ranurasPorDefecto() {
    if (this.parrilla.length) return
    this.definirParrilla(
      this.jugadores.map((j) => j.id).sort(),
      false,
    )
  }

  // -------------------------------------------------------------------------
  // Sala
  // -------------------------------------------------------------------------

  /**
   * Crea una sala nueva. Devuelve el código de 4 letras para compartir.
   * @returns {Promise<string>}
   */
  async crearSala({ nombre = this.nombre, personaje = null, pista = null } = {}) {
    this.nombre = nombre
    this.personaje = personaje
    const codigo = await this.senal.crearSala({
      jugador: { nombre, personaje, listo: false },
      pista,
    })
    this.id = this.senal.id
    this.codigo = codigo
    this.esAnfitrion = true
    this.pista = pista
    await this._arrancarSala()
    return codigo
  }

  /** Se une a una sala existente por código. */
  async unirse(codigo, { nombre = this.nombre, personaje = null } = {}) {
    this.nombre = nombre
    this.personaje = personaje
    const datos = await this.senal.unirse(normalizarCodigo(codigo), {
      nombre,
      personaje,
      listo: false,
    })
    this.id = this.senal.id
    this.codigo = this.senal.codigo
    this.esAnfitrion = this.senal.esAnfitrion
    this.pista = datos.pista || null
    await this._arrancarSala()
  }

  async _arrancarSala() {
    await this.senal.escucharSala((datos, error) => {
      if (error) {
        this._emitir('error', error)
        return
      }
      if (!datos) {
        // La sala desapareció: el anfitrión la cerró.
        this._emitir('error', new Error('La sala se cerró.'))
        return
      }
      this._alCambiarSala(datos)
    })
    await this.senal.escucharOfertas((de, descripcion) => this._alRecibirOferta(de, descripcion))
    await this.senal.escucharRespuestas((de, descripcion) => this._alRecibirRespuesta(de, descripcion))
    await this.senal.escucharCandidatos((de, candidato) => this._alRecibirCandidato(de, candidato))

    this._temporizadorPing = setInterval(() => this._medirPing(), INTERVALO_PING)
    this._temporizadorVigia = setInterval(() => this._vigilarPares(), 1000)
  }

  _alCambiarSala(datos) {
    this._datosSala = datos
    this.pista = datos.pista || null
    this.estadoSala = datos.estado || 'lobby'
    const mapa = datos.jugadores || {}
    const ids = Object.keys(mapa).sort()

    this.jugadores = ids.map((id) => {
      const j = mapa[id] || {}
      return {
        id,
        nombre: j.nombre || 'Socio',
        personaje: j.personaje || null,
        listo: !!j.listo,
        ping: this.ping(id),
        esAnfitrion: id === datos.anfitrion,
        esLocal: id === this.id,
      }
    })
    this.esAnfitrion = datos.anfitrion === this.id
    this._ranurasPorDefecto()

    // Malla: conectar con todo el que falte, soltar al que ya no está.
    for (const id of ids) {
      if (id !== this.id && !this.pares.has(id)) this._conectarCon(id)
    }
    for (const id of [...this.pares.keys()]) {
      if (!ids.includes(id)) this._cerrarPar(id, 'salió de la sala')
    }

    // ¿El anfitrión se borró de la lista? Migramos la autoridad.
    if (!ids.includes(datos.anfitrion)) this._migrarAutoridad(ids)

    this._emitir('jugadores', this.jugadores)
  }

  // -------------------------------------------------------------------------
  // Lobby
  // -------------------------------------------------------------------------

  /** Elige personaje. El control de "sin repetidos" lo hace `Lobby`. */
  elegirPersonaje(personaje) {
    this.personaje = personaje
    this.senal.actualizarJugador({ personaje }).catch((e) => this._emitir('error', e))
  }

  marcarListo(listo = true) {
    this.listo = !!listo
    this.senal.actualizarJugador({ listo: this.listo }).catch((e) => this._emitir('error', e))
  }

  /** Elige la pista. Sólo el anfitrión. */
  elegirPista(idPista) {
    if (!this.esAnfitrion) return
    this.pista = idPista
    this.senal.actualizarSala({ pista: idPista }).catch((e) => this._emitir('error', e))
  }

  /**
   * Larga la carrera. Sólo el anfitrión: fija `tArranque` en TIEMPO DE RED y
   * lo reparte por el canal fiable. Todos empiezan en el mismo instante,
   * aunque sus relojes locales estén desfasados.
   * @param {object} opciones { retardo, semilla, vueltas, corredores }
   */
  comenzar({ retardo = 1500, semilla = Date.now() & 0xffffffff, vueltas = 3, corredores = 8 } = {}) {
    if (!this.esAnfitrion) return null
    const tArranque = this.ahora() + retardo
    this.tArranque = tArranque
    this._ranurasPorDefecto()
    this.definirParrilla(this.parrilla, true)

    const datos = {
      tArranque,
      semilla: semilla >>> 0,
      vueltas,
      corredores,
      pista: this.pista || '',
    }
    this.enviarEvento({ tipo: 'arranque', datos })
    this.senal
      .actualizarSala({ estado: 'corriendo', tArranque, semilla: datos.semilla })
      .catch((e) => this._emitir('error', e))
    this.estadoSala = 'corriendo'
    this._emitir('comenzar', { ...datos, parrilla: this.parrilla })
    return tArranque
  }

  // -------------------------------------------------------------------------
  // Conexiones WebRTC
  // -------------------------------------------------------------------------

  /**
   * Regla de roles: **el id lexicográficamente menor hace la oferta**. Así los
   * dos lados saben quién ofrece sin negociar nada y no hay colisión de SDP.
   */
  _soyOfertante(otroId) {
    return this.id < otroId
  }

  _conectarCon(otroId) {
    if (this.pares.has(otroId) || otroId === this.id) return
    if (typeof RTCPeerConnection === 'undefined') {
      this._emitir('error', new Error('Este navegador no soporta WebRTC.'))
      return
    }

    const pc = new RTCPeerConnection({ iceServers: SERVIDORES_HIELO })
    const par = {
      id: otroId,
      pc,
      canalEstado: null,
      canalEventos: null,
      ofertante: this._soyOfertante(otroId),
      candidatosPendientes: [],
      remotoListo: false,
      abierto: false,
      saludado: false,
      ping: 0,
      offset: 0,
      muestras: [],
      ultimaSenal: Date.now(),
      caido: false,
    }
    this.pares.set(otroId, par)

    // Canales NEGOCIADOS: los dos lados los crean con el mismo id, así que no
    // dependemos del evento `ondatachannel` ni del orden de llegada.
    par.canalEstado = pc.createDataChannel('estado', {
      ordered: false,
      maxRetransmits: 0,
      negotiated: true,
      id: 0,
    })
    par.canalEstado.binaryType = 'arraybuffer'
    par.canalEstado.onmessage = (ev) => this._alMensajeEstado(par, ev.data)

    par.canalEventos = pc.createDataChannel('eventos', {
      ordered: true,
      negotiated: true,
      id: 1,
    })
    par.canalEventos.binaryType = 'arraybuffer'
    par.canalEventos.onmessage = (ev) => this._alMensajeEvento(par, ev.data)
    par.canalEventos.onopen = () => {
      par.abierto = true
      par.ultimaSenal = Date.now()
      this._enviarControlA(par, saludo({ id: this.id, nombre: this.nombre }))
      if (this.esAnfitrion && this.parrilla.length) {
        this._enviarControlA(par, { c: 'parrilla', ids: this.parrilla })
      }
      this._medirPingA(par)
      this._emitir('entrar', { id: otroId })
    }
    par.canalEventos.onclose = () => {
      par.abierto = false
    }

    pc.onicecandidate = (ev) => {
      if (ev.candidate) {
        this.senal.enviarCandidato(otroId, ev.candidate).catch(() => {})
      }
    }
    pc.onconnectionstatechange = () => {
      par.ultimaSenal = Date.now()
      if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
        this._cerrarPar(otroId, 'se perdió la conexión')
      }
    }

    if (par.ofertante) {
      pc.createOffer()
        .then((oferta) => pc.setLocalDescription(oferta))
        .then(() => this.senal.enviarOferta(otroId, pc.localDescription))
        .catch((e) => this._emitir('error', e))
    }
  }

  async _alRecibirOferta(de, descripcion) {
    if (de === this.id) return
    if (!this.pares.has(de)) this._conectarCon(de)
    const par = this.pares.get(de)
    if (!par || par.ofertante) return // yo ofrezco: ignoro ofertas cruzadas
    try {
      await par.pc.setRemoteDescription(descripcion)
      await this._vaciarCandidatos(par)
      const respuesta = await par.pc.createAnswer()
      await par.pc.setLocalDescription(respuesta)
      await this.senal.enviarRespuesta(de, par.pc.localDescription)
    } catch (e) {
      this._emitir('error', e)
    }
  }

  async _alRecibirRespuesta(de, descripcion) {
    const par = this.pares.get(de)
    if (!par || !par.ofertante) return
    if (par.pc.currentRemoteDescription) return
    try {
      await par.pc.setRemoteDescription(descripcion)
      await this._vaciarCandidatos(par)
    } catch (e) {
      this._emitir('error', e)
    }
  }

  async _alRecibirCandidato(de, candidato) {
    const par = this.pares.get(de)
    if (!par) return
    // Los candidatos suelen llegar antes que el SDP: se guardan en cola.
    if (!par.pc.remoteDescription) {
      par.candidatosPendientes.push(candidato)
      return
    }
    try {
      await par.pc.addIceCandidate(candidato)
    } catch {
      /* candidato tardío o inválido: se descarta */
    }
  }

  async _vaciarCandidatos(par) {
    const cola = par.candidatosPendientes
    par.candidatosPendientes = []
    for (const c of cola) {
      try {
        await par.pc.addIceCandidate(c)
      } catch {
        /* se descarta */
      }
    }
  }

  // -------------------------------------------------------------------------
  // Envío
  // -------------------------------------------------------------------------

  /**
   * Encola MI estado para enviarlo. No manda nada al instante: acumula el
   * último estado y lo despacha a `HZ_ESTADO` (20 Hz). Se puede llamar todos
   * los cuadros sin miedo.
   * @param {object} estado EstadoKart (o el parcial que haga falta)
   */
  enviarEstado(estado) {
    this._estadoPendiente = estado
    if (this._temporizadorEstado || this._cerrada) return
    this._temporizadorEstado = setInterval(() => this._despacharEstado(), 1000 / HZ_ESTADO)
  }

  _despacharEstado() {
    const estado = this._estadoPendiente
    if (!estado) return
    this._estadoPendiente = null
    const ranura = this.ranuraDe(estado.id ?? this.id)
    const paquete = empaquetarLote([
      { ...estado, ranura, sello: comprimirSello(this.ahora()) },
    ])
    for (const par of this.pares.values()) {
      const c = par.canalEstado
      if (c && c.readyState === 'open') {
        try {
          c.send(paquete)
        } catch {
          /* buffer lleno: el estado es descartable, ya vendrá el próximo */
        }
      }
    }
  }

  /**
   * Envía un evento fiable y ordenado. `{ tipo, datos }`; `de` y `t` los
   * completa la red. Tipos: 'item'|'impacto'|'caja'|'vuelta'|'fin'|'chat'|'arranque'.
   */
  enviarEvento(evento) {
    if (this._cerrada) return
    let paquete
    try {
      paquete = empaquetarEvento({
        tipo: evento.tipo,
        de: this.ranuraDe(evento.de ?? this.id),
        t: evento.t ?? this.ahora(),
        datos: this._aRanuras(evento.datos || {}),
      })
    } catch (e) {
      this._emitir('error', e)
      return
    }
    for (const par of this.pares.values()) {
      const c = par.canalEventos
      if (c && c.readyState === 'open') {
        try {
          c.send(paquete)
        } catch (e) {
          this._emitir('error', e)
        }
      }
    }
  }

  /** Traduce ids de corredor a ranuras en los campos conocidos. */
  _aRanuras(datos) {
    const salida = { ...datos }
    for (const campo of ['objetivo', 'origen', 'corredor']) {
      if (typeof salida[campo] === 'string') salida[campo] = this.ranuraDe(salida[campo])
    }
    return salida
  }

  /** Mensaje de control (JSON) a toda la malla. */
  _enviarControl(mensaje) {
    for (const par of this.pares.values()) this._enviarControlA(par, mensaje)
  }

  _enviarControlA(par, mensaje) {
    const c = par.canalEventos
    if (!c || c.readyState !== 'open') return
    try {
      c.send(JSON.stringify(mensaje))
    } catch {
      /* se ignora */
    }
  }

  // -------------------------------------------------------------------------
  // Recepción
  // -------------------------------------------------------------------------

  _alMensajeEstado(par, datos) {
    par.ultimaSenal = Date.now()
    const lote = desempaquetarLote(datos)
    if (!lote) return
    const referencia = this.ahora()
    for (const estado of lote.estados) {
      estado.sello = expandirSello(estado.sello, referencia)
      estado.id = this.idDeRanura(estado.ranura) || par.id
      // Nadie mueve el kart de otro: sólo aceptamos del par lo que es suyo.
      // (El anfitrión sí puede reenviar el estado de los karts de la IA.)
      const esSuyo = estado.id === par.id
      const esIAdelAnfitrion = this._esAnfitrion(par.id) && !this._esHumano(estado.id)
      if (!esSuyo && !esIAdelAnfitrion) continue
      this._emitir('estado', estado, par.id)
    }
  }

  _alMensajeEvento(par, datos) {
    par.ultimaSenal = Date.now()
    if (typeof datos === 'string') {
      let mensaje
      try {
        mensaje = JSON.parse(datos)
      } catch {
        return
      }
      this._alControl(par, mensaje)
      return
    }
    const evento = desempaquetarEvento(datos)
    if (!evento) return
    evento.t = evento.t || this.ahora()
    const deId = this.idDeRanura(evento.de) || par.id
    const datosTraducidos = { ...evento.datos }
    for (const campo of ['objetivo', 'origen', 'corredor']) {
      if (typeof datosTraducidos[campo] === 'number') {
        datosTraducidos[`${campo}Id`] = this.idDeRanura(datosTraducidos[campo])
      }
    }

    if (evento.tipo === 'arranque') {
      // Sólo el anfitrión puede dar la largada.
      if (!this._esAnfitrion(par.id)) return
      this.tArranque = datosTraducidos.tArranque
      this.estadoSala = 'corriendo'
      if (datosTraducidos.pista) this.pista = datosTraducidos.pista
      this._emitir('comenzar', { ...datosTraducidos, parrilla: this.parrilla })
      return
    }
    // Impactos y sorteos de caja son atribución exclusiva del anfitrión.
    if ((evento.tipo === 'impacto' || evento.tipo === 'caja') && !this._esAnfitrion(par.id)) return

    this._emitir('evento', { tipo: evento.tipo, de: deId, datos: datosTraducidos, t: evento.t })
  }

  _alControl(par, m) {
    switch (m.c || (m.hola ? 'hola' : '')) {
      case 'hola': {
        const chequeo = verificarSaludo(m)
        if (!chequeo.ok) {
          this._emitir('error', new Error(`${m.nombre || par.id}: ${chequeo.motivo}`))
          this._cerrarPar(par.id, chequeo.motivo)
          return
        }
        par.saludado = true
        // Contestamos el saludo para que el otro también nos valide.
        if (!par.contestado) {
          par.contestado = true
          this._enviarControlA(par, saludo({ id: this.id, nombre: this.nombre }))
        }
        break
      }
      case 'ping':
        this._enviarControlA(par, { c: 'pong', t: m.t, r: Date.now() })
        break
      case 'pong':
        this._alPong(par, m)
        break
      case 'parrilla':
        if (this._esAnfitrion(par.id) && Array.isArray(m.ids)) this.definirParrilla(m.ids, false)
        break
      default:
        break
    }
  }

  // -------------------------------------------------------------------------
  // Ping y sincronía de reloj (NTP simplificado)
  // -------------------------------------------------------------------------

  _medirPing() {
    for (const par of this.pares.values()) this._medirPingA(par)
    // Refrescamos el ping publicado en la lista de jugadores.
    let cambio = false
    for (const j of this.jugadores) {
      const p = this.ping(j.id)
      if (j.ping !== p) {
        j.ping = p
        cambio = true
      }
    }
    if (cambio) this._emitir('jugadores', this.jugadores)
  }

  _medirPingA(par) {
    this._enviarControlA(par, { c: 'ping', t: Date.now() })
  }

  _alPong(par, m) {
    const t3 = Date.now()
    const rtt = t3 - m.t
    if (rtt < 0 || rtt > 4000) return
    // Suponiendo camino simétrico, al instante t3 el reloj remoto marca
    // m.r + rtt/2, así que el desfase es esa diferencia.
    const offset = m.r + rtt / 2 - t3
    par.muestras.push({ rtt, offset })
    if (par.muestras.length > 8) par.muestras.shift()
    // El ping se suaviza; el offset se toma de la MEJOR muestra (la de menor
    // RTT), que es la menos contaminada por picos de la red.
    par.ping = par.ping ? par.ping * 0.7 + rtt * 0.3 : rtt
    let mejor = par.muestras[0]
    for (const s of par.muestras) if (s.rtt < mejor.rtt) mejor = s
    par.offset = mejor.offset
    this._recalcularReloj()
  }

  /** El reloj de referencia es el del anfitrión. */
  _recalcularReloj() {
    if (this.esAnfitrion) {
      this.offsetReloj = 0
      return
    }
    const anfitrion = this.jugadores.find((j) => j.esAnfitrion)
    const par = anfitrion ? this.pares.get(anfitrion.id) : null
    if (par && par.muestras.length) this.offsetReloj = par.offset
  }

  // -------------------------------------------------------------------------
  // Caídas y migración de autoridad
  // -------------------------------------------------------------------------

  _esAnfitrion(id) {
    const j = this.jugadores.find((x) => x.id === id)
    return !!(j && j.esAnfitrion)
  }

  _esHumano(id) {
    return this.jugadores.some((x) => x.id === id)
  }

  _vigilarPares() {
    const ahora = Date.now()
    for (const par of this.pares.values()) {
      if (par.caido) continue
      const estado = par.pc.connectionState
      const mudo = ahora - par.ultimaSenal > TIEMPO_CAIDA
      if (mudo || estado === 'failed' || estado === 'closed') {
        this._cerrarPar(par.id, mudo ? 'dejó de responder' : 'conexión perdida')
      }
    }
  }

  /**
   * Da de baja a un par. Emite `salir` para que la carrera le pase el kart a
   * la IA, y si el que se cayó era el anfitrión, migra la autoridad.
   */
  _cerrarPar(id, motivo = '') {
    const par = this.pares.get(id)
    if (!par) return
    par.caido = true
    try {
      par.pc.close()
    } catch {
      /* ya cerrada */
    }
    this.pares.delete(id)

    const jugador = this.jugadores.find((j) => j.id === id)
    const eraAnfitrion = !!(jugador && jugador.esAnfitrion)
    this._emitir('salir', {
      id,
      motivo,
      nombre: jugador ? jugador.nombre : id,
      personaje: jugador ? jugador.personaje : null,
      ranura: this.ranuraDe(id),
    })

    if (eraAnfitrion) {
      this._migrarAutoridad(this.jugadores.map((j) => j.id).filter((x) => x !== id))
    }
  }

  /**
   * Nuevo anfitrión = id más bajo (orden lexicográfico) entre los que siguen
   * conectados. Es determinista: todos llegan a la misma conclusión sin
   * hablarlo. El nuevo anfitrión intenta además escribirlo en Firestore para
   * que los que entren después lo vean.
   */
  _migrarAutoridad(idsVivos) {
    const vivos = [...idsVivos].filter(Boolean).sort()
    if (!vivos.length) return
    const nuevo = vivos[0]
    this.esAnfitrion = nuevo === this.id
    for (const j of this.jugadores) j.esAnfitrion = j.id === nuevo
    this._recalcularReloj()
    if (this.esAnfitrion) {
      this.senal.esAnfitrion = true
      this.senal.actualizarSala({ anfitrion: this.id }).catch(() => {})
    }
    this._emitir('autoridad', { anfitrion: nuevo, yo: this.esAnfitrion })
  }

  // -------------------------------------------------------------------------
  // Salida
  // -------------------------------------------------------------------------

  /** Cierra todo: temporizadores, conexiones y documentos propios de Firestore. */
  async salir() {
    if (this._cerrada) return
    this._cerrada = true
    clearInterval(this._temporizadorEstado)
    clearInterval(this._temporizadorPing)
    clearInterval(this._temporizadorVigia)
    this._temporizadorEstado = null
    for (const par of this.pares.values()) {
      try {
        par.pc.close()
      } catch {
        /* ya cerrada */
      }
    }
    this.pares.clear()
    const ultimo = this.esAnfitrion && this.jugadores.length <= 1
    await this.senal.salir({ ultimo }).catch(() => {})
    this.jugadores = []
  }
}

// ---------------------------------------------------------------------------
// class RedLocal — misma interfaz, cero red
// ---------------------------------------------------------------------------

/**
 * Partida de un solo jugador: la parrilla se completa con IA y no se toca ni
 * Firebase ni WebRTC. Es lo que devuelve `crearRed()` cuando no hay
 * credenciales `VITE_FIREBASE_*`, para que el juego SIEMPRE arranque.
 *
 * Cumple la misma interfaz que `Red`, así que la carrera no distingue: es
 * anfitrión de sí misma, `enviarEstado`/`enviarEvento` no hacen nada y
 * `ahora()` es simplemente el reloj local.
 */
export class RedLocal extends Emisor {
  constructor({ id = 'local', nombre = 'Socio' } = {}) {
    super()
    this.modo = 'local'
    this.id = id
    this.nombre = nombre
    this.esAnfitrion = true
    this.codigo = null
    this.pista = null
    this.estadoSala = 'lobby'
    this.personaje = null
    this.listo = false
    this.tArranque = 0
    this.parrilla = [id]
    this.jugadores = [
      { id, nombre, personaje: null, listo: false, ping: 0, esAnfitrion: true, esLocal: true },
    ]
  }

  ahora() {
    return Date.now()
  }

  ping() {
    return 0
  }

  definirParrilla(ids) {
    this.parrilla = [...ids]
  }

  ranuraDe(id) {
    const i = this.parrilla.indexOf(id)
    return i < 0 ? 255 : i
  }

  idDeRanura(ranura) {
    return this.parrilla[ranura] ?? null
  }

  async crearSala({ nombre = this.nombre, personaje = null, pista = null } = {}) {
    this.nombre = nombre
    this.personaje = personaje
    this.pista = pista
    this.codigo = 'SOLO'
    this.jugadores[0].nombre = nombre
    this.jugadores[0].personaje = personaje
    // Diferimos el aviso para que quien llama alcance a suscribirse.
    Promise.resolve().then(() => this._emitir('jugadores', this.jugadores))
    return this.codigo
  }

  async unirse() {
    throw new Error('Estás jugando sin conexión: no se puede entrar a una sala.')
  }

  elegirPersonaje(personaje) {
    this.personaje = personaje
    this.jugadores[0].personaje = personaje
    this._emitir('jugadores', this.jugadores)
  }

  marcarListo(listo = true) {
    this.listo = !!listo
    this.jugadores[0].listo = this.listo
    this._emitir('jugadores', this.jugadores)
  }

  elegirPista(idPista) {
    this.pista = idPista
  }

  comenzar({ retardo = 300, semilla = Date.now() & 0xffffffff, vueltas = 3, corredores = 8 } = {}) {
    this.tArranque = this.ahora() + retardo
    this.estadoSala = 'corriendo'
    const datos = {
      tArranque: this.tArranque,
      semilla: semilla >>> 0,
      vueltas,
      corredores,
      pista: this.pista || '',
      parrilla: this.parrilla,
    }
    Promise.resolve().then(() => this._emitir('comenzar', datos))
    return this.tArranque
  }

  enviarEstado() {}

  enviarEvento() {}

  async salir() {
    this.estadoSala = 'terminada'
  }
}

// ---------------------------------------------------------------------------

/**
 * Fábrica de red.
 * @param {object} opciones
 * @param {'auto'|'red'|'local'} [opciones.modo] 'auto' elige según el entorno
 * @returns {Red|RedLocal}
 */
export function crearRed({ modo = 'auto', ...resto } = {}) {
  if (modo === 'local') return new RedLocal(resto)
  if (modo === 'red') return new Red(resto)
  // 'auto': si no hay credenciales de Firebase o no hay WebRTC, se juega solo.
  return hayRed() ? new Red(resto) : new RedLocal(resto)
}

export default { Red, RedLocal, crearRed }
