// Circuito Cooperativa: el único circuito del MVP.
//
// La pista se define con un puñado de puntos de control; de ahí sale una curva
// cerrada que se remuestrea por longitud de arco. Todas las consultas que hace
// la física (altura del suelo, tipo de superficie, progreso en la vuelta,
// choque contra el muro) se resuelven sobre ese muestreo con una grilla
// espacial, así son baratas aunque se llamen ocho veces por cuadro.
import * as THREE from 'three'
import { PALETA } from '../assets/paleta.js'
import { textura } from '../assets/texturas.js'
import { clamp, lerp, rng, smoothstep } from '../core/utils.js'

/**
 * Puntos de control del trazado: [x, z, y, semiancho].
 * Recorrido: recta de meta → curva rápida → bajada → horquilla → chicane →
 * subida → curva peraltada larga → vuelta a meta.
 */
const PUNTOS = [
  [0, 165, 0, 14], // meta, la recta más ancha
  [95, 162, 0, 13],
  [162, 132, 1.5, 11],
  [200, 62, 3, 10],
  [204, -22, 1, 11],
  [176, -88, -1.5, 9],
  [110, -122, -2.5, 7.5], // horquilla cerrada
  [54, -104, -1.5, 8],
  [36, -52, 0, 8.5], // chicane
  [-22, -34, 1.5, 9],
  [-78, -62, 3.5, 10],
  [-138, -42, 5.5, 10],
  [-162, 32, 6, 12], // peraltada larga
  [-132, 112, 3, 12],
  [-62, 152, 0.8, 13],
]

const MUESTRAS = 480
const MARGEN_MURO = 3.0
const ANCHO_BORDILLO = 1.2
const ANCHO_PASTO = 55
const CELDA = 12

/** Tramos de turbo: [posición en la vuelta 0..1, largo en metros]. */
const TURBOS = [
  [0.29, 14],
  [0.62, 14],
  [0.85, 14],
]

const _v = new THREE.Vector3()

export const META_PISTA = {
  id: 'cooperativa',
  nombre: 'Circuito Cooperativa',
  descripcion: 'Pradera soleada. Recta larga, horquilla traicionera y una peraltada para pasar.',
  vueltas: 3,
  dificultad: 1,
}

