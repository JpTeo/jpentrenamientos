// Maquinaria compartida de construcción de circuitos.
//
// A partir de una definición declarativa (`def`) arma:
//   · el eje central como CatmullRom cerrada remuestreada por longitud de arco,
//   · un marco de referencia sin giros bruscos (transporte paralelo + peralte),
//   · las mallas de calzada, bordillos, terreno, muros, turbos y meta,
//   · una grilla espacial uniforme para que `muestrear()` y `progreso()` sean O(1),
//   · y todos los datos de carrera (parrilla, cajas, monedas, checkpoints).
//
// Contrato: ver `src/game/CONTRATOS.md`, sección 2.
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { CARRERA } from '../core/constantes.js'
import { clamp, clamp01, fbm, lerp, rng, smoothstep, TAU } from '../core/utils.js'
import { PALETA } from '../assets/paleta.js'
import { materialMaps, sprite, textura } from '../assets/texturas.js'

/** Separación entre muestras del eje central, en metros. */
export const PASO_MUESTRA = 1.5
/** Lado de la celda de la grilla espacial, en metros. */
export const LADO_CELDA = 12
/** Radio de indexado de cada muestra dentro de la grilla. */
const RADIO_INDICE = 30
/** Combadura (bombeo) transversal de la calzada, en metros. */
const COMBADURA = 0.12
/** Ancho por defecto del bordillo. */
const ANCHO_BORDILLO = 0.9

// Vectores temporales reutilizados: nada se asigna dentro del bucle de juego.
const _va = new THREE.Vector3()
const _vb = new THREE.Vector3()
const _vc = new THREE.Vector3()
const _vd = new THREE.Vector3()

// ---------------------------------------------------------------------------
// Estructuras de salida
// ---------------------------------------------------------------------------

/** Crea un objeto Superficie vacío (para reutilizar entre cuadros). */
export function crearSuperficie() {
  return {
    y: 0,
    normal: new THREE.Vector3(0, 1, 0),
    tipo: 'asfalto',
    enPista: false,
    distanciaCentro: 0,
    anchoAqui: 0,
  }
}

/** Crea un objeto Progreso vacío. */
export function crearProgreso() {
  return {
    s: 0,
    t: 0,
    lateral: 0,
    tangente: new THREE.Vector3(0, 0, -1),
    indice: 0,
  }
}

// ---------------------------------------------------------------------------
// Interpolación periódica de escalares sobre los nodos de control
// ---------------------------------------------------------------------------

/** Catmull-Rom escalar y periódico. `k` es la coordenada continua de nodo. */
function interpolarCerrado(valores, k) {
  const n = valores.length
  if (n === 1) return valores[0]
  const i = Math.floor(k)
  const t = k - i
  const idx = (j) => valores[((j % n) + n) % n]
  const p0 = idx(i - 1)
  const p1 = idx(i)
  const p2 = idx(i + 1)
  const p3 = idx(i + 2)
  const t2 = t * t
  const t3 = t2 * t
  return (
    0.5 *
    (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3)
  )
}

// ---------------------------------------------------------------------------
// Grilla espacial uniforme
// ---------------------------------------------------------------------------

class GrillaEspacial {
  constructor(minX, minZ, maxX, maxZ, lado) {
    this.lado = lado
    this.minX = minX - lado * 2
    this.minZ = minZ - lado * 2
    this.cols = Math.max(1, Math.ceil((maxX - minX) / lado) + 5)
    this.filas = Math.max(1, Math.ceil((maxZ - minZ) / lado) + 5)
    this.celdas = new Array(this.cols * this.filas)
  }

  /** Índice de celda de un punto (o -1 si cae fuera). */
  indiceDe(x, z) {
    const ix = Math.floor((x - this.minX) / this.lado)
    const iz = Math.floor((z - this.minZ) / this.lado)
    if (ix < 0 || iz < 0 || ix >= this.cols || iz >= this.filas) return -1
    return iz * this.cols + ix
  }

  /** Inserta `valor` en todas las celdas que toca el disco (x,z,radio). */
  insertar(x, z, radio, valor) {
    const l = this.lado
    const ix0 = clamp(Math.floor((x - radio - this.minX) / l), 0, this.cols - 1)
    const ix1 = clamp(Math.floor((x + radio - this.minX) / l), 0, this.cols - 1)
    const iz0 = clamp(Math.floor((z - radio - this.minZ) / l), 0, this.filas - 1)
    const iz1 = clamp(Math.floor((z + radio - this.minZ) / l), 0, this.filas - 1)
    for (let iz = iz0; iz <= iz1; iz++) {
      for (let ix = ix0; ix <= ix1; ix++) {
        const i = iz * this.cols + ix
        const c = this.celdas[i]
        if (c) c.push(valor)
        else this.celdas[i] = [valor]
      }
    }
  }

  /** Devuelve el array de la celda que contiene (x,z) o null. */
  consultar(x, z) {
    const i = this.indiceDe(x, z)
    return i < 0 ? null : this.celdas[i] || null
  }
}

// ---------------------------------------------------------------------------
// Eje central: remuestreo por longitud de arco + marco de referencia
// ---------------------------------------------------------------------------

/**
 * Construye el eje central de la pista.
 * @param {Array} nodos puntos de control `{x,y,z,ancho,peralte,...}`
 * @param {object} opciones `{ semilla, ondulacion }`
 */
