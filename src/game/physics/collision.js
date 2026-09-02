// Helpers de colisión reutilizables (física de karts e ítems).
//
// Todo pasa en el plano XZ: el juego es arcade y las alturas se resuelven por
// separado con la suspensión. Ninguna función asigna memoria: todas escriben
// sobre un `out` provisto por el llamador (o sobre un temporal de módulo que se
// reutiliza, y que hay que consumir antes de la siguiente llamada).
import { KART } from '../core/constantes.js'
import { clamp, clamp01 } from '../core/utils.js'

/** Resultado reutilizable de las consultas de distancia. */
export function crearResultadoContacto() {
  return {
    golpe: false,
    /** Penetración positiva en metros (0 si no hay contacto). */
    penetracion: 0,
    /** Normal de separación en XZ (unitaria), apunta de B hacia A. */
    nx: 0,
    nz: 0,
    /** Punto de contacto aproximado. */
    px: 0,
    pz: 0,
    /** Parámetro 0..1 sobre el segmento/cápsula A y B (según la función). */
    ta: 0,
    tb: 0,
  }
}

const _tmp = crearResultadoContacto()

/**
 * Punto más cercano a (px,pz) sobre el segmento AB, en forma de parámetro 0..1.
 */
export function parametroMasCercano(ax, az, bx, bz, px, pz) {
  const ex = bx - ax
  const ez = bz - az
  const largo2 = ex * ex + ez * ez
  if (largo2 < 1e-9) return 0
  return clamp01(((px - ax) * ex + (pz - az) * ez) / largo2)
}

/**
 * Círculo (centro c, radio r) contra segmento AB.
 * @returns {ReturnType<crearResultadoContacto>} `out` con la normal apuntando
 *   del segmento hacia el círculo.
 */
export function circuloSegmento(cx, cz, r, ax, az, bx, bz, out = _tmp) {
  const t = parametroMasCercano(ax, az, bx, bz, cx, cz)
  const qx = ax + (bx - ax) * t
  const qz = az + (bz - az) * t
  let dx = cx - qx
  let dz = cz - qz
  let d = Math.sqrt(dx * dx + dz * dz)
  if (d < 1e-6) {
    // Centro exactamente sobre el segmento: empujamos perpendicular.
    dx = -(bz - az)
    dz = bx - ax
    d = Math.sqrt(dx * dx + dz * dz) || 1
  }
  const inv = 1 / d
  out.nx = dx * inv
  out.nz = dz * inv
  out.px = qx
  out.pz = qz
  out.ta = t
  out.tb = 0
  out.penetracion = r - d
  out.golpe = out.penetracion > 0
  return out
}

/**
 * Distancia mínima entre dos segmentos 2D. Devuelve los parámetros de cada uno.
 * Base de la prueba cápsula-cápsula.
 */
export function segmentoSegmento(ax, az, bx, bz, cx, cz, dx, dz, out = _tmp) {
  const ux = bx - ax
  const uz = bz - az
  const vx = dx - cx
  const vz = dz - cz
  const wx = ax - cx
  const wz = az - cz
  const a = ux * ux + uz * uz
  const b = ux * vx + uz * vz
  const c = vx * vx + vz * vz
  const d = ux * wx + uz * wz
  const e = vx * wx + vz * wz
  const den = a * c - b * b

  let s
  let t
  if (den < 1e-9) {
    // Paralelos: apoyamos en el extremo A y proyectamos.
    s = 0
    t = c > 1e-9 ? clamp01(e / c) : 0
  } else {
    s = clamp01((b * e - c * d) / den)
    t = clamp01((a * e - b * d) / den)
    // Una pasada de refinado: al recortar `s` cambia el `t` óptimo y viceversa.
    t = c > 1e-9 ? clamp01((b * s + e) / c) : 0
    s = a > 1e-9 ? clamp01((b * t - d) / a) : 0
  }

  const p1x = ax + ux * s
  const p1z = az + uz * s
  const p2x = cx + vx * t
  const p2z = cz + vz * t
  out.ta = s
  out.tb = t
  out.px = (p1x + p2x) * 0.5
  out.pz = (p1z + p2z) * 0.5
  let ndx = p1x - p2x
  let ndz = p1z - p2z
  let dist = Math.sqrt(ndx * ndx + ndz * ndz)
  if (dist < 1e-6) {
    ndx = -uz
    ndz = ux
    dist = Math.sqrt(ndx * ndx + ndz * ndz) || 1
    out.nx = ndx / dist
    out.nz = ndz / dist
    out.penetracion = 0
    out.golpe = false
    return out
  }
  out.nx = ndx / dist
  out.nz = ndz / dist
  out.penetracion = -dist // el llamador le suma los radios
  out.golpe = false
  return out
}

