// Motor: renderer, escena, cámara, bucle de paso fijo y post-proceso.
// No sabe nada de karts ni de pistas: sólo orquesta sistemas registrados.
import * as THREE from 'three'

const PASO_FIJO = 1 / 60
const MAX_SUBPASOS = 5

export class Engine {
  /**
   * @param {HTMLElement} contenedor elemento donde se monta el canvas
   * @param {object} opciones
   */
  constructor(contenedor, opciones = {}) {
    this.contenedor = contenedor
    this.opciones = opciones

    this.renderer = new THREE.WebGLRenderer({
      antialias: opciones.antialias !== false,
      powerPreference: 'high-performance',
      stencil: false,
      alpha: false,
    })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, opciones.maxPixelRatio ?? 2))
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = opciones.exposicion ?? 1.05
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap
    this.renderer.domElement.style.display = 'block'
    this.renderer.domElement.style.width = '100%'
    this.renderer.domElement.style.height = '100%'
    this.renderer.domElement.style.touchAction = 'none'
    contenedor.appendChild(this.renderer.domElement)

    this.escena = new THREE.Scene()
    this.camara = new THREE.PerspectiveCamera(
      opciones.fov ?? 62,
      1,
      opciones.near ?? 0.25,
      opciones.far ?? 2600,
    )
    this.camara.position.set(0, 5, 12)

    this.reloj = new THREE.Clock()
    this.acumulador = 0
    this.tiempo = 0
    this.cuadro = 0
    this.corriendo = false
    this.pausado = false

    /** @type {Array<{fixedUpdate?:Function, update?:Function, prioridad?:number}>} */
    this.sistemas = []
    /** Post-proceso opcional: objeto con .render(dt) y .setSize(w,h) */
    this.post = null

    // Métricas simples para el HUD de depuración.
    this.fps = 60
    this._acumFps = 0
    this._cuadrosFps = 0

    this._onResize = () => this.redimensionar()
    window.addEventListener('resize', this._onResize)
    if (window.visualViewport) window.visualViewport.addEventListener('resize', this._onResize)
    this.redimensionar()
  }

  /** Registra un sistema. Menor prioridad = se ejecuta antes. */
  registrar(sistema, prioridad = 0) {
    sistema.prioridad = prioridad
    this.sistemas.push(sistema)
    this.sistemas.sort((a, b) => (a.prioridad ?? 0) - (b.prioridad ?? 0))
    return sistema
  }

  quitar(sistema) {
    const i = this.sistemas.indexOf(sistema)
    if (i >= 0) this.sistemas.splice(i, 1)
  }

  redimensionar() {
    const w = this.contenedor.clientWidth || window.innerWidth
    const h = this.contenedor.clientHeight || window.innerHeight
    if (w === 0 || h === 0) return
    this.ancho = w
    this.alto = h
    this.camara.aspect = w / h
    this.camara.updateProjectionMatrix()
    this.renderer.setSize(w, h, false)
    if (this.post && this.post.setSize) this.post.setSize(w, h)
  }

  iniciar() {
    if (this.corriendo) return
    this.corriendo = true
    this.reloj.start()
    this.renderer.setAnimationLoop(() => this._tick())
  }

  detener() {
    this.corriendo = false
    this.renderer.setAnimationLoop(null)
  }

  _tick() {
    const bruto = this.reloj.getDelta()
    // Cap para evitar el "salto" al volver de una pestaña en segundo plano.
    const dt = Math.min(bruto, 0.1)

    this._acumFps += bruto
    this._cuadrosFps++
    if (this._acumFps >= 0.5) {
      this.fps = this._cuadrosFps / this._acumFps
      this._acumFps = 0
      this._cuadrosFps = 0
    }

    if (!this.pausado) {
      this.acumulador += dt
      let pasos = 0
      while (this.acumulador >= PASO_FIJO && pasos < MAX_SUBPASOS) {
        for (const s of this.sistemas) if (s.fixedUpdate) s.fixedUpdate(PASO_FIJO, this.tiempo)
        this.acumulador -= PASO_FIJO
        this.tiempo += PASO_FIJO
        pasos++
      }
      if (pasos === MAX_SUBPASOS) this.acumulador = 0
    }

    const alpha = this.acumulador / PASO_FIJO
    for (const s of this.sistemas) if (s.update) s.update(dt, alpha, this.tiempo)

    this.cuadro++
    this.render(dt)
  }

  render(dt) {
    if (this.post && this.post.render) this.post.render(dt)
    else this.renderer.render(this.escena, this.camara)
  }

  destruir() {
    this.detener()
    window.removeEventListener('resize', this._onResize)
    if (window.visualViewport) window.visualViewport.removeEventListener('resize', this._onResize)
    for (const s of this.sistemas) if (s.destruir) s.destruir()
    this.sistemas.length = 0
    if (this.post && this.post.dispose) this.post.dispose()
    this.escena.traverse((o) => {
      if (o.geometry) o.geometry.dispose()
      const m = o.material
      if (Array.isArray(m)) m.forEach((mm) => mm && mm.dispose && mm.dispose())
      else if (m && m.dispose) m.dispose()
    })
    this.renderer.dispose()
    if (this.renderer.domElement.parentNode) {
      this.renderer.domElement.parentNode.removeChild(this.renderer.domElement)
    }
  }
}

export const PASO_FIJO_S = PASO_FIJO
export default Engine
