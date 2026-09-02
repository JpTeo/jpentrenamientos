// Sistema de partículas por GPU.
//
// Cada emisor es un único THREE.Points con una BufferGeometry de tamaño fijo
// (pool circular). El movimiento se integra en el vértice: posición inicial +
// velocidad*t - gravedad*t²/2, con un rebote analítico opcional contra un plano
// de suelo. La CPU sólo escribe los atributos de las partículas nuevas.
//
// Reglas: cero asignaciones dentro de `actualizar`, y `emitir` sólo escribe en
// arrays ya reservados. Presupuesto global recomendado: <= 6 emisores y
// <= 20.000 partículas sumando todos.
import * as THREE from 'three'
import { clamp, clamp01, rng, TAU } from '../core/utils.js'

// Número de floats por partícula repartidos en los atributos.
const FLOATS = {
  posicion: 3,
  velocidad: 3,
  tiempo: 2, // nacimiento, duración
  tamano: 2, // inicial, final
  colorIni: 3,
  colorFin: 3,
  giro: 2, // fase, velocidad angular
  parametros: 3, // gravedad, altura de suelo, semilla
}

const VERTEX = /* glsl */ `
  uniform float uTiempo;
  uniform float uEscala;      // píxeles por metro a 1 m de la cámara
  uniform float uRebote;      // 0 = sin rebote, 0..1 = restitución
  uniform float uFriccion;    // pérdida horizontal al rebotar
  uniform float uArrastre;    // amortiguación exponencial de la velocidad
  uniform float uEntrada;     // fracción de vida en la que aparece
  uniform float uSalida;      // fracción de vida en la que empieza a irse
  uniform float uOpacidad;
  uniform float uTamanoMax;   // tope de gl_PointSize (evita overdraw brutal)

  attribute vec3 aVelocidad;
  attribute vec2 aTiempo;
  attribute vec2 aTamano;
  attribute vec3 aColorIni;
  attribute vec3 aColorFin;
  attribute vec2 aGiro;
  attribute vec3 aParametros;

  varying vec4 vColor;
  varying float vGiro;
  varying float vVistaZ;

  void main() {
    float dur = aTiempo.y;
    float t = uTiempo - aTiempo.x;

    if (dur <= 0.0 || t < 0.0 || t > dur) {
      // Partícula muerta: fuera del volumen de recorte y sin tamaño.
      gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
      gl_PointSize = 0.0;
      vColor = vec4(0.0);
      vGiro = 0.0;
      vVistaZ = 1.0;
      return;
    }

    float u = t / dur;
    float g = aParametros.x;
    float suelo = aParametros.y;

    // Integral de la velocidad con arrastre exponencial (analítica).
    float ta = uArrastre > 0.001 ? (1.0 - exp(-uArrastre * t)) / uArrastre : t;

    vec3 p = position + aVelocidad * ta;
    p.y -= 0.5 * g * t * t;

    if (uRebote > 0.0) {
      float dy = position.y - suelo;
      float disc = aVelocidad.y * aVelocidad.y + 2.0 * g * dy;
      // Instante en el que la parábola toca el suelo (si es que lo toca).
      float tImp = (g > 0.001 && disc > 0.0) ? (aVelocidad.y + sqrt(disc)) / g : 1.0e9;
      if (t > tImp && tImp > 0.0) {
        float td = t - tImp;
        float vy = -(aVelocidad.y - g * tImp) * uRebote;
        vec3 pImp = position + aVelocidad * tImp;
        pImp.y -= 0.5 * g * tImp * tImp;
        p.x = pImp.x + aVelocidad.x * uFriccion * td;
        p.z = pImp.z + aVelocidad.z * uFriccion * td;
        p.y = pImp.y + vy * td - 0.5 * g * td * td;
      }
      p.y = max(p.y, suelo);
    }

    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;

    float tam = mix(aTamano.x, aTamano.y, u);
    float dist = max(-mv.z, 0.01);
    gl_PointSize = clamp(tam * uEscala / dist, 0.0, uTamanoMax);

    float aparece = uEntrada > 0.0001 ? smoothstep(0.0, uEntrada, u) : 1.0;
    float desaparece = 1.0 - smoothstep(uSalida, 1.0, u);
    vColor = vec4(mix(aColorIni, aColorFin, u), aparece * desaparece * uOpacidad);
    vGiro = aGiro.x + aGiro.y * t;
    vVistaZ = dist;
  }
`

