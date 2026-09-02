// Materiales compartidos de personajes y karts.
//
// Look "toon-realista": MeshStandardMaterial con rugosidad alta, poco metal y
// flat shading donde el facetado low-poly suma (pelo, barba, goma). Encima se
// le puede pegar un contorno estilo cel-shading (geometría duplicada con
// `side: BackSide` expandida por normales), que es lo que le da el borde nítido
// de dibujo animado.
//
// Todo se cachea por color: cien karts comparten cuatro materiales de metal.
import * as THREE from 'three'

/** Caché principal: clave textual -> material. */
const cache = new Map()

/** Todos los materiales creados acá, para poder inyectarles el envMap. */
const registro = new Set()

/** Caché de geometrías expandidas para contorno: geometría -> (grosor -> geo). */
const cacheContorno = new WeakMap()

/** Entorno (PMREM) activo; se aplica a todo lo que se cree después. */
let entornoActual = null
let intensidadEntorno = 1

function hexClave(c) {
  return (c instanceof THREE.Color ? c.getHex() : c).toString(16).padStart(6, '0')
}

/** Registra el material y le aplica el entorno vigente. */
function registrar(material) {
  registro.add(material)
  if (entornoActual && material.isMeshStandardMaterial) {
    material.envMap = entornoActual
    material.envMapIntensity = (material.userData.intensidadEntorno ?? 1) * intensidadEntorno
    material.needsUpdate = true
  }
  return material
}

function memo(clave, fabrica) {
  const previo = cache.get(clave)
  if (previo) return previo
  const m = registrar(fabrica())
  m.userData.claveCache = clave
  cache.set(clave, m)
  return m
}

// ---------------------------------------------------------------------------
// Materiales base
// ---------------------------------------------------------------------------

/** Piel: mate, con un pelín de brillo subcutáneo en el specular. */
export function materialPiel(color = 0xd9a578, opciones = {}) {
  const clave = `piel:${hexClave(color)}:${opciones.map ? opciones.map.uuid : '-'}`
  return memo(clave, () => {
    const m = new THREE.MeshStandardMaterial({
      color,
      roughness: 0.74,
      metalness: 0,
      map: opciones.map || null,
    })
    m.userData.intensidadEntorno = 0.35
    return m
  })
}

/** Pelo y barba: facetado a propósito, mate y un punto más oscuro en sombra. */
export function materialPelo(color = 0x5a3a22) {
  return memo(`pelo:${hexClave(color)}`, () => {
    const m = new THREE.MeshStandardMaterial({
      color,
      roughness: 0.62,
      metalness: 0.02,
      flatShading: true,
    })
    m.userData.intensidadEntorno = 0.5
    return m
  })
}

/** Tela de remera/pantalón: rugosa total, sin reflejo. */
export function materialTela(color = 0x17171d, opciones = {}) {
  const clave = `tela:${hexClave(color)}:${opciones.map ? opciones.map.uuid : '-'}`
  return memo(clave, () => {
    const m = new THREE.MeshStandardMaterial({
      color,
      roughness: 0.94,
      metalness: 0,
      map: opciones.map || null,
    })
    m.userData.intensidadEntorno = 0.18
    return m
  })
}

/** Plástico pintado (carrocería, cascos): brillo suave tipo laca. */
export function materialPlastico(color = 0xe8402a, opciones = {}) {
  const clave = `plastico:${hexClave(color)}:${opciones.map ? opciones.map.uuid : '-'}:${opciones.rugosidad ?? 0.34}`
  return memo(clave, () => {
    const m = new THREE.MeshStandardMaterial({
      color,
      roughness: opciones.rugosidad ?? 0.34,
      metalness: 0.06,
      map: opciones.map || null,
      transparent: !!opciones.transparente,
      side: opciones.doblecara ? THREE.DoubleSide : THREE.FrontSide,
    })
    m.userData.intensidadEntorno = 1.1
    return m
  })
}

/** Metal cromado/pintado: se apoya fuerte en el envMap. */
export function materialMetal(color = 0xc9ccd4, opciones = {}) {
  const clave = `metal:${hexClave(color)}:${opciones.rugosidad ?? 0.22}`
  return memo(clave, () => {
    const m = new THREE.MeshStandardMaterial({
      color,
      roughness: opciones.rugosidad ?? 0.22,
      metalness: 0.92,
      flatShading: !!opciones.facetado,
    })
    m.userData.intensidadEntorno = 1.6
    return m
  })
}

/** Vidrio de visores y cristales de anteojos. */
export function materialVidrio(color = 0x1b2c3a, opacidad = 0.62) {
  return memo(`vidrio:${hexClave(color)}:${opacidad}`, () => {
    const m = new THREE.MeshStandardMaterial({
      color,
      roughness: 0.08,
      metalness: 0.35,
      transparent: true,
      opacity: opacidad,
      depthWrite: false,
      side: THREE.DoubleSide,
    })
    m.userData.intensidadEntorno = 2.2
    return m
  })
}

