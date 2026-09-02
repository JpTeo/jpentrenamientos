// Mallas de los ítems. Todo generado con geometría primitiva de three: cero
// modelos externos. Las geometrías y materiales se cachean por clave, así que
// los 40 proyectiles del pool comparten los mismos buffers.
//
// Convención de orientación: cada modelo mira a **-Z** (igual que el kart) y
// tiene el pivote en su centro, apoyado sobre Y=0 cuando corresponde.
import * as THREE from 'three'
import { PALETA } from '../assets/paleta.js'
import { sprite } from '../assets/texturas.js'
import { TAU, clamp01, easeOutCubic, easeOutElastic, rng } from '../core/utils.js'
import { REAPARICION_CAJA } from './definiciones.js'

// ---------------------------------------------------------------------------
// Caché de geometrías y materiales
// ---------------------------------------------------------------------------

const geometrias = new Map()
const materiales = new Map()

function geo(clave, fabrica) {
  let g = geometrias.get(clave)
  if (!g) {
    g = fabrica()
    geometrias.set(clave, g)
  }
  return g
}

function mat(clave, params) {
  let m = materiales.get(clave)
  if (!m) {
    m = new THREE.MeshStandardMaterial(params)
    materiales.set(clave, m)
  }
  return m
}

/** Libera todo lo cacheado. Llamar al destruir el juego. */
export function limpiarModelos() {
  for (const g of geometrias.values()) g.dispose()
  for (const m of materiales.values()) {
    if (m.map) m.map.dispose?.()
    m.dispose()
  }
  geometrias.clear()
  materiales.clear()
}

// ---------------------------------------------------------------------------
// Banana
// ---------------------------------------------------------------------------

/** Curva de la banana: una C acostada. */
function curvaBanana() {
  return new THREE.CubicBezierCurve3(
    new THREE.Vector3(-0.42, 0.03, 0),
    new THREE.Vector3(-0.24, 0.36, 0),
    new THREE.Vector3(0.24, 0.36, 0),
    new THREE.Vector3(0.42, 0.03, 0),
  )
}

/**
 * Tubo con las puntas afinadas: TubeGeometry no soporta radio variable, así que
 * escalamos cada anillo hacia su centro sobre la curva.
 */
function geometriaBanana() {
  return geo('banana', () => {
    const curva = curvaBanana()
    const segmentos = 16
    const radiales = 8
    const g = new THREE.TubeGeometry(curva, segmentos, 0.125, radiales, false)
    const pos = g.attributes.position
    const centro = new THREE.Vector3()
    const v = new THREE.Vector3()
    const porAnillo = radiales + 1
    for (let i = 0; i <= segmentos; i++) {
      const t = i / segmentos
      // Perfil: gordo al medio, en punta en los extremos.
      const k = 0.18 + Math.pow(Math.sin(Math.PI * t), 0.6) * 0.92
      curva.getPoint(t, centro)
      for (let j = 0; j < porAnillo; j++) {
        const idx = i * porAnillo + j
        v.fromBufferAttribute(pos, idx).sub(centro).multiplyScalar(k).add(centro)
        pos.setXYZ(idx, v.x, v.y, v.z)
      }
    }
    pos.needsUpdate = true
    g.computeVertexNormals()
    return g
  })
}

/** Banana amarilla curvada con cabito marrón. ~420 tris. */
export function crearBanana() {
  const grupo = new THREE.Group()
  const cuerpo = new THREE.Mesh(
    geometriaBanana(),
    mat('bananaCuerpo', { color: 0xffd400, roughness: 0.42, metalness: 0.02, emissive: 0x3a2f00, emissiveIntensity: 0.35 }),
  )
  cuerpo.castShadow = true
  grupo.add(cuerpo)

  // Cabito: cilindro corto en la punta izquierda, apuntando hacia arriba.
  const cabo = new THREE.Mesh(
    geo('bananaCabo', () => new THREE.CylinderGeometry(0.045, 0.07, 0.17, 6)),
    mat('bananaCabo', { color: 0x7a4a1e, roughness: 0.85 }),
  )
  cabo.position.set(-0.44, 0.07, 0)
  cabo.rotation.z = 0.9
  grupo.add(cabo)

  // Manchita marrón en la punta derecha (detalle cartoon).
  const punta = new THREE.Mesh(
    geo('bananaPunta', () => new THREE.SphereGeometry(0.055, 6, 5)),
    mat('bananaCabo', { color: 0x7a4a1e, roughness: 0.85 }),
  )
  punta.position.set(0.44, 0.045, 0)
  grupo.add(punta)

  grupo.userData.tipoModelo = 'banana'
  return grupo
}

