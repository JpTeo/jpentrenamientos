// Fábrica de decorado: props low-poly, estilizados y de colores saturados.
//
// Todas las funciones devuelven `{ grupo, actualizar?(dt, tiempo, camara) }`.
// Para poblados grandes (árboles, postes, público) usá `bosque()` / `instanciar()`,
// que arman `InstancedMesh` y mantienen las llamadas de dibujo bajo control.
//
// Ningún prop toca la escena: se cuelgan del grupo de la pista.
import * as THREE from 'three'
import { PALETA } from '../assets/paleta.js'
import { materialMaps, sprite, textura } from '../assets/texturas.js'
import { clamp01, lerp, rng, TAU } from '../core/utils.js'

// ---------------------------------------------------------------------------
// Caché de materiales y geometrías compartidas
// ---------------------------------------------------------------------------
const cacheMat = new Map()
const cacheGeo = new Map()

/** Material compartido por clave (se crea una sola vez por sesión). */
export function material(clave, crear) {
  let m = cacheMat.get(clave)
  if (!m) {
    m = crear()
    cacheMat.set(clave, m)
  }
  return m
}

/** Geometría compartida por clave. */
export function geometria(clave, crear) {
  let g = cacheGeo.get(clave)
  if (!g) {
    g = crear()
    cacheGeo.set(clave, g)
  }
  return g
}

/** Libera todo lo cacheado por el decorado. */
export function limpiarDecor() {
  for (const m of cacheMat.values()) if (m && m.dispose) m.dispose()
  for (const g of cacheGeo.values()) if (g && g.dispose) g.dispose()
  cacheMat.clear()
  cacheGeo.clear()
}

const matLambert = (clave, color, extra = {}) =>
  material(clave, () => new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0.02, ...extra }))

const _m4 = new THREE.Matrix4()
const _q = new THREE.Quaternion()
const _v = new THREE.Vector3()
const _v2 = new THREE.Vector3()
const _e = new THREE.Euler(0, 0, 0, 'YXZ')

/** Compone una matriz de posición/rotación/escala reutilizando temporales. */
function matriz(x, y, z, rotY = 0, ex = 1, ey = ex, ez = ex, rotX = 0, rotZ = 0) {
  _e.set(rotX, rotY, rotZ)
  _q.setFromEuler(_e)
  _v.set(x, y, z)
  _v2.set(ex, ey, ez)
  return _m4.compose(_v, _q, _v2)
}

// ---------------------------------------------------------------------------
// Plantillas: cada prop se describe como una lista de piezas {geo, mat, m}
// ---------------------------------------------------------------------------

function piezasArbol(tipo, o = {}) {
  const piezas = []
  const semilla = o.semilla ?? 1
  if (tipo === 'pino') {
    const tronco = geometria('pino:tronco', () => new THREE.CylinderGeometry(0.24, 0.36, 2.4, 6))
    piezas.push({
      geo: tronco,
      mat: material('corteza', () =>
        new THREE.MeshStandardMaterial({ ...materialMaps('corteza', [1, 2]), roughness: 0.95 }),
      ),
      m: new THREE.Matrix4().copy(matriz(0, 1.2, 0)),
    })
    const copaAlt = [0, 1, 2]
    for (const i of copaAlt) {
      const g = geometria(`pino:copa${i}`, () =>
        new THREE.ConeGeometry(2.5 - i * 0.62, 3.0 - i * 0.45, 8),
      )
      piezas.push({
        geo: g,
        mat: matLambert(`pino:hoja${i}`, [0x1f7a45, 0x2b9455, 0x3cb264][i], { flatShading: true }),
        m: new THREE.Matrix4().copy(matriz(0, 3.0 + i * 1.5, 0)),
      })
    }
  } else if (tipo === 'palmera') {
    const tronco = geometria('palmera:tronco', () => {
      const curva = new THREE.CatmullRomCurve3([
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(0.35, 2.2, 0.1),
        new THREE.Vector3(0.9, 4.4, 0.25),
        new THREE.Vector3(1.5, 6.2, 0.35),
      ])
      return new THREE.TubeGeometry(curva, 8, 0.26, 6, false)
    })
    piezas.push({
      geo: tronco,
      mat: matLambert('palmera:tronco', 0xa8794a, { flatShading: true }),
      m: new THREE.Matrix4(),
    })
    const hoja = geometria('palmera:hoja', () => {
      const g = new THREE.ConeGeometry(0.62, 3.4, 4, 1, false)
      g.rotateX(Math.PI * 0.5)
      g.scale(1, 0.22, 1)
      return g
    })
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * TAU
      piezas.push({
        geo: hoja,
        mat: matLambert('palmera:hoja', 0x3ec46a, { flatShading: true, side: THREE.DoubleSide }),
        m: new THREE.Matrix4().copy(
          matriz(1.5 + Math.cos(a) * 1.3, 6.2 - 0.35, 0.35 + Math.sin(a) * 1.3, -a, 1, 1, 1, 0.42, 0),
        ),
      })
    }
    piezas.push({
      geo: geometria('palmera:coco', () => new THREE.IcosahedronGeometry(0.28, 0)),
      mat: matLambert('palmera:coco', 0x6b4a2a, { flatShading: true }),
      m: new THREE.Matrix4().copy(matriz(1.5, 5.9, 0.35)),
    })
  } else {
    // 'redondo': el árbol cartoon clásico
    const tronco = geometria('redondo:tronco', () => new THREE.CylinderGeometry(0.28, 0.42, 2.1, 6))
    piezas.push({
      geo: tronco,
      mat: material('corteza', () =>
        new THREE.MeshStandardMaterial({ ...materialMaps('corteza', [1, 2]), roughness: 0.95 }),
      ),
      m: new THREE.Matrix4().copy(matriz(0, 1.05, 0)),
    })
    const r = rng(semilla + 5)
    const bolas = [
      { x: 0, y: 3.3, z: 0, s: 2.05, c: 0x53b93a },
      { x: -1.25, y: 2.7, z: 0.35, s: 1.35, c: 0x3d8f2a },
      { x: 1.15, y: 2.85, z: -0.4, s: 1.45, c: 0x74d64f },
      { x: 0.1, y: 4.5, z: 0.2, s: 1.15, c: 0x74d64f },
    ]
    bolas.forEach((b, i) => {
      piezas.push({
        geo: geometria(`redondo:bola${i}`, () => new THREE.IcosahedronGeometry(1, 1)),
        mat: matLambert(`redondo:hoja${b.c}`, b.c, { flatShading: true }),
        m: new THREE.Matrix4().copy(
          matriz(b.x, b.y, b.z, r() * TAU, b.s, b.s * 0.92, b.s),
        ),
      })
    })
  }
  return piezas
}

