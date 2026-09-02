// Física propia de los proyectiles de ítems (bananas, caparazones y bombas).
//
// Es deliberadamente INDEPENDIENTE de `FisicaKart`: un caparazón no tiene
// suspensión ni derrape, sólo posición, velocidad, seguimiento del terreno y
// rebote contra los muros. Todo está poolizado: las mallas se crean una vez y
// se reciclan, nunca se instancia ni se destruye geometría en carrera.
//
// El pool NO decide consecuencias: detecta contactos y avisa por callbacks.
// Quién recibe el golpe y qué castigo se aplica lo decide `SistemaItems`
// (y sólo si es el anfitrión).
import * as THREE from 'three'
import { crearResultadoContacto, interseccionEsferaKart, rebotar } from '../physics/collision.js'
import { FISICA, KART } from '../core/constantes.js'
import { damp } from '../core/utils.js'
import { ITEMS } from './definiciones.js'
import { crearModeloItem } from './Modelos.js'

/** Estados posibles de un proyectil. */
export const ESTADO = {
  LIBRE: 'libre',
  ARRASTRADO: 'arrastrado', // colgando atrás del kart, todavía no lanzado
  VOLANDO: 'volando',
  APOYADO: 'apoyado', // banana quieta en el piso
}

/** Tipos que maneja el pool. */
export const TIPOS_PROYECTIL = ['banana', 'caparazonVerde', 'caparazonRojo', 'bomba']

const GRAVEDAD = FISICA.gravedad
const ARRIBA = new THREE.Vector3(0, 1, 0)

// Temporales de módulo: nada de asignar dentro del bucle.
const _v = new THREE.Vector3()
const _w = new THREE.Vector3()
const _der = new THREE.Vector3()
const _prev = new THREE.Vector3()
const _delta = new THREE.Vector3()
const _vel2 = [0, 0]
const _contacto = crearResultadoContacto()
const _sup = { y: 0, normal: new THREE.Vector3(0, 1, 0), tipo: 'asfalto', enPista: true, distanciaCentro: 0, anchoAqui: 11 }
const _col = { golpe: false, correccion: new THREE.Vector3(), normal: new THREE.Vector3() }
const _punto = {
  posicion: new THREE.Vector3(),
  tangente: new THREE.Vector3(0, 0, -1),
  normal: new THREE.Vector3(0, 1, 0),
  ancho: 11,
}

/**
 * Un proyectil del pool. Se reutiliza: `reiniciar()` lo deja como nuevo.
 */
export class Proyectil {
  /**
   * @param {string} tipo uno de `TIPOS_PROYECTIL`
   * @param {THREE.Object3D} malla modelo ya creado (se reutiliza)
   */
  constructor(tipo, malla) {
    this.tipo = tipo
    this.def = ITEMS[tipo]
    this.malla = malla
    this.malla.visible = false

    this.estado = ESTADO.LIBRE
    this.id = 0 // identificador para la red
    this.idDueno = null
    this.idObjetivo = null

    this.posicion = new THREE.Vector3()
    this.velocidad = new THREE.Vector3()
    this.anterior = new THREE.Vector3()
    this.radio = this.def.radio ?? 0.5
    this.vida = 0
    this.rebotes = 0
    this.gracia = 0 // segundos en los que no puede golpear a su dueño
    this.mecha = 0 // bomba
    this.giro = 0
    this.velGiro = 0
    this.enSuelo = false

    // Seguimiento sobre el eje de la pista (caparazón rojo).
    this.s = 0
    this.lateral = 0
    this.tiempoVivo = 0
  }

  get activo() {
    return this.estado !== ESTADO.LIBRE
  }

  /** Deja el proyectil listo para volver al pool. */
  reiniciar() {
    this.estado = ESTADO.LIBRE
    this.idDueno = null
    this.idObjetivo = null
    this.velocidad.set(0, 0, 0)
    this.vida = 0
    this.rebotes = 0
    this.gracia = 0
    this.mecha = 0
    this.enSuelo = false
    this.tiempoVivo = 0
    this.malla.visible = false
  }
}

