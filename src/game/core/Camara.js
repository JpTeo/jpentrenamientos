// Cámara de persecución al estilo kart arcade: va por detrás y por encima,
// se abre con la velocidad, se inclina en las curvas y sabe hacer planos
// cinematográficos para la presentación y el final.
import * as THREE from 'three'
import { CAMARA, VELOCIDAD } from './constantes.js'
import { clamp, clamp01, damp, lerp, smoothstep, TAU } from './utils.js'

const _obj = new THREE.Vector3()
const _mira = new THREE.Vector3()
const _adelante = new THREE.Vector3()
const _arriba = new THREE.Vector3()
const _derecha = new THREE.Vector3()
const _q = new THREE.Quaternion()
const _e = new THREE.Euler()
const _tmp = new THREE.Vector3()

export const MODO = {
  PERSECUCION: 'persecucion',
  ATRAS: 'atras',
  PRESENTACION: 'presentacion',
  PODIO: 'podio',
  LIBRE: 'libre',
  FOTO: 'foto',
}

export class CamaraCarrera {
  /**
   * @param {THREE.PerspectiveCamera} camara
   * @param {object} pista PistaRuntime (para el plano de presentación)
   */
  constructor(camara, pista) {
    this.camara = camara
    this.pista = pista
    this.modo = MODO.PERSECUCION
    this.objetivo = null // { estado: EstadoKart }

    this.posicion = new THREE.Vector3()
    this.mira = new THREE.Vector3()
    this.arribaSuave = new THREE.Vector3(0, 1, 0)
    this.distancia = CAMARA.distancia
    this.altura = CAMARA.altura
    this.fov = CAMARA.fovBase
    this.balanceo = 0
    this.desfaseLateral = 0

    // Sacudida (la alimenta FX)
    this.sacudidaPos = new THREE.Vector3()
    this.sacudidaRot = new THREE.Vector3()

    this.tiempoPresentacion = 0
    this.duracionPresentacion = 6.5
    this._primerCuadro = true
    this.zoomExtra = 0
  }

  seguir(objetivo) {
    this.objetivo = objetivo
    this._primerCuadro = true
  }

  /** Coloca la cámara instantáneamente detrás del objetivo (sin suavizado). */
  encajar() {
    this._primerCuadro = true
  }

  actualizar(dt, control) {
    switch (this.modo) {
      case MODO.PRESENTACION:
        this._presentacion(dt)
        break
      case MODO.PODIO:
        this._podio(dt)
        break
      case MODO.FOTO:
      case MODO.LIBRE:
        break
      default:
        this._persecucion(dt, control)
    }
    this._aplicarSacudida()
  }

  _persecucion(dt, control = null) {
    const o = this.objetivo
    if (!o) return
    const e = o.estado
    const mirarAtras = this.modo === MODO.ATRAS || (control && control.mirarAtras)

    // Base del kart
    _adelante.set(0, 0, -1).applyQuaternion(e.quaternion)
    _arriba.set(0, 1, 0).applyQuaternion(e.quaternion)
    _derecha.crossVectors(_adelante, _arriba).normalize()

    // Con el kart en derrape la cámara se queda mirando hacia donde AVANZA,
    // no hacia donde apunta el morro: eso es lo que hace legible el derrape.
    const rapidezNorm = clamp01(Math.abs(e.rapidez) / VELOCIDAD.base)
    if (e.velocidad.lengthSq() > 4) {
      _tmp.copy(e.velocidad).setY(0).normalize()
      const mezclaVel = e.derrapando ? 0.55 : 0.2
      _adelante.lerp(_tmp, mezclaVel * clamp01(rapidezNorm * 1.5)).normalize()
    }

    // La distancia y la altura crecen con la velocidad y con el turbo.
    const turbo = e.turbo > 0 ? 1 : 0
    const distObjetivo =
      (mirarAtras ? CAMARA.distanciaAtras : CAMARA.distancia) *
        (1 + rapidezNorm * 0.16 + turbo * 0.1) +
      this.zoomExtra
    const altObjetivo = CAMARA.altura * (1 + rapidezNorm * 0.07)

    this.distancia = damp(this.distancia, distObjetivo, 5, dt)
    this.altura = damp(this.altura, altObjetivo, 5, dt)

    // Posición deseada: detrás y arriba, apoyada en la normal del suelo para
    // que en los peraltes la cámara acompañe la inclinación.
    const signo = mirarAtras ? 1 : -1
    _obj
      .copy(e.posicion)
      .addScaledVector(_adelante, signo * this.distancia)
      .addScaledVector(_arriba, this.altura)

    // Desfase lateral en derrape: la cámara se corre un poco hacia afuera.
    const lateralObjetivo = e.derrapando ? -e.ladoDerrape * 0.85 : 0
    this.desfaseLateral = damp(this.desfaseLateral, lateralObjetivo, 6, dt)
    _obj.addScaledVector(_derecha, this.desfaseLateral * signo)

    // No atravesar el suelo.
    if (this.pista && this.pista.muestrear) {
      const s = this.pista.muestrear(_obj.x, _obj.z)
      const minY = s.y + 1.1
      if (_obj.y < minY) _obj.y = minY
    }

    _mira
      .copy(e.posicion)
      .addScaledVector(_arriba, CAMARA.miraAltura)
      .addScaledVector(_adelante, signo * (2.6 + rapidezNorm * 2.4))

    if (this._primerCuadro) {
      this.posicion.copy(_obj)
      this.mira.copy(_mira)
      this._primerCuadro = false
    } else {
      // Suavizado más firme a alta velocidad para que no se quede atrás.
      const kPos = CAMARA.suavizadoPos * (1 + rapidezNorm * 0.9)
      this.posicion.x = damp(this.posicion.x, _obj.x, kPos, dt)
      this.posicion.y = damp(this.posicion.y, _obj.y, kPos * 0.85, dt)
      this.posicion.z = damp(this.posicion.z, _obj.z, kPos, dt)
      this.mira.x = damp(this.mira.x, _mira.x, CAMARA.suavizadoMira, dt)
      this.mira.y = damp(this.mira.y, _mira.y, CAMARA.suavizadoMira, dt)
      this.mira.z = damp(this.mira.z, _mira.z, CAMARA.suavizadoMira, dt)
    }

    // "Arriba" de la cámara: mezcla entre el mundo y la normal del kart, para
    // que en un peralte fuerte el horizonte se incline (sin marear).
    _tmp.copy(_arriba).lerp(THREE.Object3D.DEFAULT_UP, 0.55).normalize()
    this.arribaSuave.lerp(_tmp, clamp01(dt * 6)).normalize()

    // Balanceo (roll) por el giro: sutil, pero da muchísima sensación.
    const balanceoObjetivo = -e.giroVisual * 0.055 * (0.35 + rapidezNorm * 0.65)
    this.balanceo = damp(this.balanceo, balanceoObjetivo, 6, dt)

    // FOV: se abre con la velocidad y de golpe con el turbo.
    const fovObjetivo =
      CAMARA.fovBase +
      (CAMARA.fovTurbo - CAMARA.fovBase) * clamp01(rapidezNorm * 0.55 + turbo * 0.75) +
      (e.estrella > 0 ? 4 : 0)
    this.fov = damp(this.fov, fovObjetivo, turbo ? 9 : 4.5, dt)

    this.camara.position.copy(this.posicion)
    this.camara.up.copy(this.arribaSuave)
    this.camara.lookAt(this.mira)
    if (this.balanceo) this.camara.rotateZ(this.balanceo)
    if (Math.abs(this.camara.fov - this.fov) > 0.01) {
      this.camara.fov = this.fov
      this.camara.updateProjectionMatrix()
    }
  }