// ---------------------------------------------------------------------------
// Caparazones
// ---------------------------------------------------------------------------

/** Coloca hexágonos sobre la cúpula, orientados según la normal de la esfera. */
function marcarHexagonos(grupo, radio, color, clave) {
  const gHex = geo(`hex:${clave}`, () => new THREE.CircleGeometry(radio * 0.26, 6))
  const mHex = mat(`hex:${clave}`, { color, roughness: 0.55, metalness: 0.05 })
  const dir = new THREE.Vector3()
  const destino = new THREE.Vector3()
  // Uno en la coronilla + dos anillos escalonados.
  const puntos = [[0, 0]]
  for (let i = 0; i < 6; i++) puntos.push([Math.PI * 0.32, (i / 6) * TAU])
  for (let i = 0; i < 6; i++) puntos.push([Math.PI * 0.62, (i / 6) * TAU + Math.PI / 6])
  for (const [theta, phi] of puntos) {
    const m = new THREE.Mesh(gHex, mHex)
    dir.set(Math.sin(theta) * Math.cos(phi), Math.cos(theta), Math.sin(theta) * Math.sin(phi))
    m.position.copy(dir).multiplyScalar(radio * 1.004)
    destino.copy(dir).multiplyScalar(radio * 3)
    m.lookAt(destino)
    m.rotation.z = phi
    grupo.add(m)
  }
}

/**
 * Caparazón: media esfera con borde blanco, panza clara y patrón hexagonal.
 * @param {object} opciones `{ color, clave, franja }`
 */
export function crearCaparazon({ color = PALETA.marcaVerde, clave = 'verde', franja = false } = {}) {
  const grupo = new THREE.Group()
  const R = 0.5

  const cupula = new THREE.Mesh(
    geo('capCupula', () => new THREE.SphereGeometry(R, 18, 10, 0, TAU, 0, Math.PI * 0.5)),
    mat(`capCupula:${clave}`, { color, roughness: 0.34, metalness: 0.08, emissive: color, emissiveIntensity: 0.14 }),
  )
  cupula.castShadow = true
  grupo.add(cupula)

  // Patrón hexagonal marcado, en un tono más oscuro del mismo color.
  const oscuro = new THREE.Color(color).multiplyScalar(0.62).getHex()
  marcarHexagonos(grupo, R, oscuro, clave)

  // Borde blanco: un toro justo en el ecuador.
  const borde = new THREE.Mesh(
    geo('capBorde', () => new THREE.TorusGeometry(R * 0.99, R * 0.13, 8, 22)),
    mat('capBorde', { color: 0xfbf7ea, roughness: 0.5 }),
  )
  borde.rotation.x = Math.PI * 0.5
  borde.position.y = 0.015
  grupo.add(borde)

  // Panza clara: media esfera achatada hacia abajo.
  const panza = new THREE.Mesh(
    geo('capPanza', () => {
      const g = new THREE.SphereGeometry(R * 0.96, 16, 7, 0, TAU, Math.PI * 0.5, Math.PI * 0.5)
      g.scale(1, 0.46, 1)
      return g
    }),
    mat('capPanza', { color: 0xf3e6c4, roughness: 0.72 }),
  )
  grupo.add(panza)

  // Franja del caparazón rojo: arco blanco de frente a atrás.
  if (franja) {
    const arco = new THREE.Mesh(
      geo('capFranja', () => new THREE.TorusGeometry(R * 0.93, R * 0.075, 6, 20, Math.PI)),
      mat('capFranjaMat', { color: 0xfbf7ea, roughness: 0.45 }),
    )
    arco.rotation.y = Math.PI * 0.5
    arco.position.y = 0.02
    grupo.add(arco)
  }

  grupo.userData.tipoModelo = franja ? 'caparazonRojo' : 'caparazonVerde'
  return grupo
}

