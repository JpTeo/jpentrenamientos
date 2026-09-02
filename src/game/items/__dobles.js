// Dobles de prueba (stubs) para poder ejercitar el sistema de ítems sin el
// resto del juego. NADA de este archivo debe usarse en la carrera real salvo
// `interseccionEsferaKartRespaldo`, que es el plan B mientras el agente de
// física no publique `src/game/physics/collision.js`.
//
// En cuanto ese archivo exista, `Proyectiles.js` lo carga solo (import dinámico
// del path real) y este respaldo deja de usarse. El import real no se toca.
import * as THREE from 'three'
import { KART, VELOCIDAD } from '../core/constantes.js'
import { rng } from '../core/utils.js'

// ---------------------------------------------------------------------------
// Respaldo de colisión esfera ↔ kart
// ---------------------------------------------------------------------------

const _dif = new THREE.Vector3()

/**
 * Colisión aproximada entre una esfera (proyectil) y el cilindro de colisión de
 * un kart. Misma forma de resultado que el helper oficial de física.
 *
 * @param {THREE.Vector3} centro centro de la esfera, en mundo
 * @param {number} radio radio de la esfera
 * @param {{posicion: THREE.Vector3}} estadoKart estado del kart candidato
 * @param {object} [salida] objeto reutilizable
 * @returns {{golpe: boolean, distancia: number, normal: THREE.Vector3, punto: THREE.Vector3}}
 */
export function interseccionEsferaKartRespaldo(centro, radio, estadoKart, salida = null) {
  const out = salida || { golpe: false, distancia: 0, normal: new THREE.Vector3(), punto: new THREE.Vector3() }
  if (!out.normal) out.normal = new THREE.Vector3()
  if (!out.punto) out.punto = new THREE.Vector3()
  const p = estadoKart && (estadoKart.posicion || estadoKart)
  if (!p) {
    out.golpe = false
    return out
  }
  const semialto = KART.alto * 0.5 + 0.45
  const dy = centro.y - (p.y + semialto)
  const dx = centro.x - p.x
  const dz = centro.z - p.z
  const distXZ = Math.hypot(dx, dz)
  const alcance = radio + KART.radioColision
  out.distancia = distXZ
  out.golpe = distXZ <= alcance && Math.abs(dy) <= semialto + radio + 0.35
  if (out.golpe) {
    _dif.set(dx, 0, dz)
    if (_dif.lengthSq() < 1e-6) _dif.set(0, 0, 1)
    out.normal.copy(_dif).normalize()
    out.punto.set(p.x, p.y + semialto, p.z).addScaledVector(out.normal, KART.radioColision)
  }
  return out
}

// ---------------------------------------------------------------------------
// Doble de PistaRuntime: un óvalo plano con muros a los costados
// ---------------------------------------------------------------------------

/** Crea una pista falsa: circuito circular de radio `radio`, ancho fijo. */
export function pistaFalsa({ radio = 120, semiancho = 11, vueltas = 3, cajas = 6 } = {}) {
  const longitud = 2 * Math.PI * radio
  const _p = new THREE.Vector3()
  const _t = new THREE.Vector3()
  const _n = new THREE.Vector3(0, 1, 0)

  const puntoEn = (s, out) => {
    const a = (s / radio) % (Math.PI * 2)
    const res = out || { posicion: new THREE.Vector3(), tangente: new THREE.Vector3(), normal: new THREE.Vector3(), ancho: semiancho }
    res.posicion.set(Math.cos(a) * radio, 0, Math.sin(a) * radio)
    res.tangente.set(-Math.sin(a), 0, Math.cos(a))
    res.normal.set(0, 1, 0)
    res.ancho = semiancho
    return res
  }

  const azar = rng(7)
  const cajasItem = []
  for (let i = 0; i < cajas; i++) {
    const p = puntoEn((i / cajas) * longitud, { posicion: _p.clone(), tangente: _t.clone(), normal: _n.clone(), ancho: semiancho })
    cajasItem.push({ posicion: p.posicion.clone().setY(0.9) })
  }

  return {
    id: 'falsa',
    nombre: 'Pista de prueba',
    vueltas,
    longitud,
    grupo: new THREE.Group(),
    limites: new THREE.Box3(new THREE.Vector3(-radio * 2, -10, -radio * 2), new THREE.Vector3(radio * 2, 40, radio * 2)),
    muestrear(x, z, out) {
      const d = Math.hypot(x, z)
      const res = out || { normal: new THREE.Vector3() }
      res.y = 0
      if (!res.normal) res.normal = new THREE.Vector3()
      res.normal.set(0, 1, 0)
      res.distanciaCentro = Math.abs(d - radio)
      res.anchoAqui = semiancho
      res.enPista = res.distanciaCentro <= semiancho
      res.tipo = res.enPista ? 'asfalto' : 'cesped'
      return res
    },
    progreso(x, z, out) {
      const a = Math.atan2(z, x)
      const s = ((a + Math.PI * 2) % (Math.PI * 2)) * radio
      const res = out || { tangente: new THREE.Vector3() }
      res.s = s
      res.t = s / longitud
      res.lateral = Math.hypot(x, z) - radio
      if (!res.tangente) res.tangente = new THREE.Vector3()
      res.tangente.set(-Math.sin(a), 0, Math.cos(a))
      res.indice = Math.floor(res.t * 64)
      return res
    },
    puntoEn,
    colisionar(posicion, radioEsfera, out) {
      const res = out || { correccion: new THREE.Vector3(), normal: new THREE.Vector3() }
      if (!res.correccion) res.correccion = new THREE.Vector3()
      if (!res.normal) res.normal = new THREE.Vector3()
      res.golpe = false
      res.correccion.set(0, 0, 0)
      res.normal.set(0, 0, 0)
      const d = Math.hypot(posicion.x, posicion.z) || 1e-6
      const lateral = d - radio
      const limite = semiancho - radioEsfera
      if (Math.abs(lateral) > limite) {
        const signo = Math.sign(lateral)
        res.golpe = true
        res.normal.set(-(posicion.x / d) * signo, 0, -(posicion.z / d) * signo)
        const exceso = Math.abs(lateral) - limite
        res.correccion.copy(res.normal).multiplyScalar(exceso)
      }
      return res
    },
    puestosSalida: Array.from({ length: 8 }, (_, i) => ({
      posicion: new THREE.Vector3(radio, 0, i * 4),
      rotacionY: 0,
    })),
    cajasItem,
    monedas: [],
    puntosControl: 8,
    checkpointEn: (s) => Math.floor((s / longitud) * 8),
    actualizar() {},
    destruir() {},
    _azar: azar,
  }
}