export function crearPista(opciones = {}) {
  const conMallas = opciones.sinMallas !== true
  const semilla = opciones.semilla ?? 20260902

  // -------------------------------------------------------------------------
  // Eje central: curva cerrada remuestreada por longitud de arco
  // -------------------------------------------------------------------------
  const curva = new THREE.CatmullRomCurve3(
    PUNTOS.map((p) => new THREE.Vector3(p[0], p[2], p[1])),
    true,
    'centripetal',
    0.5,
  )

  const puntos = curva.getSpacedPoints(MUESTRAS) // MUESTRAS+1, el último repite el primero
  puntos.length = MUESTRAS

  // Longitud real y distancia acumulada por muestra.
  const dist = new Float32Array(MUESTRAS + 1)
  for (let i = 1; i <= MUESTRAS; i++) {
    dist[i] = dist[i - 1] + puntos[i % MUESTRAS].distanceTo(puntos[i - 1])
  }
  const longitud = dist[MUESTRAS]
  const paso = longitud / MUESTRAS

  // Tangente y normal lateral (derecha) de cada muestra.
  const tang = []
  const lat = []
  for (let i = 0; i < MUESTRAS; i++) {
    const a = puntos[(i - 1 + MUESTRAS) % MUESTRAS]
    const b = puntos[(i + 1) % MUESTRAS]
    const t = new THREE.Vector3().subVectors(b, a).normalize()
    tang.push(t)
    lat.push(new THREE.Vector3(t.z, 0, -t.x).normalize())
  }

  // Semiancho por muestra: se ancla cada punto de control a su muestra más
  // cercana y se interpola suave entre anclas.
  const anchos = calcularAnchos(puntos)

  // -------------------------------------------------------------------------
  // Grilla espacial para las consultas
  // -------------------------------------------------------------------------
  const caja = new THREE.Box3().setFromPoints(puntos).expandByScalar(ANCHO_PASTO + 20)
  const cols = Math.ceil((caja.max.x - caja.min.x) / CELDA)
  const filas = Math.ceil((caja.max.z - caja.min.z) / CELDA)
  const grilla = new Array(cols * filas)
  const celdaDe = (x, z) => {
    const cx = clamp(Math.floor((x - caja.min.x) / CELDA), 0, cols - 1)
    const cz = clamp(Math.floor((z - caja.min.z) / CELDA), 0, filas - 1)
    return cz * cols + cx
  }
  for (let i = 0; i < MUESTRAS; i++) {
    const p = puntos[i]
    // Cada muestra se registra en las celdas de un entorno, para que una
    // consulta a media pista siempre encuentre candidatos.
    const radio = Math.ceil((anchos[i] + 8) / CELDA)
    const cx = Math.floor((p.x - caja.min.x) / CELDA)
    const cz = Math.floor((p.z - caja.min.z) / CELDA)
    for (let dz = -radio; dz <= radio; dz++) {
      for (let dx = -radio; dx <= radio; dx++) {
        const x = cx + dx
        const z = cz + dz
        if (x < 0 || z < 0 || x >= cols || z >= filas) continue
        const k = z * cols + x
        if (!grilla[k]) grilla[k] = []
        grilla[k].push(i)
      }
    }
  }

  /** Índice de la muestra más cercana a (x,z). */
  function muestraCercana(x, z) {
    const candidatos = grilla[celdaDe(x, z)]
    let mejor = -1
    let mejorD = Infinity
    if (candidatos) {
      for (let k = 0; k < candidatos.length; k++) {
        const i = candidatos[k]
        const p = puntos[i]
        const d = (p.x - x) * (p.x - x) + (p.z - z) * (p.z - z)
        if (d < mejorD) {
          mejorD = d
          mejor = i
        }
      }
    }
    if (mejor >= 0) return mejor
    // Fuera de la grilla poblada: barrido grueso y refinado alrededor.
    for (let i = 0; i < MUESTRAS; i += 6) {
      const p = puntos[i]
      const d = (p.x - x) * (p.x - x) + (p.z - z) * (p.z - z)
      if (d < mejorD) {
        mejorD = d
        mejor = i
      }
    }
    for (let j = -6; j <= 6; j++) {
      const i = (mejor + j + MUESTRAS) % MUESTRAS
      const p = puntos[i]
      const d = (p.x - x) * (p.x - x) + (p.z - z) * (p.z - z)
      if (d < mejorD) {
        mejorD = d
        mejor = i
      }
    }
    return mejor
  }

  /**
   * Proyecta (x,z) sobre el eje: devuelve la muestra, el avance dentro del
   * segmento, la distancia lateral con signo y la altura interpolada.
   */
  function proyectar(x, z, out) {
    const i = muestraCercana(x, z)
    const p = puntos[i]
    const t = tang[i]
    const dx = x - p.x
    const dz = z - p.z
    const a = dx * t.x + dz * t.z // avance sobre la tangente
    const l = dx * lat[i].x + dz * lat[i].z // desplazamiento lateral
    const u = clamp(a / paso, -1, 1)
    const j = u >= 0 ? (i + 1) % MUESTRAS : (i - 1 + MUESTRAS) % MUESTRAS
    const f = Math.abs(u)
    out.indice = i
    out.lateral = l
    out.y = lerp(p.y, puntos[j].y, f)
    out.ancho = lerp(anchos[i], anchos[j], f)
    out.s = (dist[i] + a + longitud) % longitud
    return out
  }

  // -------------------------------------------------------------------------
  // Tramos de turbo, precalculados en distancia
  // -------------------------------------------------------------------------
  const turbos = TURBOS.map(([t, largo]) => ({ s: t * longitud, largo }))
  const enTurbo = (s, lateral, ancho) => {
    if (Math.abs(lateral) > ancho * 0.85) return false
    for (const t of turbos) {
      let d = Math.abs(s - t.s)
      if (d > longitud / 2) d = longitud - d
      if (d < t.largo / 2) return true
    }
    return false
  }

  // -------------------------------------------------------------------------
  // API que consume la física
  // -------------------------------------------------------------------------
  const _proy = { indice: 0, lateral: 0, y: 0, ancho: 0, s: 0 }

  function muestrear(x, z, out) {
    const o = out || {
      y: 0,
      normal: new THREE.Vector3(0, 1, 0),
      tipo: 'asfalto',
      enPista: true,
      distanciaCentro: 0,
      anchoAqui: 0,
    }
    if (!o.normal) o.normal = new THREE.Vector3(0, 1, 0)
    proyectar(x, z, _proy)
    const abs = Math.abs(_proy.lateral)
    o.y = _proy.y
    o.distanciaCentro = abs
    o.anchoAqui = _proy.ancho
    // La pista es suave: alcanza con la normal del plano local, inclinada por
    // la pendiente longitudinal del tramo.
    const t = tang[_proy.indice]
    o.normal.set(-t.x * t.y, 1, -t.z * t.y).normalize()
    if (abs <= _proy.ancho) {
      o.tipo = enTurbo(_proy.s, _proy.lateral, _proy.ancho) ? 'turbo' : 'asfalto'
      o.enPista = true
    } else if (abs <= _proy.ancho + ANCHO_BORDILLO) {
      o.tipo = 'bordillo'
      o.enPista = true
    } else {
      o.tipo = 'cesped'
      o.enPista = false
    }
    return o
  }

  function progreso(x, z, out) {
    const o = out || { s: 0, t: 0, lateral: 0, tangente: new THREE.Vector3(), indice: 0 }
    if (!o.tangente) o.tangente = new THREE.Vector3()
    proyectar(x, z, _proy)
    o.s = _proy.s
    o.t = _proy.s / longitud
    o.lateral = _proy.lateral
    o.indice = _proy.indice
    o.tangente.copy(tang[_proy.indice])
    return o
  }

  function puntoEn(s, out) {
    const o = out || {
      posicion: new THREE.Vector3(),
      tangente: new THREE.Vector3(),
      normal: new THREE.Vector3(0, 1, 0),
      ancho: 0,
    }
    if (!o.posicion) o.posicion = new THREE.Vector3()
    if (!o.tangente) o.tangente = new THREE.Vector3()
    if (!o.normal) o.normal = new THREE.Vector3(0, 1, 0)
    const ss = ((s % longitud) + longitud) % longitud
    const fi = ss / paso
    const i = Math.floor(fi) % MUESTRAS
    const j = (i + 1) % MUESTRAS
    const f = fi - Math.floor(fi)
    o.posicion.lerpVectors(puntos[i], puntos[j], f)
    o.tangente.copy(tang[i]).lerp(tang[j], f).normalize()
    o.normal.set(0, 1, 0)
    o.ancho = lerp(anchos[i], anchos[j], f)
    return o
  }

  function colisionar(posicion, radio, out) {
    const o = out || { golpe: false, correccion: new THREE.Vector3(), normal: new THREE.Vector3() }
    if (!o.correccion) o.correccion = new THREE.Vector3()
    if (!o.normal) o.normal = new THREE.Vector3()
    o.golpe = false
    o.correccion.set(0, 0, 0)
    proyectar(posicion.x, posicion.z, _proy)
    const limite = _proy.ancho + MARGEN_MURO
    const abs = Math.abs(_proy.lateral)
    if (abs + radio <= limite) return o
    const signo = _proy.lateral >= 0 ? 1 : -1
    const exceso = abs + radio - limite
    const n = lat[_proy.indice]
    o.golpe = true
    o.normal.set(-n.x * signo, 0, -n.z * signo)
    o.correccion.copy(o.normal).multiplyScalar(exceso)
    return o
  }

  const PUNTOS_CONTROL = 24
  const checkpointEn = (s) =>
    Math.floor((((s % longitud) + longitud) % longitud) / (longitud / PUNTOS_CONTROL))

  // Parrilla: cuatro puestos en dos columnas, detrás de la meta.
  const puestosSalida = []
  for (let i = 0; i < 8; i++) {
    const fila = Math.floor(i / 2)
    const col = i % 2 === 0 ? -1 : 1
    const s = longitud - 8 - fila * 6
    const p = puntoEn(s)
    const n = new THREE.Vector3(p.tangente.z, 0, -p.tangente.x)
    puestosSalida.push({
      posicion: new THREE.Vector3(
        p.posicion.x + n.x * col * 3.4,
        p.posicion.y,
        p.posicion.z + n.z * col * 3.4,
      ),
      // El frente del kart es su -Z local, así que el yaw que lo alinea con la
      // tangente es atan2(-tx, -tz). Con el signo al revés largaban de espaldas.
      rotacionY: Math.atan2(-p.tangente.x, -p.tangente.z),
    })
  }

  // -------------------------------------------------------------------------
  // Mallas
  // -------------------------------------------------------------------------
  const grupo = new THREE.Group()
  grupo.name = 'pista'
  if (conMallas) {
    construirMallas(grupo, { puntos, tang, lat, anchos, dist, longitud, turbos, semilla })
  }

  return {
    id: META_PISTA.id,
    nombre: META_PISTA.nombre,
    vueltas: META_PISTA.vueltas,
    longitud,
    grupo,
    limites: caja,
    muestrear,
    progreso,
    puntoEn,
    colisionar,
    checkpointEn,
    puntosControl: PUNTOS_CONTROL,
    puestosSalida,
    cajasItem: [],
    monedas: [],
    /** Trazado normalizado 0..1 para dibujar el minimapa en la interfaz. */
    trazado(n = 90) {
      const pts = []
      for (let i = 0; i < n; i++) {
        const p = puntoEn((i / n) * longitud)
        pts.push({ x: p.posicion.x, z: p.posicion.z })
      }
      const xs = pts.map((p) => p.x)
      const zs = pts.map((p) => p.z)
      const minX = Math.min(...xs)
      const minZ = Math.min(...zs)
      const esc = Math.max(Math.max(...xs) - minX, Math.max(...zs) - minZ) || 1
      return pts.map((p) => ({ x: (p.x - minX) / esc, z: (p.z - minZ) / esc }))
    },
    actualizar() {},
    destruir() {
      grupo.traverse((o) => {
        if (o.geometry) o.geometry.dispose()
        const m = o.material
        if (Array.isArray(m)) m.forEach((x) => x && x.dispose && x.dispose())
        else if (m && m.dispose) m.dispose()
      })
    },
  }
}

