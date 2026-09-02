// Señalización de Teo Kart sobre Firestore.
//
// Firestore acá NO es el servidor del juego: sólo sirve de "pizarrón" para que
// los pares se encuentren e intercambien SDP/ICE. Una vez que el WebRTC quedó
// establecido, la partida entera viaja par a par y Firestore no se toca más
// (salvo para el estado del lobby y la limpieza al salir).
//
// TODOS los imports de Firebase son PEREZOSOS (dinámicos, dentro de las
// funciones) para que este módulo se pueda importar en Node sin entorno.

/** Alfabeto legible: sin I, O, 0 ni 1 (se confunden al dictar por teléfono). */
export const ALFABETO_CODIGO = 'ABCDEFGHJKLMNPQRSTUVWXYZ'

/** Colección raíz de las salas. */
export const COLECCION_SALAS = 'salasKart'

/** Una sala con más de 3 horas se considera muerta. */
export const TTL_SALA_MS = 3 * 60 * 60 * 1000

/** Servidores STUN públicos de Google (sin TURN: no hay servidor propio). */
export const SERVIDORES_HIELO = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
]

/** Genera un código de sala de 4 letras mayúsculas legibles. */
export function codigoAleatorio(largo = 4) {
  let s = ''
  for (let i = 0; i < largo; i++) {
    s += ALFABETO_CODIGO[Math.floor(Math.random() * ALFABETO_CODIGO.length)]
  }
  return s
}

/** Normaliza lo que tipea el usuario: mayúsculas y sin caracteres raros. */
export function normalizarCodigo(codigo) {
  return String(codigo || '')
    .toUpperCase()
    .replace(/[^A-Z]/g, '')
    .slice(0, 4)
}

/**
 * ¿Hay credenciales de Firebase en el entorno? Si no, el juego cae a
 * `RedLocal` y se puede jugar sin red igual.
 */
export function hayCredenciales() {
  try {
    const env = typeof import.meta !== 'undefined' ? import.meta.env : null
    if (!env) return false
    return Boolean(env.VITE_FIREBASE_API_KEY && env.VITE_FIREBASE_PROJECT_ID)
  } catch {
    return false
  }
}

/** ¿El navegador soporta WebRTC con DataChannel? */
export function hayWebRTC() {
  return typeof RTCPeerConnection !== 'undefined'
}

/** ¿Se puede jugar en red acá? */
export function hayRed() {
  return hayCredenciales() && hayWebRTC()
}

// ---------------------------------------------------------------------------

/**
 * Capa de señalización. Una instancia por partida.
 *
 * Estructura en Firestore:
 *
 *   salasKart/{CODIGO}
 *     { anfitrion, creada, latido, pista, estado, version, jugadores: { uid: {...} } }
 *     ├── ofertas/{de__para}      { de, para, tipo, sdp, creada }
 *     ├── respuestas/{de__para}   { de, para, tipo, sdp, creada }
 *     └── candidatos/{de__para}   { de, para, lista: [ ...candidatosICE ], creada }
 *
 * El id de documento `de__para` permite que las reglas de seguridad exijan
 * que el prefijo sea el uid de quien escribe: nadie puede firmar por otro.
 */
export class Senalizacion {
  constructor({ db = null, auth = null, version = 1 } = {}) {
    this.db = db
    this.auth = auth
    this.version = version
    this.id = null // uid anónimo de Firebase
    this.codigo = null
    this.esAnfitrion = false
    this._fs = null // módulo firebase/firestore cacheado
    this._bajas = [] // funciones de desuscripción
    this._misDocs = [] // rutas propias a borrar al salir
    this._cerrada = false
  }

  // --- carga perezosa de Firebase ------------------------------------------

  async _firestore() {
    if (!this._fs) this._fs = await import('firebase/firestore')
    return this._fs
  }

  async _base() {
    if (!this.db || !this.auth) {
      const cfg = await import('../../firebase/config.js')
      this.db = this.db || cfg.db
      this.auth = this.auth || cfg.auth
    }
    return { db: this.db, auth: this.auth }
  }

  /** Autentica de forma anónima si hace falta. Devuelve el uid. */
  async conectar() {
    if (this.id) return this.id
    const { auth } = await this._base()
    if (auth.currentUser) {
      this.id = auth.currentUser.uid
      return this.id
    }
    const { signInAnonymously, onAuthStateChanged } = await import('firebase/auth')
    try {
      const cred = await signInAnonymously(auth)
      this.id = cred.user.uid
    } catch (e) {
      // Puede fallar si el proyecto no tiene habilitado el acceso anónimo.
      throw new Error(`No se pudo autenticar de forma anónima: ${e.message}`)
    }
    // Nos aseguramos de que el token esté listo antes de escribir.
    if (!this.id) {
      this.id = await new Promise((res) => {
        const baja = onAuthStateChanged(auth, (u) => {
          if (u) {
            baja()
            res(u.uid)
          }
        })
      })
    }
    return this.id
  }

  _refSala(codigo = this.codigo) {
    const { doc } = this._fs
    return doc(this.db, COLECCION_SALAS, codigo)
  }

  // --- salas ---------------------------------------------------------------