/**
 * Pool de proyectiles. Crea las mallas una sola vez por tipo y las recicla.
 */
export class PoolProyectiles {
  /**
   * @param {THREE.Object3D} escena dónde colgar las mallas
   * @param {object} pista PistaRuntime
   * @param {object} [opciones] `{ porTipo }` cuántos proyectiles reservar por tipo
   */
  constructor(escena, pista, { porTipo = { banana: 12, caparazonVerde: 8, caparazonRojo: 10, bomba: 6 } } = {}) {
    this.escena = escena
    this.pista = pista
    this.grupo = new THREE.Group()
    this.grupo.name = 'proyectiles'
    if (escena && escena.add) escena.add(this.grupo)

    /** @type {Map<string, Proyectil[]>} */
    this.pools = new Map()
    /** @type {Proyectil[]} lista plana de todos, para recorrer rápido */
    this.todos = []
    this._proximoId = 1

    for (const tipo of TIPOS_PROYECTIL) {
      const lista = []
      const n = porTipo[tipo] ?? 6
      for (let i = 0; i < n; i++) lista.push(this._crear(tipo))
      this.pools.set(tipo, lista)
    }
  }

  _crear(tipo) {
    const malla = crearModeloItem(tipo)
    malla.visible = false
    this.grupo.add(malla)
    const p = new Proyectil(tipo, malla)
    this.todos.push(p)
    return p
  }

  /** Saca uno libre del pool (o crea uno más si se quedó corto). */
  obtener(tipo) {
    const lista = this.pools.get(tipo)
    if (!lista) return null
    for (const p of lista) if (!p.activo) return p
    // Si no hay libres reciclamos el más viejo: nunca fallamos un disparo.
    let viejo = lista[0]
    for (const p of lista) if (p.tiempoVivo > viejo.tiempoVivo) viejo = p
    viejo.reiniciar()
    return viejo
  }

  /**
   * Pone un proyectil en juego.
   *
   * @param {string} tipo
   * @param {object} opciones
   * @param {string} opciones.idDueno quién lo tiró
   * @param {THREE.Vector3} opciones.posicion punto de salida
   * @param {THREE.Vector3} opciones.direccion dirección unitaria de disparo
   * @param {number} [opciones.rapidez] m/s (por defecto, la de la ficha)
   * @param {number} [opciones.rapidezBase] velocidad del kart, se suma
   * @param {string|null} [opciones.idObjetivo] víctima del caparazón rojo
   * @param {boolean} [opciones.arrastrado] nace colgando atrás del kart
   * @param {number} [opciones.id] id de red (si viene del anfitrión)
   */
  lanzar(tipo, opciones) {
    const p = this.obtener(tipo)
    if (!p) return null
    const def = p.def
    p.reiniciar()
    p.id = opciones.id ?? this._proximoId++
    p.idDueno = opciones.idDueno ?? null
    p.idObjetivo = opciones.idObjetivo ?? null
    p.posicion.copy(opciones.posicion)
    p.anterior.copy(opciones.posicion)
    p.vida = def.vida ?? 8
    p.mecha = def.mecha ?? 0
    p.gracia = opciones.arrastrado ? 0.25 : 0.45
    p.estado = opciones.arrastrado ? ESTADO.ARRASTRADO : ESTADO.VOLANDO
    p.malla.visible = true
    p.malla.position.copy(p.posicion)
    p.malla.scale.setScalar(1)
    p.velGiro = tipo === 'banana' ? 2.2 : 7.5

    const dir = _v.copy(opciones.direccion || ARRIBA).setY(0)
    if (dir.lengthSq() < 1e-6) dir.set(0, 0, -1)
    dir.normalize()

    if (!opciones.arrastrado) {
      const base = opciones.rapidez ?? def.velocidad ?? def.velocidadLanzada ?? 14
      const extra = Math.max(0, opciones.rapidezBase ?? 0) * (tipo === 'banana' ? 0.35 : 0.25)
      p.velocidad.copy(dir).multiplyScalar(base + extra)
      // Las trampas salen con un arquito; los caparazones van rasantes.
      p.velocidad.y = tipo === 'banana' ? 3.2 : tipo === 'bomba' ? 6.5 : 0
    }

    // Estado sobre el eje de la pista (lo usa el caparazón rojo).
    if (this.pista && this.pista.progreso) {
      const pr = this.pista.progreso(p.posicion.x, p.posicion.z)
      p.s = pr.s
      p.lateral = pr.lateral
    }
    return p
  }

