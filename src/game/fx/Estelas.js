// Estelas de turbo (cintas), marcas de derrape sobre el asfalto y marcas de
// neumático fuera de pista.
//
// Todo está poolizado: las cintas son mallas de tamaño fijo con un buffer
// circular de muestras, y las marcas comparten una única geometría con un
// anillo de cuadriláteros. Nada se crea dentro de `actualizar`.
import * as THREE from 'three'
import { clamp, clamp01, damp } from '../core/utils.js'
import { PALETA } from '../assets/paleta.js'

const ARRIBA = new THREE.Vector3(0, 1, 0)

/** Colores de la estela según el nivel de mini-turbo. */
export const COLORES_ESTELA = [
  { cabeza: 0xffffff, cola: 0x2fb8ff },
  { cabeza: 0xbde9ff, cola: PALETA.turboAzul },
  { cabeza: 0xfff0c0, cola: PALETA.turboNaranja },
  { cabeza: 0xffd8f6, cola: PALETA.turboRosa },
]

const VERT_MARCAS = /* glsl */ `
  uniform float uTiempo;
  attribute float aNacimiento;
  attribute float aVida;
  attribute float aBorde;      // -1 borde, 0 centro, 1 borde
  attribute float aOpacidad;
  attribute vec3 aColor;
  varying vec4 vColor;

  void main() {
    float edad = uTiempo - aNacimiento;
    float vivo = step(0.0, edad) * step(edad, aVida);
    float u = aVida > 0.0 ? edad / aVida : 1.0;
    float desvanecer = 1.0 - smoothstep(0.45, 1.0, u);
    float aparecer = smoothstep(0.0, 0.06, u);
    float lateral = 1.0 - abs(aBorde);
    vColor = vec4(aColor, aOpacidad * lateral * desvanecer * aparecer * vivo);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const FRAG_MARCAS = /* glsl */ `
  varying vec4 vColor;
  void main() {
    if (vColor.a < 0.005) discard;
    gl_FragColor = vColor;
  }