const FRAGMENT = /* glsl */ `
  uniform sampler2D uTextura;
  uniform vec2 uResolucion;
  uniform float uSuavizado;   // metros de transición para soft particles
  uniform float uCerca;
  uniform float uLejos;
  #ifdef SUAVE
    uniform sampler2D uProfundidad;
  #endif

  varying vec4 vColor;
  varying float vGiro;
  varying float vVistaZ;

  void main() {
    vec2 uv = gl_PointCoord - 0.5;
    float c = cos(vGiro);
    float s = sin(vGiro);
    uv = vec2(c * uv.x - s * uv.y, s * uv.x + c * uv.y) + 0.5;
    if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) discard;

    vec4 tex = texture2D(uTextura, uv);
    vec4 col = tex * vColor;

    #ifdef SUAVE
      vec2 uvPantalla = gl_FragCoord.xy / uResolucion;
      float bruto = texture2D(uProfundidad, uvPantalla).x;
      float ndc = bruto * 2.0 - 1.0;
      float zEscena = (2.0 * uCerca * uLejos) /
                      (uLejos + uCerca - ndc * (uLejos - uCerca));
      col.a *= clamp((zEscena - vVistaZ) / max(uSuavizado, 0.001), 0.0, 1.0);
    #endif

    if (col.a < 0.004) discard;
    gl_FragColor = col;
  }
`

/**
 * Un emisor = un THREE.Points con su pool. Todas las partículas de un emisor
 * comparten textura, blending y parámetros de rebote/arrastre.
 */