  /** Suelta un proyectil que venía arrastrado, dándole velocidad. */
  soltar(p, direccion, rapidez = null, rapidezBase = 0) {
    if (!p || p.estado !== ESTADO.ARRASTRADO) return false
    const def = p.def
    p.estado = ESTADO.VOLANDO
    p.gracia = Math.max(p.gracia, 0.35)
    const dir = _v.copy(direccion || ARRIBA).setY(0)
    if (dir.lengthSq() < 1e-6) dir.set(0, 0, -1)
    dir.normalize()
    const base = rapidez ?? def.velocidad ?? def.velocidadLanzada ?? 14
    p.velocidad.copy(dir).multiplyScalar(base + Math.max(0, rapidezBase) * 0.25)
    p.velocidad.y = p.tipo === 'banana' ? 2.6 : p.tipo === 'bomba' ? 5.5 : 0
    if (this.pista && this.pista.progreso) {
      const pr = this.pista.progreso(p.posicion.x, p.posicion.z)
      p.s = pr.s
      p.lateral = pr.lateral
    }
    return true
  }

  /** Coloca a mano un proyectil arrastrado (lo llama `SistemaItems`). */
  colocarArrastrado(p, posicion, yaw = 0) {
    if (!p) return
    p.posicion.copy(posicion)
    p.anterior.copy(posicion)
    p.malla.position.copy(posicion)
    p.malla.rotation.y = yaw
  }

  /** Apaga un proyectil. `motivo` = 'vida' | 'muro' | 'impacto' | 'explosion' | 'limpieza' */
  desactivar(p, motivo = 'vida', alFin = null) {
    if (!p || !p.activo) return
    const previo = p.estado
    p.reiniciar()
    if (alFin) alFin(p, motivo, previo)
  }

  /** Busca un proyectil activo por su id de red. */
  porId(id) {
    for (const p of this.todos) if (p.activo && p.id === id) return p
    return null
  }