export function construirEje(nodos, opciones = {}) {
  const semilla = opciones.semilla ?? 1
  const puntos = nodos.map((n) => new THREE.Vector3(n.x, n.y ?? 0, n.z))
  const curva = new THREE.CatmullRomCurve3(puntos, true, 'centripetal', 0.5)

  // 1) Muestreo denso en espacio de parámetro para medir longitud de arco.
  const M = Math.max(3000, nodos.length * 160)
  const densoP = new Array(M + 1)
  const acum = new Float64Array(M + 1)
  for (let i = 0; i <= M; i++) densoP[i] = curva.getPoint(i / M, new THREE.Vector3())
  for (let i = 1; i <= M; i++) acum[i] = acum[i - 1] + densoP[i].distanceTo(densoP[i - 1])
  const longitud = acum[M]

  // 2) Remuestreo uniforme por distancia: paso constante => `progreso()` exacto.
  const N = Math.max(64, Math.round(longitud / PASO_MUESTRA))
  const paso = longitud / N

  const px = new Float32Array(N)
  const py = new Float32Array(N)
  const pz = new Float32Array(N)
  const uu = new Float32Array(N) // parámetro de curva (para interpolar nodos)

  let j = 0
  for (let i = 0; i < N; i++) {
    const objetivo = i * paso
    while (j < M && acum[j + 1] < objetivo) j++
    const tramo = acum[j + 1] - acum[j] || 1e-6
    const f = clamp01((objetivo - acum[j]) / tramo)
    const a = densoP[j]
    const b = densoP[j + 1] || densoP[M]
    px[i] = lerp(a.x, b.x, f)
    py[i] = lerp(a.y, b.y, f)
    pz[i] = lerp(a.z, b.z, f)
    uu[i] = (j + f) / M
  }

  // 3) Ondulación longitudinal periódica (armónicos enteros => sin costura).
  const amp = opciones.ondulacion ?? 0.22
  if (amp > 0) {
    const r = rng(semilla + 17)
    const arm = [
      { k: 3, a: amp * 1.0, f: r() * TAU },
      { k: 5, a: amp * 0.62, f: r() * TAU },
      { k: 9, a: amp * 0.38, f: r() * TAU },
      { k: 14, a: amp * 0.22, f: r() * TAU },
    ]
    for (let i = 0; i < N; i++) {
      const w = (i / N) * TAU
      let d = 0
      for (const h of arm) d += Math.sin(w * h.k + h.f) * h.a
      py[i] += d
    }
  }

  // 4) Tangentes por diferencias centrales (cerradas).
  const tx = new Float32Array(N)
  const ty = new Float32Array(N)
  const tz = new Float32Array(N)
  for (let i = 0; i < N; i++) {
    const a = (i - 1 + N) % N
    const b = (i + 1) % N
    let dx = px[b] - px[a]
    let dy = py[b] - py[a]
    let dz = pz[b] - pz[a]
    const l = Math.hypot(dx, dy, dz) || 1
    tx[i] = dx / l
    ty[i] = dy / l
    tz[i] = dz / l
  }

  // 5) Marco de referencia por transporte paralelo (doble reflexión, RMF).
  const nx = new Float32Array(N)
  const ny = new Float32Array(N)
  const nz = new Float32Array(N)
  // Normal inicial: la más cercana al "arriba" del mundo.
  {
    const t = _va.set(tx[0], ty[0], tz[0])
    const n = _vb.set(0, 1, 0).addScaledVector(t, -t.y)
    if (n.lengthSq() < 1e-8) n.set(1, 0, 0).addScaledVector(t, -t.x)
    n.normalize()
    nx[0] = n.x
    ny[0] = n.y
    nz[0] = n.z
  }
  const propagar = (i, ix, out) => {
    // Doble reflexión entre la muestra `i` y la `ix`.
    const v1 = _va.set(px[ix] - px[i], py[ix] - py[i], pz[ix] - pz[i])
    const c1 = v1.lengthSq() || 1e-9
    const u = _vb.set(nx[i], ny[i], nz[i])
    const rL = _vc.copy(u).addScaledVector(v1, (-2 / c1) * v1.dot(u))
    const t0 = _vd.set(tx[i], ty[i], tz[i])
    const tL = t0.addScaledVector(v1, (-2 / c1) * v1.dot(t0))
    const v2 = new THREE.Vector3(tx[ix] - tL.x, ty[ix] - tL.y, tz[ix] - tL.z)
    const c2 = v2.lengthSq() || 1e-9
    out.copy(rL).addScaledVector(v2, (-2 / c2) * v2.dot(rL))
    // Reortogonaliza contra la tangente destino.
    const td = new THREE.Vector3(tx[ix], ty[ix], tz[ix])
    out.addScaledVector(td, -out.dot(td)).normalize()
  }
  const tmpN = new THREE.Vector3()
  for (let i = 0; i < N - 1; i++) {
    propagar(i, i + 1, tmpN)
    nx[i + 1] = tmpN.x
    ny[i + 1] = tmpN.y
    nz[i + 1] = tmpN.z
  }
  // Cierre: el marco vuelve al inicio con una torsión residual; se reparte.
  propagar(N - 1, 0, tmpN)
  {
    const n0 = _va.set(nx[0], ny[0], nz[0])
    const t0 = _vb.set(tx[0], ty[0], tz[0])
    const cos = clamp(tmpN.dot(n0), -1, 1)
    const sen = _vc.copy(tmpN).cross(n0).dot(t0)
    const defecto = Math.atan2(sen, cos)
    if (Math.abs(defecto) > 1e-6) {
      for (let i = 0; i < N; i++) {
        const a = (defecto * i) / N
        const c = Math.cos(a)
        const s = Math.sin(a)
        const n = _va.set(nx[i], ny[i], nz[i])
        const t = _vb.set(tx[i], ty[i], tz[i])
        const cruz = _vc.copy(t).cross(n)
        nx[i] = n.x * c + cruz.x * s
        ny[i] = n.y * c + cruz.y * s
        nz[i] = n.z * c + cruz.z * s
      }
    }
  }

  // 6) Escalares por nodo interpolados suavemente + peralte aplicado al marco.
  const anchosNodo = nodos.map((n) => n.ancho ?? 9)
  const peraltesNodo = nodos.map((n) => n.peralte ?? 0)
  const ancho = new Float32Array(N)
  const peralte = new Float32Array(N)
  const dx = new Float32Array(N)
  const dy = new Float32Array(N)
  const dz = new Float32Array(N)
  const nn = nodos.length
  for (let i = 0; i < N; i++) {
    const k = uu[i] * nn
    ancho[i] = interpolarCerrado(anchosNodo, k)
    peralte[i] = interpolarCerrado(peraltesNodo, k)
    // derecha = tangente × normal ; peralte positivo baja el lado derecho.
    const t = _va.set(tx[i], ty[i], tz[i])
    const n = _vb.set(nx[i], ny[i], nz[i])
    const d = _vc.copy(t).cross(n).normalize()
    const c = Math.cos(peralte[i])
    const s = Math.sin(peralte[i])
    const dxr = d.x * c - n.x * s
    const dyr = d.y * c - n.y * s
    const dzr = d.z * c - n.z * s
    dx[i] = dxr
    dy[i] = dyr
    dz[i] = dzr
    // Normal peraltada = derecha' × tangente
    const nr = _vd.set(dxr, dyr, dzr).cross(t).normalize()
    nx[i] = nr.x
    ny[i] = nr.y
    nz[i] = nr.z
  }

  // 7) Curvatura por muestra (para decidir dónde va el bordillo).
  const curvatura = new Float32Array(N)
  for (let i = 0; i < N; i++) {
    const a = (i - 1 + N) % N
    const b = (i + 1) % N
    const ax = tx[a]
    const az = tz[a]
    const bx = tx[b]
    const bz = tz[b]
    const cruz = ax * bz - az * bx
    const punto = clamp(ax * bx + az * bz, -1, 1)
    curvatura[i] = Math.abs(Math.atan2(cruz, punto)) / (2 * paso)
  }

  // Interpolación de escalares "por nodo" arbitrarios (superficie, etc.).
  const nodoEn = new Float32Array(N)
  for (let i = 0; i < N; i++) nodoEn[i] = uu[i] * nn

  return {
    curva,
    N,
    paso,
    longitud,
    px,
    py,
    pz,
    tx,
    ty,
    tz,
    nx,
    ny,
    nz,
    dx,
    dy,
    dz,
    ancho,
    peralte,
    curvatura,
    nodoEn,
  }
}

// ---------------------------------------------------------------------------
// Zonas (lava, agua, tierra, vacío)
// ---------------------------------------------------------------------------

/** Distancia con signo de (x,z) al borde de una zona: <0 dentro. */
function distanciaZona(zona, x, z) {
  if (zona.forma === 'disco') {
    const rx = (x - zona.x) / (zona.radioX ?? zona.radio)
    const rz = (z - zona.z) / (zona.radioZ ?? zona.radio)
    const r = Math.hypot(rx, rz)
    const escala = Math.min(zona.radioX ?? zona.radio, zona.radioZ ?? zona.radio)
    return (r - 1) * escala
  }
  // 'franja': distancia a la polilínea menos el semiancho
  let mejor = Infinity
  const p = zona.puntos
  for (let i = 0; i < p.length - 1; i++) {
    const ax = p[i][0]
    const az = p[i][1]
    const bx = p[i + 1][0]
    const bz = p[i + 1][1]
    const ex = bx - ax
    const ez = bz - az
    const len2 = ex * ex + ez * ez || 1e-6
    const t = clamp01(((x - ax) * ex + (z - az) * ez) / len2)
    const cx = ax + ex * t - x
    const cz = az + ez * t - z
    const d = Math.hypot(cx, cz)
    if (d < mejor) mejor = d
  }
  return mejor - zona.ancho * 0.5
}

// ---------------------------------------------------------------------------
// Fusión de geometría por material
// ---------------------------------------------------------------------------

class Fusionador {
  constructor(grupo) {
    this.grupo = grupo
    this.baldes = new Map()
  }

  /** Agrega una geometría a un balde identificado por `clave`. */
  agregar(clave, geometria, material, opciones = {}) {
    let b = this.baldes.get(clave)
    if (!b) {
      b = { material, geos: [], opciones }
      this.baldes.set(clave, b)
    }
    b.geos.push(geometria)
  }

  /** Fusiona todo y cuelga las mallas resultantes del grupo. */
  construir() {
    const salida = []
    for (const [clave, b] of this.baldes) {
      if (!b.geos.length) continue
      let geo
      try {
        geo = b.geos.length === 1 ? b.geos[0] : mergeGeometries(b.geos, false)
      } catch {
        geo = b.geos[0]
      }
      if (!geo) continue
      if (b.geos.length > 1) for (const g of b.geos) if (g !== geo) g.dispose()
      geo.computeBoundingSphere()
      const malla = new THREE.Mesh(geo, b.material)
      malla.name = clave
      malla.castShadow = !!b.opciones.sombraProyecta
      malla.receiveShadow = b.opciones.sombraRecibe !== false
      if (b.opciones.renderOrder) malla.renderOrder = b.opciones.renderOrder
      this.grupo.add(malla)
      salida.push(malla)
    }
    this.baldes.clear()
    return salida
  }
}

// ---------------------------------------------------------------------------
// Utilidades de geometría
// ---------------------------------------------------------------------------

/**
 * Construye una tira triangulada a partir de filas de vértices.
 * `filas` = Array de Array de `{x,y,z,u,v,nx,ny,nz,r,g,b}`.
 */