export const crearCaparazonVerde = () =>
  crearCaparazon({ color: 0x2ecc40, clave: 'verde', franja: false })
export const crearCaparazonRojo = () =>
  crearCaparazon({ color: 0xff3b30, clave: 'rojo', franja: true })

// ---------------------------------------------------------------------------
// Ojos reutilizables (bomba, hongo, bala)
// ---------------------------------------------------------------------------

/**
 * Par de ojos cartoon mirando a -Z.
 * @param {object} opciones `{ separacion, alto, tamano, enojado, adelante }`
 */
function crearOjos({ separacion = 0.16, alto = 0, tamano = 0.1, enojado = false, adelante = 0.34 } = {}) {
  const grupo = new THREE.Group()
  const gBlanco = geo('ojoBlanco', () => new THREE.SphereGeometry(1, 10, 8))
  const gPupila = geo('ojoPupila', () => new THREE.SphereGeometry(1, 8, 6))
  const mBlanco = mat('ojoBlanco', { color: 0xffffff, roughness: 0.35 })
  const mPupila = mat('ojoPupila', { color: 0x14121f, roughness: 0.4 })
  const mCeja = mat('ojoCeja', { color: 0x14121f, roughness: 0.6 })
  for (const lado of [-1, 1]) {
    const blanco = new THREE.Mesh(gBlanco, mBlanco)
    blanco.scale.setScalar(tamano)
    blanco.scale.z = tamano * 0.6
    blanco.position.set(lado * separacion, alto, -adelante)
    grupo.add(blanco)

    const pupila = new THREE.Mesh(gPupila, mPupila)
    pupila.scale.setScalar(tamano * 0.52)
    pupila.scale.z = tamano * 0.3
    pupila.position.set(lado * separacion, alto, -adelante - tamano * 0.5)
    grupo.add(pupila)

    if (enojado) {
      const ceja = new THREE.Mesh(
        geo('ojoCejaGeo', () => new THREE.BoxGeometry(1, 0.3, 0.25)),
        mCeja,
      )
      ceja.scale.setScalar(tamano * 1.5)
      ceja.position.set(lado * separacion, alto + tamano * 0.95, -adelante - tamano * 0.4)
      ceja.rotation.z = lado * -0.55
      grupo.add(ceja)
    }
  }
  return grupo
}

// ---------------------------------------------------------------------------
// Hongo
// ---------------------------------------------------------------------------

/** Hongo: sombrero rojo con lunares + pie beige con ojitos. */
export function crearHongo({ color = 0xff5a5a } = {}) {
  const grupo = new THREE.Group()

  const sombrero = new THREE.Mesh(
    geo('hongoSombrero', () => {
      const g = new THREE.SphereGeometry(0.44, 16, 10, 0, TAU, 0, Math.PI * 0.52)
      g.scale(1, 0.86, 1)
      return g
    }),
    mat(`hongoSombrero:${color}`, { color, roughness: 0.38, emissive: color, emissiveIntensity: 0.12 }),
  )
  sombrero.position.y = 0.16
  sombrero.castShadow = true
  grupo.add(sombrero)

  // Reborde del sombrero para que no se vea hueco de costado.
  const reborde = new THREE.Mesh(
    geo('hongoReborde', () => new THREE.CylinderGeometry(0.44, 0.38, 0.09, 16)),
    mat(`hongoSombrero:${color}`, { color, roughness: 0.38 }),
  )
  reborde.position.y = 0.14
  grupo.add(reborde)

  // Lunares: círculos apoyados sobre la cúpula.
  const gLunar = geo('hongoLunar', () => new THREE.CircleGeometry(0.115, 10))
  const mLunar = mat('hongoLunar', { color: 0xfff6e2, roughness: 0.5 })
  const dir = new THREE.Vector3()
  const lunares = [[0, 0], [Math.PI * 0.36, 0], [Math.PI * 0.36, TAU / 3], [Math.PI * 0.36, (2 * TAU) / 3], [Math.PI * 0.2, Math.PI]]
  for (const [theta, phi] of lunares) {
    const l = new THREE.Mesh(gLunar, mLunar)
    dir.set(Math.sin(theta) * Math.cos(phi), Math.cos(theta) * 0.86, Math.sin(theta) * Math.sin(phi))
    l.position.copy(dir).multiplyScalar(0.445).add(new THREE.Vector3(0, 0.16, 0))
    l.lookAt(dir.clone().multiplyScalar(3).add(new THREE.Vector3(0, 0.16, 0)))
    grupo.add(l)
  }

  const pie = new THREE.Mesh(
    geo('hongoPie', () => new THREE.CylinderGeometry(0.2, 0.26, 0.3, 14)),
    mat('hongoPie', { color: 0xffeccd, roughness: 0.66 }),
  )
  pie.position.y = -0.02
  pie.castShadow = true
  grupo.add(pie)

  const ojos = crearOjos({ separacion: 0.1, alto: 0.0, tamano: 0.055, adelante: 0.19 })
  grupo.add(ojos)

  grupo.userData.tipoModelo = 'hongo'
  return grupo
}