/** Interpola el semiancho de cada punto de control a lo largo del muestreo. */
function calcularAnchos(puntos) {
  const n = puntos.length
  // Muestra más cercana a cada punto de control.
  const anclas = PUNTOS.map((p) => {
    let mejor = 0
    let mejorD = Infinity
    for (let i = 0; i < n; i++) {
      const d = (puntos[i].x - p[0]) ** 2 + (puntos[i].z - p[1]) ** 2
      if (d < mejorD) {
        mejorD = d
        mejor = i
      }
    }
    return { i: mejor, ancho: p[3] }
  }).sort((a, b) => a.i - b.i)

  const anchos = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    // Ancla anterior y siguiente, con envoltura circular.
    let prev = anclas[anclas.length - 1]
    let next = anclas[0]
    for (let k = 0; k < anclas.length; k++) {
      if (anclas[k].i <= i) prev = anclas[k]
      if (anclas[k].i > i) {
        next = anclas[k]
        break
      }
    }
    let span = next.i - prev.i
    if (span <= 0) span += n
    let d = i - prev.i
    if (d < 0) d += n
    anchos[i] = lerp(prev.ancho, next.ancho, smoothstep(span === 0 ? 0 : d / span))
  }
  return anchos
}

// ---------------------------------------------------------------------------
// Geometría del escenario
// ---------------------------------------------------------------------------