function tiraDesdeFilas(filas, conColor = false) {
  const nf = filas.length
  if (nf < 2) return null
  const nc = filas[0].length
  const total = nf * nc
  const pos = new Float32Array(total * 3)
  const nor = new Float32Array(total * 3)
  const uv = new Float32Array(total * 2)
  const col = conColor ? new Float32Array(total * 3) : null
  let k = 0
  for (let f = 0; f < nf; f++) {
    const fila = filas[f]
    for (let c = 0; c < nc; c++) {
      const v = fila[c]
      pos[k * 3] = v.x
      pos[k * 3 + 1] = v.y
      pos[k * 3 + 2] = v.z
      nor[k * 3] = v.nx
      nor[k * 3 + 1] = v.ny
      nor[k * 3 + 2] = v.nz
      uv[k * 2] = v.u
      uv[k * 2 + 1] = v.v
      if (col) {
        col[k * 3] = v.r
        col[k * 3 + 1] = v.g
        col[k * 3 + 2] = v.b
      }
      k++
    }
  }
  const idx = []
  for (let f = 0; f < nf - 1; f++) {
    for (let c = 0; c < nc - 1; c++) {
      const a = f * nc + c
      const b = a + 1
      const d = a + nc
      const e = d + 1
      idx.push(a, d, b, b, d, e)
    }
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3))
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
  if (col) geo.setAttribute('color', new THREE.BufferAttribute(col, 3))
  geo.setIndex(idx)
  return geo
}

/** Transforma una geometría con posición, rotación Y y escala. */
function ubicar(geo, x, y, z, rotY = 0, escala = 1) {
  const m = new THREE.Matrix4()
  m.compose(
    new THREE.Vector3(x, y, z),
    new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotY),
    new THREE.Vector3(escala, escala, escala),
  )
  geo.applyMatrix4(m)
  return geo
}

// ---------------------------------------------------------------------------
// Construcción principal
// ---------------------------------------------------------------------------

/**
 * Construye una pista completa a partir de su definición.
 * @param {object} def definición declarativa del circuito
 * @param {object} ctx `{ escena, calidad, semilla, sinMallas }`
 * @returns {object} PistaRuntime
 */