/** Goma de cubiertas: negro rugoso y facetado. */
export function materialGoma(color = 0x1a1a1f) {
  return memo(`goma:${hexClave(color)}`, () => {
    const m = new THREE.MeshStandardMaterial({
      color,
      roughness: 0.96,
      metalness: 0,
      flatShading: true,
    })
    m.userData.intensidadEntorno = 0.1
    return m
  })
}

/** Emisivo puro para luces, boquillas de escape y chispas. */
export function materialEmisivo(color = 0xffcc00, intensidad = 1.6) {
  return memo(`emisivo:${hexClave(color)}:${intensidad}`, () => {
    const m = new THREE.MeshStandardMaterial({
      color: 0x101010,
      emissive: color,
      emissiveIntensity: intensidad,
      roughness: 0.5,
      metalness: 0,
    })
    m.userData.intensidadEntorno = 0
    m.userData.emisivoBase = intensidad
    return m
  })
}

/** Material plano sin luz, para calcos, números y el iris de los ojos. */
export function materialPlano(color = 0xffffff, opciones = {}) {
  const clave = `plano:${hexClave(color)}:${opciones.map ? opciones.map.uuid : '-'}:${!!opciones.transparente}`
  return memo(clave, () => {
    const m = new THREE.MeshBasicMaterial({
      color,
      map: opciones.map || null,
      transparent: !!opciones.transparente,
      alphaTest: opciones.transparente ? 0.05 : 0,
      side: opciones.doblecara ? THREE.DoubleSide : THREE.FrontSide,
      toneMapped: opciones.toneMapped !== false,
    })
    return m
  })
}

/** Material del contorno: negro plano visto desde atrás. */
export function materialContorno(color = 0x141019) {
  return memo(`contorno:${hexClave(color)}`, () => {
    const m = new THREE.MeshBasicMaterial({
      color,
      side: THREE.BackSide,
      toneMapped: false,
    })
    m.userData.esContorno = true
    return m
  })
}

// ---------------------------------------------------------------------------
// Contorno cel-shading
// ---------------------------------------------------------------------------

/**
 * Copia una geometría empujando cada vértice a lo largo de su normal.
 * Se cachea por (geometría, grosor) porque las geometrías se comparten entre
 * instancias: cuatro karts iguales usan un único contorno.
 */
export function geometriaExpandida(geometria, grosor) {
  let porGrosor = cacheContorno.get(geometria)
  if (!porGrosor) {
    porGrosor = new Map()
    cacheContorno.set(geometria, porGrosor)
  }
  const previo = porGrosor.get(grosor)
  if (previo) return previo

  const geo = geometria.clone()
  if (!geo.attributes.normal) geo.computeVertexNormals()
  // Fuera todo lo que el contorno no usa: es color plano.
  for (const nombre of Object.keys(geo.attributes)) {
    if (nombre !== 'position' && nombre !== 'normal') geo.deleteAttribute(nombre)
  }
  const pos = geo.attributes.position
  const nor = geo.attributes.normal
  for (let i = 0; i < pos.count; i++) {
    pos.setXYZ(
      i,
      pos.getX(i) + nor.getX(i) * grosor,
      pos.getY(i) + nor.getY(i) * grosor,
      pos.getZ(i) + nor.getZ(i) * grosor
    )
  }
  pos.needsUpdate = true
  geo.computeBoundingSphere()
  geo.userData.esContorno = true
  porGrosor.set(grosor, geo)
  return geo
}

/**
 * Cuelga un contorno de la malla dada. Se aplica sólo a la silueta (cráneo,
 * torso, chasis): es lo que define el dibujo, y duplicar todo saldría caro.
 * Devuelve la malla del contorno (o null si la malla no sirve).
 */
export function agregarContorno(mesh, grosor = 0.016, color = 0x141019) {
  if (!mesh || !mesh.isMesh || !mesh.geometry) return null
  if (mesh.userData.contorno) return mesh.userData.contorno
  const borde = new THREE.Mesh(geometriaExpandida(mesh.geometry, grosor), materialContorno(color))
  borde.name = 'contorno'
  borde.castShadow = false
  borde.receiveShadow = false
  borde.renderOrder = -1
  borde.userData.esContorno = true
  borde.userData.detalle = 1 // el LOD lo apaga primero
  mesh.add(borde)
  mesh.userData.contorno = borde
  return borde
}

/** Quita el contorno de una malla (lo usa el LOD y `destruir`). */
export function quitarContorno(mesh) {
  const borde = mesh && mesh.userData && mesh.userData.contorno
  if (!borde) return
  mesh.remove(borde)
  mesh.userData.contorno = null
}

// ---------------------------------------------------------------------------
// Entorno (reflejos)
// ---------------------------------------------------------------------------