function cinta(puntos, lat, desde, hasta, dist, repeticionV, alturaExtra = 0) {
  const n = puntos.length
  const pos = []
  const uv = []
  const idx = []
  for (let i = 0; i <= n; i++) {
    const k = i % n
    const p = puntos[k]
    const l = lat[k]
    const a = typeof desde === 'function' ? desde(k) : desde
    const b = typeof hasta === 'function' ? hasta(k) : hasta
    pos.push(p.x + l.x * a, p.y + alturaExtra, p.z + l.z * a)
    pos.push(p.x + l.x * b, p.y + alturaExtra, p.z + l.z * b)
    const v = dist[i] / repeticionV
    uv.push(0, v, 1, v)
  }
  for (let i = 0; i < n; i++) {
    const a = i * 2
    idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3)
  }
  return armar(pos, uv, idx)
}

/**
 * Arma la geometría y, si la cinta quedó "de espaldas", invierte el bobinado.
 * Sin esto, una cinta cuyos bordes están al revés (por ejemplo la del lado
 * izquierdo, que va de -ancho a -ancho-55) apunta hacia abajo y el motor la
 * descarta por backface culling: se ve el pasto y no la pista.
 */
function armar(pos, uv, idx) {
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  g.setIndex(idx)
  g.computeVertexNormals()
  const nor = g.getAttribute('normal')
  let suma = 0
  for (let i = 0; i < nor.count; i++) suma += nor.getY(i)
  if (suma < 0) {
    for (let i = 0; i < idx.length; i += 3) {
      const t = idx[i + 1]
      idx[i + 1] = idx[i + 2]
      idx[i + 2] = t
    }
    g.setIndex(idx)
    g.computeVertexNormals()
  }
  return g
}