// ---------------------------------------------------------------------------
// Rayo
// ---------------------------------------------------------------------------

function formaRayo() {
  const f = new THREE.Shape()
  const p = [
    [0.0, 0.6],
    [-0.26, 0.1],
    [-0.06, 0.1],
    [-0.2, -0.6],
    [0.26, 0.02],
    [0.04, 0.02],
    [0.2, 0.6],
  ]
  f.moveTo(p[0][0], p[0][1])
  for (let i = 1; i < p.length; i++) f.lineTo(p[i][0], p[i][1])
  f.closePath()
  return f
}

/** Rayo: zigzag extruido, amarillo y muy emisivo. */
export function crearRayo() {
  const grupo = new THREE.Group()
  const cuerpo = new THREE.Mesh(
    geo('rayo', () =>
      new THREE.ExtrudeGeometry(formaRayo(), {
        depth: 0.16,
        bevelEnabled: true,
        bevelThickness: 0.03,
        bevelSize: 0.025,
        bevelSegments: 1,
      }).center(),
    ),
    mat('rayo', {
      color: 0xfff05a,
      roughness: 0.25,
      metalness: 0.1,
      emissive: 0xffe000,
      emissiveIntensity: 1.1,
    }),
  )
  grupo.add(cuerpo)
  grupo.userData.tipoModelo = 'rayo'
  return grupo
}

// ---------------------------------------------------------------------------
// Estrella
// ---------------------------------------------------------------------------

function formaEstrella(puntas = 5, externo = 0.55, interno = 0.24) {
  const f = new THREE.Shape()
  for (let i = 0; i < puntas * 2; i++) {
    const r = i % 2 === 0 ? externo : interno
    const a = (i / (puntas * 2)) * TAU + Math.PI / 2
    const x = Math.cos(a) * r
    const y = Math.sin(a) * r
    i === 0 ? f.moveTo(x, y) : f.lineTo(x, y)
  }
  f.closePath()
  return f
}

/** Estrella dorada de 5 puntas, extruida, emisiva y con ojos. */
export function crearEstrella() {
  const grupo = new THREE.Group()
  const cuerpo = new THREE.Mesh(
    geo('estrella', () =>
      new THREE.ExtrudeGeometry(formaEstrella(), {
        depth: 0.18,
        bevelEnabled: true,
        bevelThickness: 0.04,
        bevelSize: 0.04,
        bevelSegments: 1,
      }).center(),
    ),
    mat('estrella', {
      color: 0xffe83d,
      roughness: 0.2,
      metalness: 0.15,
      emissive: 0xffc90e,
      emissiveIntensity: 0.95,
    }),
  )
  grupo.add(cuerpo)
  grupo.add(crearOjos({ separacion: 0.14, alto: 0.02, tamano: 0.075, adelante: 0.14 }))
  grupo.userData.tipoModelo = 'estrella'
  return grupo
}

// ---------------------------------------------------------------------------
// Bomba
// ---------------------------------------------------------------------------

/**
 * Bomba negra con mecha encendida (sprite aditivo) y ojos.
 * El grupo expone `userData.chispa` para animar la mecha.
 */