  /**
   * Un paso de simulación.
   *
   * @param {number} dt
   * @param {object} ctx
   * @param {Array<{id:string, estado:object}>} ctx.karts corredores en carrera
   * @param {boolean} ctx.resolver true si este cliente decide impactos
   * @param {(p:Proyectil, idVictima:string) => void} [ctx.alGolpe]
   * @param {(p:Proyectil) => void} [ctx.alExplosion]
   * @param {(id:string) => boolean} [ctx.esInvencible]
   * @param {(p:Proyectil, motivo:string) => void} [ctx.alFin]
   */
  actualizar(dt, ctx = {}) {
    const karts = ctx.karts || []
    for (const p of this.todos) {
      if (!p.activo) continue
      p.tiempoVivo += dt
      if (p.gracia > 0) p.gracia -= dt

      if (p.estado === ESTADO.ARRASTRADO) {
        // La posición la maneja SistemaItems; acá sólo gira y busca contactos.
        p.malla.rotation.y += p.velGiro * 0.35 * dt
        if (ctx.resolver) this._buscarKarts(p, dt, karts, ctx)
        continue
      }

      p.vida -= dt
      if (p.vida <= 0) {
        if (p.tipo === 'bomba') this._explotar(p, ctx)
        else this.desactivar(p, 'vida', ctx.alFin)
        continue
      }

      p.anterior.copy(p.posicion)
      switch (p.tipo) {
        case 'caparazonRojo':
          this._pasoRojo(p, dt, karts, ctx)
          break
        default:
          this._pasoBalistico(p, dt, ctx)
          break
      }

      if (!p.activo) continue

      // Mecha de la bomba y proximidad.
      if (p.tipo === 'bomba') {
        p.mecha -= dt
        const chispa = p.malla.userData.chispa
        if (chispa) {
          const pulso = 0.34 + Math.sin(p.tiempoVivo * 26) * 0.09 + (1 - p.mecha / (p.def.mecha || 3)) * 0.28
          chispa.scale.setScalar(Math.max(0.12, pulso))
        }
        if (p.mecha <= 0) {
          this._explotar(p, ctx)
          continue
        }
        if (ctx.resolver && this._hayKartCerca(p, karts, p.def.radioProximidad, ctx)) {
          this._explotar(p, ctx)
          continue
        }
      }

      if (ctx.resolver && this._buscarKarts(p, dt, karts, ctx)) continue

      this._dibujar(p, dt)
    }
  }

  // ------------------------------------------------------------------ pasos

  /** Bananas, caparazones verdes y bombas: balística + rebote en muros. */
  _pasoBalistico(p, dt, ctx) {
    const apoyado = p.estado === ESTADO.APOYADO
    if (!apoyado) {
      p.velocidad.y -= GRAVEDAD * dt
      p.posicion.addScaledVector(p.velocidad, dt)
    }

    // Terreno.
    const sup = this.pista && this.pista.muestrear ? this.pista.muestrear(p.posicion.x, p.posicion.z, _sup) : null
    const ySuelo = (sup ? sup.y : 0) + p.radio * 0.85
    if (p.posicion.y <= ySuelo) {
      p.posicion.y = ySuelo
      p.enSuelo = true
      if (p.velocidad.y < 0) {
        const reboteY = p.tipo === 'banana' ? 0.12 : p.tipo === 'bomba' ? 0.42 : 0.25
        p.velocidad.y = -p.velocidad.y * reboteY
        if (p.velocidad.y < 1.2) p.velocidad.y = 0
      }
      // Rozamiento del piso: la banana frena hasta quedarse quieta.
      if (p.tipo === 'banana' || p.tipo === 'bomba') {
        const roce = p.tipo === 'banana' ? 3.6 : 1.8
        const v = _v.set(p.velocidad.x, 0, p.velocidad.z)
        const rap = v.length()
        const nuevo = Math.max(0, rap - roce * dt * (sup && !sup.enPista ? 2.2 : 1))
        if (rap > 1e-4) {
          v.multiplyScalar(nuevo / rap)
          p.velocidad.x = v.x
          p.velocidad.z = v.z
        }
        if (nuevo < 0.35 && Math.abs(p.velocidad.y) < 0.4) {
          p.velocidad.set(0, 0, 0)
          p.posicion.y = ySuelo
          if (p.tipo === 'banana') p.estado = ESTADO.APOYADO
        }
      }
    } else {
      p.enSuelo = false
    }

    // Muros: los caparazones rebotan, la banana y la bomba se frenan contra ellos.
    if (this.pista && this.pista.colisionar) {
      const col = this.pista.colisionar(p.posicion, p.radio, _col)
      if (col && col.golpe) {
        if (col.correccion) p.posicion.add(col.correccion)
        const n = col.normal
        if (p.tipo === 'caparazonVerde') {
          const frontal = rebotar(p.velocidad.x, p.velocidad.z, n.x, n.z, _vel2, 1, 0.06)
          p.velocidad.x = _vel2[0]
          p.velocidad.z = _vel2[1]
          // Mantiene la velocidad: un caparazón verde no pierde ritmo al rebotar.
          const v = _v.set(p.velocidad.x, 0, p.velocidad.z)
          const rap = v.length()
          if (rap > 1e-4) {
            v.multiplyScalar((p.def.velocidad ?? 34) / rap)
            p.velocidad.x = v.x
            p.velocidad.z = v.z
          }
          p.rebotes++
          if (ctx.alRebote) ctx.alRebote(p, frontal)
          if (p.rebotes > (p.def.rebotesMax ?? 4)) {
            this.desactivar(p, 'muro', ctx.alFin)
            return
          }
        } else {
          const frontal = rebotar(p.velocidad.x, p.velocidad.z, n.x, n.z, _vel2, 0.25, 0.75)
          p.velocidad.x = _vel2[0]
          p.velocidad.z = _vel2[1]
          if (ctx.alRebote && frontal > 0.3) ctx.alRebote(p, frontal)
        }
      }
    }
  }

