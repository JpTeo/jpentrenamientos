// Conductores de la máquina. Persecución pura sobre el eje de la pista con un
// desvío propio de cada personalidad, frenada anticipada según la curvatura
// que viene, y derrape en las curvas cerradas para ganar mini-turbo.
import * as THREE from 'three'
import { controlVacio } from '../core/Input.js'
import { clamp, damp, deltaAngulo, rng as crearRng } from '../core/utils.js'
import { VELOCIDAD } from '../core/constantes.js'

const PERSONALIDADES = {
  agresivo: { desvio: 0.3, frenada: 1.0, derrape: 1.0, ruido: 0.035, tope: 1.0 },
  prolijo: { desvio: 0.18, frenada: 1.1, derrape: 0.9, ruido: 0.015, tope: 0.98 },
  tramposo: { desvio: -0.26, frenada: 1.02, derrape: 0.95, ruido: 0.03, tope: 0.99 },
  torpe: { desvio: 0.1, frenada: 1.3, derrape: 0.5, ruido: 0.08, tope: 0.94 },
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
    this.tiempoVivo = 0
  }

  /**
   * @param {number} dt
   * @param {object} e estado del kart (ver la física)
   * @returns {object} control con la misma forma que el del jugador
   */
  pensar(dt, e) {
    const c = this.control
    this.tiempoVivo += dt
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
    // Si se está yendo ancho, el objetivo se corre hacia adentro en proporción
    // al error: así vuelve a la trazada en vez de seguir derecho al pasto.
    const fuera = Math.abs(e.progreso.lateral) - _p.ancho * 0.75
    if (fuera > 0) lateralObjetivo -= Math.sign(e.progreso.lateral) * Math.min(fuera * 1.6, _p.ancho)
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
    const objetivoVel = clamp(tope * (1 - curva * 0.72 * this.p.frenada), tope * 0.38, tope)

    // --- Acelerador y freno ---
    c.acelerar = rapidez < objetivoVel ? 1 : 0.25
    c.frenar = rapidez > objetivoVel * 1.22 ? 0.7 : 0
    // Encarado al revés: frenar y girar hasta reencauzar. Sólo cuenta si de
    // verdad se está moviendo: parado en la parrilla, `marchaAtras` es ruido.
    if (e.marchaAtras && rapidez > 2) {
      c.acelerar = 0
      c.frenar = 1
    }

    // --- Volante ---
    // El rumbo del kart es `yaw + PI` (su frente es el -Z local) y la física
    // aplica `yaw += -giro * omega * dt`. Para cerrar un error de rumbo
    // positivo hay que pedir giro NEGATIVO: con el signo al revés, la IA se
    // iba de la pista a los dos segundos.
    let giro = clamp(-error * 2.5, -1, 1)

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

    // --- Rescate: si pide acelerador y aun así no avanza, es que está trabado
    // contra algo. Ojo con la largada: ahí todos están a 0 km/h y no por eso
    // hay que mandarlos marcha atrás.
    const pidiendoGas = c.acelerar > 0.5 && c.frenar < 0.5
    if (this.tiempoVivo > 3 && rapidez < 2.5 && pidiendoGas && !e.terminado) {
      this.tiempoTrabado += dt
    } else if (rapidez > 4) {
      this.tiempoTrabado = 0
    }
    if (this.tiempoTrabado > 2) {
      // Marcha atrás corta y volanteo al revés para despegarse del muro.
      c.acelerar = 0
      c.frenar = 1
      c.giro = clamp(error * 2, -1, 1) // al revés que en marcha adelante
      c.derrape = false
      if (this.tiempoTrabado > 3.4) this.tiempoTrabado = 0
    }

    return c
  }
}

export default ConductorIA