function piezasArbusto(o = {}) {
  const color = o.color ?? 0x3d8f2a
  const piezas = []
  const puntos = [
    { x: 0, y: 0.55, z: 0, s: 0.85 },
    { x: 0.62, y: 0.42, z: 0.18, s: 0.6 },
    { x: -0.5, y: 0.46, z: -0.25, s: 0.68 },
  ]
  puntos.forEach((p, i) => {
    piezas.push({
      geo: geometria(`arbusto${i}`, () => new THREE.IcosahedronGeometry(1, 0)),
      mat: matLambert(`arbusto:${color}`, color, { flatShading: true }),
      m: new THREE.Matrix4().copy(matriz(p.x, p.y, p.z, i * 1.1, p.s, p.s * 0.8, p.s)),
    })
  })
  return piezas
}

function piezasRoca(o = {}) {
  const tex = o.textura || 'rocaVolcanica'
  return [
    {
      geo: geometria(`roca:${o.detalle ?? 0}`, () => {
        const g = new THREE.IcosahedronGeometry(1, o.detalle ?? 0)
        const p = g.attributes.position
        const r = rng(77)
        for (let i = 0; i < p.count; i++) {
          const f = 0.78 + r() * 0.42
          p.setXYZ(i, p.getX(i) * f, p.getY(i) * f * 0.8, p.getZ(i) * f)
        }
        g.computeVertexNormals()
        return g
      }),
      mat: material(`roca:${tex}`, () =>
        new THREE.MeshStandardMaterial({
          ...materialMaps(tex, [1, 1]),
          roughness: 0.95,
          metalness: 0.02,
          flatShading: true,
        }),
      ),
      m: new THREE.Matrix4(),
    },
  ]
}

function piezasPoste(o = {}) {
  const alto = o.alto ?? 4.2
  const color = o.color ?? 0xd8dae0
  return [
    {
      geo: geometria(`poste:${alto}`, () => new THREE.CylinderGeometry(0.11, 0.14, alto, 7)),
      mat: matLambert(`poste:${color}`, color, { metalness: 0.55, roughness: 0.42 }),
      m: new THREE.Matrix4().copy(matriz(0, alto * 0.5, 0)),
    },
    {
      geo: geometria('poste:base', () => new THREE.CylinderGeometry(0.28, 0.34, 0.28, 8)),
      mat: matLambert('poste:base', 0x8a8f99, { metalness: 0.3, roughness: 0.7 }),
      m: new THREE.Matrix4().copy(matriz(0, 0.14, 0)),
    },
  ]
}

function piezasCono() {
  return [
    {
      geo: geometria('cono:cuerpo', () => new THREE.ConeGeometry(0.32, 0.78, 8)),
      mat: matLambert('cono:naranja', 0xff6a1a),
      m: new THREE.Matrix4().copy(matriz(0, 0.39, 0)),
    },
    {
      geo: geometria('cono:base', () => new THREE.BoxGeometry(0.62, 0.07, 0.62)),
      mat: matLambert('cono:base', 0x2b2b33),
      m: new THREE.Matrix4().copy(matriz(0, 0.035, 0)),
    },
    {
      geo: geometria('cono:banda', () => new THREE.CylinderGeometry(0.22, 0.26, 0.14, 8)),
      mat: matLambert('cono:blanco', 0xf7f3e8),
      m: new THREE.Matrix4().copy(matriz(0, 0.44, 0)),
    },
  ]
}

function piezasNeumaticos(o = {}) {
  const n = o.cantidad ?? 3
  const piezas = []
  for (let i = 0; i < n; i++) {
    piezas.push({
      geo: geometria('gomas:toro', () => new THREE.TorusGeometry(0.46, 0.2, 6, 12)),
      mat: matLambert('gomas', 0x24242c, { roughness: 0.95 }),
      m: new THREE.Matrix4().copy(matriz(0, 0.22 + i * 0.38, 0, i * 0.7, 1, 1, 1, Math.PI / 2, 0)),
    })
  }
  return piezas
}