  /**
   * Caparazón rojo: avanza sobre el **eje de la pista** (no en línea recta) y
   * corrige su desplazamiento lateral hacia el de la víctima. Si toca un muro,
   * se pierde.
   */
  _pasoRojo(p, dt, karts, ctx) {
    const pista = this.pista
    if (!pista || !pista.puntoEn) {
      this._pasoBalistico(p, dt, ctx)
      return
    }
    const def = p.def
    const objetivo = p.idObjetivo ? karts.find((k) => k.id === p.idObjetivo) : null

    // Homing final: a menos de 3 m va derecho a la yugular.
    if (objetivo) {
      const e = objetivo.estado
      const d2 = (e.posicion.x - p.posicion.x) ** 2 + (e.posicion.z - p.posicion.z) ** 2
      if (d2 < 9) {
        _w.set(e.posicion.x - p.posicion.x, 0, e.posicion.z - p.posicion.z)
        if (_w.lengthSq() > 1e-6) _w.normalize()
        p.posicion.addScaledVector(_w, (def.velocidad ?? 32) * dt)
        p.posicion.y = this._alturaSuelo(p)
        p.velocidad.copy(_w).multiplyScalar(def.velocidad ?? 32)
        return
      }
    }

    // Avance sobre el eje.
    p.s += (def.velocidad ?? 32) * dt
    if (pista.longitud > 0) p.s %= pista.longitud
    const objetivoLateral = objetivo ? objetivo.estado.progreso.lateral : p.lateral
    p.lateral = damp(p.lateral, objetivoLateral, def.velocidadBusqueda ?? 3.4, dt)

    const punto = pista.puntoEn(p.s, _punto)
    _der.crossVectors(punto.tangente, ARRIBA).normalize()
    _v.copy(punto.posicion).addScaledVector(_der, p.lateral)
    _v.y = 0
    const yAntes = p.posicion.y
    p.posicion.set(_v.x, yAntes, _v.z)
    p.posicion.y = this._alturaSuelo(p)

    // Dirección real (para orientar la malla y el barrido de colisión).
    _delta.copy(p.posicion).sub(p.anterior)
    if (dt > 0) p.velocidad.copy(_delta).divideScalar(dt)

    // Un muro lo desintegra.
    if (pista.colisionar) {
      const col = pista.colisionar(p.posicion, p.radio, _col)
      if (col && col.golpe) {
        if (ctx.alFin) ctx.alFin(p, 'muro', p.estado)
        p.reiniciar()
      }
    }
  }

  /** Altura del proyectil siguiendo el relieve, suavizada. */
  _alturaSuelo(p) {
    const sup = this.pista && this.pista.muestrear ? this.pista.muestrear(p.posicion.x, p.posicion.z, _sup) : null
    const objetivo = (sup ? sup.y : 0) + p.radio * 0.9
    return p.posicion.y === 0 ? objetivo : objetivo
  }

  // -------------------------------------------------------------- contactos