function construirMallas(grupo, ctx) {
  const { puntos, lat, anchos, dist, longitud, turbos, semilla } = ctx
  const n = puntos.length
  const anchoDe = (i) => anchos[i]

  // Calzada
  const matAsfalto = new THREE.MeshStandardMaterial({
    map: textura('asfalto', [1, 1]),
    roughness: 0.95,
    metalness: 0,
  })
  matAsfalto.map.repeat.set(2, 1)
  const calzada = new THREE.Mesh(
    cinta(puntos, lat, (i) => -anchoDe(i), (i) => anchoDe(i), dist, 9),
    matAsfalto,
  )
  calzada.receiveShadow = true
  grupo.add(calzada)

  // Bordillos rojos y blancos a cada lado
  const matBordillo = new THREE.MeshStandardMaterial({
    map: textura('bordillo', [1, 1]),
    roughness: 0.8,
  })
  matBordillo.map.repeat.set(1, 1)
  for (const s of [-1, 1]) {
    const b = new THREE.Mesh(
      cinta(
        puntos,
        lat,
        (i) => s * anchoDe(i),
        (i) => s * (anchoDe(i) + ANCHO_BORDILLO),
        dist,
        3.2,
        0.05,
      ),
      matBordillo,
    )
    b.receiveShadow = true
    grupo.add(b)
  }

  // Pasto: acompaña la altura de la pista, sin costuras
  const matPasto = new THREE.MeshStandardMaterial({
    map: textura('cesped', [1, 1]),
    roughness: 1,
  })
  matPasto.map.repeat.set(6, 1)
  for (const s of [-1, 1]) {
    const g = new THREE.Mesh(
      cinta(
        puntos,
        lat,
        (i) => s * (anchoDe(i) + ANCHO_BORDILLO),
        (i) => s * (anchoDe(i) + ANCHO_PASTO),
        dist,
        26,
        -0.06,
      ),
      matPasto,
    )
    g.receiveShadow = true
    grupo.add(g)
  }

  // Paneles de turbo
  const matTurbo = new THREE.MeshStandardMaterial({
    color: 0xff8a00,
    emissive: 0xff6a00,
    emissiveIntensity: 0.55,
    roughness: 0.5,
  })
  const paso = longitud / n
  for (const t of turbos) {
    const i0 = Math.floor((t.s - t.largo / 2) / paso)
    const i1 = Math.ceil((t.s + t.largo / 2) / paso)
    const sub = []
    const subLat = []
    const subDist = [0]
    for (let i = i0; i <= i1; i++) {
      const k = ((i % n) + n) % n
      sub.push(puntos[k])
      subLat.push(lat[k])
      if (sub.length > 1) subDist.push(subDist[subDist.length - 1] + paso)
    }
    subDist.push(subDist[subDist.length - 1] + paso)
    const g = cintaAbierta(sub, subLat, anchos, i0, n, subDist)
    const m = new THREE.Mesh(g, matTurbo)
    m.position.y = 0.03
    grupo.add(m)
  }

  // Línea de meta a cuadros
  const geoMeta = new THREE.PlaneGeometry(anchos[0] * 2, 3.4)
  geoMeta.rotateX(-Math.PI / 2) // horneamos la horizontal: así el yaw alcanza
  const meta = new THREE.Mesh(
    geoMeta,
    new THREE.MeshStandardMaterial({ map: textura('damero', [6, 1], { filas: 8 }), roughness: 0.9 }),
  )
  meta.position.set(puntos[0].x, puntos[0].y + 0.05, puntos[0].z)
  meta.rotation.y = Math.atan2(ctx.tang[0].x, ctx.tang[0].z)
  grupo.add(meta)

  // Vallas: cajas instanciadas a los costados, rojas y blancas alternadas
  const geoValla = new THREE.BoxGeometry(0.5, 1.1, 2.4)
  // `instanceColor` alcanza para pintar cada instancia; activar `vertexColors`
  // sin un atributo de color por vértice dejaba todas las vallas en negro.
  const matValla = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.7 })
  const cada = 3
  const total = Math.floor(n / cada) * 2
  const vallas = new THREE.InstancedMesh(geoValla, matValla, total)
  const colores = new Float32Array(total * 3)
  const dummy = new THREE.Object3D()
  const cRojo = new THREE.Color(PALETA.bordeRojo)
  const cBlanco = new THREE.Color(PALETA.bordeBlanco)
  let k = 0
  for (let i = 0; i < n; i += cada) {
    for (const s of [-1, 1]) {
      if (k >= total) break
      const p = puntos[i]
      const l = lat[i]
      const d = anchos[i] + MARGEN_MURO + 0.4
      dummy.position.set(p.x + l.x * s * d, p.y + 0.55, p.z + l.z * s * d)
      dummy.rotation.y = Math.atan2(ctx.tang[i].x, ctx.tang[i].z)
      dummy.updateMatrix()
      vallas.setMatrixAt(k, dummy.matrix)
      const c = (i / cada + (s > 0 ? 1 : 0)) % 2 === 0 ? cRojo : cBlanco
      colores[k * 3] = c.r
      colores[k * 3 + 1] = c.g
      colores[k * 3 + 2] = c.b
      k++
    }
  }
  vallas.count = k
  vallas.instanceColor = new THREE.InstancedBufferAttribute(colores, 3)
  vallas.instanceColor.needsUpdate = true
  vallas.castShadow = true
  grupo.add(vallas)

  // Árboles simples (tronco + copa cónica) repartidos por el pasto
  const r = rng(semilla)
  const cant = 150
  const troncos = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(0.28, 0.36, 2.2, 6),
    new THREE.MeshStandardMaterial({ color: 0x6b4a2a, roughness: 1, flatShading: true }),
    cant,
  )
  const copas = new THREE.InstancedMesh(
    new THREE.ConeGeometry(2.1, 4.6, 7),
    new THREE.MeshStandardMaterial({ color: PALETA.cespedOscuro, roughness: 1, flatShading: true }),
    cant,
  )
  for (let i = 0; i < cant; i++) {
    const idx = Math.floor(r() * n)
    const s = r() > 0.5 ? 1 : -1
    const d = anchos[idx] + 8 + r() * 34
    const p = puntos[idx]
    const l = lat[idx]
    const esc = 0.7 + r() * 0.9
    const x = p.x + l.x * s * d + (r() - 0.5) * 6
    const z = p.z + l.z * s * d + (r() - 0.5) * 6
    dummy.position.set(x, p.y + 1.1 * esc, z)
    dummy.scale.setScalar(esc)
    dummy.rotation.set(0, r() * Math.PI * 2, 0)
    dummy.updateMatrix()
    troncos.setMatrixAt(i, dummy.matrix)
    dummy.position.y = p.y + (2.2 + 2.3) * esc
    dummy.updateMatrix()
    copas.setMatrixAt(i, dummy.matrix)
  }
  troncos.castShadow = true
  copas.castShadow = true
  grupo.add(troncos, copas)

  // Suelo lejano, para que no se vea el vacío detrás del pasto
  const suelo = new THREE.Mesh(
    new THREE.PlaneGeometry(1800, 1800),
    new THREE.MeshStandardMaterial({ color: PALETA.cespedOscuro, roughness: 1 }),
  )
  suelo.rotation.x = -Math.PI / 2
  suelo.position.y = -3
  grupo.add(suelo)
}

/** Cinta sobre un tramo abierto de muestras (para los paneles de turbo). */
function cintaAbierta(sub, subLat, anchos, i0, n, subDist) {
  const pos = []
  const uv = []
  const idx = []
  for (let i = 0; i < sub.length; i++) {
    const k = ((i0 + i) % n + n) % n
    const p = sub[i]
    const l = subLat[i]
    const a = anchos[k] * 0.8
    pos.push(p.x - l.x * a, p.y, p.z - l.z * a)
    pos.push(p.x + l.x * a, p.y, p.z + l.z * a)
    const v = subDist[i] / 6
    uv.push(0, v, 1, v)
  }
  for (let i = 0; i < sub.length - 1; i++) {
    const a = i * 2
    idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3)
  }
  return armar(pos, uv, idx)
}

export default { META_PISTA, crearPista }