export function crearBomba() {
  const grupo = new THREE.Group()

  const cuerpo = new THREE.Mesh(
    geo('bombaCuerpo', () => new THREE.SphereGeometry(0.42, 16, 12)),
    mat('bombaCuerpo', { color: 0x2b2b33, roughness: 0.35, metalness: 0.35 }),
  )
  cuerpo.castShadow = true
  grupo.add(cuerpo)

  const tapa = new THREE.Mesh(
    geo('bombaTapa', () => new THREE.CylinderGeometry(0.13, 0.16, 0.13, 10)),
    mat('bombaTapa', { color: 0x4a4a58, roughness: 0.5, metalness: 0.6 }),
  )
  tapa.position.y = 0.42
  grupo.add(tapa)

  // Mecha: tubo corto curvado.
  const mecha = new THREE.Mesh(
    geo('bombaMecha', () =>
      new THREE.TubeGeometry(
        new THREE.QuadraticBezierCurve3(
          new THREE.Vector3(0, 0, 0),
          new THREE.Vector3(0.06, 0.13, 0),
          new THREE.Vector3(0.16, 0.2, 0),
        ),
        8,
        0.022,
        5,
        false,
      ),
    ),
    mat('bombaMechaMat', { color: 0xcbb894, roughness: 0.9 }),
  )
  mecha.position.y = 0.48
  grupo.add(mecha)

  // Chispa de la mecha: partícula aditiva animable.
  const chispa = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: sprite('destello'),
      color: 0xffb020,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      transparent: true,
    }),
  )
  chispa.position.set(0.16, 0.68, 0)
  chispa.scale.setScalar(0.42)
  grupo.add(chispa)
  grupo.userData.chispa = chispa

  grupo.add(crearOjos({ separacion: 0.13, alto: 0.06, tamano: 0.085, adelante: 0.34, enojado: true }))
  grupo.userData.tipoModelo = 'bomba'
  return grupo
}

// ---------------------------------------------------------------------------
// Bala
// ---------------------------------------------------------------------------

/** Bala plateada con ojos furiosos y bracitos. Mira a -Z. */
export function crearBala() {
  const grupo = new THREE.Group()

  const cuerpo = new THREE.Mesh(
    geo('balaCuerpo', () => {
      const g = new THREE.CapsuleGeometry(0.36, 0.6, 6, 16)
      g.rotateX(Math.PI * 0.5)
      return g
    }),
    mat('balaCuerpo', { color: 0xd9dde3, roughness: 0.22, metalness: 0.85 }),
  )
  cuerpo.castShadow = true
  grupo.add(cuerpo)

  // Bracitos cortos a los costados.
  const gBrazo = geo('balaBrazo', () => {
    const g = new THREE.CapsuleGeometry(0.09, 0.24, 4, 8)
    g.rotateZ(Math.PI * 0.5)
    return g
  })
  const mBrazo = mat('balaBrazo', { color: 0xb9c0c9, roughness: 0.3, metalness: 0.75 })
  for (const lado of [-1, 1]) {
    const b = new THREE.Mesh(gBrazo, mBrazo)
    b.position.set(lado * 0.42, -0.02, 0.06)
    b.rotation.z = lado * 0.35
    grupo.add(b)
  }

  grupo.add(crearOjos({ separacion: 0.15, alto: 0.07, tamano: 0.1, adelante: 0.52, enojado: true }))
  grupo.userData.tipoModelo = 'bala'
  return grupo
}

// ---------------------------------------------------------------------------
// Moneda
// ---------------------------------------------------------------------------

/** Moneda dorada con relieve en las dos caras. Mira a -Z. */
export function crearMoneda() {
  const grupo = new THREE.Group()
  const disco = new THREE.Mesh(
    geo('monedaDisco', () => {
      const g = new THREE.CylinderGeometry(0.34, 0.34, 0.08, 18)
      g.rotateX(Math.PI * 0.5)
      return g
    }),
    mat('moneda', {
      color: PALETA.moneda,
      roughness: 0.2,
      metalness: 0.9,
      emissive: 0x7a5a00,
      emissiveIntensity: 0.35,
    }),
  )
  disco.castShadow = true
  grupo.add(disco)

  const gAro = geo('monedaAro', () => {
    const g = new THREE.TorusGeometry(0.23, 0.032, 5, 18)
    return g
  })
  const mAro = mat('monedaAro', { color: PALETA.monedaBrillo, roughness: 0.25, metalness: 0.8 })
  for (const lado of [-1, 1]) {
    const aro = new THREE.Mesh(gAro, mAro)
    aro.position.z = lado * 0.045
    grupo.add(aro)
  }
  grupo.userData.tipoModelo = 'monedas'
  return grupo
}