  /** ¿Hay algún kart (que no sea el dueño en gracia) a menos de `radio`? */
  _hayKartCerca(p, karts, radio, ctx) {
    const r2 = radio * radio
    for (const k of karts) {
      if (!k || !k.estado) continue
      if (k.id === p.idDueno && p.gracia > 0) continue
      if (k.estado.terminado) continue
      const dx = k.estado.posicion.x - p.posicion.x
      const dz = k.estado.posicion.z - p.posicion.z
      const dy = k.estado.posicion.y - p.posicion.y
      if (dx * dx + dz * dz < r2 && Math.abs(dy) < 3) {
        if (ctx.esInvencible && ctx.esInvencible(k.id)) continue
        return true
      }
    }
    return false
  }

  /**
   * Barrido del proyectil contra todos los karts. Devuelve true si el proyectil
   * dejó de existir en este cuadro.
   */
  _buscarKarts(p, dt, karts, ctx) {
    _delta.copy(p.posicion).sub(p.anterior)
    let mejor = null
    let mejorT = 2
    for (const k of karts) {
      if (!k || !k.estado) continue
      if (k.estado.terminado) continue
      if (k.id === p.idDueno && p.gracia > 0) continue
      const r = interseccionEsferaKart(
        p.anterior.x,
        p.anterior.y,
        p.anterior.z,
        _delta.x,
        _delta.y,
        _delta.z,
        p.radio,
        k.estado,
        KART.radioColision * (k.estado.aplastado > 0 ? 0.72 : 1),
        KART.alto + 0.9,
        _contacto,
      )
      if (r.golpe && r.t < mejorT) {
        mejorT = r.t
        mejor = k
      }
    }
    if (!mejor) return false

    // La estrella y la bala arrasan con lo que toquen: el proyectil se rompe
    // sin castigar a nadie.
    const inmune = ctx.esInvencible ? ctx.esInvencible(mejor.id) : false
    if (p.tipo === 'bomba') {
      this._explotar(p, ctx)
      return true
    }
    if (!inmune && ctx.alGolpe) ctx.alGolpe(p, mejor.id)
    if (inmune && ctx.alFin) ctx.alFin(p, 'inmune', p.estado)
    p.reiniciar()
    void dt
    return true
  }

  /** Detona una bomba: avisa el área y apaga el proyectil. */
  _explotar(p, ctx) {
    if (ctx.alExplosion) ctx.alExplosion(p)
    if (ctx.alFin) ctx.alFin(p, 'explosion', p.estado)
    p.reiniciar()
  }

  // ------------------------------------------------------------------ dibujo

  /** Sincroniza la malla con el estado físico y le da vidilla. */
  _dibujar(p, dt) {
    p.malla.position.copy(p.posicion)
    switch (p.tipo) {
      case 'banana':
        p.malla.rotation.y += (p.estado === ESTADO.APOYADO ? 0 : p.velGiro) * dt
        break
      case 'bomba':
        p.malla.rotation.y += 1.6 * dt
        p.malla.rotation.x += 2.4 * dt
        break
      default: {
        // Los caparazones ruedan hacia adelante y miran hacia donde van.
        const rap = Math.hypot(p.velocidad.x, p.velocidad.z)
        if (rap > 0.2) p.malla.rotation.y = Math.atan2(-p.velocidad.x, -p.velocidad.z)
        p.giro += rap * dt * 1.2
        p.malla.children[0] && (p.malla.children[0].rotation.y = p.giro)
        break
      }
    }
  }

  /** Apaga todos los proyectiles (fin de carrera). */
  limpiar(alFin = null) {
    for (const p of this.todos) if (p.activo) this.desactivar(p, 'limpieza', alFin)
  }

  destruir() {
    this.limpiar()
    for (const p of this.todos) {
      p.malla.removeFromParent()
    }
    this.todos.length = 0
    this.pools.clear()
    this.grupo.removeFromParent()
  }
}

export default PoolProyectiles