/**
 * Cápsula-cápsula en XZ. Cada cápsula es un segmento con radio; sirve tanto
 * para karts alargados como para muros redondeados o bananas en fila.
 * @returns `out` con `penetracion` = (r1 + r2) - distancia.
 */
export function capsulaCapsula2D(ax, az, bx, bz, r1, cx, cz, dx, dz, r2, out = _tmp) {
  segmentoSegmento(ax, az, bx, bz, cx, cz, dx, dz, out)
  out.penetracion += r1 + r2
  out.golpe = out.penetracion > 0
  return out
}

/**
 * Cápsula que representa a un kart: segmento a lo largo de su eje longitudinal.
 * Escribe en `out4` = [ax, az, bx, bz]. `frenteX/frenteZ` es el vector unitario
 * hacia adelante del kart.
 */
export function capsulaDeKart(x, z, frenteX, frenteZ, out4, largo = KART.largo) {
  const semi = Math.max(0, largo * 0.5 - KART.radioColision * 0.55)
  out4[0] = x + frenteX * semi
  out4[1] = z + frenteZ * semi
  out4[2] = x - frenteX * semi
  out4[3] = z - frenteZ * semi
  return out4
}

/**
 * Resolución de empuje entre dos karts modelados como cilindros en XZ.
 *
 * Devuelve, para el kart A, cuánto tiene que **moverse** y cuánta velocidad
 * lateral gana. El reparto es por masa: el más pesado casi no se mueve. Cada
 * kart llama a esta función para sí mismo (con A = propio, B = ajeno), así que
 * el resultado es simétrico sin que ninguno escriba en el estado del otro.
 *
 * @param {object} out se rellena con { golpe, nx, nz, penetracion, desplazo,
 *   impulso, cierre } donde `desplazo` es la distancia a mover a lo largo de la
 *   normal, `impulso` la velocidad a sumar y `cierre` la velocidad de
 *   aproximación (para decidir si hubo "bump").
 */
export function resolverEmpujeKarts(
  ax,
  az,
  avx,
  avz,
  amasa,
  bx,
  bz,
  bvx,
  bvz,
  bmasa,
  radio = KART.radioColision,
  out = crearResultadoContacto(),
) {
  let dx = ax - bx
  let dz = az - bz
  let d2 = dx * dx + dz * dz
  const suma = radio * 2
  out.golpe = false
  out.penetracion = 0
  out.desplazo = 0
  out.impulso = 0
  out.cierre = 0
  if (d2 >= suma * suma) return out
  let d = Math.sqrt(d2)
  if (d < 1e-5) {
    // Superpuestos exactamente: separamos en una dirección estable.
    dx = 1
    dz = 0
    d = 1e-5
  }
  const inv = 1 / d
  out.nx = dx * inv
  out.nz = dz * inv
  out.px = (ax + bx) * 0.5
  out.pz = (az + bz) * 0.5
  out.penetracion = suma - d
  out.golpe = true

  // Reparto por masa: el liviano se lleva la mayor parte del desplazamiento.
  const total = amasa + bmasa
  const parte = total > 0 ? bmasa / total : 0.5
  out.desplazo = out.penetracion * parte

  // Velocidad de aproximación a lo largo de la normal (positiva = se acercan).
  out.cierre = (bvx - avx) * out.nx + (bvz - avz) * out.nz
  const acercandose = Math.max(0, out.cierre)
  // Impulso elástico suave + un empujón mínimo para que nunca queden pegados.
  out.impulso = (acercandose * 0.75 + 1.6) * parte
  return out
}

const _seg = crearResultadoContacto()