/** Plantillas disponibles para `bosque()` e `instanciar()`. */
export function plantilla(tipo, opciones = {}) {
  switch (tipo) {
    case 'redondo':
    case 'pino':
    case 'palmera':
      return piezasArbol(tipo, opciones)
    case 'arbusto':
      return piezasArbusto(opciones)
    case 'roca':
      return piezasRoca(opciones)
    case 'poste':
      return piezasPoste(opciones)
    case 'cono':
      return piezasCono()
    case 'neumaticos':
      return piezasNeumaticos(opciones)
    case 'cristal':
      return [
        {
          geo: geometria('cristal', () => {
            const g = new THREE.ConeGeometry(0.45, 2.2, 5)
            g.translate(0, 1.1, 0)
            return g
          }),
          mat: material('cristal', () =>
            new THREE.MeshStandardMaterial({
              color: 0xff7a3c,
              emissive: 0xff4a00,
              emissiveIntensity: 1.5,
              roughness: 0.25,
              metalness: 0.1,
              flatShading: true,
            }),
          ),
          m: new THREE.Matrix4(),
        },
      ]
    default:
      throw new Error(`Plantilla de decorado desconocida: ${tipo}`)
  }
}

// ---------------------------------------------------------------------------
// Instanciado
// ---------------------------------------------------------------------------

/**
 * Crea un `InstancedMesh` por cada pieza de la plantilla.
 * @param {string} tipo nombre de plantilla
 * @param {Array} transformaciones `[{x,y,z,rotY,escala}]`
 * @param {object} opciones `{ sombra:boolean, opcionesPlantilla }`
 */
export function instanciar(tipo, transformaciones, opciones = {}) {
  const piezas = plantilla(tipo, opciones.opcionesPlantilla || {})
  const grupo = new THREE.Group()
  grupo.name = `inst_${tipo}`
  const n = transformaciones.length
  if (!n) return { grupo }
  const local = new THREE.Matrix4()
  const mundo = new THREE.Matrix4()
  for (const pieza of piezas) {
    const inst = new THREE.InstancedMesh(pieza.geo, pieza.mat, n)
    inst.castShadow = opciones.sombra !== false
    inst.receiveShadow = false
    for (let i = 0; i < n; i++) {
      const t = transformaciones[i]
      const e = t.escala ?? 1
      local.copy(
        matriz(t.x, t.y ?? 0, t.z, t.rotY ?? 0, e * (t.escalaX ?? 1), e * (t.escalaY ?? 1), e * (t.escalaZ ?? 1)),
      )
      mundo.multiplyMatrices(local, pieza.m)
      inst.setMatrixAt(i, mundo)
    }
    inst.instanceMatrix.needsUpdate = true
    inst.computeBoundingSphere()
    grupo.add(inst)
  }
  return { grupo }
}

/**
 * Poblado mixto: agrupa por tipo y devuelve un grupo con todos los
 * `InstancedMesh` necesarios (2 o 3 llamadas de dibujo por tipo de prop).
 * @param {Array} items `[{tipo, x, y, z, rotY, escala}]`
 */
export function bosque(items, opciones = {}) {
  const grupo = new THREE.Group()
  grupo.name = 'bosque'
  const porTipo = new Map()
  for (const it of items) {
    let a = porTipo.get(it.tipo)
    if (!a) {
      a = []
      porTipo.set(it.tipo, a)
    }
    a.push(it)
  }
  for (const [tipo, lista] of porTipo) {
    grupo.add(instanciar(tipo, lista, opciones).grupo)
  }
  return { grupo }
}

// ---------------------------------------------------------------------------
// Props sueltos
// ---------------------------------------------------------------------------

/** Árbol individual (para los pocos que necesiten posición exacta). */
export function arbol(tipo = 'redondo', o = {}) {
  const grupo = new THREE.Group()
  for (const p of plantilla(tipo, o)) {
    const m = new THREE.Mesh(p.geo, p.mat)
    m.applyMatrix4(p.m)
    m.castShadow = true
    grupo.add(m)
  }
  return { grupo }
}

export function arbusto(o = {}) {
  return arbol('arbusto', o)
}

export function roca(o = {}) {
  return arbol('roca', o)
}

export function poste(o = {}) {
  return arbol('poste', o)
}

export function cono(o = {}) {
  return arbol('cono', o)
}

export function neumaticos(o = {}) {
  return arbol('neumaticos', o)
}

/** Cartel publicitario sobre dos postes, con texto de la cooperativa. */
export function cartelPublicitario(o = {}) {
  const ancho = o.ancho ?? 7
  const alto = o.alto ?? 2
  const altura = o.altura ?? 2.6
  const grupo = new THREE.Group()
  const matPanel = material(`cartel:${o.texto}:${o.fondo ?? PALETA.marcaPrimario}`, () =>
    new THREE.MeshStandardMaterial({
      map: sprite('cartel', { texto: o.texto ?? 'TEO', fondo: o.fondo ?? PALETA.marcaPrimario }),
      roughness: 0.68,
      metalness: 0.06,
      side: THREE.DoubleSide,
    }),
  )
  const panel = new THREE.Mesh(new THREE.BoxGeometry(ancho, alto, 0.16), matPanel)
  panel.position.y = altura + alto * 0.5
  panel.castShadow = true
  grupo.add(panel)
  const matPoste = matLambert('cartel:poste', 0x9aa0aa, { metalness: 0.6, roughness: 0.4 })
  for (const s of [-1, 1]) {
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.13, altura + alto * 0.5, 6), matPoste)
    p.position.set(s * ancho * 0.36, (altura + alto * 0.5) * 0.5, 0)
    p.castShadow = true
    grupo.add(p)
  }
  return { grupo }
}