// ---------------------------------------------------------------------------
// Doble de FisicaKart
// ---------------------------------------------------------------------------

/** Crea un corredor falso con la forma que espera `SistemaItems`. */
export function corredorFalso(id, { personaje = 'jp', puesto = 1, s = 0, pista = null, esLocal = false } = {}) {
  const posicion = new THREE.Vector3()
  if (pista) pista.puntoEn(s).posicion && posicion.copy(pista.puntoEn(s).posicion)
  const estado = {
    id,
    personaje,
    posicion,
    quaternion: new THREE.Quaternion(),
    velocidad: new THREE.Vector3(),
    rapidez: 20,
    rapidezMax: VELOCIDAD.base,
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
    progreso: { s, t: 0, lateral: 0, tangente: new THREE.Vector3(0, 0, 1), indice: 0 },
    vuelta: 1,
    puesto,
    terminado: false,
    tiempoTotal: 0,
    tiempos: [],
    monedas: 0,
  }
  const registro = []
  const fisica = {
    estado,
    registro,
    colocarEn(p, rotY) {
      estado.posicion.copy(p)
      estado.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotY || 0)
    },
    step() {},
    darTurbo(seg, fuerza = 1) {
      estado.turbo = Math.max(estado.turbo, seg)
      registro.push(['turbo', seg, fuerza])
    },
    golpear(tipo) {
      registro.push(['golpe', tipo])
      if (tipo === 'giro') estado.girando = 1.05
      else if (tipo === 'aplastar') estado.aplastado = 6.5
      else if (tipo === 'volcar') estado.aturdido = 1.3
      else estado.aturdido = Math.max(estado.aturdido, 0.35)
    },
    aplicarImpulso(v) {
      estado.velocidad.add(v)
    },
    reubicar() {},
  }
  return { id, fisica, estado, esLocal }
}

// ---------------------------------------------------------------------------
// Dobles de FX y Audio: sólo registran lo que se les pide
// ---------------------------------------------------------------------------

export function fxFalso() {
  const llamadas = []
  const anotar = (n) => (...args) => llamadas.push([n, ...args])
  return {
    llamadas,
    chispasDerrape: anotar('chispasDerrape'),
    polvo: anotar('polvo'),
    estela: anotar('estela'),
    impacto: anotar('impacto'),
    ondaExpansiva: anotar('ondaExpansiva'),
    moneda: anotar('moneda'),
    humo: anotar('humo'),
    lineasVelocidad: anotar('lineasVelocidad'),
    sacudirCamara: anotar('sacudirCamara'),
    destello: anotar('destello'),
    actualizar() {},
    destruir() {},
  }
}

export function audioFalso() {
  const llamadas = []
  return {
    llamadas,
    desbloquear() {},
    motor() {},
    sonido(nombre, opciones) {
      llamadas.push([nombre, opciones])
    },
    musica() {},
    volumen() {},
    destruir() {},
  }
}

/** Escena mínima (un Group sirve como contenedor). */
export function escenaFalsa() {
  return new THREE.Scene()
}

export default {
  interseccionEsferaKartRespaldo,
  pistaFalsa,
  corredorFalso,
  fxFalso,
  audioFalso,
  escenaFalsa,
}