// ---------------------------------------------------------------------------
// Fábrica por id de ítem
// ---------------------------------------------------------------------------

const FABRICAS = {
  banana: crearBanana,
  caparazonVerde: crearCaparazonVerde,
  caparazonRojo: crearCaparazonRojo,
  triple: crearCaparazonRojo,
  hongo: crearHongo,
  hongoTriple: crearHongo,
  rayo: crearRayo,
  estrella: crearEstrella,
  bomba: crearBomba,
  bala: crearBala,
  monedas: crearMoneda,
}

/**
 * Devuelve la malla del ítem pedido.
 * @param {string} id id de ítem (o 'caja' para la caja sorpresa)
 * @param {object} [opciones] `{ escala }`
 */
export function crearModeloItem(id, opciones = {}) {
  const fabrica = FABRICAS[id]
  if (!fabrica) return new THREE.Group()
  const g = fabrica(opciones)
  if (opciones.escala) g.scale.setScalar(opciones.escala)
  return g
}

// ---------------------------------------------------------------------------
// Caja de ítem
// ---------------------------------------------------------------------------

const CANT_FRAGMENTOS = 10

/**
 * Caja sorpresa: cubo con las caras de `sprite('cajaItem')`, girando sobre dos
 * ejes, flotando con un seno y con halo aditivo. Al tomarla estalla en
 * fragmentos y reaparece a los `REAPARICION_CAJA` segundos con rebote elástico.
 */
