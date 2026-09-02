// Entrada del jugador local: teclado + gamepad, normalizada al contrato de
// control que consume la física. Detecta flancos (recién pulsado / soltado).
import { clamp } from './utils.js'

/** Estado de control neutro. La física siempre recibe un objeto con esta forma. */
export function controlVacio() {
  return {
    acelerar: 0, // 0..1
    frenar: 0, // 0..1
    giro: 0, // -1 (izquierda) .. 1 (derecha)
    derrape: false, // mantenido
    derrapeAbajo: false, // flanco de bajada (este cuadro)
    item: false, // flanco: usar ítem
    mirarAtras: false,
    pausa: false, // flanco
  }
}

const MAPA = {
  acelerar: ['ArrowUp', 'KeyW'],
  frenar: ['ArrowDown', 'KeyS'],
  izquierda: ['ArrowLeft', 'KeyA'],
  derecha: ['ArrowRight', 'KeyD'],
  derrape: ['Space', 'ShiftLeft'],
  item: ['KeyE', 'ControlLeft', 'ShiftRight'],
  mirarAtras: ['KeyC'],
  pausa: ['Escape', 'KeyP'],
}

export class Input {
  constructor(objetivo = window) {
    this.objetivo = objetivo
    this.teclas = new Set()
    this.reciente = new Set()
    this.control = controlVacio()
    this.gamepadIndex = null
    this.giroSuave = 0
    this.habilitado = true

    this._down = (e) => {
      if (!this.habilitado) return
      if (e.repeat) return
      // No robamos el teclado si el foco está en un campo de texto.
      const t = e.target
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return
      this.teclas.add(e.code)
      this.reciente.add(e.code)
      if (Object.values(MAPA).some((l) => l.includes(e.code))) e.preventDefault()
    }
    this._up = (e) => {
      this.teclas.delete(e.code)
    }
    this._blur = () => this.teclas.clear()

    objetivo.addEventListener('keydown', this._down, { passive: false })
    objetivo.addEventListener('keyup', this._up)
    window.addEventListener('blur', this._blur)
  }

  _algunaTecla(lista) {
    for (const k of lista) if (this.teclas.has(k)) return true
    return false
  }
  _algunaReciente(lista) {
    for (const k of lista) if (this.reciente.has(k)) return true
    return false
  }

  /** Lee el estado y devuelve el control de este cuadro. Llamar una vez por cuadro. */
  leer(dt = 1 / 60) {
    const c = this.control
    const antesDerrape = c.derrape

    let acelerar = this._algunaTecla(MAPA.acelerar) ? 1 : 0
    let frenar = this._algunaTecla(MAPA.frenar) ? 1 : 0
    let giroObjetivo = (this._algunaTecla(MAPA.derecha) ? 1 : 0) - (this._algunaTecla(MAPA.izquierda) ? 1 : 0)
    let derrape = this._algunaTecla(MAPA.derrape)
    let item = this._algunaReciente(MAPA.item)
    let mirarAtras = this._algunaTecla(MAPA.mirarAtras)
    const pausa = this._algunaReciente(MAPA.pausa)

    const gp = this._gamepad()
    if (gp) {
      const eje = Math.abs(gp.axes[0]) > 0.15 ? gp.axes[0] : 0
      if (eje) giroObjetivo = clamp(eje, -1, 1)
      const rt = gp.buttons[7] ? gp.buttons[7].value : 0
      const lt = gp.buttons[6] ? gp.buttons[6].value : 0
      if (rt > 0.05) acelerar = Math.max(acelerar, rt)
      if (lt > 0.05) frenar = Math.max(frenar, lt)
      if (gp.buttons[0] && gp.buttons[0].pressed) acelerar = 1
      if (gp.buttons[1] && gp.buttons[1].pressed) frenar = 1
      if (gp.buttons[5] && gp.buttons[5].pressed) derrape = true
      if (gp.buttons[4] && gp.buttons[4].pressed && !this._itemGpAntes) item = true
      this._itemGpAntes = !!(gp.buttons[4] && gp.buttons[4].pressed)
      if (gp.buttons[3] && gp.buttons[3].pressed) mirarAtras = true
      // Dpad
      if (gp.buttons[14] && gp.buttons[14].pressed) giroObjetivo = -1
      if (gp.buttons[15] && gp.buttons[15].pressed) giroObjetivo = 1
    }

    // Suavizado del giro con teclado: da tacto analógico sin gamepad.
    const vel = giroObjetivo === 0 ? 12 : 9
    this.giroSuave += (giroObjetivo - this.giroSuave) * Math.min(1, vel * dt)
    if (Math.abs(this.giroSuave) < 0.004) this.giroSuave = 0

    c.acelerar = acelerar
    c.frenar = frenar
    c.giro = clamp(this.giroSuave, -1, 1)
    c.derrape = derrape
    c.derrapeAbajo = derrape && !antesDerrape
    c.item = item
    c.mirarAtras = mirarAtras
    c.pausa = pausa

    this.reciente.clear()
    return c
  }

  _gamepad() {
    if (!navigator.getGamepads) return null
    const pads = navigator.getGamepads()
    for (const p of pads) if (p && p.connected) return p
    return null
  }

  destruir() {
    this.objetivo.removeEventListener('keydown', this._down)
    this.objetivo.removeEventListener('keyup', this._up)
    window.removeEventListener('blur', this._blur)
    this.teclas.clear()
  }
}

export default Input