/** Farol de pista: poste + cabezal con material emisivo. */
export function farol(o = {}) {
  const alto = o.alto ?? 5.4
  const grupo = new THREE.Group()
  const matPoste = matLambert('farol:poste', 0x3b414d, { metalness: 0.55, roughness: 0.45 })
  const mastil = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.15, alto, 7), matPoste)
  mastil.position.y = alto * 0.5
  mastil.castShadow = true
  grupo.add(mastil)
  const brazo = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.12, 0.12), matPoste)
  brazo.position.set(0.55, alto - 0.15, 0)
  grupo.add(brazo)
  const matLuz = material(`farol:luz:${o.color ?? 0xfff3c0}`, () =>
    new THREE.MeshStandardMaterial({
      color: o.color ?? 0xfff3c0,
      emissive: o.color ?? 0xfff3c0,
      emissiveIntensity: 1.6,
      roughness: 0.3,
    }),
  )
  const cabeza = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.22, 0.5), matLuz)
  cabeza.position.set(1.1, alto - 0.28, 0)
  grupo.add(cabeza)
  return {
    grupo,
    actualizar(dt, tiempo) {
      matLuz.emissiveIntensity = 1.45 + Math.sin(tiempo * 2.1 + grupo.position.x) * 0.12
    },
  }
}

/** Tribuna con público animado (sprites de `texturaPublico`). */
export function tribuna(o = {}) {
  const largo = o.largo ?? 22
  const filas = o.filas ?? 5
  const grupo = new THREE.Group()
  const matEstructura = matLambert(`tribuna:${o.color ?? 0xf0f0f5}`, o.color ?? 0xf0f0f5, {
    roughness: 0.8,
  })
  const matEscalon = matLambert('tribuna:escalon', 0xb8bcc6, { roughness: 0.9 })
  const capasPublico = []
  for (let f = 0; f < filas; f++) {
    const y = 0.55 + f * 0.72
    const z = -f * 1.05
    const grada = new THREE.Mesh(new THREE.BoxGeometry(largo, 0.7, 1.05), matEscalon)
    grada.position.set(0, y - 0.35, z)
    grada.receiveShadow = true
    grada.castShadow = f === filas - 1
    grupo.add(grada)

    const tex = sprite('publico', { semilla: 5 + f * 3 }).clone()
    tex.needsUpdate = true
    tex.wrapS = THREE.RepeatWrapping
    tex.repeat.set(Math.max(1, Math.round(largo / 9)), 1)
    tex.offset.x = f * 0.17
    const matPub = new THREE.MeshStandardMaterial({
      map: tex,
      transparent: true,
      alphaTest: 0.4,
      side: THREE.DoubleSide,
      roughness: 0.9,
    })
    const plano = new THREE.Mesh(new THREE.PlaneGeometry(largo, 1.5), matPub)
    plano.position.set(0, y + 0.5, z + 0.16)
    grupo.add(plano)
    capasPublico.push({ plano, tex, mat: matPub, base: y + 0.5, fase: f * 1.3 })
  }
  // Techo volado
  const techo = new THREE.Mesh(new THREE.BoxGeometry(largo + 1.4, 0.28, filas * 1.05 + 2.2), matEstructura)
  techo.position.set(0, 0.55 + filas * 0.72 + 1.4, -filas * 0.52)
  techo.castShadow = true
  grupo.add(techo)
  for (const s of [-1, 1]) {
    const col = new THREE.Mesh(
      new THREE.BoxGeometry(0.32, 0.55 + filas * 0.72 + 1.4, 0.32),
      matEstructura,
    )
    col.position.set(s * (largo * 0.46), (0.55 + filas * 0.72 + 1.4) * 0.5, -filas * 1.05 - 0.6)
    col.castShadow = true
    grupo.add(col)
  }
  return {
    grupo,
    actualizar(dt, tiempo) {
      for (const c of capasPublico) {
        c.plano.position.y = c.base + Math.abs(Math.sin(tiempo * 3.1 + c.fase)) * 0.16
        c.tex.offset.x += dt * 0.006
      }
    },
  }
}

/** Globo aerostático que flota y gira suavemente. */
export function globoAerostatico(o = {}) {
  const color = o.color ?? PALETA.marcaPrimario
  const grupo = new THREE.Group()
  const globo = new THREE.Mesh(
    geometria('globo:esfera', () => {
      const g = new THREE.SphereGeometry(3.2, 14, 12)
      g.scale(1, 1.22, 1)
      return g
    }),
    matLambert(`globo:${color}`, color, { flatShading: true, roughness: 0.6 }),
  )
  globo.position.y = 4.4
  globo.castShadow = true
  grupo.add(globo)
  const franja = new THREE.Mesh(
    geometria('globo:franja', () => {
      const g = new THREE.SphereGeometry(3.24, 14, 12, 0, TAU, Math.PI * 0.42, Math.PI * 0.16)
      g.scale(1, 1.22, 1)
      return g
    }),
    matLambert('globo:franja', PALETA.marcaSecundario, { side: THREE.DoubleSide }),
  )
  franja.position.y = 4.4
  grupo.add(franja)
  const canasta = new THREE.Mesh(
    geometria('globo:canasta', () => new THREE.BoxGeometry(1.3, 1.1, 1.3)),
    material('globo:mimbre', () =>
      new THREE.MeshStandardMaterial({ ...materialMaps('madera', [1, 1]), roughness: 0.9 }),
    ),
  )
  canasta.position.y = 0.55
  canasta.castShadow = true
  grupo.add(canasta)
  const matCuerda = matLambert('globo:cuerda', 0x6b5a3a)
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * TAU + 0.4
    const cuerda = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 2.4, 4), matCuerda)
    cuerda.position.set(Math.cos(a) * 0.62, 2.3, Math.sin(a) * 0.62)
    grupo.add(cuerda)
  }
  const base = o.y ?? 0
  const fase = o.fase ?? 0
  return {
    grupo,
    actualizar(dt, tiempo) {
      grupo.position.y = base + Math.sin(tiempo * 0.32 + fase) * 1.9
      grupo.rotation.y += dt * 0.09
    },
  }
}