/**
 * Estudio de tres luces montado como escena de emisivos y horneado a PMREM.
 * Le da al metal y a la pintura reflejos creíbles sin cargar ningún HDRI.
 * Necesita un WebGLRenderer, así que sólo se llama desde el juego (nunca al
 * importar el módulo).
 */
export function crearEntornoEstudio(renderer, opciones = {}) {
  if (!renderer) return null
  const escena = new THREE.Scene()
  const fondoArriba = new THREE.Color(opciones.cielo ?? 0x9ed8ff)
  const fondoAbajo = new THREE.Color(opciones.suelo ?? 0x4a4a58)

  // Cúpula con degradado vertical (cielo arriba, asfalto abajo).
  const domoGeo = new THREE.SphereGeometry(12, 16, 10)
  const colores = []
  const posiciones = domoGeo.attributes.position
  const aux = new THREE.Color()
  for (let i = 0; i < posiciones.count; i++) {
    const t = THREE.MathUtils.clamp(posiciones.getY(i) / 12, -1, 1) * 0.5 + 0.5
    aux.copy(fondoAbajo).lerp(fondoArriba, t * t)
    colores.push(aux.r, aux.g, aux.b)
  }
  domoGeo.setAttribute('color', new THREE.Float32BufferAttribute(colores, 3))
  escena.add(
    new THREE.Mesh(
      domoGeo,
      new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide })
    )
  )

  // Softbox cenital + dos rebotes laterales + un contraluz cálido.
  const panel = (w, h, color, intensidad, pos, mirar) => {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(intensidad) })
    )
    m.position.copy(pos)
    m.lookAt(mirar)
    escena.add(m)
  }
  const centro = new THREE.Vector3(0, 0, 0)
  panel(9, 9, 0xffffff, 3.4, new THREE.Vector3(0, 8, 0), centro)
  panel(6, 5, 0xdfeaff, 1.5, new THREE.Vector3(-7, 2, 3), centro)
  panel(5, 4, 0xffe6c8, 1.2, new THREE.Vector3(6.5, 2.5, -3), centro)
  panel(7, 3, 0xffffff, 0.9, new THREE.Vector3(0, 1.2, 9), centro)

  const pmrem = new THREE.PMREMGenerator(renderer)
  pmrem.compileEquirectangularShader()
  const objetivo = pmrem.fromScene(escena, 0.06)
  pmrem.dispose()
  escena.traverse((o) => {
    if (o.isMesh) {
      o.geometry.dispose()
      o.material.dispose()
    }
  })
  return objetivo.texture
}

/** Inyecta un envMap (propio o del motor) en todos los materiales del módulo. */
export function establecerEntorno(envMap, intensidad = 1) {
  entornoActual = envMap || null
  intensidadEntorno = intensidad
  for (const m of registro) {
    if (!m.isMeshStandardMaterial) continue
    m.envMap = entornoActual
    m.envMapIntensity = (m.userData.intensidadEntorno ?? 1) * intensidadEntorno
    m.needsUpdate = true
  }
}

export function entorno() {
  return entornoActual
}

// ---------------------------------------------------------------------------
// Materiales propios por instancia (estado estrella, tintes, desvanecidos)
// ---------------------------------------------------------------------------

/**
 * Clona los materiales de un subárbol para poder animarlos sin tocar la caché
 * compartida. Se hace perezosamente: sólo cuando el corredor agarra la estrella.
 */
export function adoptarMateriales(raiz) {
  if (raiz.userData.materialesPropios) return raiz.userData.materialesPropios
  const propios = []
  const mapa = new Map()
  raiz.traverse((o) => {
    if (!o.isMesh || !o.material || o.userData.esContorno) return
    const original = o.material
    let copia = mapa.get(original)
    if (!copia) {
      copia = original.clone()
      copia.userData = { ...original.userData, original }
      mapa.set(original, copia)
      propios.push(copia)
    }
    o.material = copia
  })
  raiz.userData.materialesPropios = propios
  return propios
}

/** Devuelve el subárbol a los materiales compartidos y libera las copias. */
export function devolverMateriales(raiz) {
  const propios = raiz.userData.materialesPropios
  if (!propios) return
  raiz.traverse((o) => {
    if (o.isMesh && o.material && o.material.userData && o.material.userData.original) {
      o.material = o.material.userData.original
    }
  })
  for (const m of propios) m.dispose()
  raiz.userData.materialesPropios = null
}

/** Libera todos los materiales cacheados (al desmontar el juego). */
export function limpiarMateriales() {
  for (const m of registro) m.dispose()
  registro.clear()
  cache.clear()
}

export default {
  materialPiel,
  materialPelo,
  materialTela,
  materialPlastico,
  materialMetal,
  materialVidrio,
  materialGoma,
  materialEmisivo,
  materialPlano,
  agregarContorno,
  establecerEntorno,
  crearEntornoEstudio,
}