`

/**
 * Cinta que sigue a un kart. Buffer circular de muestras, tres columnas de
 * vértices (borde / centro / borde) para que el canto quede difuminado.
 */
export class Cinta {
  constructor({ segmentos = 26, ancho = 0.5, duracion = 0.42, paso = 0.32 } = {}) {
    this.N = segmentos + 1
    this.ancho = ancho
    this.duracion = duracion
    this.paso = paso
    this.activa = false
    this.intensidad = 0
    this.arcoiris = false

    const filas = this.N
    const verts = filas * 3
    this.posiciones = new Float32Array(verts * 3)
    this.colores = new Float32Array(verts * 4)

    const indices = new Uint16Array((filas - 1) * 2 * 6)
    let k = 0
    for (let i = 0; i < filas - 1; i++) {
      for (let c = 0; c < 2; c++) {
        const a = i * 3 + c
        const b = i * 3 + c + 1
        const d = (i + 1) * 3 + c
        const e = (i + 1) * 3 + c + 1
        indices[k++] = a
        indices[k++] = d
        indices[k++] = e
        indices[k++] = a
        indices[k++] = e
        indices[k++] = b
      }
    }

    this.geometria = new THREE.BufferGeometry()
    this.atrPos = new THREE.BufferAttribute(this.posiciones, 3).setUsage(THREE.DynamicDrawUsage)
    this.atrCol = new THREE.BufferAttribute(this.colores, 4).setUsage(THREE.DynamicDrawUsage)
    this.geometria.setAttribute('position', this.atrPos)
    this.geometria.setAttribute('color', this.atrCol)
    this.geometria.setIndex(new THREE.BufferAttribute(indices, 1))
    this.geometria.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6)

    this.material = new THREE.MeshBasicMaterial({
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    })
    this.malla = new THREE.Mesh(this.geometria, this.material)
    this.malla.frustumCulled = false
    this.malla.renderOrder = 8
    this.malla.matrixAutoUpdate = false
    this.malla.visible = false

    // Buffer circular de muestras.
    this.muestras = new Float32Array(this.N * 3)
    this.edades = new Float32Array(this.N)
    this.cuenta = 0
    this.cabeza = 0

    this.colorCabeza = new THREE.Color(0xffffff)
    this.colorCola = new THREE.Color(PALETA.turboAzul)

    this._tmpA = new THREE.Vector3()
    this._tmpB = new THREE.Vector3()
    this._lado = new THREE.Vector3()
    this._tan = new THREE.Vector3()
    this._col = new THREE.Color()
  }

  /** Configura los colores de la cinta a partir del nivel (0..3) o de un hex. */
  configurarColor(color) {
    if (typeof color === 'number' && Number.isInteger(color) && color >= 0 && color <= 3) {
      this.colorCabeza.set(COLORES_ESTELA[color].cabeza)
      this.colorCola.set(COLORES_ESTELA[color].cola)
      this.arcoiris = false
    } else if (color === 'arcoiris') {
      this.arcoiris = true
    } else if (color != null) {
      this.colorCabeza.set(color)
      this.colorCola.copy(this.colorCabeza).multiplyScalar(0.55)
      this.arcoiris = false
    }
  }

  _empujar(x, y, z) {
    this.cabeza = (this.cabeza + 1) % this.N
    const i = this.cabeza * 3
    this.muestras[i] = x
    this.muestras[i + 1] = y
    this.muestras[i + 2] = z
    this.edades[this.cabeza] = 0
    if (this.cuenta < this.N) this.cuenta++
  }

  /** Reinicia la cinta en una posición (al activarla). */
  reiniciar(pos) {
    this.cuenta = 0
    this.cabeza = 0
    for (let i = 0; i < this.N; i++) {
      this.muestras[i * 3] = pos.x
      this.muestras[i * 3 + 1] = pos.y
      this.muestras[i * 3 + 2] = pos.z
      this.edades[i] = this.duracion
    }
    this.cuenta = 1
    this.edades[0] = 0
  }

  /**
   * @param {number} dt
   * @param {THREE.Vector3|null} pos posición actual del kart (o null si no hay)
   */
  actualizar(dt, pos, tiempo) {
    for (let i = 0; i < this.N; i++) this.edades[i] += dt
    this.intensidad = damp(this.intensidad, this.activa ? 1 : 0, 9, dt)

    if (pos) {
      if (this.cuenta === 0) this.reiniciar(pos)
      const ic = this.cabeza * 3
      const dx = pos.x - this.muestras[ic]
      const dy = pos.y - this.muestras[ic + 1]
      const dz = pos.z - this.muestras[ic + 2]
      const d2 = dx * dx + dy * dy + dz * dz
      if (d2 > this.paso * this.paso) this._empujar(pos.x, pos.y, pos.z)
      else {
        // La punta sigue pegada al kart entre muestras.
        this.muestras[ic] = pos.x
        this.muestras[ic + 1] = pos.y
        this.muestras[ic + 2] = pos.z
      }
    }

    if (this.intensidad < 0.01 && !this.activa) {
      this.malla.visible = false
      return
    }
    this.malla.visible = true
    this._construir(tiempo)
  }

  _construir(tiempo) {
    const N = this.N
    const P = this.posiciones
    const C = this.colores
    const primero = (this.cabeza - (this.cuenta - 1) + N * 2) % N

    for (let fila = 0; fila < N; fila++) {
      // Filas sin muestra se pegan a la más vieja con alfa 0.
      const usable = fila >= N - this.cuenta
      const j = usable ? fila - (N - this.cuenta) : 0
      const idx = (primero + j) % N
      const i3 = idx * 3
      const px = this.muestras[i3]
      const py = this.muestras[i3 + 1]
      const pz = this.muestras[i3 + 2]

      // Tangente por diferencias con la muestra siguiente (o la anterior).
      const jSig = Math.min(j + 1, this.cuenta - 1)
      const jAnt = Math.max(j - 1, 0)
      const iS = ((primero + jSig) % N) * 3
      const iA = ((primero + jAnt) % N) * 3
      this._tan.set(
        this.muestras[iS] - this.muestras[iA],
        this.muestras[iS + 1] - this.muestras[iA + 1],
        this.muestras[iS + 2] - this.muestras[iA + 2],
      )
      if (this._tan.lengthSq() < 1e-8) this._tan.set(0, 0, 1)
      this._tan.normalize()
      this._lado.copy(this._tan).cross(ARRIBA)
      if (this._lado.lengthSq() < 1e-8) this._lado.set(1, 0, 0)
      this._lado.normalize()

      const t = this.cuenta > 1 ? j / (this.cuenta - 1) : 1 // 0 = cola, 1 = punta
      const edad = clamp01(this.edades[idx] / this.duracion)
      const cono = (0.28 + 0.72 * t) * this.ancho * (0.55 + 0.45 * this.intensidad)
      const alfa = usable ? (1 - edad) * (0.15 + 0.85 * t) * this.intensidad : 0

      if (this.arcoiris) {
        this._col.setHSL((t * 0.85 + tiempo * 0.55) % 1, 1, 0.6)
      } else {
        this._col.copy(this.colorCola).lerp(this.colorCabeza, t * t)
      }

      const v = fila * 3
      const o0 = v * 3
      const o1 = (v + 1) * 3
      const o2 = (v + 2) * 3
      P[o0] = px - this._lado.x * cono
      P[o0 + 1] = py - this._lado.y * cono
      P[o0 + 2] = pz - this._lado.z * cono
      P[o1] = px
      P[o1 + 1] = py
      P[o1 + 2] = pz
      P[o2] = px + this._lado.x * cono
      P[o2 + 1] = py + this._lado.y * cono
      P[o2 + 2] = pz + this._lado.z * cono

      for (let c = 0; c < 3; c++) {
        const oc = (v + c) * 4
        C[oc] = this._col.r
        C[oc + 1] = this._col.g
        C[oc + 2] = this._col.b
        C[oc + 3] = c === 1 ? alfa : 0
      }
    }

    this.atrPos.needsUpdate = true
    this.atrCol.needsUpdate = true
  }

  destruir() {
    this.geometria.dispose()
    this.material.dispose()
    if (this.malla.parent) this.malla.parent.remove(this.malla)
  }
}

/**
 * Pool de tiras planas proyectadas sobre la pista (derrape y neumático).
 * Se desvanecen solas: la edad se calcula en el shader con `uTiempo`.
 */
export class MarcasSuelo {
  constructor({ maximo = 900, vida = 6, alturaSobreSuelo = 0.018 } = {}) {
    this.maximo = maximo
    this.vida = vida
    this.altura = alturaSobreSuelo
    this.tiempo = 0
    this._cursor = 0
    this._marca = 0

    const verts = maximo * 6 // 2 filas x 3 columnas
    this.pos = new Float32Array(verts * 3)
    this.nacimiento = new Float32Array(verts)
    this.vidas = new Float32Array(verts)
    this.bordes = new Float32Array(verts)
    this.opacidades = new Float32Array(verts)
    this.colores = new Float32Array(verts * 3)

    for (let m = 0; m < maximo; m++) {
      for (let f = 0; f < 2; f++) {
        for (let c = 0; c < 3; c++) {
          this.bordes[m * 6 + f * 3 + c] = c - 1
        }
      }
      for (let v = 0; v < 6; v++) this.vidas[m * 6 + v] = vida
    }

    const idx = new Uint32Array(maximo * 12)
    let k = 0
    for (let m = 0; m < maximo; m++) {
      const base = m * 6
      for (let c = 0; c < 2; c++) {
        const a = base + c
        const b = base + c + 1
        const d = base + 3 + c
        const e = base + 3 + c + 1
        idx[k++] = a
        idx[k++] = d
        idx[k++] = e
        idx[k++] = a
        idx[k++] = e
        idx[k++] = b
      }
    }

    this.geometria = new THREE.BufferGeometry()
    this.atrPos = new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage)
    this.atrNac = new THREE.BufferAttribute(this.nacimiento, 1).setUsage(THREE.DynamicDrawUsage)
    this.atrVida = new THREE.BufferAttribute(this.vidas, 1).setUsage(THREE.DynamicDrawUsage)
    this.atrBorde = new THREE.BufferAttribute(this.bordes, 1)
    this.atrOpac = new THREE.BufferAttribute(this.opacidades, 1).setUsage(THREE.DynamicDrawUsage)
    this.atrColor = new THREE.BufferAttribute(this.colores, 3).setUsage(THREE.DynamicDrawUsage)
    this.geometria.setAttribute('position', this.atrPos)
    this.geometria.setAttribute('aNacimiento', this.atrNac)
    this.geometria.setAttribute('aVida', this.atrVida)
    this.geometria.setAttribute('aBorde', this.atrBorde)
    this.geometria.setAttribute('aOpacidad', this.atrOpac)
    this.geometria.setAttribute('aColor', this.atrColor)
    this.geometria.setIndex(new THREE.BufferAttribute(idx, 1))
    this.geometria.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6)
    this.geometria.setDrawRange(0, 0)

    this.material = new THREE.ShaderMaterial({
      uniforms: { uTiempo: { value: 0 } },
      vertexShader: VERT_MARCAS,
      fragmentShader: FRAG_MARCAS,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -6,
      polygonOffsetUnits: -12,
      toneMapped: false,
    })

    this.malla = new THREE.Mesh(this.geometria, this.material)
    this.malla.frustumCulled = false
    this.malla.renderOrder = 2
    this.malla.matrixAutoUpdate = false

    this._col = new THREE.Color()
    this._lado = new THREE.Vector3()
    this._tan = new THREE.Vector3()
    /** @type {Map<string, {x:number,y:number,z:number,valido:boolean}>} */
    this._ultima = new Map()
    this._rango = { start: 0, count: 0 }
  }

  /**
   * Añade una tira entre dos puntos del suelo.
   * @param {THREE.Vector3} desde
   * @param {THREE.Vector3} hasta
   */
  agregar(desde, hasta, ancho, color, opacidad, vida) {
    this._tan.subVectors(hasta, desde)
    if (this._tan.lengthSq() < 1e-6) return
    this._tan.normalize()
    this._lado.copy(this._tan).cross(ARRIBA)
    if (this._lado.lengthSq() < 1e-8) return
    this._lado.normalize().multiplyScalar(ancho * 0.5)

    const m = this._cursor
    this._cursor = (m + 1) % this.maximo
    if (m + 1 > this._marca) this._marca = m + 1
    this._col.set(color)
    const v = m * 6
    const dur = vida ?? this.vida

    for (let f = 0; f < 2; f++) {
      const p = f === 0 ? desde : hasta
      for (let c = 0; c < 3; c++) {
        const iv = v + f * 3 + c
        const s = c - 1
        this.pos[iv * 3] = p.x + this._lado.x * s
        this.pos[iv * 3 + 1] = p.y + this.altura
        this.pos[iv * 3 + 2] = p.z + this._lado.z * s
        this.nacimiento[iv] = this.tiempo
        this.vidas[iv] = dur
        this.opacidades[iv] = opacidad
        this.colores[iv * 3] = this._col.r
        this.colores[iv * 3 + 1] = this._col.g
        this.colores[iv * 3 + 2] = this._col.b
      }
    }

    this._subir(v, 6)
  }

  _subir(inicio, cant) {
    const r = this._rango
    r.start = inicio * 3
    r.count = cant * 3
    this.atrPos.updateRanges.length = 0
    this.atrPos.updateRanges.push(r)
    this.atrPos.needsUpdate = true
    this.atrColor.updateRanges.length = 0
    this.atrColor.updateRanges.push(r)
    this.atrColor.needsUpdate = true
    // Los atributos escalares se suben enteros: son pequeños (1 float/vértice).
    this.atrNac.needsUpdate = true
    this.atrVida.needsUpdate = true
    this.atrOpac.needsUpdate = true
  }

  /**
   * Deja marca de una rueda siguiendo su recorrido. Emite un tramo nuevo sólo
   * cuando la rueda avanzó `paso` metros, para no llenar el pool.
   */
  rastro(clave, posicion, ancho, color, opacidad, paso = 1.1, vida) {
    let u = this._ultima.get(clave)
    if (!u) {
      u = { x: posicion.x, y: posicion.y, z: posicion.z, valido: false }
      this._ultima.set(clave, u)
    }
    const dx = posicion.x - u.x
    const dy = posicion.y - u.y
    const dz = posicion.z - u.z
    const d2 = dx * dx + dy * dy + dz * dz
    if (!u.valido) {
      u.x = posicion.x
      u.y = posicion.y
      u.z = posicion.z
      u.valido = true
      return
    }
    if (d2 < paso * paso) return
    if (d2 > 64) {
      // Teletransporte / reubicación: no dibujamos la tira gigante.
      u.x = posicion.x
      u.y = posicion.y
      u.z = posicion.z
      return
    }
    this._a.set(u.x, u.y, u.z)
    this.agregar(this._a, posicion, ancho, color, opacidad, vida)
    u.x = posicion.x
    u.y = posicion.y
    u.z = posicion.z
  }

  /** Corta el rastro de una rueda (deja de derrapar). */
  cortar(clave) {
    const u = this._ultima.get(clave)
    if (u) u.valido = false
  }

  actualizar(dt) {
    this.tiempo += dt
    this.material.uniforms.uTiempo.value = this.tiempo
    this.geometria.setDrawRange(0, this._marca * 6 > 0 ? this._marca * 12 : 0)
  }

  limpiar() {
    this.opacidades.fill(0)
    this.atrOpac.updateRanges.length = 0
    this.atrOpac.needsUpdate = true
    this._cursor = 0
    this._marca = 0
    this._ultima.clear()
    this.geometria.setDrawRange(0, 0)
  }

  destruir() {
    this.geometria.dispose()
    this.material.dispose()
    if (this.malla.parent) this.malla.parent.remove(this.malla)
  }
}

/**
 * Conjunto de estelas: una cinta por corredor + el pool de marcas de suelo.
 */
export class Estelas {
  /**
   * @param {THREE.Object3D} padre
   * @param {object} [opciones]
   */
  constructor(padre, opciones = {}) {
    this.padre = padre
    this.calidad = opciones.calidad || 'alta'
    const maxCintas = opciones.maxCintas ?? 8
    const segmentos = this.calidad === 'baja' ? 14 : this.calidad === 'media' ? 20 : 28

    /** @type {Map<string, Cinta>} */
    this.cintas = new Map()
    this._librés = []
    for (let i = 0; i < maxCintas; i++) {
      const c = new Cinta({ segmentos, ancho: opciones.anchoCinta ?? 0.62 })
      padre.add(c.malla)
      this._librés.push(c)
    }

    this.marcas = new MarcasSuelo({
      maximo: this.calidad === 'baja' ? 300 : this.calidad === 'media' ? 600 : 900,
      vida: opciones.vidaMarcas ?? 6,
    })
    padre.add(this.marcas.malla)

    /** Posiciones actuales por corredor, las escribe el orquestador. */
    this._posiciones = new Map()
    this._tmp = new THREE.Vector3()
    this.tiempo = 0
  }

  /** Devuelve (creando si hace falta) la cinta asociada a un corredor. */
  cinta(id) {
    let c = this.cintas.get(id)
    if (!c) {
      c = this._librés.pop()
      if (!c) return null
      this.cintas.set(id, c)
    }
    return c
  }

  /** Activa/desactiva la estela de un corredor. `color` = nivel 0..3, hex o 'arcoiris'. */
  establecer(id, activa, color, posicion) {
    const c = this.cinta(id)
    if (!c) return
    if (color !== undefined && color !== null) c.configurarColor(color)
    if (activa && !c.activa && posicion) c.reiniciar(posicion)
    c.activa = !!activa
    if (posicion) {
      let p = this._posiciones.get(id)
      if (!p) {
        p = new THREE.Vector3()
        this._posiciones.set(id, p)
      }
      p.copy(posicion)
      p.activa = true
    }
  }

  /** Actualiza la posición de seguimiento de una cinta sin tocar su estado. */
  seguir(id, posicion) {
    let p = this._posiciones.get(id)
    if (!p) {
      p = new THREE.Vector3()
      this._posiciones.set(id, p)
    }
    p.copy(posicion)
  }

  actualizar(dt) {
    this.tiempo += dt
    for (const [id, c] of this.cintas) {
      const p = this._posiciones.get(id)
      c.actualizar(dt, p || null, this.tiempo)
    }
    this.marcas.actualizar(dt)
  }

  limpiar() {
    for (const c of this.cintas.values()) {
      c.activa = false
      c.cuenta = 0
      c.malla.visible = false
    }
    this.marcas.limpiar()
  }

  destruir() {
    for (const c of this.cintas.values()) c.destruir()
    for (const c of this._librés) c.destruir()
    this.cintas.clear()
    this._librés.length = 0
    this._posiciones.clear()
    this.marcas.destruir()
  }
}

export { clamp }
export default Estelas