/** Molino de viento con aspas girando. */
export function molino(o = {}) {
  const alto = o.alto ?? 11
  const grupo = new THREE.Group()
  const torre = new THREE.Mesh(
    new THREE.CylinderGeometry(0.85, 1.7, alto, 10),
    matLambert('molino:torre', 0xf3ece0, { roughness: 0.85 }),
  )
  torre.position.y = alto * 0.5
  torre.castShadow = true
  grupo.add(torre)
  const techo = new THREE.Mesh(
    new THREE.ConeGeometry(1.25, 1.8, 10),
    matLambert('molino:techo', PALETA.marcaPrimario),
  )
  techo.position.y = alto + 0.85
  techo.castShadow = true
  grupo.add(techo)

  const eje = new THREE.Group()
  eje.position.set(0, alto - 0.4, 1.15)
  grupo.add(eje)
  const matAspa = matLambert('molino:aspa', 0xfff6e2, { side: THREE.DoubleSide })
  const matViga = matLambert('molino:viga', 0x8a5a2c)
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * TAU
    const brazo = new THREE.Group()
    brazo.rotation.z = a
    const viga = new THREE.Mesh(new THREE.BoxGeometry(0.16, 5.4, 0.16), matViga)
    viga.position.y = 2.7
    brazo.add(viga)
    const tela = new THREE.Mesh(new THREE.PlaneGeometry(1.15, 4.2), matAspa)
    tela.position.set(0.62, 2.9, 0.06)
    brazo.add(tela)
    eje.add(brazo)
  }
  const vel = o.velocidad ?? 0.55
  return {
    grupo,
    actualizar(dt) {
      eje.rotation.z += dt * vel
    },
  }
}

/** Guirnalda de banderines entre dos puntos (catenaria animada). */
export function banderin(o = {}) {
  const desde = o.desde instanceof THREE.Vector3 ? o.desde : new THREE.Vector3(...(o.desde || [0, 5, 0]))
  const hasta = o.hasta instanceof THREE.Vector3 ? o.hasta : new THREE.Vector3(...(o.hasta || [12, 5, 0]))
  const cantidad = o.cantidad ?? 16
  const caida = o.caida ?? 1.6
  const colores = o.colores || [
    PALETA.marcaPrimario,
    PALETA.marcaSecundario,
    PALETA.marcaTerciario,
    PALETA.marcaVerde,
  ]
  const grupo = new THREE.Group()
  // Cuerda
  const puntosCuerda = []
  for (let i = 0; i <= 24; i++) {
    const t = i / 24
    const p = new THREE.Vector3().lerpVectors(desde, hasta, t)
    p.y -= Math.sin(t * Math.PI) * caida
    puntosCuerda.push(p)
  }
  const cuerda = new THREE.Mesh(
    new THREE.TubeGeometry(new THREE.CatmullRomCurve3(puntosCuerda), 24, 0.035, 4, false),
    matLambert('banderin:cuerda', 0x40331f),
  )
  grupo.add(cuerda)

  const geoBandera = geometria('banderin:tri', () => {
    const g = new THREE.BufferGeometry()
    const v = new Float32Array([-0.24, 0, 0, 0.24, 0, 0, 0, -0.56, 0])
    g.setAttribute('position', new THREE.BufferAttribute(v, 3))
    g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]), 3))
    g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array([0, 1, 1, 1, 0.5, 0]), 2))
    return g
  })
  const instancias = []
  const porColor = new Map()
  for (let i = 0; i < cantidad; i++) {
    const t = (i + 0.5) / cantidad
    const c = colores[i % colores.length]
    let lista = porColor.get(c)
    if (!lista) {
      lista = []
      porColor.set(c, lista)
    }
    const p = new THREE.Vector3().lerpVectors(desde, hasta, t)
    p.y -= Math.sin(t * Math.PI) * caida
    lista.push({ p, t, fase: i * 0.7 })
  }
  const dir = new THREE.Vector3().subVectors(hasta, desde)
  const rotY = Math.atan2(dir.x, dir.z) + Math.PI / 2
  for (const [c, lista] of porColor) {
    const mat = matLambert(`banderin:${c}`, c, { side: THREE.DoubleSide, roughness: 0.75 })
    const inst = new THREE.InstancedMesh(geoBandera, mat, lista.length)
    inst.frustumCulled = false
    inst.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    grupo.add(inst)
    instancias.push({ inst, lista })
  }
  return {
    grupo,
    actualizar(dt, tiempo) {
      for (const { inst, lista } of instancias) {
        for (let i = 0; i < lista.length; i++) {
          const b = lista[i]
          const onda = Math.sin(tiempo * 3.4 + b.fase) * 0.32
          inst.setMatrixAt(i, matriz(b.p.x, b.p.y, b.p.z, rotY, 1, 1, 1, 0, onda))
        }
        inst.instanceMatrix.needsUpdate = true
      }
    },
  }
}