export function construirPista(def, ctx = {}) {
  const sinMallas = ctx.sinMallas === true
  const calidad = ctx.calidad || 'alta'
  const semilla = ctx.semilla ?? def.semilla ?? 1
  const tema = def.tema
  const azar = rng(semilla)

  const eje = construirEje(def.nodos, { semilla, ondulacion: tema.ondulacion ?? 0.22 })
  const { N, paso, longitud } = eje
  const anchoBordillo = def.bordillo?.ancho ?? ANCHO_BORDILLO
  const altoBordillo = def.bordillo?.alto ?? 0.085

  const grupo = new THREE.Group()
  grupo.name = def.id
  const desechables = []
  const animables = []
  const lods = []

  // --- Rangos por `s` normalizados a [0, longitud) -------------------------
  const normalizarRango = (r) => ({
    ...r,
    desde: ((r.desde % longitud) + longitud) % longitud,
    hasta: ((r.hasta % longitud) + longitud) % longitud,
  })
  const enRango = (r, s) => (r.desde <= r.hasta ? s >= r.desde && s <= r.hasta : s >= r.desde || s <= r.hasta)
  const turbos = (def.turbos || []).map(normalizarRango)
  const rampas = (def.rampas || []).map(normalizarRango)
  const huecos = (def.huecos || []).map(normalizarRango)
  const tramosSuperficie = (def.tramosSuperficie || []).map(normalizarRango)
  const bordillosForzados = (def.bordillosForzados || []).map(normalizarRango)
  const sinBordillo = (def.sinBordillo || []).map(normalizarRango)

  // --- Bordillos por muestra ----------------------------------------------
  const umbralCurva = def.bordillo?.umbralCurvatura ?? 0.011
  const bordilloIzq = new Uint8Array(N)
  const bordilloDer = new Uint8Array(N)
  {
    // Suaviza la curvatura para que el bordillo no parpadee.
    const suave = new Float32Array(N)
    const R = 6
    for (let i = 0; i < N; i++) {
      let acc = 0
      for (let k = -R; k <= R; k++) acc += eje.curvatura[(i + k + N) % N]
      suave[i] = acc / (2 * R + 1)
    }
    for (let i = 0; i < N; i++) {
      const s = i * paso
      let on = suave[i] > umbralCurva
      for (const r of bordillosForzados) if (enRango(r, s)) on = true
      for (const r of sinBordillo) if (enRango(r, s)) on = false
      bordilloIzq[i] = on ? 1 : 0
      bordilloDer[i] = on ? 1 : 0
    }
    // Extiende un poco los tramos para que no queden trozos sueltos.
    const dilatar = (arr) => {
      const copia = arr.slice()
      const D = 5
      for (let i = 0; i < N; i++) {
        if (!copia[i]) continue
        for (let k = -D; k <= D; k++) arr[(i + k + N) % N] = 1
      }
    }
    dilatar(bordilloIzq)
    dilatar(bordilloDer)
    for (let i = 0; i < N; i++) {
      const s = i * paso
      for (const r of sinBordillo) {
        if (enRango(r, s)) {
          bordilloIzq[i] = 0
          bordilloDer[i] = 0
        }
      }
    }
  }

  // --- Grilla espacial del eje --------------------------------------------
  let minX = Infinity
  let maxX = -Infinity
  let minZ = Infinity
  let maxZ = -Infinity
  for (let i = 0; i < N; i++) {
    if (eje.px[i] < minX) minX = eje.px[i]
    if (eje.px[i] > maxX) maxX = eje.px[i]
    if (eje.pz[i] < minZ) minZ = eje.pz[i]
    if (eje.pz[i] > maxZ) maxZ = eje.pz[i]
  }
  const margenMundo = def.margenTerreno ?? 95
  const grilla = new GrillaEspacial(
    minX - margenMundo,
    minZ - margenMundo,
    maxX + margenMundo,
    maxZ + margenMundo,
    LADO_CELDA,
  )
  for (let i = 0; i < N; i++) grilla.insertar(eje.px[i], eje.pz[i], RADIO_INDICE, i)

  // Índice grueso de respaldo (para consultas muy lejanas al trazado).
  const SALTO_GRUESO = Math.max(4, Math.floor(N / 160))
  const gruesos = []
  for (let i = 0; i < N; i += SALTO_GRUESO) gruesos.push(i)

  /** Índice de muestra más cercana en XZ. O(1) gracias a la grilla. */
  function indiceCercano(x, z) {
    let mejor = -1
    let mejorD = Infinity
    const c = grilla.consultar(x, z)
    if (c) {
      for (let k = 0; k < c.length; k++) {
        const i = c[k]
        const ax = eje.px[i] - x
        const az = eje.pz[i] - z
        const d = ax * ax + az * az
        if (d < mejorD) {
          mejorD = d
          mejor = i
        }
      }
    }
    if (mejor >= 0) return mejor
    // Respaldo: barrido grueso + refinamiento local.
    for (let k = 0; k < gruesos.length; k++) {
      const i = gruesos[k]
      const ax = eje.px[i] - x
      const az = eje.pz[i] - z
      const d = ax * ax + az * az
      if (d < mejorD) {
        mejorD = d
        mejor = i
      }
    }
    const base = mejor
    for (let k = -SALTO_GRUESO; k <= SALTO_GRUESO; k++) {
      const i = (base + k + N) % N
      const ax = eje.px[i] - x
      const az = eje.pz[i] - z
      const d = ax * ax + az * az
      if (d < mejorD) {
        mejorD = d
        mejor = i
      }
    }
    return mejor
  }

  /** Proyecta (x,z) sobre el eje: devuelve `{ s, lateral, indice }` en `out`. */
  const _proy = { s: 0, lateral: 0, indice: 0 }
  function proyectar(x, z, out = _proy) {
    let i = indiceCercano(x, z)
    for (let paso2 = 0; paso2 < 2; paso2++) {
      const txn = eje.tx[i]
      const tzn = eje.tz[i]
      const inv = 1 / (Math.hypot(txn, tzn) || 1)
      const fx = txn * inv
      const fz = tzn * inv
      const ax = x - eje.px[i]
      const az = z - eje.pz[i]
      const adelante = ax * fx + az * fz
      const lat = ax * -fz + az * fx
      let s = i * paso + adelante
      s = ((s % longitud) + longitud) % longitud
      out.s = s
      out.lateral = lat
      out.indice = i
      const ni = Math.round(s / paso) % N
      if (ni === i) break
      i = ni
    }
    return out
  }

  // --- Interpolación del marco a lo largo de `s` --------------------------
  const _marco = {
    posicion: new THREE.Vector3(),
    tangente: new THREE.Vector3(),
    normal: new THREE.Vector3(),
    derecha: new THREE.Vector3(),
    ancho: 9,
    indice: 0,
  }
  function marcoEn(s, out = _marco) {
    const ss = ((s % longitud) + longitud) % longitud
    const fi = ss / paso
    const i = Math.floor(fi) % N
    const j = (i + 1) % N
    const f = fi - Math.floor(fi)
    out.posicion.set(
      lerp(eje.px[i], eje.px[j], f),
      lerp(eje.py[i], eje.py[j], f),
      lerp(eje.pz[i], eje.pz[j], f),
    )
    out.tangente.set(lerp(eje.tx[i], eje.tx[j], f), lerp(eje.ty[i], eje.ty[j], f), lerp(eje.tz[i], eje.tz[j], f)).normalize()
    out.derecha.set(lerp(eje.dx[i], eje.dx[j], f), lerp(eje.dy[i], eje.dy[j], f), lerp(eje.dz[i], eje.dz[j], f)).normalize()
    out.normal.set(lerp(eje.nx[i], eje.nx[j], f), lerp(eje.ny[i], eje.ny[j], f), lerp(eje.nz[i], eje.nz[j], f)).normalize()
    out.ancho = lerp(eje.ancho[i], eje.ancho[j], f)
    out.indice = i
    return out
  }

  /** Punto de la calzada a distancia `s` y desplazamiento `lateral`. */
  function puntoLateral(s, lateral, out = new THREE.Vector3()) {
    const m = marcoEn(s)
    const ln = clamp(lateral / m.ancho, -1, 1)
    out.copy(m.posicion)
      .addScaledVector(m.derecha, lateral)
      .addScaledVector(m.normal, COMBADURA * (1 - ln * ln))
    return out
  }

  // --- Zonas (lava / agua / tierra / vacío) --------------------------------
  const zonas = (def.zonas || []).map((z) => {
    const zo = { borde: 6, hundir: 1.4, ...z }
    // Círculo envolvente: descarte O(1) antes de la prueba fina.
    if (zo.forma === 'disco') {
      zo._bx = zo.x
      zo._bz = zo.z
      zo._br = Math.max(zo.radioX ?? zo.radio, zo.radioZ ?? zo.radio) * 1.25 + zo.borde
    } else {
      let sx = 0
      let sz = 0
      for (const p of zo.puntos) {
        sx += p[0]
        sz += p[1]
      }
      zo._bx = sx / zo.puntos.length
      zo._bz = sz / zo.puntos.length
      let r = 0
      for (const p of zo.puntos) r = Math.max(r, Math.hypot(p[0] - zo._bx, p[1] - zo._bz))
      zo._br = r + zo.ancho * 0.5 + zo.borde + 2
    }
    return zo
  })
  const zonasHunden = zonas.filter((z) => z.y !== undefined && z.y !== null)

  // --- Altura del terreno --------------------------------------------------
  const colinas = tema.colinas || { amplitud: 6, escala: 0.011, octavas: 4 }
  const mezclaT = tema.mezclaTerreno || { desde: 7, hasta: 42 }
  const caidaBorde = tema.caidaBorde ?? 0.38
  const alturaBase = tema.alturaBase || (() => 0)
  const _pt = { s: 0, lateral: 0, indice: 0 }
  const _marcoTerreno = {
    posicion: new THREE.Vector3(),
    tangente: new THREE.Vector3(),
    normal: new THREE.Vector3(),
    derecha: new THREE.Vector3(),
    ancho: 9,
    indice: 0,
  }

  /** Altura del terreno fuera de la calzada. Continua con el borde de pista. */
  function alturaTerreno(x, z) {
    const pr = proyectar(x, z, _pt)
    const m = marcoEn(pr.s, _marcoTerreno)
    const borde = m.ancho + anchoBordillo
    // El terreno sigue la sección peraltada hasta el borde y recién ahí cae:
    // así queda cosido a la calzada sin costuras aunque haya peralte fuerte.
    const lateralRecortado = clamp(pr.lateral, -borde, borde)
    const yBorde = m.posicion.y + lateralRecortado * m.derecha.y
    const d = Math.max(0, Math.abs(pr.lateral) - borde)
    let y = yBorde - caidaBorde * smoothstep(d / 2.5)
    const mezcla = smoothstep(clamp01((d - mezclaT.desde) / (mezclaT.hasta - mezclaT.desde)))
    if (mezcla > 0) {
      const relieve =
        (fbm(x * colinas.escala, z * colinas.escala, colinas.octavas, semilla + 3) - 0.5) *
        colinas.amplitud
      const base = alturaBase(x, z) + relieve
      y = lerp(y, base, mezcla)
    }
    for (let k = 0; k < zonasHunden.length; k++) {
      const zo = zonasHunden[k]
      const dz = distanciaZona(zo, x, z)
      if (dz > zo.borde) continue
      const w = 1 - smoothstep(clamp01((dz + zo.borde) / (zo.borde * 2)))
      const protegido = smoothstep(clamp01(d / 5))
      const peso = w * protegido
      if (peso > 0) y = lerp(y, zo.y - zo.hundir, peso)
    }
    return y
  }

  // --- Consultas del contrato ---------------------------------------------
  const _supDef = crearSuperficie()
  const _progDef = crearProgreso()
  const _pm = { s: 0, lateral: 0, indice: 0 }

  function tipoTramo(s) {
    for (let i = 0; i < tramosSuperficie.length; i++) {
      if (enRango(tramosSuperficie[i], s)) return tramosSuperficie[i].tipo
    }
    return 'asfalto'
  }

  function muestrear(x, z, out = _supDef) {
    const pr = proyectar(x, z, _pm)
    const m = marcoEn(pr.s, _marco)
    const lat = pr.lateral
    const abs = Math.abs(lat)
    out.distanciaCentro = abs
    out.anchoAqui = m.ancho
    const enHueco = huecos.length > 0 && huecos.some((h) => enRango(h, pr.s))

    if (abs <= m.ancho + anchoBordillo && !enHueco) {
      const ln = clamp(lat / m.ancho, -1, 1)
      const dentro = abs <= m.ancho
      const comba = dentro ? COMBADURA * (1 - ln * ln) : 0
      out.y = m.posicion.y + lat * m.derecha.y + comba * m.normal.y + (dentro ? 0 : altoBordillo)
      out.normal.copy(m.normal)
      out.enPista = true
      if (!dentro) {
        const i = pr.indice
        out.tipo = (lat > 0 ? bordilloDer[i] : bordilloIzq[i]) ? 'bordillo' : tipoTramo(pr.s)
      } else {
        let tipo = tipoTramo(pr.s)
        for (let i = 0; i < turbos.length; i++) {
          const t = turbos[i]
          if (enRango(t, pr.s) && lat >= t.desdeLateral && lat <= t.hastaLateral) {
            tipo = 'turbo'
            break
          }
        }
        if (tipo !== 'turbo') {
          for (let i = 0; i < rampas.length; i++) {
            if (enRango(rampas[i], pr.s)) {
              tipo = 'rampa'
              break
            }
          }
        }
        out.tipo = tipo
      }
      return out
    }

    // Fuera de la calzada: terreno + zonas.
    out.enPista = false
    const anchoAqui = m.ancho
    const sAqui = pr.s
    let tipo = tema.superficie || 'cesped'
    let y = alturaTerreno(x, z)
    let normalPlana = false
    for (let k = 0; k < zonas.length; k++) {
      const zo = zonas[k]
      const bdx = x - zo._bx
      const bdz = z - zo._bz
      if (bdx * bdx + bdz * bdz > zo._br * zo._br) continue
      if (distanciaZona(zo, x, z) > 0) continue
      tipo = zo.tipo
      if (zo.y !== undefined && zo.y !== null) {
        y = zo.y
        normalPlana = true
      }
    }
    if (enHueco && abs <= anchoAqui + anchoBordillo) {
      for (let k = 0; k < huecos.length; k++) {
        const h = huecos[k]
        if (!enRango(h, sAqui)) continue
        if (h.tipo) tipo = h.tipo
        if (h.y !== undefined) {
          y = h.y
          normalPlana = true
        }
        break
      }
    }
    out.y = y
    out.tipo = tipo
    if (normalPlana) out.normal.set(0, 1, 0)
    else {
      // Normal aproximada por diferencias finitas (suficiente para el kart).
      const e = 1.2
      const hx = alturaTerreno(x + e, z) - alturaTerreno(x - e, z)
      const hz = alturaTerreno(x, z + e) - alturaTerreno(x, z - e)
      out.normal.set(-hx, 2 * e, -hz).normalize()
    }
    return out
  }

  function progreso(x, z, out = _progDef) {
    const pr = proyectar(x, z, _pm)
    out.s = pr.s
    out.t = pr.s / longitud
    out.lateral = pr.lateral
    out.indice = pr.indice
    out.tangente.set(eje.tx[pr.indice], eje.ty[pr.indice], eje.tz[pr.indice])
    return out
  }

  const _puntoEn = {
    posicion: new THREE.Vector3(),
    tangente: new THREE.Vector3(),
    normal: new THREE.Vector3(),
    ancho: 9,
  }
  function puntoEn(s, out = _puntoEn) {
    const m = marcoEn(s)
    out.posicion.copy(m.posicion).addScaledVector(m.normal, COMBADURA)
    out.tangente.copy(m.tangente)
    out.normal.copy(m.normal)
    out.ancho = m.ancho
    return out
  }

  // --- Muros y colisión ----------------------------------------------------
  const segmentos = [] // { ax, az, bx, bz, y, alto, radio, nx, nz, largo }
  const grillaMuros = new GrillaEspacial(
    minX - margenMundo,
    minZ - margenMundo,
    maxX + margenMundo,
    maxZ + margenMundo,
    LADO_CELDA,
  )

  function agregarSegmento(ax, az, bx, bz, y, alto, radio) {
    const ex = bx - ax
    const ez = bz - az
    const largo = Math.hypot(ex, ez) || 1e-5
    const seg = {
      ax,
      az,
      bx,
      bz,
      y,
      alto,
      radio,
      ex: ex / largo,
      ez: ez / largo,
      largo,
    }
    const i = segmentos.length
    segmentos.push(seg)
    const cx = (ax + bx) * 0.5
    const cz = (az + bz) * 0.5
    grillaMuros.insertar(cx, cz, largo * 0.5 + radio + 1.5, i)
    return seg
  }

  /** Cilindro sólido del decorado (postes, rocas, tribunas). */
  function agregarSolido(x, z, radio, y = 0, alto = 4) {
    agregarSegmento(x, z, x + 0.001, z, y, alto, radio)
  }

  const _col = { golpe: false, correccion: new THREE.Vector3(), normal: new THREE.Vector3() }
  function colisionar(posicion, radio, out = _col) {
    out.golpe = false
    out.correccion.set(0, 0, 0)
    out.normal.set(0, 0, 0)
    const c = grillaMuros.consultar(posicion.x, posicion.z)
    if (!c) return out
    let mejorPen = 0
    for (let k = 0; k < c.length; k++) {
      const s = segmentos[c[k]]
      if (posicion.y + 1.4 < s.y || posicion.y > s.y + s.alto) continue
      const ax = posicion.x - s.ax
      const az = posicion.z - s.az
      const t = clamp(ax * s.ex + az * s.ez, 0, s.largo)
      const cx = posicion.x - (s.ax + s.ex * t)
      const cz = posicion.z - (s.az + s.ez * t)
      const d = Math.hypot(cx, cz)
      const min = radio + s.radio
      if (d >= min) continue
      const pen = min - d
      const inv = d > 1e-5 ? 1 / d : 0
      const nx2 = d > 1e-5 ? cx * inv : -s.ez
      const nz2 = d > 1e-5 ? cz * inv : s.ex
      out.golpe = true
      out.correccion.x += nx2 * pen
      out.correccion.z += nz2 * pen
      if (pen > mejorPen) {
        mejorPen = pen
        out.normal.set(nx2, 0, nz2)
      }
    }
    if (out.golpe && out.normal.lengthSq() > 0) out.normal.normalize()
    return out
  }

  // --- Datos de carrera ----------------------------------------------------
  const sMeta = def.sMeta ?? 0
  const puestosSalida = []
  {
    const filas = 4
    const cols = 2
    for (let f = 0; f < filas; f++) {
      for (let c = 0; c < cols; c++) {
        const s = sMeta - 9 - f * CARRERA.separacionParrilla
        const lateral = (c === 0 ? -1 : 1) * (CARRERA.anchoParrilla * 0.5)
        const pos = puntoLateral(s, lateral, new THREE.Vector3())
        const m = marcoEn(s)
        puestosSalida.push({
          posicion: pos.setY(pos.y + 0.05),
          rotacionY: Math.atan2(-m.tangente.x, -m.tangente.z),
        })
      }
    }
  }

  const cajasItem = []
  for (const fila of def.cajasItem || []) {
    const cantidad = fila.n ?? 5
    const extension = fila.extension ?? 0.72
    for (let i = 0; i < cantidad; i++) {
      const u = cantidad === 1 ? 0 : (i / (cantidad - 1)) * 2 - 1
      const m = marcoEn(fila.s)
      const pos = puntoLateral(fila.s, u * extension * m.ancho, new THREE.Vector3())
      pos.y += 1.15
      cajasItem.push({ posicion: pos })
    }
  }

  const monedas = []
  for (const mo of def.monedas || []) {
    const pos = puntoLateral(mo.s, mo.lateral ?? 0, new THREE.Vector3())
    pos.y += 0.85
    monedas.push({ posicion: pos })
  }
  // Relleno automático hasta ~40 monedas, alternando la trazada.
  {
    let intento = 0
    while (monedas.length < (def.monedasObjetivo ?? 40) && intento < 400) {
      intento++
      const s = (azar() * longitud) % longitud
      const m = marcoEn(s)
      const lateral = (azar() * 2 - 1) * m.ancho * 0.66
      const pos = puntoLateral(s, lateral, new THREE.Vector3())
      let cerca = false
      for (const otra of monedas) {
        if (otra.posicion.distanceToSquared(pos) < 36) {
          cerca = true
          break
        }
      }
      if (cerca) continue
      if (huecos.some((h) => enRango(h, s))) continue
      pos.y += 0.85
      monedas.push({ posicion: pos })
    }
  }

  const puntosControl = def.puntosControl ?? 24
  function checkpointEn(s) {
    const ss = ((s % longitud) + longitud) % longitud
    return Math.min(puntosControl - 1, Math.floor((ss / longitud) * puntosControl))
  }

  // =========================================================================
  // MALLAS
  // =========================================================================
  const materiales = []
  function registrarMaterial(m) {
    materiales.push(m)
    return m
  }

  if (!sinMallas) {
    const fus = new Fusionador(grupo)
    const columnas = calidad === 'baja' ? 8 : 10

    // ---- Calzada ---------------------------------------------------------
    {
      const mapas = materialMaps('asfalto', [1, 1], { tono: tema.colorAsfalto ?? PALETA.asfalto })
      const matAsfalto = registrarMaterial(
        new THREE.MeshStandardMaterial({
          ...mapas,
          color: 0xffffff,
          roughness: 0.94,
          metalness: 0.02,
          vertexColors: true,
        }),
      )
      const matTierraPista = registrarMaterial(
        new THREE.MeshStandardMaterial({
          ...materialMaps('tierra', [1, 1]),
          roughness: 0.99,
          metalness: 0,
          vertexColors: true,
        }),
      )

      // Se corta la tira en tramos continuos (los huecos de salto quedan vacíos).
      let filas = []
      let materialActual = 'asfalto'
      const cerrarTramo = () => {
        if (filas.length > 1) {
          const g = tiraDesdeFilas(filas, true)
          if (g) fus.agregar(materialActual === 'tierra' ? 'calzadaTierra' : 'calzada', g, materialActual === 'tierra' ? matTierraPista : matAsfalto, { sombraRecibe: true })
        }
        filas = []
      }
      for (let i = 0; i <= N; i++) {
        const ii = i % N
        const s = i * paso
        if (huecos.some((h) => enRango(h, s % longitud))) {
          cerrarTramo()
          continue
        }
        const tipo = tipoTramo(s % longitud) === 'tierra' ? 'tierra' : 'asfalto'
        if (tipo !== materialActual && filas.length > 1) {
          // Cierra el tramo repitiendo la fila para no dejar costura.
          cerrarTramo()
        }
        materialActual = tipo
        const fila = []
        const ancho = eje.ancho[ii]
        for (let c = 0; c <= columnas; c++) {
          const u = (c / columnas) * 2 - 1
          const lat = u * ancho
          const comba = COMBADURA * (1 - u * u)
          const x = eje.px[ii] + eje.dx[ii] * lat + eje.nx[ii] * comba
          const y = eje.py[ii] + eje.dy[ii] * lat + eje.ny[ii] * comba
          const z = eje.pz[ii] + eje.dz[ii] * lat + eje.nz[ii] * comba
          // Oscurecimiento suave hacia los bordes (goma y polvo acumulado).
          const suciedad = 1 - 0.22 * Math.pow(Math.abs(u), 3)
          const centroClaro = 1 + 0.05 * (1 - Math.abs(u))
          const g = suciedad * centroClaro
          fila.push({
            x,
            y,
            z,
            nx: eje.nx[ii],
            ny: eje.ny[ii],
            nz: eje.nz[ii],
            u: lat / 8,
            v: s / 8,
            r: g,
            g,
            b: g * 0.99,
          })
        }
        filas.push(fila)
      }
      cerrarTramo()

      // Faldón lateral: tapa el corte entre calzada y terreno.
      const matFaldon = registrarMaterial(
        new THREE.MeshStandardMaterial({ color: 0x2a2a33, roughness: 1, metalness: 0 }),
      )
      for (const lado of [-1, 1]) {
        let filasF = []
        const cerrarF = () => {
          if (filasF.length > 1) {
            const g = tiraDesdeFilas(filasF, false)
            if (g) fus.agregar('faldon', g, matFaldon, { sombraRecibe: false })
          }
          filasF = []
        }
        for (let i = 0; i <= N; i++) {
          const ii = i % N
          const s = i * paso
          if (huecos.some((h) => enRango(h, s % longitud))) {
            cerrarF()
            continue
          }
          const ancho = eje.ancho[ii] + anchoBordillo
          const lat = lado * ancho
          const x = eje.px[ii] + eje.dx[ii] * lat
          const y = eje.py[ii] + eje.dy[ii] * lat
          const z = eje.pz[ii] + eje.dz[ii] * lat
          const nxo = eje.dx[ii] * lado
          const nzo = eje.dz[ii] * lado
          const arriba = { x, y: y + altoBordillo, z, nx: nxo, ny: 0, nz: nzo, u: s / 4, v: 0 }
          const abajo = { x, y: y - 1.1, z, nx: nxo, ny: 0, nz: nzo, u: s / 4, v: 1 }
          filasF.push(lado > 0 ? [arriba, abajo] : [abajo, arriba])
        }
        cerrarF()
      }
    }

    // ---- Bordillos -------------------------------------------------------
    {
      const matBordillo = registrarMaterial(
        new THREE.MeshStandardMaterial({
          ...materialMaps('bordillo', [1, 1], { rayas: 8 }),
          roughness: 0.7,
          metalness: 0.03,
        }),
      )
      for (const lado of [-1, 1]) {
        const activo = lado < 0 ? bordilloIzq : bordilloDer
        let filas = []
        const cerrar = () => {
          if (filas.length > 1) {
            const g = tiraDesdeFilas(filas, false)
            if (g) fus.agregar('bordillo', g, matBordillo, { sombraRecibe: true })
          }
          filas = []
        }
        for (let i = 0; i <= N; i++) {
          const ii = i % N
          const s = i * paso
          if (!activo[ii] || huecos.some((h) => enRango(h, s % longitud))) {
            cerrar()
            continue
          }
          const fila = []
          for (let c = 0; c <= 2; c++) {
            const lat = lado * (eje.ancho[ii] + (c / 2) * anchoBordillo)
            const alza = c === 0 ? altoBordillo * 0.45 : altoBordillo
            const x = eje.px[ii] + eje.dx[ii] * lat + eje.nx[ii] * alza
            const y = eje.py[ii] + eje.dy[ii] * lat + eje.ny[ii] * alza
            const z = eje.pz[ii] + eje.dz[ii] * lat + eje.nz[ii] * alza
            fila.push({
              x,
              y,
              z,
              nx: eje.nx[ii],
              ny: eje.ny[ii],
              nz: eje.nz[ii],
              u: lado > 0 ? c / 2 : 1 - c / 2,
              v: s / 4,
            })
          }
          filas.push(lado > 0 ? fila : fila.reverse())
        }
        cerrar()
      }
    }

    // ---- Terreno ---------------------------------------------------------
    {
      const rep = tema.repeticionTerreno ?? 0.09
      const mapas = materialMaps(tema.texturaTerreno || 'cesped', [1, 1], tema.opcionesTerreno || {})
      const matTerreno = registrarMaterial(
        new THREE.MeshStandardMaterial({
          ...mapas,
          roughness: 0.98,
          metalness: 0,
          vertexColors: true,
        }),
      )
      const celda = calidad === 'baja' ? 6.5 : 4.6
      const x0 = minX - margenMundo
      const z0 = minZ - margenMundo
      const cols = Math.ceil((maxX - minX + margenMundo * 2) / celda) + 1
      const filasN = Math.ceil((maxZ - minZ + margenMundo * 2) / celda) + 1
      const nv = (cols + 1) * (filasN + 1)
      const pos = new Float32Array(nv * 3)
      const uv = new Float32Array(nv * 2)
      const col = new Float32Array(nv * 3)
      const huecoV = new Uint8Array(nv)
      const zonasHueco = zonas.filter((z) => z.hueco)
      let k = 0
      for (let f = 0; f <= filasN; f++) {
        for (let c = 0; c <= cols; c++) {
          const x = x0 + c * celda
          const z = z0 + f * celda
          const y = alturaTerreno(x, z)
          pos[k * 3] = x
          pos[k * 3 + 1] = y
          pos[k * 3 + 2] = z
          uv[k * 2] = x * rep
          uv[k * 2 + 1] = z * rep
          const v = 0.82 + fbm(x * 0.035, z * 0.035, 3, semilla + 9) * 0.4
          col[k * 3] = v
          col[k * 3 + 1] = v * 1.02
          col[k * 3 + 2] = v * 0.96
          for (const zo of zonasHueco) if (distanciaZona(zo, x, z) < 0) huecoV[k] = 1
          k++
        }
      }
      const idx = []
      const vi = (c, f) => f * (cols + 1) + c
      for (let f = 0; f < filasN; f++) {
        for (let c = 0; c < cols; c++) {
          const a = vi(c, f)
          const b = vi(c + 1, f)
          const d = vi(c, f + 1)
          const e = vi(c + 1, f + 1)
          if (huecoV[a] && huecoV[b] && huecoV[d] && huecoV[e]) continue
          idx.push(a, d, b, b, d, e)
        }
      }
      const geo = new THREE.BufferGeometry()
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
      geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
      geo.setAttribute('color', new THREE.BufferAttribute(col, 3))
      geo.setIndex(idx)
      geo.computeVertexNormals()
      const malla = new THREE.Mesh(geo, matTerreno)
      malla.name = 'terreno'
      malla.receiveShadow = true
      grupo.add(malla)

      // Faldón perimetral hacia abajo: esconde el borde del mundo tras la niebla.
      const borde = []
      for (let c = 0; c <= cols; c++) borde.push([vi(c, 0), 0])
      for (let f = 0; f <= filasN; f++) borde.push([vi(cols, f), 1])
      for (let c = cols; c >= 0; c--) borde.push([vi(c, filasN), 2])
      for (let f = filasN; f >= 0; f--) borde.push([vi(0, f), 3])
      const filasFaldon = borde.map(([i]) => {
        const x = pos[i * 3]
        const y = pos[i * 3 + 1]
        const z = pos[i * 3 + 2]
        return [
          { x, y, z, nx: 0, ny: 1, nz: 0, u: 0, v: 0 },
          { x, y: y - 70, z, nx: 0, ny: 1, nz: 0, u: 0, v: 6 },
        ]
      })
      const gf = tiraDesdeFilas(filasFaldon, false)
      if (gf) {
        const matF = registrarMaterial(
          new THREE.MeshBasicMaterial({
            color: tema.colorFaldon ?? tema.niebla?.color ?? 0x334433,
            side: THREE.DoubleSide,
            fog: true,
          }),
        )
        const mf = new THREE.Mesh(gf, matF)
        mf.name = 'faldonMundo'
        grupo.add(mf)
      }
    }

    // ---- Zonas visibles (lava, agua, senderos de tierra) ------------------
    for (const zo of zonas) {
      if (zo.invisible) continue
      const esLiquido = zo.tipo === 'lava' || zo.tipo === 'agua'
      const nombreTex = zo.textura || (zo.tipo === 'lava' ? 'lava' : zo.tipo === 'agua' ? 'agua' : 'tierra')
      const repZ = zo.repeticion ?? (esLiquido ? 0.035 : 0.1)
      const tex = textura(nombreTex, [1, 1])
      const texAnim = tex.clone()
      texAnim.needsUpdate = true
      texAnim.wrapS = texAnim.wrapT = THREE.RepeatWrapping
      const mat = registrarMaterial(
        zo.tipo === 'lava'
          ? new THREE.MeshStandardMaterial({
              map: texAnim,
              emissiveMap: texAnim,
              emissive: 0xffffff,
              emissiveIntensity: 1.35,
              roughness: 0.55,
              metalness: 0,
              toneMapped: true,
            })
          : new THREE.MeshStandardMaterial({
              map: texAnim,
              color: 0xffffff,
              roughness: zo.tipo === 'agua' ? 0.16 : 0.98,
              metalness: zo.tipo === 'agua' ? 0.25 : 0,
              transparent: zo.tipo === 'agua',
              opacity: zo.tipo === 'agua' ? 0.9 : 1,
            }),
      )
      let geo = null
      if (zo.forma === 'disco') {
        const rx = zo.radioX ?? zo.radio
        const rz = zo.radioZ ?? zo.radio
        const segs = 56
        const vs = []
        const ids = []
        vs.push({ x: zo.x, z: zo.z })
        for (let i = 0; i < segs; i++) {
          const a = (i / segs) * TAU
          const irr = 1 + Math.sin(a * 3 + zo.x) * 0.07 + Math.cos(a * 5 - zo.z) * 0.05
          vs.push({ x: zo.x + Math.cos(a) * rx * irr, z: zo.z + Math.sin(a) * rz * irr })
        }
        for (let i = 1; i <= segs; i++) ids.push(0, i, i === segs ? 1 : i + 1)
        const p = new Float32Array(vs.length * 3)
        const u2 = new Float32Array(vs.length * 2)
        const n2 = new Float32Array(vs.length * 3)
        for (let i = 0; i < vs.length; i++) {
          const yy = zo.y !== undefined && zo.y !== null ? zo.y : alturaTerreno(vs[i].x, vs[i].z) + 0.06
          p[i * 3] = vs[i].x
          p[i * 3 + 1] = yy
          p[i * 3 + 2] = vs[i].z
          u2[i * 2] = vs[i].x * repZ
          u2[i * 2 + 1] = vs[i].z * repZ
          n2[i * 3 + 1] = 1
        }
        geo = new THREE.BufferGeometry()
        geo.setAttribute('position', new THREE.BufferAttribute(p, 3))
        geo.setAttribute('uv', new THREE.BufferAttribute(u2, 2))
        geo.setAttribute('normal', new THREE.BufferAttribute(n2, 3))
        geo.setIndex(ids)
      } else {
        // Franja: ribete a lo largo de la polilínea, subdividida.
        const pts = []
        for (let i = 0; i < zo.puntos.length - 1; i++) {
          const a = zo.puntos[i]
          const b = zo.puntos[i + 1]
          const d = Math.hypot(b[0] - a[0], b[1] - a[1])
          const n = Math.max(1, Math.round(d / 3.5))
          for (let k2 = 0; k2 < n; k2++) {
            const t = k2 / n
            pts.push([lerp(a[0], b[0], t), lerp(a[1], b[1], t)])
          }
        }
        pts.push(zo.puntos[zo.puntos.length - 1])
        const filas = []
        for (let i = 0; i < pts.length; i++) {
          const a = pts[Math.max(0, i - 1)]
          const b = pts[Math.min(pts.length - 1, i + 1)]
          const ex = b[0] - a[0]
          const ez = b[1] - a[1]
          const l = Math.hypot(ex, ez) || 1
          const px2 = -ez / l
          const pz2 = ex / l
          const fila = []
          for (let c = -1; c <= 1; c++) {
            const x = pts[i][0] + px2 * c * zo.ancho * 0.5
            const z = pts[i][1] + pz2 * c * zo.ancho * 0.5
            const yy = zo.y !== undefined && zo.y !== null ? zo.y : alturaTerreno(x, z) + 0.06
            fila.push({ x, y: yy, z, nx: 0, ny: 1, nz: 0, u: x * repZ, v: z * repZ })
          }
          filas.push(fila)
        }
        geo = tiraDesdeFilas(filas, false)
      }
      if (!geo) continue
      const malla = new THREE.Mesh(geo, mat)
      malla.name = `zona_${zo.tipo}`
      malla.receiveShadow = zo.tipo !== 'lava'
      if (zo.y === undefined || zo.y === null) {
        mat.polygonOffset = true
        mat.polygonOffsetFactor = -2
        mat.polygonOffsetUnits = -2
      }
      grupo.add(malla)
      const vel = zo.tipo === 'lava' ? 0.012 : zo.tipo === 'agua' ? 0.02 : 0
      if (vel > 0) {
        animables.push((dt, tiempo) => {
          texAnim.offset.y = -tiempo * vel
          texAnim.offset.x = Math.sin(tiempo * 0.11) * 0.03
          if (zo.tipo === 'lava') {
            mat.emissiveIntensity = 1.2 + Math.sin(tiempo * 0.9 + zo.x * 0.1) * 0.28
          }
        })
      }
    }

    // ---- Paneles de turbo -------------------------------------------------
    if (turbos.length) {
      const texT = sprite('flechasTurbo').clone()
      texT.needsUpdate = true
      texT.wrapS = THREE.ClampToEdgeWrapping
      texT.wrapT = THREE.RepeatWrapping
      const matT = registrarMaterial(
        new THREE.MeshStandardMaterial({
          map: texT,
          emissiveMap: texT,
          emissive: 0xffffff,
          emissiveIntensity: 1.8,
          transparent: true,
          depthWrite: false,
          roughness: 0.6,
          metalness: 0,
          polygonOffset: true,
          polygonOffsetFactor: -4,
          polygonOffsetUnits: -4,
        }),
      )
      const geos = []
      for (const t of turbos) {
        const largo = t.hasta >= t.desde ? t.hasta - t.desde : longitud - t.desde + t.hasta
        const pasos = Math.max(2, Math.round(largo / 2))
        const filas = []
        for (let i = 0; i <= pasos; i++) {
          const s = t.desde + (largo * i) / pasos
          const m = marcoEn(s)
          const fila = []
          for (let c = 0; c <= 1; c++) {
            const lat = lerp(t.desdeLateral, t.hastaLateral, c)
            const ln = clamp(lat / m.ancho, -1, 1)
            const p = _va
              .copy(m.posicion)
              .addScaledVector(m.derecha, lat)
              .addScaledVector(m.normal, COMBADURA * (1 - ln * ln) + 0.035)
            fila.push({
              x: p.x,
              y: p.y,
              z: p.z,
              nx: m.normal.x,
              ny: m.normal.y,
              nz: m.normal.z,
              u: c,
              v: -((largo * i) / pasos) / 9,
            })
          }
          filas.push(fila)
        }
        const g = tiraDesdeFilas(filas, false)
        if (g) geos.push(g)
      }
      if (geos.length) {
        const g = geos.length === 1 ? geos[0] : mergeGeometries(geos, false)
        const malla = new THREE.Mesh(g, matT)
        malla.name = 'turbos'
        malla.renderOrder = 2
        grupo.add(malla)
        animables.push((dt, tiempo) => {
          texT.offset.y = (tiempo * 1.4) % 1
          matT.emissiveIntensity = 1.55 + Math.sin(tiempo * 6) * 0.5
        })
      }
    }

    // ---- Muros -----------------------------------------------------------
    construirMuros()

    fus.construir()
  } else {
    // En modo lógico igual se registran las cápsulas de colisión.
    construirMuros(true)
  }

  function construirMuros(soloColision = false) {
    const fus = soloColision ? null : new Fusionador(grupo)
    const cacheMat = new Map()
    const matPara = (clave, crear) => {
      let m = cacheMat.get(clave)
      if (!m) {
        m = registrarMaterial(crear())
        cacheMat.set(clave, m)
      }
      return m
    }
    for (const muro of def.muros || []) {
      const r = normalizarRango(muro)
      const largo = r.hasta >= r.desde ? r.hasta - r.desde : longitud - r.desde + r.hasta
      const separacion = muro.separacion ?? 4
      const pasos = Math.max(1, Math.round(largo / separacion))
      const lado = muro.lado
      const desplazamiento = muro.desplazamiento ?? 1.4
      const altura = muro.altura ?? 1.7
      const radio = muro.radio ?? 0.45
      const puntos = []
      for (let i = 0; i <= pasos; i++) {
        const s = r.desde + (largo * i) / pasos
        const m = marcoEn(s)
        const lat = lado * (m.ancho + anchoBordillo + desplazamiento)
        const p = new THREE.Vector3()
          .copy(m.posicion)
          .addScaledVector(m.derecha, lat)
          .addScaledVector(m.normal, 0)
        puntos.push({ p, m: { x: m.derecha.x, z: m.derecha.z, tx: m.tangente.x, tz: m.tangente.z } })
      }
      for (let i = 0; i < puntos.length - 1; i++) {
        const a = puntos[i].p
        const b = puntos[i + 1].p
        agregarSegmento(a.x, a.z, b.x, b.z, Math.min(a.y, b.y) - 0.5, altura + 0.6, radio)
      }
      if (soloColision) continue

      const tipo = muro.tipo || 'valla'
      for (let i = 0; i < puntos.length - 1; i++) {
        const a = puntos[i].p
        const b = puntos[i + 1].p
        const cx = (a.x + b.x) * 0.5
        const cz = (a.z + b.z) * 0.5
        const cy = (a.y + b.y) * 0.5
        const ang = Math.atan2(b.x - a.x, b.z - a.z)
        const tramo = Math.hypot(b.x - a.x, b.z - a.z)

        if (tipo === 'valla') {
          const textos = muro.textos && muro.textos.length ? muro.textos : ['COOPERATIVA']
          const texto = textos[i % textos.length]
          const fondo = (muro.fondos || [PALETA.marcaPrimario])[i % (muro.fondos?.length || 1)]
          const mat = matPara(`valla:${texto}:${fondo}`, () =>
            new THREE.MeshStandardMaterial({
              map: sprite('cartel', { texto, fondo }),
              roughness: 0.75,
              metalness: 0.05,
              side: THREE.DoubleSide,
            }),
          )
          const panel = new THREE.BoxGeometry(tramo * 0.96, altura * 0.72, 0.14)
          ubicar(panel, cx, cy + altura * 0.62, cz, ang + Math.PI / 2)
          fus.agregar(`valla:${texto}:${fondo}`, panel, mat, { sombraProyecta: true })
          const matPoste = matPara('posteValla', () =>
            new THREE.MeshStandardMaterial({ color: 0xd8dae0, roughness: 0.5, metalness: 0.6 }),
          )
          const poste = new THREE.CylinderGeometry(0.09, 0.11, altura, 6)
          ubicar(poste, a.x, a.y + altura * 0.5 - 0.2, a.z)
          fus.agregar('posteValla', poste, matPoste, { sombraProyecta: true })
        } else if (tipo === 'guardarrail') {
          const matMetal = matPara('guardarrail', () =>
            new THREE.MeshStandardMaterial({ color: 0xc8ccd4, roughness: 0.36, metalness: 0.82 }),
          )
          const riel = new THREE.BoxGeometry(tramo * 1.02, 0.42, 0.12)
          ubicar(riel, cx, cy + 0.82, cz, ang + Math.PI / 2)
          fus.agregar('guardarrail', riel, matMetal, { sombraProyecta: true })
          const riel2 = new THREE.BoxGeometry(tramo * 1.02, 0.16, 0.1)
          ubicar(riel2, cx, cy + 0.34, cz, ang + Math.PI / 2)
          fus.agregar('guardarrail', riel2, matMetal, { sombraProyecta: false })
          if (i % 2 === 0) {
            const poste = new THREE.BoxGeometry(0.14, 1.1, 0.14)
            ubicar(poste, a.x, a.y + 0.5, a.z, ang)
            fus.agregar('guardarrail', poste, matMetal, { sombraProyecta: true })
          }
        } else if (tipo === 'roca') {
          const matRoca = matPara('muroRoca', () =>
            new THREE.MeshStandardMaterial({
              ...materialMaps(tema.texturaRoca || 'rocaVolcanica', [1, 1]),
              roughness: 0.96,
              metalness: 0.02,
            }),
          )
          const esc = 1.1 + azar() * 0.9
          const bloque = new THREE.IcosahedronGeometry(radio * 2.1 * esc, 0)
          bloque.scale(1, 0.85 + azar() * 0.5, 1)
          ubicar(bloque, a.x, a.y + radio * 1.0, a.z, azar() * TAU)
          fus.agregar('muroRoca', bloque, matRoca, { sombraProyecta: true })
        } else if (tipo === 'baranda') {
          const matPiedra = matPara('baranda', () =>
            new THREE.MeshStandardMaterial({ color: 0x4a3b3f, roughness: 0.92, metalness: 0.05 }),
          )
          const riel = new THREE.BoxGeometry(tramo * 1.02, 0.22, 0.22)
          ubicar(riel, cx, cy + 0.95, cz, ang + Math.PI / 2)
          fus.agregar('baranda', riel, matPiedra, { sombraProyecta: true })
          const poste = new THREE.BoxGeometry(0.3, 1.05, 0.3)
          ubicar(poste, a.x, a.y + 0.5, a.z, ang)
          fus.agregar('baranda', poste, matPiedra, { sombraProyecta: true })
        } else {
          const matMuro = matPara('muroSolido', () =>
            new THREE.MeshStandardMaterial({
              ...materialMaps(muro.textura || 'ladrillo', [1, 1]),
              roughness: 0.9,
              metalness: 0.02,
            }),
          )
          const bloque = new THREE.BoxGeometry(tramo * 1.02, altura, 0.6)
          ubicar(bloque, cx, cy + altura * 0.5, cz, ang + Math.PI / 2)
          fus.agregar('muroSolido', bloque, matMuro, { sombraProyecta: true })
        }
      }
    }
    if (fus) fus.construir()
  }

  // --- API para el decorado de cada circuito -------------------------------
  const api = {
    grupo,
    calidad,
    semilla,
    tema,
    azar,
    longitud,
    eje,
    puntoEn,
    puntoLateral,
    marcoEn,
    muestrear,
    progreso,
    alturaTerreno,
    agregarSolido,
    agregarSegmento,
    sinMallas,
    /** Registra una función de animación por cuadro. */
    animar(fn) {
      animables.push(fn)
    },
    /** Registra un objeto que sólo se dibuja dentro de `distancia` metros. */
    lod(objeto, distancia) {
      lods.push({ objeto, d2: distancia * distancia })
    },
    /** Marca un material/geometría para liberarlo al destruir la pista. */
    desechar(x) {
      desechables.push(x)
    },
    registrarMaterial,
  }
  if (typeof def.decorar === 'function' && !sinMallas) def.decorar(api)

  // --- Límites --------------------------------------------------------------
  const limites = new THREE.Box3(
    new THREE.Vector3(minX - margenMundo, -120, minZ - margenMundo),
    new THREE.Vector3(maxX + margenMundo, 220, maxZ + margenMundo),
  )

  // --- Sombras con criterio: sólo lo cercano proyecta ------------------------
  if (!sinMallas) {
    grupo.traverse((o) => {
      if (!o.isMesh) return
      if (o.name === 'terreno' || o.name === 'faldonMundo') o.castShadow = false
    })
  }

  let cursorLod = 0
  function actualizar(dt, tiempo, camara) {
    for (let i = 0; i < animables.length; i++) animables[i](dt, tiempo, camara)
    if (lods.length && camara) {
      const porCuadro = Math.max(1, Math.ceil(lods.length / 6))
      for (let k = 0; k < porCuadro; k++) {
        const l = lods[cursorLod % lods.length]
        cursorLod++
        const o = l.objeto
        if (!o) continue
        const dx2 = o.position.x - camara.position.x
        const dz2 = o.position.z - camara.position.z
        o.visible = dx2 * dx2 + dz2 * dz2 < l.d2
      }
    }
  }

  function destruir() {
    grupo.traverse((o) => {
      if (o.geometry) o.geometry.dispose()
    })
    for (const m of materiales) if (m && m.dispose) m.dispose()
    for (const d of desechables) if (d && d.dispose) d.dispose()
    if (grupo.parent) grupo.parent.remove(grupo)
    animables.length = 0
    lods.length = 0
  }

  if (ctx.escena && !sinMallas) ctx.escena.add(grupo)

  return {
    id: def.id,
    nombre: def.nombre,
    vueltas: def.vueltas ?? CARRERA.vueltasPorDefecto,
    longitud,
    grupo,
    limites,
    muestrear,
    progreso,
    puntoEn,
    colisionar,
    puestosSalida,
    cajasItem,
    monedas,
    puntosControl,
    checkpointEn,
    actualizar,
    destruir,
    // Extras útiles para IA, cámara y depuración (no forman parte del contrato).
    eje,
    tema,
    alturaTerreno,
    puntoLateral,
    api,
  }
}

export default { construirPista, construirEje, crearSuperficie, crearProgreso, PASO_MUESTRA }
