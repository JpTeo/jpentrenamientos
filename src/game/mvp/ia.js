// Conductores de la máquina. Persecución pura sobre el eje de la pista con un
// desvío propio de cada personalidad, frenada anticipada según la curvatura
// que viene, y derrape en las curvas cerradas para ganar mini-turbo.
import * as THREE from 'three'
import { controlVacio } from '../core/Input.js'
import { clamp, damp, deltaAngulo, rng as crearRng } from '../core/utils.js'
import { VELOCIDAD } from '../core/constantes.js'

const PERSONALIDADES = {
  agresivo: { desvio: 0.55, frenada: 0.9, derrape: 1.0, ruido: 0.05, tope: 1.0 },
  prolijo: { desvio: 0.25, frenada: 1.05, derrape: 0.9, ruido: 0.02, tope: 0.98 },
  tramposo: { desvio: -0.4, frenada: 0.95, derrape: 0.95, ruido: 0.04, tope: 0.99 },
  torpe: { desvio: 0.1, frenada: 1.25, derrape: 0.5, ruido: 0.11, tope: 0.94 },
}

const DIFICULTAD = { facil: 0.88, normal: 0.96, dificil: 1.0 }

const _p = { posicion: new THREE.Vector3(), tangente: new THREE.Vector3(), normal: null, ancho: 0 }
const _q = { posicion: new THREE.Vector3(), tangente: new THREE.Vector3(), normal: null, ancho: 0 }
const _frente = new THREE.Vector3()

export class ConductorIA {
  constructor(pista, opciones = {}) {
    this.pista = pista
    this.p = PERSONALIDADES[opciones.personalidad] || PERSONALIDADES.prolijo
    this.factor = DIFICULTAD[opciones.dificultad] || DIFICULTAD.normal
    this.rng = opciones.rng || crearRng(7)
    this.control = controlVacio()
    this.faseRuido = this.rng() * 100
    this.desvio = this.p.desvio * (this.rng() * 0.6 + 0.7)
    this.tiempoTrabado = 0
    this.derrapeRestante = 0
  }

  /**
   * @param {number} dt
   * @param {object} e estado del kart (ver la física)
   * @returns {object} control con la misma forma que el del jugador
   */
  pensar(dt, e) {
    const c = this.control
    const pista = this.pista
    const rapidez = Math.abs(e.rapidez)
    const s = e.progreso.s

    // --- Punto de mira: más lejos cuanto más rápido va ---
    const mira = clamp(9 + rapidez * 0.6, 11, 36)
    pista.puntoEn(s + mira, _p)

    // Desvío lateral: trazada propia + corrección si se fue del asfalto.
    this.faseRuido += dt * 0.7
    const ruido = Math.sin(this.faseRuido * 2.1) * this.p.ruido
    let lateralObjetivo = this.desvio * _p.ancho * 0.45 + ruido * _p.ancho
    if (Math.abs(e.progreso.lateral) > _p.ancho) lateralObjetivo = 0 // volver al centro
    const nx = _p.tangente.z
    const nz = -_p.tangente.x
    const objX = _p.posicion.x + nx * lateralObjetivo
    const objZ = _p.posicion.z + nz * lateralObjetivo

    // --- Error angular hacia el objetivo ---
    _frente.set(0, 0, -1).applyQuaternion(e.quaternion)
    const rumboActual = Math.atan2(_frente.x, _frente.z)
    const rumboObjetivo = Math.atan2(objX - e.posicion.x, objZ - e.posicion.z)
    const error = deltaAngulo(rumboActual, rumboObjetivo)

    // --- Curvatura de lo que viene, para saber a qué velocidad entrar ---
    pista.puntoEn(s + 14, _p)
    pista.puntoEn(s + 44, _q)
    const curva = Math.abs(
      deltaAngulo(
        Math.atan2(_p.tangente.x, _p.tangente.z),
        Math.atan2(_q.tangente.x, _q.tangente.z),
      ),
    )
    // Cuanto más cerrada la curva, menor la velocidad objetivo.
    const tope = VELOCIDAD.base * this.factor * this.p.tope
    const objetivoVel = clamp(tope * (1 - curva * 0.62 * this.p.frenada), tope * 0.42, tope)

    // --- Acelerador y freno ---
    c.acelerar = rapidez < objetivoVel ? 1 : 0.25
    c.frenar = rapidez > objetivoVel * 1.22 ? 0.7 : 0
    if (e.marchaAtras) {
      // Encarado al revés: frenar y girar hasta reencauzar.
      c.acelerar = 0
      c.frenar = 1
    }

    // --- Volante ---
    let giro = clamp(error * 2.1, -1, 1)

    // --- Derrape en curvas cerradas ---
    const quiereDerrape =
      curva > 0.42 * (2 - this.p.derrape) &&
      rapidez > VELOCIDAD.minimaParaDerrapar + 3 &&
      Math.abs(giro) > 0.3
    if (quiereDerrape) this.derrapeRestante = 0.55
    this.derrapeRestante = Math.max(0, this.derrapeRestante - dt)
    const derrapeAntes = c.derrape
    // Sostiene el derrape hasta llegar al nivel que su habilidad le permite.
    const nivelBuscado = this.p.derrape >= 0.95 ? 3 : this.p.derrape >= 0.85 ? 2 : 1
    c.derrape =
      this.derrapeRestante > 0 || (e.derrapando && e.nivelDerrape < nivelBuscado && curva > 0.12)
    c.derrapeAbajo = c.derrape && !derrapeAntes
    // Mientras derrapa, mantener el volante del lado del derrape.
    if (e.derrapando && e.ladoDerrape) {
      giro = clamp(giro + e.ladoDerrape * 0.45, -1, 1)
    }

    c.giro = damp(c.giro, giro, 16, dt)
    c.item = false
    c.mirarAtras = false
    c.pausa = false

    // --- Rescate: si lleva mucho tiempo casi parado, marcha atrás y reencara ---
    if (rapidez < 2.5 && !e.terminado) {
      this.tiempoTrabado += dt
      if (this.tiempoTrabado > 1.6) {
        c.acelerar = 0
        c.frenar = 1
        c.giro = -clamp(error * 2, -1, 1)
        if (this.tiempoTrabado > 3.2) this.tiempoTrabado = 0
      }
    } else {
      this.tiempoTrabado = 0
    }

    return c
  }
}

export default ConductorIA