/** Chimenea volcánica: cono de roca con columna de humo que sube. */
export function chimeneaVolcanica(o = {}) {
  const alto = o.alto ?? 7
  const radio = o.radio ?? 3.2
  const grupo = new THREE.Group()
  const cono = new THREE.Mesh(
    new THREE.ConeGeometry(radio, alto, 9, 2, true),
    material('chimenea:roca', () =>
      new THREE.MeshStandardMaterial({
        ...materialMaps('rocaVolcanica', [2, 2]),
        roughness: 0.95,
        flatShading: true,
        side: THREE.DoubleSide,
      }),
    ),
  )
  cono.position.y = alto * 0.5
  cono.castShadow = true
  cono.receiveShadow = true
  grupo.add(cono)
  const boca = new THREE.Mesh(
    new THREE.CircleGeometry(radio * 0.34, 12),
    material('chimenea:boca', () =>
      new THREE.MeshStandardMaterial({
        color: PALETA.lava,
        emissive: PALETA.lava,
        emissiveIntensity: 2.2,
        roughness: 0.5,
      }),
    ),
  )
  boca.rotation.x = -Math.PI / 2
  boca.position.y = alto - 0.05
  grupo.add(boca)

  const nHumo = o.humo ?? 7
  const matHumo = material('humo:decor', () =>
    new THREE.MeshBasicMaterial({
      map: sprite('humo', { semilla: 4 }),
      color: 0x776b66,
      transparent: true,
      opacity: 0.42,
      depthWrite: false,
      blending: THREE.NormalBlending,
    }),
  )
  const instHumo = new THREE.InstancedMesh(
    geometria('humo:plano', () => new THREE.PlaneGeometry(1, 1)),
    matHumo,
    nHumo,
  )
  instHumo.frustumCulled = false
  instHumo.renderOrder = 4
  instHumo.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
  grupo.add(instHumo)
  const fase = o.fase ?? 0

  return {
    grupo,
    actualizar(dt, tiempo, camara) {
      const rotCam = camara ? Math.atan2(
        camara.position.x - grupo.position.x,
        camara.position.z - grupo.position.z,
      ) : 0
      for (let i = 0; i < nHumo; i++) {
        const ciclo = ((tiempo * 0.16 + fase + i / nHumo) % 1 + 1) % 1
        const y = alto + ciclo * 16
        const esc = 2.2 + ciclo * 7
        const desvio = Math.sin(ciclo * 4 + i) * ciclo * 4
        instHumo.setMatrixAt(i, matriz(desvio, y, desvio * 0.4, rotCam, esc, esc, esc))
      }
      instHumo.instanceMatrix.needsUpdate = true
      matHumo.opacity = 0.36 + Math.sin(tiempo * 0.8 + fase) * 0.06
    },
  }
}

/** Géiser de lava con temporizador determinista. */
export function geiserDeLava(o = {}) {
  const periodo = o.periodo ?? 7.5
  const fase = o.fase ?? 0
  const alturaMax = o.altura ?? 12
  const grupo = new THREE.Group()
  const matLava = material('geiser:lava', () =>
    new THREE.MeshStandardMaterial({
      map: textura('lava', [1, 3]),
      emissiveMap: textura('lava', [1, 3]),
      emissive: 0xffffff,
      emissiveIntensity: 2.4,
      roughness: 0.4,
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
    }),
  )
  const columna = new THREE.Mesh(
    geometria('geiser:columna', () => {
      const g = new THREE.CylinderGeometry(0.55, 1.25, 1, 10, 1, true)
      g.translate(0, 0.5, 0)
      return g
    }),
    matLava,
  )
  columna.scale.set(1, 0.01, 1)
  grupo.add(columna)
  const boca = new THREE.Mesh(
    geometria('geiser:boca', () => new THREE.TorusGeometry(1.5, 0.42, 6, 12)),
    material('geiser:roca', () =>
      new THREE.MeshStandardMaterial({
        ...materialMaps('rocaVolcanica', [1, 1]),
        roughness: 0.95,
        flatShading: true,
      }),
    ),
  )
  boca.rotation.x = Math.PI / 2
  boca.position.y = 0.18
  boca.castShadow = true
  grupo.add(boca)
  const brasas = new THREE.InstancedMesh(
    geometria('geiser:brasa', () => new THREE.IcosahedronGeometry(0.3, 0)),
    material('geiser:brasaMat', () =>
      new THREE.MeshStandardMaterial({
        color: PALETA.lavaBrillo,
        emissive: PALETA.lava,
        emissiveIntensity: 2.6,
        roughness: 0.4,
      }),
    ),
    9,
  )
  brasas.frustumCulled = false
  brasas.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
  grupo.add(brasas)

  return {
    grupo,
    /** Devuelve 0..1: cuánta lava está saliendo en este instante. */
    intensidad(tiempo) {
      const c = ((tiempo / periodo + fase) % 1 + 1) % 1
      return c < 0.26 ? Math.sin((c / 0.26) * Math.PI) : 0
    },
    actualizar(dt, tiempo) {
      const c = ((tiempo / periodo + fase) % 1 + 1) % 1
      const f = c < 0.26 ? Math.sin((c / 0.26) * Math.PI) : 0
      const h = Math.max(0.01, f * alturaMax)
      columna.scale.set(0.7 + f * 0.6, h, 0.7 + f * 0.6)
      matLava.opacity = clamp01(f * 1.3)
      matLava.emissiveIntensity = 1.8 + f * 1.6
      for (let i = 0; i < 9; i++) {
        const t = ((tiempo * 0.9 + i * 0.37) % 1 + 1) % 1
        const a = (i / 9) * TAU
        const r = 0.6 + t * 3.4
        const y = f > 0.02 ? h * 0.9 + t * 5 - t * t * 7 : -50
        brasas.setMatrixAt(i, matriz(Math.cos(a) * r, y, Math.sin(a) * r, t * 6, 0.4 + f * 0.7))
      }
      brasas.instanceMatrix.needsUpdate = true
    },
  }
}