  /** Plano de presentación: vuelo por la recta de meta antes de la largada. */
  _presentacion(dt) {
    this.tiempoPresentacion += dt
    const t = clamp01(this.tiempoPresentacion / this.duracionPresentacion)
    const s = smoothstep(t)
    const o = this.objetivo
    if (!o) return
    const centro = o.estado.posicion

    // Órbita descendente que termina justo detrás del kart.
    const angulo = lerp(-2.4, -Math.PI / 2, s) + Math.PI / 2
    const radio = lerp(19, CAMARA.distancia, s * s)
    const altura = lerp(11, CAMARA.altura, s)

    _e.setFromQuaternion(o.estado.quaternion, 'YXZ')
    const yaw = _e.y
    _obj.set(
      centro.x + Math.sin(yaw + angulo) * radio,
      centro.y + altura,
      centro.z + Math.cos(yaw + angulo) * radio,
    )
    this.posicion.lerp(_obj, clamp01(dt * 6))
    this.mira.lerp(_mira.copy(centro).addScalar(0).setY(centro.y + 1), clamp01(dt * 6))

    this.camara.position.copy(this.posicion)
    this.camara.up.set(0, 1, 0)
    this.camara.lookAt(this.mira)
    this.camara.fov = lerp(48, CAMARA.fovBase, s)
    this.camara.updateProjectionMatrix()

    if (t >= 1) {
      this.modo = MODO.PERSECUCION
      this._primerCuadro = false
    }
  }

  /** Plano de podio: órbita lenta alrededor del ganador. */
  _podio(dt) {
    this.tiempoPresentacion += dt
    const o = this.objetivo
    if (!o) return
    const c = o.estado.posicion
    const a = this.tiempoPresentacion * 0.35
    this.posicion.set(c.x + Math.cos(a) * 8, c.y + 3.4, c.z + Math.sin(a) * 8)
    this.mira.copy(c).setY(c.y + 1.1)
    this.camara.position.copy(this.posicion)
    this.camara.up.set(0, 1, 0)
    this.camara.lookAt(this.mira)
    this.camara.fov = 44
    this.camara.updateProjectionMatrix()
  }

  _aplicarSacudida() {
    if (this.sacudidaPos.lengthSq() > 0) this.camara.position.add(this.sacudidaPos)
    if (this.sacudidaRot.lengthSq() > 0) {
      this.camara.rotateX(this.sacudidaRot.x)
      this.camara.rotateY(this.sacudidaRot.y)
      this.camara.rotateZ(this.sacudidaRot.z)
    }
  }

  /** Coloca la cámara en una pose fija (modo foto / capturas de revisión). */
  fijar(posicion, mira, fov = 55) {
    this.modo = MODO.FOTO
    this.camara.position.copy(posicion)
    this.camara.up.set(0, 1, 0)
    this.camara.lookAt(mira)
    this.camara.fov = fov
    this.camara.updateProjectionMatrix()
  }

  iniciarPresentacion(duracion = 6.5) {
    this.modo = MODO.PRESENTACION
    this.duracionPresentacion = duracion
    this.tiempoPresentacion = 0
    const o = this.objetivo
    if (o) {
      _e.setFromQuaternion(o.estado.quaternion, 'YXZ')
      this.posicion.set(
        o.estado.posicion.x + Math.sin(_e.y - 2.4) * 19,
        o.estado.posicion.y + 11,
        o.estado.posicion.z + Math.cos(_e.y - 2.4) * 19,
      )
      this.mira.copy(o.estado.posicion)
    }
  }

  iniciarPodio() {
    this.modo = MODO.PODIO
    this.tiempoPresentacion = 0
  }
}

export const TAU_CAMARA = TAU
export default CamaraCarrera
