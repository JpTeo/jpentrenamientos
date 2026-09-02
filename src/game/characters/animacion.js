// Animación procedural de personajes y karts: sin esqueletos, sin clips.
// Todo sale de muelles, osciladores y un poco de cinemática inversa.
//
// La regla de oro es que nada se anima "de golpe": todo pasa por un muelle o
// por `damp`, así el movimiento tiene peso y el pelo llega siempre un cuadro
// tarde (que es exactamente lo que hace que se vea vivo).
import * as THREE from 'three'
import { clamp, clamp01, damp, lerp, TAU } from '../core/utils.js'

// ---------------------------------------------------------------------------
// Muelles
// ---------------------------------------------------------------------------

/** Muelle amortiguado de un solo valor. `paso(dt, objetivo)` devuelve el valor. */
export class Muelle {
  constructor(valor = 0, rigidez = 120, amortiguacion = 16) {
    this.valor = valor
    this.velocidad = 0
    this.rigidez = rigidez
    this.amortiguacion = amortiguacion
  }

  paso(dt, objetivo) {
    const h = Math.min(dt, 1 / 30)
    this.velocidad += (objetivo - this.valor) * this.rigidez * h
    this.velocidad *= Math.exp(-this.amortiguacion * h)
    this.valor += this.velocidad * h
    return this.valor
  }

  /** Empujón instantáneo (aterrizajes, golpes). */
  impulso(v) {
    this.velocidad += v
  }

  fijar(v) {
    this.valor = v
    this.velocidad = 0
  }
}

/** Tres muelles en paralelo, para posiciones y rotaciones. */
export class MuelleVec {
  constructor(rigidez = 120, amortiguacion = 16) {
    this.valor = new THREE.Vector3()
    this.velocidad = new THREE.Vector3()
    this.rigidez = rigidez
    this.amortiguacion = amortiguacion
  }

  paso(dt, objetivo) {
    const h = Math.min(dt, 1 / 30)
    const k = this.rigidez * h
    this.velocidad.x += (objetivo.x - this.valor.x) * k
    this.velocidad.y += (objetivo.y - this.valor.y) * k
    this.velocidad.z += (objetivo.z - this.valor.z) * k
    this.velocidad.multiplyScalar(Math.exp(-this.amortiguacion * h))
    this.valor.addScaledVector(this.velocidad, h)
    return this.valor
  }
}

/**
 * Inercia de accesorios: el pelo, la cola y los mechones siguen a la cabeza
 * con retardo. Se le pasa la rotación objetivo (la de la cabeza) y devuelve
 * el desfase que hay que aplicarle al mechón.
 */
export class InerciaMechon {
  constructor(factor = 1, rigidez = 150, amortiguacion = 13) {
    this.factor = factor
    this.x = new Muelle(0, rigidez, amortiguacion)
    this.y = new Muelle(0, rigidez, amortiguacion)
    this.z = new Muelle(0, rigidez, amortiguacion)
  }

  aplicar(dt, objeto, objetivoX, objetivoY, objetivoZ) {
    const f = this.factor
    objeto.rotation.x = this.x.paso(dt, objetivoX * f)
    objeto.rotation.y = this.y.paso(dt, objetivoY * f)
    objeto.rotation.z = this.z.paso(dt, objetivoZ * f)
  }
}

// ---------------------------------------------------------------------------
// Cinemática inversa de dos huesos
// ---------------------------------------------------------------------------

const _dir = new THREE.Vector3()
const _h = new THREE.Vector3()
const _q = new THREE.Quaternion()
const _qRoll = new THREE.Quaternion()

/**
 * Resuelve una cadena hombro→codo→mano (o cadera→rodilla→pie).
 * Los huesos cuelgan sobre su -Y local y el codo dobla sobre su X local.
 *
 * @param {THREE.Object3D} raiz     articulación superior (hombro / cadera)
 * @param {THREE.Object3D} medio    articulación media (codo / rodilla)
 * @param {number} l1               largo del hueso superior
 * @param {number} l2               largo del hueso inferior
 * @param {THREE.Vector3} objetivo  destino, relativo a `raiz`, en el espacio del padre
 * @param {number} polo             giro alrededor del eje raíz→objetivo (abre codos)
 * @param {number} signo            +1 codo hacia adelante, -1 hacia atrás (rodillas)
 */
export function resolverIK2(raiz, medio, l1, l2, objetivo, polo = 0, signo = 1) {
  _dir.copy(objetivo)
  let d = _dir.length()
  if (d < 1e-5) return
  const dmin = Math.abs(l1 - l2) + 1e-4
  const dmax = l1 + l2 - 1e-4
  d = clamp(d, dmin, dmax)
  _dir.normalize()

  const cosB = clamp((d * d - l1 * l1 - l2 * l2) / (2 * l1 * l2), -1, 1)
  const b = Math.acos(cosB) // 0 = extendido
  const senB = Math.sin(b)

  _h.set(0, -(l1 + l2 * cosB), -l2 * senB * signo).normalize()
  _q.setFromUnitVectors(_h, _dir)
  if (polo) {
    _qRoll.setFromAxisAngle(_dir, polo)
    _q.premultiply(_qRoll)
  }
  raiz.quaternion.copy(_q)
  medio.rotation.set(b * signo, 0, 0)
}

// ---------------------------------------------------------------------------
// Parpadeo
// ---------------------------------------------------------------------------