/** Puente recto de tablero + pilares. Se orienta a lo largo de +X. */
export function puente(o = {}) {
  const largo = o.largo ?? 40
  const ancho = o.ancho ?? 22
  const alto = o.alto ?? 6
  const grupo = new THREE.Group()
  const matEstructura = o.piedra
    ? material('puente:piedra', () =>
        new THREE.MeshStandardMaterial({ ...materialMaps('rocaVolcanica', [3, 1]), roughness: 0.95 }),
      )
    : material('puente:madera', () =>
        new THREE.MeshStandardMaterial({ ...materialMaps('madera', [6, 1]), roughness: 0.9 }),
      )
  // Vigas laterales bajo la calzada (la calzada la dibuja la pista).
  for (const s of [-1, 1]) {
    const viga = new THREE.Mesh(new THREE.BoxGeometry(largo, 1.1, 1.1), matEstructura)
    viga.position.set(0, -0.75, s * (ancho * 0.5 - 0.55))
    viga.castShadow = true
    viga.receiveShadow = true
    grupo.add(viga)
  }
  const tablero = new THREE.Mesh(new THREE.BoxGeometry(largo, 0.5, ancho), matEstructura)
  tablero.position.y = -0.62
  tablero.receiveShadow = true
  tablero.castShadow = true
  grupo.add(tablero)
  const pilares = o.pilares ?? 3
  for (let i = 0; i < pilares; i++) {
    const x = lerp(-largo * 0.4, largo * 0.4, pilares === 1 ? 0.5 : i / (pilares - 1))
    for (const s of [-1, 1]) {
      const p = new THREE.Mesh(
        new THREE.CylinderGeometry(0.85, 1.15, alto, 8),
        matEstructura,
      )
      p.position.set(x, -alto * 0.5 - 0.8, s * (ancho * 0.32))
      p.castShadow = true
      grupo.add(p)
    }
  }
  if (o.arcos !== false && !o.piedra) {
    const matArco = matLambert('puente:arco', PALETA.marcaPrimario, { roughness: 0.7 })
    for (const s of [-1, 1]) {
      const arco = new THREE.Mesh(
        new THREE.TorusGeometry(largo * 0.42, 0.35, 6, 20, Math.PI),
        matArco,
      )
      arco.position.set(0, -0.4, s * (ancho * 0.5 - 0.4))
      arco.castShadow = true
      grupo.add(arco)
    }
  }
  return { grupo }
}

/** Túnel abierto por los extremos, orientado a lo largo de +X. */
export function tunel(o = {}) {
  const largo = o.largo ?? 45
  const radio = o.radio ?? 15
  const grupo = new THREE.Group()
  const geo = new THREE.CylinderGeometry(radio, radio, largo, 18, 1, true, 0, Math.PI)
  geo.rotateZ(Math.PI / 2)
  const mat = material('tunel:mat', () =>
    new THREE.MeshStandardMaterial({
      ...materialMaps(o.textura || 'ladrillo', [8, 3]),
      roughness: 0.92,
      side: THREE.BackSide,
    }),
  )
  const bóveda = new THREE.Mesh(geo, mat)
  bóveda.receiveShadow = true
  grupo.add(bóveda)
  const matBorde = matLambert('tunel:borde', 0xd8d2c4)
  for (const s of [-1, 1]) {
    const anillo = new THREE.Mesh(new THREE.TorusGeometry(radio + 0.4, 0.6, 6, 20, Math.PI), matBorde)
    anillo.position.x = s * largo * 0.5
    anillo.rotation.y = Math.PI / 2
    anillo.castShadow = true
    grupo.add(anillo)
  }
  return { grupo }
}