export class Emisor {
  /**
   * @param {object} o
   * @param {string} o.nombre
   * @param {number} o.maximo cantidad de partículas del pool
   * @param {THREE.Texture} o.textura sprite con alfa
   * @param {number} [o.blending] THREE.AdditiveBlending | THREE.NormalBlending
   */
  constructor(o) {
    this.nombre = o.nombre || 'emisor'
    this.maximo = Math.max(8, o.maximo | 0)
    this.rebote = o.rebote ?? 0
    this.friccion = o.friccion ?? 0.55
    this.arrastre = o.arrastre ?? 0
    this.vidaMax = 0.5
    this.tamanoMax = o.tamanoMax ?? 900

    const n = this.maximo
    this.aPos = new Float32Array(n * FLOATS.posicion)
    this.aVel = new Float32Array(n * FLOATS.velocidad)
    this.aTiempo = new Float32Array(n * FLOATS.tiempo)
    this.aTamano = new Float32Array(n * FLOATS.tamano)
    this.aColorIni = new Float32Array(n * FLOATS.colorIni)
    this.aColorFin = new Float32Array(n * FLOATS.colorFin)
    this.aGiro = new Float32Array(n * FLOATS.giro)
    this.aParam = new Float32Array(n * FLOATS.parametros)

    const geo = new THREE.BufferGeometry()
    this.atrPos = new THREE.BufferAttribute(this.aPos, 3)
    this.atrVel = new THREE.BufferAttribute(this.aVel, 3)
    this.atrTiempo = new THREE.BufferAttribute(this.aTiempo, 2)
    this.atrTamano = new THREE.BufferAttribute(this.aTamano, 2)
    this.atrColorIni = new THREE.BufferAttribute(this.aColorIni, 3)
    this.atrColorFin = new THREE.BufferAttribute(this.aColorFin, 3)
    this.atrGiro = new THREE.BufferAttribute(this.aGiro, 2)
    this.atrParam = new THREE.BufferAttribute(this.aParam, 3)
    // Listas fijas usadas para subir rangos sin asignar nada por cuadro.
    this._atributos = [
      this.atrPos,
      this.atrVel,
      this.atrTiempo,
      this.atrTamano,
      this.atrColorIni,
      this.atrColorFin,
      this.atrGiro,
      this.atrParam,
    ]
    this._componentes = [3, 3, 2, 2, 3, 3, 2, 3]
    for (const a of this._atributos) a.setUsage(THREE.DynamicDrawUsage)
    geo.setAttribute('position', this.atrPos)
    geo.setAttribute('aVelocidad', this.atrVel)
    geo.setAttribute('aTiempo', this.atrTiempo)
    geo.setAttribute('aTamano', this.atrTamano)
    geo.setAttribute('aColorIni', this.atrColorIni)
    geo.setAttribute('aColorFin', this.atrColorFin)
    geo.setAttribute('aGiro', this.atrGiro)
    geo.setAttribute('aParametros', this.atrParam)
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6)
    geo.setDrawRange(0, 0)
    this.geometria = geo

    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uTiempo: { value: 0 },
        uEscala: { value: 600 },
        uRebote: { value: this.rebote },
        uFriccion: { value: this.friccion },
        uArrastre: { value: this.arrastre },
        uEntrada: { value: o.entrada ?? 0.08 },
        uSalida: { value: o.salida ?? 0.45 },
        uOpacidad: { value: o.opacidad ?? 1 },
        uTamanoMax: { value: this.tamanoMax },
        uTextura: { value: o.textura || null },
        uResolucion: { value: new THREE.Vector2(1, 1) },
        uSuavizado: { value: o.suavizado ?? 0.9 },
        uCerca: { value: 0.25 },
        uLejos: { value: 2600 },
        uProfundidad: { value: null },
      },
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      blending: o.blending ?? THREE.AdditiveBlending,
      toneMapped: false,
    })

    this.puntos = new THREE.Points(geo, this.material)
    this.puntos.frustumCulled = false
    this.puntos.renderOrder = o.orden ?? 10
    this.puntos.name = `fx:${this.nombre}`
    this.puntos.matrixAutoUpdate = false

    this._cursor = 0
    this._marca = 0 // marca de agua alta del pool
    this._tiempo = 0
    this._ultimaEmision = -1e6
    this._suave = false

    // Rangos de subida reutilizados (evitan asignar objetos por cuadro).
    this._rangos = []
    for (let i = 0; i < 8; i++) this._rangos.push({ start: 0, count: 0 })

    // Temporales.
    this._azar = rng((o.semilla ?? 7) * 2654435761)
    this._dir = new THREE.Vector3()
    this._ejeA = new THREE.Vector3()
    this._ejeB = new THREE.Vector3()
    this._colA = new THREE.Color()
    this._colB = new THREE.Color()
  }

  /** Cantidad máxima de partículas del pool. */
  get capacidad() {
    return this.maximo
  }

  /** Dirección aleatoria dentro de un cono alrededor de `dir`. */
  _direccionCono(out, dir, dispersion) {
    const r = this._azar
    if (dispersion <= 0.0001) return out.copy(dir)
    if (Math.abs(dir.y) < 0.94) this._ejeA.set(0, 1, 0).cross(dir).normalize()
    else this._ejeA.set(1, 0, 0).cross(dir).normalize()
    this._ejeB.copy(dir).cross(this._ejeA).normalize()
    const cosMax = Math.cos(Math.min(dispersion, Math.PI))
    const cosT = 1 - r() * (1 - cosMax)
    const sinT = Math.sqrt(Math.max(0, 1 - cosT * cosT))
    const phi = r() * TAU
    out.copy(dir).multiplyScalar(cosT)
    out.addScaledVector(this._ejeA, sinT * Math.cos(phi))
    out.addScaledVector(this._ejeB, sinT * Math.sin(phi))
    return out
  }

  /**
   * Crea `n` partículas. El objeto de opciones conviene reutilizarlo desde el
   * llamador para no asignar nada por cuadro.
   *
   * @param {number} n
   * @param {object} o
   * @param {THREE.Vector3} o.posicion origen
   * @param {THREE.Vector3} [o.direccion] dirección media de salida
   * @param {number} [o.dispersion] semiángulo del cono, radianes
   * @param {number} [o.velocidad] módulo medio, m/s
   * @param {number} [o.velocidadVar] variación relativa 0..1
   * @param {THREE.Vector3} [o.arrastreVel] velocidad heredada (del kart)
   * @param {number} [o.radio] radio de nacimiento alrededor de `posicion`
   * @param {number} [o.vida] segundos
   * @param {number} [o.vidaVar] variación relativa 0..1
   * @param {number} [o.tamano] metros
   * @param {number} [o.tamanoFin] metros al morir
   * @param {number} [o.tamanoVar] variación relativa 0..1
   * @param {number|THREE.Color} [o.colorInicio]
   * @param {number|THREE.Color} [o.colorFin]
   * @param {number} [o.gravedad] m/s²
   * @param {number} [o.suelo] altura del plano de rebote
   * @param {number} [o.rotacion] velocidad angular media, rad/s
   */
  emitir(n, o) {
    if (n <= 0) return
    const cant = Math.min(n | 0, this.maximo)
    const r = this._azar
    const pos = o.posicion
    if (!pos) return

    const dir = o.direccion
    const dispersion = o.dispersion ?? 0.35
    const vel = o.velocidad ?? 4
    const velVar = o.velocidadVar ?? 0.35
    const heredada = o.arrastreVel
    const radio = o.radio ?? 0
    const vida = Math.max(0.02, o.vida ?? 0.6)
    const vidaVar = o.vidaVar ?? 0.25
    const tam = o.tamano ?? 0.3
    const tamFin = o.tamanoFin ?? tam * 0.35
    const tamVar = o.tamanoVar ?? 0.35
    const grav = o.gravedad ?? 0
    const suelo = o.suelo ?? pos.y - 0.02
    const giroVel = o.rotacion ?? 0

    this._colA.set(o.colorInicio ?? 0xffffff)
    this._colB.set(o.colorFin ?? o.colorInicio ?? 0xffffff)

    // Si la tanda no entra al final del anillo, reiniciamos el cursor: así
    // siempre subimos un rango contiguo (una sola llamada a bufferSubData).
    if (this._cursor + cant > this.maximo) this._cursor = 0
    const inicio = this._cursor

    for (let i = 0; i < cant; i++) {
      const k = inicio + i
      const i3 = k * 3
      const i2 = k * 2

      let px = pos.x
      let py = pos.y
      let pz = pos.z
      if (radio > 0) {
        px += (r() - 0.5) * 2 * radio
        py += (r() - 0.5) * 2 * radio
        pz += (r() - 0.5) * 2 * radio
      }
      this.aPos[i3] = px
      this.aPos[i3 + 1] = py
      this.aPos[i3 + 2] = pz

      let vx = 0
      let vy = 0
      let vz = 0
      if (dir) {
        this._direccionCono(this._dir, dir, dispersion)
        const m = vel * (1 + (r() - 0.5) * 2 * velVar)
        vx = this._dir.x * m
        vy = this._dir.y * m
        vz = this._dir.z * m
      } else {
        // Sin dirección: explosión esférica.
        const z = r() * 2 - 1
        const a = r() * TAU
        const s = Math.sqrt(Math.max(0, 1 - z * z))
        const m = vel * (1 + (r() - 0.5) * 2 * velVar)
        vx = Math.cos(a) * s * m
        vy = z * m
        vz = Math.sin(a) * s * m
      }
      if (heredada) {
        vx += heredada.x
        vy += heredada.y
        vz += heredada.z
      }
      this.aVel[i3] = vx
      this.aVel[i3 + 1] = vy
      this.aVel[i3 + 2] = vz

      const v = vida * (1 + (r() - 0.5) * 2 * vidaVar)
      this.aTiempo[i2] = this._tiempo
      this.aTiempo[i2 + 1] = v
      if (v > this.vidaMax) this.vidaMax = v

      const f = 1 + (r() - 0.5) * 2 * tamVar
      this.aTamano[i2] = tam * f
      this.aTamano[i2 + 1] = tamFin * f

      this.aColorIni[i3] = this._colA.r
      this.aColorIni[i3 + 1] = this._colA.g
      this.aColorIni[i3 + 2] = this._colA.b
      this.aColorFin[i3] = this._colB.r
      this.aColorFin[i3 + 1] = this._colB.g
      this.aColorFin[i3 + 2] = this._colB.b

      this.aGiro[i2] = r() * TAU
      this.aGiro[i2 + 1] = giroVel * (r() * 2 - 1)

      this.aParam[i3] = grav
      this.aParam[i3 + 1] = suelo
      this.aParam[i3 + 2] = r()
    }

    this._cursor = (inicio + cant) % this.maximo
    if (inicio + cant > this._marca) this._marca = Math.min(inicio + cant, this.maximo)
    this._ultimaEmision = this._tiempo
    this._marcarRango(inicio, cant)
  }

  /** Marca el tramo subido en todos los atributos, reutilizando los objetos. */
  _marcarRango(inicio, cant) {
    const attrs = this._atributos
    const comps = this._componentes
    for (let i = 0; i < attrs.length; i++) {
      const attr = attrs[i]
      const rango = this._rangos[i]
      rango.start = inicio * comps[i]
      rango.count = cant * comps[i]
      attr.updateRanges.length = 0
      attr.updateRanges.push(rango)
      attr.needsUpdate = true
    }
  }

  /** Deja el pool vacío al instante. */
  limpiar() {
    this.aTiempo.fill(0)
    this.atrTiempo.updateRanges.length = 0
    this.atrTiempo.needsUpdate = true
    this._cursor = 0
    this._marca = 0
    this.geometria.setDrawRange(0, 0)
  }

  /** Avanza el reloj del emisor y ajusta el rango de dibujo. */
  actualizar(dt) {
    this._tiempo += dt
    this.material.uniforms.uTiempo.value = this._tiempo
    if (this._tiempo - this._ultimaEmision > this.vidaMax * 1.05) {
      if (this._marca !== 0) {
        this._marca = 0
        this._cursor = 0
      }
      this.geometria.setDrawRange(0, 0)
    } else {
      this.geometria.setDrawRange(0, this._marca)
    }
  }

  /** Escala de píxeles por metro y tamaño del lienzo (para soft particles). */
  establecerCamara(alturaPx, anchoPx, fovRad, cerca, lejos) {
    const u = this.material.uniforms
    u.uEscala.value = alturaPx / (2 * Math.tan(fovRad * 0.5))
    u.uResolucion.value.set(anchoPx, alturaPx)
    u.uCerca.value = cerca
    u.uLejos.value = lejos
  }

  /** Activa/desactiva soft particles con una textura de profundidad externa. */
  establecerProfundidad(textura) {
    const quiere = !!textura
    this.material.uniforms.uProfundidad.value = textura || null
    if (quiere === this._suave) return
    this._suave = quiere
    if (quiere) this.material.defines.SUAVE = ''
    else delete this.material.defines.SUAVE
    this.material.needsUpdate = true
  }

  establecerOpacidad(v) {
    this.material.uniforms.uOpacidad.value = clamp01(v)
  }

  destruir() {
    this.geometria.dispose()
    this.material.dispose()
    if (this.puntos.parent) this.puntos.parent.remove(this.puntos)
  }
}