/**
 * Barrido de un proyectil esférico contra un kart (cilindro en XZ + altura).
 * Lo usa el sistema de ítems para caparazones y bombas: mueve la esfera de
 * `origen` a `origen + delta` y detecta el primer contacto.
 *
 * @param {number} ox,oz posición previa del proyectil
 * @param {number} dx,dz desplazamiento de este cuadro
 * @param {number} oy,dy ídem en altura (para no pegarle a un kart que saltó)
 * @param {number} radio radio del proyectil
 * @param {object} kart EstadoKart (usa `posicion`)
 * @param {number} radioKart radio del cilindro del kart
 * @param {number} altoKart altura útil del cilindro
 * @param {object} out { golpe, t, px, pz, nx, nz } — `t` es 0..1 sobre el barrido
 */
export function interseccionEsferaKart(
  ox,
  oy,
  oz,
  dx,
  dy,
  dz,
  radio,
  kart,
  radioKart = KART.radioColision,
  altoKart = KART.alto + 0.9,
  out = crearResultadoContacto(),
) {
  out.golpe = false
  out.t = 1
  const kx = kart.posicion.x
  const ky = kart.posicion.y
  const kz = kart.posicion.z
  const r = radio + radioKart

  // Barrido 2D: |(o + t·d) - k|² = r²  →  cuadrática en t.
  const fx = ox - kx
  const fz = oz - kz
  const a = dx * dx + dz * dz
  const b = 2 * (fx * dx + fz * dz)
  const c = fx * fx + fz * fz - r * r

  let t = 0
  if (c <= 0) {
    t = 0 // ya empezaba dentro
  } else if (a < 1e-9) {
    return out // quieto y fuera
  } else {
    const disc = b * b - 4 * a * c
    if (disc < 0) return out
    const raiz = Math.sqrt(disc)
    t = (-b - raiz) / (2 * a)
    if (t < 0 || t > 1) {
      const t2 = (-b + raiz) / (2 * a)
      if (t2 < 0 || t2 > 1) return out
      t = clamp01(t2)
    }
  }

  // Comprobación de altura en el instante del contacto.
  const y = oy + dy * t
  if (y < ky - radio - 0.15 || y > ky + altoKart + radio) return out

  out.golpe = true
  out.t = clamp01(t)
  out.px = ox + dx * out.t
  out.pz = oz + dz * out.t
  let nx = out.px - kx
  let nz = out.pz - kz
  const largo = Math.sqrt(nx * nx + nz * nz) || 1
  out.nx = nx / largo
  out.nz = nz / largo
  out.penetracion = Math.max(0, r - largo)
  return out
}

/**
 * Rebote arcade contra una superficie: devuelve la velocidad reflejada con
 * pérdida proporcional a lo frontal que fue el impacto. Escribe en `out2`
 * = [vx, vz] y devuelve la "frontalidad" 0..1 (0 = rasante, 1 = de frente).
 */
export function rebotar(vx, vz, nx, nz, out2, restitucion = 0.35, perdidaMax = 0.55) {
  const vn = vx * nx + vz * nz
  if (vn >= 0) {
    out2[0] = vx
    out2[1] = vz
    return 0
  }
  const rapidez = Math.sqrt(vx * vx + vz * vz)
  const frontalidad = rapidez > 1e-4 ? clamp01(-vn / rapidez) : 0
  let rx = vx - (1 + restitucion) * vn * nx
  let rz = vz - (1 + restitucion) * vn * nz
  // Un roce apenas frena; un impacto de frente sí, pero nunca a cero.
  const factor = 1 - perdidaMax * frontalidad * frontalidad
  out2[0] = rx * factor
  out2[1] = rz * factor
  return frontalidad
}

/** Comprueba si un punto cae dentro de un cilindro XZ (uso general de ítems). */
export function dentroDeCilindro(px, pz, cx, cz, radio) {
  const dx = px - cx
  const dz = pz - cz
  return dx * dx + dz * dz <= radio * radio
}

/** Distancia XZ entre dos objetos con `.posicion`. */
export function distanciaKarts(a, b) {
  const dx = a.posicion.x - b.posicion.x
  const dz = a.posicion.z - b.posicion.z
  return Math.sqrt(dx * dx + dz * dz)
}

/** Ángulo con signo entre dos direcciones XZ unitarias, en (-PI, PI]. */
export function anguloEntre(ax, az, bx, bz) {
  return Math.atan2(ax * bz - az * bx, ax * bx + az * bz)
}

export { clamp, clamp01 }

export default {
  capsulaCapsula2D,
  capsulaDeKart,
  circuloSegmento,
  segmentoSegmento,
  resolverEmpujeKarts,
  interseccionEsferaKart,
  rebotar,
  crearResultadoContacto,
}