  /**
   * Crea una sala nueva con un código libre.
   * @returns {Promise<string>} el código de 4 letras
   */
  async crearSala({ jugador, pista = null, intentos = 12 } = {}) {
    await this.conectar()
    const fs = await this._firestore()
    const { doc, getDoc, setDoc, serverTimestamp } = fs

    for (let i = 0; i < intentos; i++) {
      const codigo = codigoAleatorio()
      const ref = doc(this.db, COLECCION_SALAS, codigo)
      const snap = await getDoc(ref)
      if (snap.exists() && !this._estaMuerta(snap.data())) continue

      await setDoc(ref, {
        anfitrion: this.id,
        creada: Date.now(),
        latido: serverTimestamp(),
        pista,
        estado: 'lobby',
        version: this.version,
        jugadores: { [this.id]: { ...jugador, id: this.id, entro: Date.now() } },
      })
      this.codigo = codigo
      this.esAnfitrion = true
      return codigo
    }
    throw new Error('No se pudo encontrar un código de sala libre. Probá de nuevo.')
  }

  /** Devuelve true si la sala superó el TTL lógico de 3 horas. */
  _estaMuerta(datos) {
    if (!datos) return true
    const creada = Number(datos.creada || 0)
    return !creada || Date.now() - creada > TTL_SALA_MS
  }

  /**
   * Se une a una sala existente registrando la propia entrada de jugador.
   * @returns {Promise<object>} los datos de la sala
   */
  async unirse(codigo, jugador) {
    await this.conectar()
    const fs = await this._firestore()
    const { doc, getDoc, updateDoc, deleteDoc } = fs
    const cod = normalizarCodigo(codigo)
    if (cod.length !== 4) throw new Error('El código de sala tiene que ser de 4 letras.')

    const ref = doc(this.db, COLECCION_SALAS, cod)
    const snap = await getDoc(ref)
    if (!snap.exists()) throw new Error(`No existe ninguna sala con el código ${cod}.`)

    const datos = snap.data()
    if (this._estaMuerta(datos)) {
      // Sala zombi: la intentamos limpiar (si las reglas nos dejan) y avisamos.
      try {
        await deleteDoc(ref)
      } catch {
        /* la borrará su anfitrión o el TTL del servidor */
      }
      throw new Error(`La sala ${cod} está vencida. Pedí un código nuevo.`)
    }
    if (datos.version !== this.version) {
      throw new Error(
        `La sala ${cod} usa otra versión del juego (${datos.version} contra ${this.version}).`,
      )
    }
    if (datos.estado === 'terminada') throw new Error(`La carrera de la sala ${cod} ya terminó.`)

    await updateDoc(ref, {
      [`jugadores.${this.id}`]: { ...jugador, id: this.id, entro: Date.now() },
    })

    this.codigo = cod
    this.esAnfitrion = datos.anfitrion === this.id
    return { ...datos, codigo: cod }
  }

  /** Escucha los cambios de la sala (jugadores, pista, estado). */
  async escucharSala(cb) {
    const fs = await this._firestore()
    const { onSnapshot } = fs
    const baja = onSnapshot(
      this._refSala(),
      (snap) => {
        if (!snap.exists()) {
          cb(null)
          return
        }
        cb({ ...snap.data(), codigo: this.codigo })
      },
      (e) => cb(null, e),
    )
    this._bajas.push(baja)
    return baja
  }

  /** Actualiza campos de MI entrada de jugador (personaje, listo, nombre). */
  async actualizarJugador(campos) {
    const fs = await this._firestore()
    const { updateDoc } = fs
    const parche = {}
    for (const [k, v] of Object.entries(campos)) parche[`jugadores.${this.id}.${k}`] = v
    await updateDoc(this._refSala(), parche)
  }

  /** Actualiza campos de la sala. Sólo tiene sentido para el anfitrión. */
  async actualizarSala(campos) {
    const fs = await this._firestore()
    const { updateDoc } = fs
    await updateDoc(this._refSala(), campos)
  }

  /** Saca a un jugador de la lista (uno mismo, o el anfitrión a un caído). */
  async quitarJugador(id = this.id) {
    const fs = await this._firestore()
    const { updateDoc, deleteField } = fs
    await updateDoc(this._refSala(), { [`jugadores.${id}`]: deleteField() })
  }

  // --- intercambio SDP/ICE -------------------------------------------------

  _par(de, para) {
    return `${de}__${para}`
  }

  /** Publica una oferta SDP dirigida a `para`. */
  async enviarOferta(para, descripcion) {
    const fs = await this._firestore()
    const { doc, setDoc } = fs
    const id = this._par(this.id, para)
    const ref = doc(this.db, COLECCION_SALAS, this.codigo, 'ofertas', id)
    await setDoc(ref, {
      de: this.id,
      para,
      tipo: descripcion.type,
      sdp: descripcion.sdp,
      creada: Date.now(),
    })
    this._misDocs.push(['ofertas', id])
  }