/**
 * Agrupa hasta 6 emisores y les sincroniza reloj, cámara y profundidad.
 */
export class SistemaParticulas {
  /**
   * @param {object} opciones
   * @param {THREE.Object3D} opciones.padre nodo donde se cuelgan los Points
   * @param {number} [opciones.maxEmisores]
   * @param {number} [opciones.presupuesto] total de partículas permitido
   */
  constructor({ padre, maxEmisores = 6, presupuesto = 20000 } = {}) {
    this.padre = padre || new THREE.Group()
    this.maxEmisores = maxEmisores
    this.presupuesto = presupuesto
    /** @type {Emisor[]} */
    this.emisores = []
    /** @type {Map<string, Emisor>} */
    this.porNombre = new Map()
    this.usado = 0
  }

  /** Crea y registra un emisor respetando el presupuesto. */
  crear(opciones) {
    if (this.emisores.length >= this.maxEmisores) {
      throw new Error(`FX: superado el límite de ${this.maxEmisores} emisores`)
    }
    const restante = this.presupuesto - this.usado
    const maximo = Math.min(opciones.maximo | 0, Math.max(64, restante))
    const emisor = new Emisor({ ...opciones, maximo })
    this.usado += emisor.maximo
    this.emisores.push(emisor)
    this.porNombre.set(emisor.nombre, emisor)
    this.padre.add(emisor.puntos)
    return emisor
  }