/** Pórtico de meta con damero, banderas al viento y cartel «META». */
export function arcoMeta(o = {}) {
  const ancho = o.ancho ?? 26
  const alto = o.alto ?? 9.5
  const texto = o.texto ?? 'META'
  const grupo = new THREE.Group()

  const matDamero = material('meta:damero', () =>
    new THREE.MeshStandardMaterial({
      ...materialMaps('damero', [8, 1], { filas: 4 }),
      roughness: 0.7,
    }),
  )
  const matPilar = matLambert(`meta:pilar:${o.colorPilar ?? PALETA.marcaTerciario}`, o.colorPilar ?? PALETA.marcaTerciario, {
    roughness: 0.62,
    metalness: 0.12,
  })

  const viga = new THREE.Mesh(new THREE.BoxGeometry(ancho, 1.5, 1.3), matDamero)
  viga.position.y = alto
  viga.castShadow = true
  grupo.add(viga)

  for (const s of [-1, 1]) {
    const pilar = new THREE.Mesh(new THREE.BoxGeometry(1.5, alto, 1.5), matPilar)
    pilar.position.set(s * (ancho * 0.5 - 0.75), alto * 0.5, 0)
    pilar.castShadow = true
    pilar.receiveShadow = true
    grupo.add(pilar)
    const base = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.7, 2.6), matPilar)
    base.position.set(s * (ancho * 0.5 - 0.75), 0.35, 0)
    base.castShadow = true
    grupo.add(base)
  }

  // Cartel con el texto de la meta.
  const matCartel = material(`meta:cartel:${texto}`, () =>
    new THREE.MeshStandardMaterial({
      map: sprite('cartel', { texto, fondo: o.fondoCartel ?? PALETA.marcaPrimario }),
      roughness: 0.6,
      side: THREE.DoubleSide,
    }),
  )
  const cartel = new THREE.Mesh(new THREE.BoxGeometry(ancho * 0.42, 2.6, 0.25), matCartel)
  cartel.position.set(0, alto + 2.1, 0)
  cartel.castShadow = true
  grupo.add(cartel)

  // Banderas sobre la viga.
  const banderas = []
  const colores = o.colores || [
    PALETA.jp,
    PALETA.male,
    PALETA.keke,
    PALETA.mati,
    PALETA.marcaSecundario,
  ]
  const nBanderas = o.banderas ?? 7
  const geoBandera = geometria('meta:bandera', () => new THREE.PlaneGeometry(1.6, 1.05, 6, 1))
  for (let i = 0; i < nBanderas; i++) {
    const x = lerp(-ancho * 0.4, ancho * 0.4, nBanderas === 1 ? 0.5 : i / (nBanderas - 1))
    const mastil = new THREE.Mesh(
      new THREE.CylinderGeometry(0.06, 0.06, 2.2, 5),
      matLambert('meta:mastil', 0xdadde3, { metalness: 0.5, roughness: 0.4 }),
    )
    mastil.position.set(x, alto + 1.85, 0)
    grupo.add(mastil)
    const color = colores[i % colores.length]
    const tela = new THREE.Mesh(geoBandera, matLambert(`meta:tela:${color}`, color, {
      side: THREE.DoubleSide,
      roughness: 0.8,
    }))
    tela.position.set(x + 0.8, alto + 2.5, 0)
    grupo.add(tela)
    banderas.push({ tela, base: tela.geometry.attributes.position.array.slice(), fase: i * 0.9 })
  }

  return {
    grupo,
    actualizar(dt, tiempo) {
      for (const b of banderas) {
        b.tela.rotation.y = Math.sin(tiempo * 2.2 + b.fase) * 0.28
        b.tela.rotation.z = Math.sin(tiempo * 3.1 + b.fase) * 0.09
      }
    },
  }
}

/** Franja de damero pintada sobre la calzada (línea de meta). */
export function lineaMeta(o = {}) {
  const ancho = o.ancho ?? 22
  const largo = o.largo ?? 3.2
  const geo = new THREE.PlaneGeometry(ancho, largo)
  geo.rotateX(-Math.PI / 2)
  const mat = material('meta:pintura', () =>
    new THREE.MeshStandardMaterial({
      ...materialMaps('damero', [Math.round(ancho / 2.6), 1], { filas: 4 }),
      roughness: 0.8,
      polygonOffset: true,
      polygonOffsetFactor: -6,
      polygonOffsetUnits: -6,
    }),
  )
  const malla = new THREE.Mesh(geo, mat)
  malla.receiveShadow = true
  return { grupo: malla }
}

/** Brasas flotando (partículas simples, deterministas). */
export function brasas(o = {}) {
  const cantidad = o.cantidad ?? 90
  const radio = o.radio ?? 90
  const altura = o.altura ?? 26
  const azar = rng(o.semilla ?? 31)
  const mat = material('brasas:mat', () =>
    new THREE.MeshBasicMaterial({
      map: sprite('destello', { dureza: 0.2 }),
      color: o.color ?? PALETA.lavaBrillo,
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: true,
    }),
  )
  const inst = new THREE.InstancedMesh(
    geometria('brasas:plano', () => new THREE.PlaneGeometry(1, 1)),
    mat,
    cantidad,
  )
  inst.frustumCulled = false
  inst.renderOrder = 5
  inst.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
  const datos = []
  for (let i = 0; i < cantidad; i++) {
    datos.push({
      x: (azar() * 2 - 1) * radio,
      z: (azar() * 2 - 1) * radio,
      fase: azar(),
      vel: 0.05 + azar() * 0.09,
      esc: 0.28 + azar() * 0.6,
      giro: azar() * TAU,
    })
  }
  const grupo = new THREE.Group()
  grupo.add(inst)
  return {
    grupo,
    actualizar(dt, tiempo, camara) {
      const rot = camara
        ? Math.atan2(camara.position.x - grupo.position.x, camara.position.z - grupo.position.z)
        : 0
      for (let i = 0; i < cantidad; i++) {
        const d = datos[i]
        const c = ((tiempo * d.vel + d.fase) % 1 + 1) % 1
        const y = c * altura
        const bal = Math.sin(tiempo * 1.4 + d.giro) * 2.4
        const esc = d.esc * (1 - c * 0.55)
        inst.setMatrixAt(i, matriz(d.x + bal, y, d.z + bal * 0.6, rot, esc))
      }
      inst.instanceMatrix.needsUpdate = true
      mat.opacity = 0.7 + Math.sin(tiempo * 2) * 0.12
    },
  }
}

export default {
  arbol,
  arbusto,
  roca,
  poste,
  cono,
  neumaticos,
  cartelPublicitario,
  farol,
  tribuna,
  globoAerostatico,
  molino,
  banderin,
  chimeneaVolcanica,
  geiserDeLava,
  puente,
  tunel,
  arcoMeta,
  lineaMeta,
  brasas,
  bosque,
  instanciar,
  plantilla,
  limpiarDecor,
}