/** Parpadeo con temporizador aleatorio: devuelve 0 (abierto) .. 1 (cerrado). */
export class Parpadeo {
  constructor(azar = Math.random) {
    this.azar = azar
    this.espera = 0.6 + azar() * 3.2
    this.t = 0
    this.cerrando = false
    this.cierre = 0
    this.doble = false
  }

  paso(dt) {
    this.t += dt
    if (!this.cerrando) {
      if (this.t >= this.espera) {
        this.cerrando = true
        this.t = 0
        this.doble = this.azar() < 0.22
      }
    } else {
      // 0.07 s cerrando, 0.09 s abriendo.
      const total = 0.16
      const f = this.t / total
      this.cierre = f < 0.44 ? f / 0.44 : 1 - (f - 0.44) / 0.56
      if (this.t >= total) {
        if (this.doble) {
          this.doble = false
          this.t = 0
        } else {
          this.cerrando = false
          this.cierre = 0
          this.t = 0
          this.espera = 1.1 + this.azar() * 3.6
        }
      }
    }
    return clamp01(this.cierre)
  }

  /** Fuerza un parpadeo ya (susto, golpe). */
  disparar() {
    this.cerrando = true
    this.t = 0
  }
}

// ---------------------------------------------------------------------------
// Ayudas de pose
// ---------------------------------------------------------------------------

/** Squash & stretch conservando volumen: `f` > 1 estira en Y. */
export function estirar(objeto, f, base = 1) {
  const inv = 1 / Math.sqrt(Math.max(0.05, f))
  objeto.scale.set(base * inv, base * f, base * inv)
}

/** Oscilador suave con dos armónicos (respiración, ralentí del motor). */
export function vaiven(t, frecuencia, amplitud = 1) {
  return (Math.sin(t * frecuencia) * 0.75 + Math.sin(t * frecuencia * 1.93 + 1.1) * 0.25) * amplitud
}

/** Ruido barato 1D determinista para temblores (aturdido, motor). */
export function tembleque(t, semilla = 0) {
  return (
    Math.sin(t * 37.1 + semilla) * 0.5 +
    Math.sin(t * 61.7 + semilla * 2.3) * 0.3 +
    Math.sin(t * 91.3 + semilla * 5.1) * 0.2
  )
}

const _colorAux = new THREE.Color()

/**
 * Pulso arcoíris para el estado estrella. Recibe materiales ya clonados por
 * instancia (ver `adoptarMateriales` en materiales.js).
 */
export function pulsoArcoiris(materiales, t, intensidad = 1) {
  if (!materiales) return
  const h = (t * 0.9) % 1
  const brillo = 0.55 + 0.45 * Math.sin(t * 14)
  _colorAux.setHSL(h, 0.95, 0.55)
  for (const m of materiales) {
    if (!m.emissive) continue
    m.emissive.copy(_colorAux)
    m.emissiveIntensity = brillo * 1.5 * intensidad
  }
}

/** Devuelve los materiales adoptados a su estado apagado. */
export function apagarEmisivo(materiales) {
  if (!materiales) return
  for (const m of materiales) {
    if (!m.emissive) continue
    m.emissive.setRGB(0, 0, 0)
    m.emissiveIntensity = m.userData.emisivoBase ?? 1
  }
}

// ---------------------------------------------------------------------------
// Nivel de detalle
// ---------------------------------------------------------------------------

/**
 * Apaga detalles chicos según el nivel: 0 = todo, 1 = sin contornos ni
 * detalles finos, 2 = sólo la silueta. Se apoya en `userData.detalle`.
 */
export function aplicarLODEn(raiz, nivel) {
  // `detalle` 1 = detalle medio (contornos), 2 = detalle fino (brillos, calcos).
  // Lo que no declara `detalle` es silueta y se ve siempre.
  const umbral = nivel <= 0 ? 3 : nivel === 1 ? 2 : 1
  raiz.traverse((o) => {
    const d = o.userData.detalle
    if (d === undefined) return
    o.visible = d < umbral
  })
}

// ---------------------------------------------------------------------------
// Estado visual normalizado
// ---------------------------------------------------------------------------

/** Rellena los campos que falten en `vis` para no tener que chequear nada. */
export const VIS_VACIO = Object.freeze({
  giro: 0,
  rapidez: 0,
  rapidezNorm: 0,
  derrapando: false,
  nivelDerrape: 0,
  turbo: 0,
  enSuelo: true,
  aturdido: 0,
  girando: 0,
  aplastado: 0,
  estrella: 0,
  vueltasRueda: 0,
  puesto: 1,
  terminado: false,
  festejo: false,
  dt: 1 / 60,
})

export function normalizarVis(vis) {
  if (!vis) return VIS_VACIO
  if (vis.__normalizado) return vis
  for (const clave in VIS_VACIO) {
    if (vis[clave] === undefined) vis[clave] = VIS_VACIO[clave]
  }
  return vis
}

/**
 * Postura según el puesto: primero va confiado (pecho afuera, mentón alto),
 * último va encogido. Devuelve -1 (encogido) .. 1 (confiado).
 */
export function actitudPorPuesto(puesto, total = 8) {
  if (!puesto) return 0
  const t = clamp01((puesto - 1) / Math.max(1, total - 1))
  return 1 - t * 2
}

export { clamp, clamp01, damp, lerp, TAU }

export default {
  Muelle,
  MuelleVec,
  InerciaMechon,
  Parpadeo,
  resolverIK2,
  estirar,
  vaiven,
  tembleque,
  pulsoArcoiris,
  aplicarLODEn,
  normalizarVis,
  actitudPorPuesto,
}