  obtener(nombre) {
    return this.porNombre.get(nombre)
  }

  actualizar(dt) {
    for (let i = 0; i < this.emisores.length; i++) this.emisores[i].actualizar(dt)
  }

  establecerCamara(alturaPx, anchoPx, fovRad, cerca, lejos) {
    for (let i = 0; i < this.emisores.length; i++) {
      this.emisores[i].establecerCamara(alturaPx, anchoPx, fovRad, cerca, lejos)
    }
  }

  establecerProfundidad(textura) {
    for (let i = 0; i < this.emisores.length; i++) {
      this.emisores[i].establecerProfundidad(textura)
    }
  }

  limpiar() {
    for (let i = 0; i < this.emisores.length; i++) this.emisores[i].limpiar()
  }

  destruir() {
    for (let i = 0; i < this.emisores.length; i++) this.emisores[i].destruir()
    this.emisores.length = 0
    this.porNombre.clear()
    this.usado = 0
  }
}

/**
 * Pasada de profundidad a media resolución. Sirve para las soft particles:
 * se dibuja ANTES del render principal y con una cámara que sólo ve la capa 0,
 * de modo que las propias partículas (capa `capaFX`) no aparecen en el mapa y
 * no se produce realimentación entre framebuffer y textura.
 */
export class PasadaProfundidad {
  /**
   * @param {THREE.WebGLRenderer} renderer
   * @param {THREE.Scene} escena
   * @param {number} [escala] 0.5 = media resolución
   */
  constructor(renderer, escena, escala = 0.5) {
    this.renderer = renderer
    this.escena = escena
    this.escala = clamp(escala, 0.25, 1)
    this.activa = true

    const depth = new THREE.DepthTexture(2, 2)
    depth.type = THREE.UnsignedIntType
    depth.minFilter = THREE.NearestFilter
    depth.magFilter = THREE.NearestFilter
    this.objetivo = new THREE.WebGLRenderTarget(2, 2, {
      depthTexture: depth,
      depthBuffer: true,
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
    })
    this.textura = depth

    this.material = new THREE.MeshDepthMaterial({ depthPacking: THREE.BasicDepthPacking })
    this.material.colorWrite = false
    this.camara = new THREE.PerspectiveCamera()
    this.camara.matrixAutoUpdate = false
    this.camara.layers.set(0)
  }

  setSize(w, h) {
    const a = Math.max(2, Math.round(w * this.escala))
    const b = Math.max(2, Math.round(h * this.escala))
    this.objetivo.setSize(a, b)
  }

  /** Copia la cámara real y renderiza sólo profundidad. */
  render(camaraReal) {
    if (!this.activa) return
    const c = this.camara
    c.projectionMatrix.copy(camaraReal.projectionMatrix)
    c.projectionMatrixInverse.copy(camaraReal.projectionMatrixInverse)
    c.matrixWorld.copy(camaraReal.matrixWorld)
    c.matrixWorldInverse.copy(camaraReal.matrixWorldInverse)
    c.near = camaraReal.near
    c.far = camaraReal.far

    const previo = this.renderer.getRenderTarget()
    const materialPrevio = this.escena.overrideMaterial
    this.escena.overrideMaterial = this.material
    this.renderer.setRenderTarget(this.objetivo)
    this.renderer.clear(true, true, false)
    this.renderer.render(this.escena, c)
    this.escena.overrideMaterial = materialPrevio
    this.renderer.setRenderTarget(previo)
  }

  dispose() {
    this.objetivo.dispose()
    this.textura.dispose()
    this.material.dispose()
  }
}

export default SistemaParticulas
