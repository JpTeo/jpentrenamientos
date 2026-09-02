// Utilidades matemáticas compartidas por todo el juego.
// Sin dependencias de three salvo donde se indica.
import * as THREE from 'three'

export const clamp = (v, min, max) => (v < min ? min : v > max ? max : v)
export const clamp01 = (v) => clamp(v, 0, 1)
export const lerp = (a, b, t) => a + (b - a) * t
export const invLerp = (a, b, v) => (b - a === 0 ? 0 : (v - a) / (b - a))
export const mix = lerp

/** Interpolación independiente del framerate. `lambda` alto = respuesta rápida. */
export const damp = (a, b, lambda, dt) => lerp(a, b, 1 - Math.exp(-lambda * dt))

export const smoothstep = (t) => {
  const x = clamp01(t)
  return x * x * (3 - 2 * x)
}
export const smootherstep = (t) => {
  const x = clamp01(t)
  return x * x * x * (x * (x * 6 - 15) + 10)
}

export const easeOutCubic = (t) => 1 - Math.pow(1 - clamp01(t), 3)
export const easeInCubic = (t) => Math.pow(clamp01(t), 3)
export const easeOutBack = (t) => {
  const c1 = 1.70158
  const c3 = c1 + 1
  const x = clamp01(t)
  return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2)
}
export const easeOutElastic = (t) => {
  const x = clamp01(t)
  if (x === 0 || x === 1) return x
  const c4 = (2 * Math.PI) / 3
  return Math.pow(2, -10 * x) * Math.sin((x * 10 - 0.75) * c4) + 1
}

export const TAU = Math.PI * 2

/** Diferencia angular más corta en radianes, resultado en (-PI, PI]. */
export function deltaAngulo(a, b) {
  let d = (b - a) % TAU
  if (d > Math.PI) d -= TAU
  if (d < -Math.PI) d += TAU
  return d
}

/** Envuelve un valor en [0, max). Útil para el progreso 0..1 de la vuelta. */
export const wrap01 = (v) => v - Math.floor(v)

/** Generador pseudoaleatorio determinista (mulberry32). Misma semilla = mismo mundo. */
export function rng(semilla = 1) {
  let a = semilla >>> 0
  return function () {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Ruido de valor 2D suavizado, determinista. Devuelve 0..1. */
export function ruido2D(x, y, semilla = 1) {
  const xi = Math.floor(x)
  const yi = Math.floor(y)
  const xf = x - xi
  const yf = y - yi
  const h = (a, b) => {
    let n = (a * 374761393 + b * 668265263 + semilla * 144665) | 0
    n = (n ^ (n >>> 13)) * 1274126177
    return ((n ^ (n >>> 16)) >>> 0) / 4294967296
  }
  const u = smoothstep(xf)
  const v = smoothstep(yf)
  return lerp(lerp(h(xi, yi), h(xi + 1, yi), u), lerp(h(xi, yi + 1), h(xi + 1, yi + 1), u), v)
}

/** Ruido fractal (varias octavas). */
export function fbm(x, y, octavas = 4, semilla = 1) {
  let suma = 0
  let amp = 0.5
  let frec = 1
  let norm = 0
  for (let i = 0; i < octavas; i++) {
    suma += ruido2D(x * frec, y * frec, semilla + i * 37) * amp
    norm += amp
    amp *= 0.5
    frec *= 2
  }
  return suma / norm
}

/** Convierte grados a radianes. */
export const rad = (g) => (g * Math.PI) / 180
export const grados = (r) => (r * 180) / Math.PI

/** Formatea milisegundos como M:SS.mmm (formato de tiempo de vuelta). */
export function formatearTiempo(ms) {
  if (!isFinite(ms) || ms < 0) return "--:--.---"
  const total = Math.floor(ms)
  const m = Math.floor(total / 60000)
  const s = Math.floor((total % 60000) / 1000)
  const c = total % 1000
  return `${m}:${String(s).padStart(2, "0")}.${String(c).padStart(3, "0")}`
}

/** Sufijo ordinal en español: 1º, 2º, 3º, 4º */
export const puesto = (n) => `${n}º`

// --- Helpers de three reutilizables (evitan asignaciones en el bucle) ---
export const V3_TMP_A = new THREE.Vector3()
export const V3_TMP_B = new THREE.Vector3()
export const V3_TMP_C = new THREE.Vector3()
export const Q_TMP_A = new THREE.Quaternion()
export const UP = Object.freeze(new THREE.Vector3(0, 1, 0))

/** Devuelve el ángulo Y (yaw) de un quaternion. */
export function yawDe(q) {
  const e = new THREE.Euler().setFromQuaternion(q, "YXZ")
  return e.y
}

/** Distancia al cuadrado en el plano XZ. */
export function distXZ2(a, b) {
  const dx = a.x - b.x
  const dz = a.z - b.z
  return dx * dx + dz * dz
}
export const distXZ = (a, b) => Math.sqrt(distXZ2(a, b))