export class CajaItem {
  /**
   * @param {THREE.Vector3} posicion posición en mundo
   * @param {object} [opciones] `{ escala, semilla, indice }`
   */
  constructor(posicion, { escala = 1, semilla = 1, indice = 0 } = {}) {
    this.indice = indice
    this.escala = escala
    this.disponible = true
    this.tiempoRota = 0
    this.tAnimacion = 0
    this.faseFlote = (semilla % 100) * 0.37

    this.grupo = new THREE.Group()
    this.grupo.position.copy(posicion)

    // --- Cubo ---
    const material = mat('cajaItem', {
      color: 0xffffff,
      map: sprite('cajaItem'),
      roughness: 0.3,
      metalness: 0.1,
      emissive: PALETA.cajaItem,
      emissiveIntensity: 0.45,
      transparent: true,
    })
    this.cubo = new THREE.Mesh(
      geo('cajaCubo', () => new THREE.BoxGeometry(1.15, 1.15, 1.15)),
      material,
    )
    this.cubo.castShadow = true
    this.pivote = new THREE.Group()
    this.pivote.add(this.cubo)
    this.grupo.add(this.pivote)

    // --- Halo ---
    this.halo = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: sprite('destello'),
        color: PALETA.cajaItem,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        transparent: true,
        opacity: 0.55,
      }),
    )
    this.halo.scale.setScalar(2.9)
    this.grupo.add(this.halo)

    // --- Fragmentos del estallido ---
    const azar = rng(1000 + semilla)
    this.fragmentos = []
    const gFrag = geo('cajaFragmento', () => new THREE.TetrahedronGeometry(0.26))
    for (let i = 0; i < CANT_FRAGMENTOS; i++) {
      const m = new THREE.Mesh(gFrag, material)
      m.visible = false
      const a = (i / CANT_FRAGMENTOS) * TAU + azar() * 0.5
      m.userData.vel = new THREE.Vector3(
        Math.cos(a) * (2.6 + azar() * 2.4),
        3.4 + azar() * 2.6,
        Math.sin(a) * (2.6 + azar() * 2.4),
      )
      m.userData.giro = new THREE.Vector3(azar() * 8 - 4, azar() * 8 - 4, azar() * 8 - 4)
      this.grupo.add(m)
      this.fragmentos.push(m)
    }

    this.grupo.scale.setScalar(escala)
  }

  /** Posición en mundo de la caja (para la detección de recogida). */
  get posicion() {
    return this.grupo.position
  }

  /** La rompe: estallido + cuenta atrás de reaparición. */
  estallar() {
    if (!this.disponible) return false
    this.disponible = false
    this.tiempoRota = 0
    this.cubo.visible = false
    this.halo.visible = false
    for (const f of this.fragmentos) {
      f.visible = true
      f.position.set(0, 0, 0)
      f.rotation.set(0, 0, 0)
      f.scale.setScalar(1)
      f.userData.vida = 0
    }
    return true
  }

  /** Vuelve a estar disponible al instante (reinicio de carrera). */
  reiniciar() {
    this.disponible = true
    this.tiempoRota = 0
    this.cubo.visible = true
    this.cubo.scale.setScalar(1)
    this.halo.visible = true
    for (const f of this.fragmentos) f.visible = false
  }

  /**
   * @param {number} dt segundos
   * @param {number} tiempo tiempo global (s)
   */
  actualizar(dt, tiempo) {
    this.tAnimacion += dt
    if (this.disponible) {
      // Giro en dos ejes + flote senoidal + halo que respira.
      this.pivote.rotation.y += dt * 1.35
      this.pivote.rotation.x += dt * 0.85
      this.grupo.position.y = this.grupo.userData.yBase ?? (this.grupo.userData.yBase = this.grupo.position.y)
      this.grupo.position.y += Math.sin(tiempo * 2.1 + this.faseFlote) * 0.16
      const pulso = 0.5 + Math.sin(tiempo * 4.4 + this.faseFlote) * 0.12
      this.halo.material.opacity = pulso
      this.halo.scale.setScalar(2.7 + pulso * 0.7)
      // Rebote elástico de reaparición.
      if (this.tiempoRota > 0) {
        const t = clamp01(this.tiempoRota / 0.6)
        this.cubo.scale.setScalar(easeOutElastic(t))
        this.tiempoRota += dt
        if (t >= 1) {
          this.tiempoRota = 0
          this.cubo.scale.setScalar(1)
        }
      }
      return
    }

    // Rota: los fragmentos vuelan y se apagan.
    this.tiempoRota += dt
    for (const f of this.fragmentos) {
      if (!f.visible) continue
      f.userData.vida += dt
      const v = f.userData.vel
      v.y -= 16 * dt
      f.position.addScaledVector(v, dt)
      f.rotation.x += f.userData.giro.x * dt
      f.rotation.y += f.userData.giro.y * dt
      f.rotation.z += f.userData.giro.z * dt
      const k = 1 - easeOutCubic(clamp01(f.userData.vida / 0.75))
      f.scale.setScalar(Math.max(0.001, k))
      if (f.userData.vida > 0.8) f.visible = false
    }
    if (this.tiempoRota >= REAPARICION_CAJA) {
      this.disponible = true
      this.tiempoRota = 0.0001 // dispara la animación elástica de vuelta
      this.cubo.visible = true
      this.cubo.scale.setScalar(0.001)
      this.halo.visible = true
      for (const f of this.fragmentos) f.visible = false
    }
  }

  destruir() {
    this.halo.material.dispose()
    this.grupo.removeFromParent()
  }
}

/** Crea las cajas de una pista a partir de `pista.cajasItem`. */
export function crearCajasDePista(pista, { escala = 1 } = {}) {
  const lista = []
  const puntos = (pista && pista.cajasItem) || []
  for (let i = 0; i < puntos.length; i++) {
    lista.push(new CajaItem(puntos[i].posicion, { escala, semilla: i + 1, indice: i }))
  }
  return lista
}

export default {
  crearModeloItem,
  crearBanana,
  crearCaparazonVerde,
  crearCaparazonRojo,
  crearHongo,
  crearRayo,
  crearEstrella,
  crearBomba,
  crearBala,
  crearMoneda,
  CajaItem,
  crearCajasDePista,
  limpiarModelos,
}