  /** Publica la respuesta SDP dirigida a `para`. */
  async enviarRespuesta(para, descripcion) {
    const fs = await this._firestore()
    const { doc, setDoc } = fs
    const id = this._par(this.id, para)
    const ref = doc(this.db, COLECCION_SALAS, this.codigo, 'respuestas', id)
    await setDoc(ref, {
      de: this.id,
      para,
      tipo: descripcion.type,
      sdp: descripcion.sdp,
      creada: Date.now(),
    })
    this._misDocs.push(['respuestas', id])
  }

  /**
   * Agrega un candidato ICE al documento del par. Se acumulan en un array
   * para no crear un documento por candidato (son 10-20 por conexión).
   */
  async enviarCandidato(para, candidato) {
    const fs = await this._firestore()
    const { doc, setDoc, arrayUnion } = fs
    const id = this._par(this.id, para)
    const ref = doc(this.db, COLECCION_SALAS, this.codigo, 'candidatos', id)
    await setDoc(
      ref,
      {
        de: this.id,
        para,
        creada: Date.now(),
        lista: arrayUnion(JSON.stringify(candidato.toJSON ? candidato.toJSON() : candidato)),
      },
      { merge: true },
    )
    if (!this._misDocs.some(([c, d]) => c === 'candidatos' && d === id)) {
      this._misDocs.push(['candidatos', id])
    }
  }

  /** Escucha las ofertas dirigidas a mí. `cb(de, { type, sdp })`. */
  async escucharOfertas(cb) {
    return this._escucharSdp('ofertas', cb)
  }

  /** Escucha las respuestas dirigidas a mí. `cb(de, { type, sdp })`. */
  async escucharRespuestas(cb) {
    return this._escucharSdp('respuestas', cb)
  }

  async _escucharSdp(sub, cb) {
    const fs = await this._firestore()
    const { collection, query, where, onSnapshot } = fs
    const q = query(
      collection(this.db, COLECCION_SALAS, this.codigo, sub),
      where('para', '==', this.id),
    )
    const baja = onSnapshot(q, (snap) => {
      for (const cambio of snap.docChanges()) {
        if (cambio.type === 'removed') continue
        const d = cambio.doc.data()
        cb(d.de, { type: d.tipo, sdp: d.sdp })
      }
    })
    this._bajas.push(baja)
    return baja
  }

  /**
   * Escucha los candidatos ICE dirigidos a mí. Sólo entrega los nuevos:
   * lleva la cuenta de cuántos consumió de cada par.
   */
  async escucharCandidatos(cb) {
    const fs = await this._firestore()
    const { collection, query, where, onSnapshot } = fs
    const consumidos = new Map()
    const q = query(
      collection(this.db, COLECCION_SALAS, this.codigo, 'candidatos'),
      where('para', '==', this.id),
    )
    const baja = onSnapshot(q, (snap) => {
      for (const documento of snap.docs) {
        const d = documento.data()
        const lista = d.lista || []
        const desde = consumidos.get(d.de) || 0
        for (let i = desde; i < lista.length; i++) {
          try {
            cb(d.de, JSON.parse(lista[i]))
          } catch {
            /* candidato corrupto: se ignora */
          }
        }
        consumidos.set(d.de, lista.length)
      }
    })
    this._bajas.push(baja)
    return baja
  }

  // --- limpieza ------------------------------------------------------------

  /** Deja de escuchar todo (sin borrar nada). */
  desescuchar() {
    for (const baja of this._bajas) {
      try {
        baja()
      } catch {
        /* ya dada de baja */
      }
    }
    this._bajas.length = 0
  }

  /**
   * Salida ordenada: corta las escuchas, borra MIS documentos de señalización
   * y me saca de la lista de jugadores. Si soy el anfitrión y quedo solo,
   * borro la sala entera.
   */
  async salir({ ultimo = false } = {}) {
    if (this._cerrada) return
    this._cerrada = true
    this.desescuchar()
    if (!this.codigo || !this.id) return
    const fs = await this._firestore().catch(() => null)
    if (!fs) return
    const { doc, deleteDoc } = fs

    for (const [sub, id] of this._misDocs) {
      try {
        await deleteDoc(doc(this.db, COLECCION_SALAS, this.codigo, sub, id))
      } catch {
        /* puede que ya no exista */
      }
    }
    this._misDocs.length = 0

    try {
      if (this.esAnfitrion && ultimo) await deleteDoc(this._refSala())
      else await this.quitarJugador(this.id)
    } catch {
      /* sin permiso o sala ya borrada */
    }
  }

  /** Borra salas vencidas que encontremos de paso (mantenimiento oportunista). */
  async limpiarVencidas(maximo = 10) {
    const fs = await this._firestore()
    const { collection, query, where, limit, getDocs, deleteDoc } = fs
    const corte = Date.now() - TTL_SALA_MS
    const q = query(collection(this.db, COLECCION_SALAS), where('creada', '<', corte), limit(maximo))
    let borradas = 0
    try {
      const snap = await getDocs(q)
      for (const d of snap.docs) {
        try {
          await deleteDoc(d.ref)
          borradas++
        } catch {
          /* no somos su anfitrión */
        }
      }
    } catch {
      /* sin permiso de listar: no pasa nada */
    }
    return borradas
  }
}

export default Senalizacion
