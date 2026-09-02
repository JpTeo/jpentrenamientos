// Generador de texturas procedurales. Todo se dibuja con Canvas 2D en tiempo de
// carga: cero assets externos, cero peticiones de red, y resultado determinista.
// Cada función está cacheada por clave para no regenerar el mismo canvas.
import * as THREE from 'three'
import { PALETA } from './paleta.js'
import { clamp01, fbm, lerp, rng, ruido2D, TAU } from '../core/utils.js'

const cache = new Map()

function hex(c) {
  return `#${c.toString(16).padStart(6, '0')}`
}

/** Mezcla dos colores hex y devuelve un string css. */
function mezcla(a, b, t) {
  const ar = (a >> 16) & 255
  const ag = (a >> 8) & 255
  const ab = a & 255
  const br = (b >> 16) & 255
  const bg = (b >> 8) & 255
  const bb = b & 255
  return `rgb(${Math.round(lerp(ar, br, t))},${Math.round(lerp(ag, bg, t))},${Math.round(lerp(ab, bb, t))})`
}

export function crearCanvas(w, h) {
  if (typeof document !== 'undefined') {
    const c = document.createElement('canvas')
    c.width = w
    c.height = h
    return c
  }
  // Entornos sin DOM (tests en node): OffscreenCanvas si existe.
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h)
  return null
}

/** Envuelve un canvas en una CanvasTexture con los ajustes habituales. */
function comoTextura(canvas, { repeat = [1, 1], srgb = true, aniso = 8 } = {}) {
  const t = new THREE.CanvasTexture(canvas)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.repeat.set(repeat[0], repeat[1])
  t.anisotropy = aniso
  if (srgb) t.colorSpace = THREE.SRGBColorSpace
  t.needsUpdate = true
  return t
}

function memo(clave, fn) {
  if (cache.has(clave)) return cache.get(clave)
  const v = fn()
  cache.set(clave, v)
  return v
}

/** Limpia la caché (útil al desmontar el juego). */
export function limpiarTexturas() {
  for (const v of cache.values()) if (v && v.dispose) v.dispose()
  cache.clear()
}

// ---------------------------------------------------------------------------
// Ruido base
// ---------------------------------------------------------------------------

function pintarGrano(ctx, w, h, intensidad = 12, semilla = 7) {
  const img = ctx.getImageData(0, 0, w, h)
  const d = img.data
  const r = rng(semilla)
  for (let i = 0; i < d.length; i += 4) {
    const n = (r() - 0.5) * intensidad * 2
    d[i] = clamp01((d[i] + n) / 255) * 255
    d[i + 1] = clamp01((d[i + 1] + n) / 255) * 255
    d[i + 2] = clamp01((d[i + 2] + n) / 255) * 255
  }
  ctx.putImageData(img, 0, 0)
}

/** Manchas suaves de fbm sobre el canvas, en modo multiply. */
function pintarManchas(ctx, w, h, escala, color, alpha, semilla) {
  const img = ctx.createImageData(w, h)
  const d = img.data
  const cr = (color >> 16) & 255
  const cg = (color >> 8) & 255
  const cb = color & 255
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const n = fbm((x / w) * escala, (y / h) * escala, 4, semilla)
      const i = (y * w + x) * 4
      d[i] = cr
      d[i + 1] = cg
      d[i + 2] = cb
      d[i + 3] = Math.round(clamp01(n) * alpha * 255)
    }
  }
  const tmp = crearCanvas(w, h)
  tmp.getContext('2d').putImageData(img, 0, 0)
  ctx.drawImage(tmp, 0, 0)
}

// ---------------------------------------------------------------------------
// Superficies
// ---------------------------------------------------------------------------

export function texturaAsfalto(tono = PALETA.asfalto) {
  return memo(`asfalto:${tono}`, () => {
    const S = 512
    const c = crearCanvas(S, S)
    const ctx = c.getContext('2d')
    ctx.fillStyle = hex(tono)
    ctx.fillRect(0, 0, S, S)
    // Grava: miles de puntitos de tamaño y tono variable.
    const r = rng(1337)
    for (let i = 0; i < 9000; i++) {
      const x = r() * S
      const y = r() * S
      const rad = 0.5 + r() * 2.1
      const t = r()
      ctx.fillStyle = mezcla(tono, t > 0.55 ? PALETA.asfaltoClaro : PALETA.asfaltoOscuro, 0.25 + r() * 0.5)
      ctx.globalAlpha = 0.25 + r() * 0.45
      ctx.beginPath()
      ctx.arc(x, y, rad, 0, TAU)
      ctx.fill()
    }
    ctx.globalAlpha = 1
    pintarManchas(ctx, S, S, 3.5, PALETA.asfaltoOscuro, 0.22, 21)
    pintarManchas(ctx, S, S, 9, PALETA.asfaltoClaro, 0.1, 55)
    pintarGrano(ctx, S, S, 9, 3)
    return c
  })
}

export function texturaCesped(base = PALETA.cesped, oscuro = PALETA.cespedOscuro, claro = PALETA.cespedClaro) {
  return memo(`cesped:${base}:${oscuro}:${claro}`, () => {
    const S = 512
    const c = crearCanvas(S, S)
    const ctx = c.getContext('2d')
    ctx.fillStyle = hex(base)
    ctx.fillRect(0, 0, S, S)
    pintarManchas(ctx, S, S, 4, oscuro, 0.35, 11)
    pintarManchas(ctx, S, S, 11, claro, 0.22, 42)
    // Briznas: trazos cortos con inclinación aleatoria.
    const r = rng(9001)
    ctx.lineCap = 'round'
    for (let i = 0; i < 4200; i++) {
      const x = r() * S
      const y = r() * S
      const len = 3 + r() * 7
      const ang = -Math.PI / 2 + (r() - 0.5) * 1.1
      ctx.strokeStyle = mezcla(oscuro, claro, r())
      ctx.globalAlpha = 0.35 + r() * 0.5
      ctx.lineWidth = 0.8 + r() * 1.3
      ctx.beginPath()
      ctx.moveTo(x, y)
      ctx.lineTo(x + Math.cos(ang) * len, y + Math.sin(ang) * len)
      ctx.stroke()
    }
    ctx.globalAlpha = 1
    pintarGrano(ctx, S, S, 7, 5)
    return c
  })
}

export function texturaTierra() {
  return memo('tierra', () => {
    const S = 512
    const c = crearCanvas(S, S)
    const ctx = c.getContext('2d')
    ctx.fillStyle = hex(PALETA.tierra)
    ctx.fillRect(0, 0, S, S)
    pintarManchas(ctx, S, S, 5, PALETA.tierraOscura, 0.45, 77)
    pintarManchas(ctx, S, S, 13, 0xd9a468, 0.25, 13)
    const r = rng(4242)
    for (let i = 0; i < 2600; i++) {
      const x = r() * S
      const y = r() * S
      ctx.fillStyle = mezcla(PALETA.tierraOscura, PALETA.roca, r())
      ctx.globalAlpha = 0.2 + r() * 0.5
      ctx.beginPath()
      ctx.ellipse(x, y, 1 + r() * 3, 1 + r() * 2, r() * TAU, 0, TAU)
      ctx.fill()
    }
    ctx.globalAlpha = 1
    pintarGrano(ctx, S, S, 10, 8)
    return c
  })
}

export function texturaArena() {
  return memo('arena', () => {
    const S = 512
    const c = crearCanvas(S, S)
    const ctx = c.getContext('2d')
    ctx.fillStyle = hex(PALETA.arena)
    ctx.fillRect(0, 0, S, S)
    pintarManchas(ctx, S, S, 6, 0xcfb173, 0.3, 91)
    // Ondulaciones de duna.
    const r = rng(555)
    ctx.globalAlpha = 0.18
    for (let i = 0; i < 60; i++) {
      ctx.strokeStyle = i % 2 ? '#fff2c8' : '#c9a866'
      ctx.lineWidth = 2 + r() * 4
      ctx.beginPath()
      for (let x = 0; x <= S; x += 8) {
        const y = i * 9 + Math.sin(x * 0.02 + i) * 6 + ruido2D(x * 0.02, i, 3) * 8
        x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
      }
      ctx.stroke()
    }
    ctx.globalAlpha = 1
    pintarGrano(ctx, S, S, 8, 2)
    return c
  })
}

export function texturaRocaVolcanica() {
  return memo('rocaVolcanica', () => {
    const S = 512
    const c = crearCanvas(S, S)
    const ctx = c.getContext('2d')
    ctx.fillStyle = hex(PALETA.rocaVolcan)
    ctx.fillRect(0, 0, S, S)
    pintarManchas(ctx, S, S, 4, 0x140a0c, 0.55, 31)
    pintarManchas(ctx, S, S, 10, 0x5a4046, 0.25, 61)
    // Vetas incandescentes.
    const r = rng(808)
    for (let i = 0; i < 26; i++) {
      let x = r() * S
      let y = r() * S
      ctx.strokeStyle = mezcla(PALETA.lava, PALETA.lavaBrillo, r())
      ctx.globalAlpha = 0.12 + r() * 0.25
      ctx.lineWidth = 0.8 + r() * 2.2
      ctx.beginPath()
      ctx.moveTo(x, y)
      for (let j = 0; j < 22; j++) {
        x += (r() - 0.5) * 30
        y += (r() - 0.5) * 30
        ctx.lineTo(x, y)
      }
      ctx.stroke()
    }
    ctx.globalAlpha = 1
    pintarGrano(ctx, S, S, 12, 6)
    return c
  })
}

export function texturaLava() {
  return memo('lava', () => {
    const S = 512
    const c = crearCanvas(S, S)
    const ctx = c.getContext('2d')
    const img = ctx.createImageData(S, S)
    const d = img.data
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const n = fbm((x / S) * 6, (y / S) * 6, 5, 17)
        const n2 = fbm((x / S) * 14 + 3, (y / S) * 14, 3, 44)
        const calor = clamp01(n * 0.75 + n2 * 0.45)
        const i = (y * S + x) * 4
        // Rampa negro -> rojo -> naranja -> amarillo
        let r, g, b
        if (calor < 0.42) {
          const t = calor / 0.42
          r = lerp(24, 190, t)
          g = lerp(8, 32, t)
          b = lerp(10, 14, t)
        } else if (calor < 0.72) {
          const t = (calor - 0.42) / 0.3
          r = lerp(190, 255, t)
          g = lerp(32, 138, t)
          b = lerp(14, 26, t)
        } else {
          const t = (calor - 0.72) / 0.28
          r = 255
          g = lerp(138, 232, t)
          b = lerp(26, 150, t)
        }
        d[i] = r
        d[i + 1] = g
        d[i + 2] = b
        d[i + 3] = 255
      }
    }
    ctx.putImageData(img, 0, 0)
    return c
  })
}

export function texturaAgua() {
  return memo('agua', () => {
    const S = 512
    const c = crearCanvas(S, S)
    const ctx = c.getContext('2d')
    ctx.fillStyle = hex(PALETA.agua)
    ctx.fillRect(0, 0, S, S)
    pintarManchas(ctx, S, S, 5, 0x0f6fa8, 0.4, 71)
    pintarManchas(ctx, S, S, 12, 0x9fe4ff, 0.25, 23)
    const r = rng(313)
    ctx.globalAlpha = 0.3
    ctx.strokeStyle = '#ffffff'
    for (let i = 0; i < 90; i++) {
      ctx.lineWidth = 0.8 + r() * 1.6
      ctx.beginPath()
      const y0 = r() * S
      for (let x = 0; x <= S; x += 10) {
        const y = y0 + Math.sin(x * 0.05 + i) * 3
        x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
      }
      ctx.stroke()
    }
    ctx.globalAlpha = 1
    return c
  })
}

// ---------------------------------------------------------------------------
// Marcas sobre la pista
// ---------------------------------------------------------------------------

/** Damero de meta. `filas` controla la cantidad de cuadros a lo ancho. */
export function texturaDamero(filas = 8, colorA = 0xffffff, colorB = 0x1b1b22) {
  return memo(`damero:${filas}:${colorA}:${colorB}`, () => {
    const S = 512
    const c = crearCanvas(S, S)
    const ctx = c.getContext('2d')
    const p = S / filas
    for (let y = 0; y < filas; y++) {
      for (let x = 0; x < filas; x++) {
        ctx.fillStyle = (x + y) % 2 ? hex(colorB) : hex(colorA)
        ctx.fillRect(x * p, y * p, p, p)
      }
    }
    pintarGrano(ctx, S, S, 6, 12)
    return c
  })
}

/** Bordillo a rayas rojas y blancas (rumble strip). */
export function texturaBordillo(rayas = 8) {
  return memo(`bordillo:${rayas}`, () => {
    const S = 256
    const c = crearCanvas(S, S)
    const ctx = c.getContext('2d')
    const p = S / rayas
    for (let i = 0; i < rayas; i++) {
      ctx.fillStyle = i % 2 ? hex(PALETA.bordeRojo) : hex(PALETA.bordeBlanco)
      ctx.fillRect(0, i * p, S, p)
    }
    // Desgaste
    pintarManchas(ctx, S, S, 8, 0x000000, 0.12, 33)
    pintarGrano(ctx, S, S, 8, 4)
    return c
  })
}

/** Panel de flechas de turbo (naranja sobre transparente). */
export function texturaFlechasTurbo() {
  return memo('flechasTurbo', () => {
    const S = 256
    const c = crearCanvas(S, S)
    const ctx = c.getContext('2d')
    ctx.clearRect(0, 0, S, S)
    for (let i = 0; i < 3; i++) {
      const y = 20 + i * 80
      const g = ctx.createLinearGradient(0, y, 0, y + 62)
      g.addColorStop(0, 'rgba(255,214,90,1)')
      g.addColorStop(1, 'rgba(255,90,10,1)')
      ctx.fillStyle = g
      ctx.beginPath()
      ctx.moveTo(S * 0.5, y)
      ctx.lineTo(S * 0.94, y + 62)
      ctx.lineTo(S * 0.68, y + 62)
      ctx.lineTo(S * 0.5, y + 30)
      ctx.lineTo(S * 0.32, y + 62)
      ctx.lineTo(S * 0.06, y + 62)
      ctx.closePath()
      ctx.fill()
    }
    return c
  })
}

/** Textura de la caja de ítem: signo de interrogación sobre fondo brillante. */
export function texturaCajaItem() {
  return memo('cajaItem', () => {
    const S = 256
    const c = crearCanvas(S, S)
    const ctx = c.getContext('2d')
    const g = ctx.createLinearGradient(0, 0, S, S)
    g.addColorStop(0, '#a5f3fc')
    g.addColorStop(0.5, '#22d3ee')
    g.addColorStop(1, '#0ea5b7')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, S, S)
    ctx.strokeStyle = 'rgba(255,255,255,0.85)'
    ctx.lineWidth = 10
    ctx.strokeRect(14, 14, S - 28, S - 28)
    ctx.fillStyle = '#ffffff'
    ctx.font = 'bold 168px system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.shadowColor = 'rgba(0,60,80,0.5)'
    ctx.shadowBlur = 12
    ctx.shadowOffsetY = 6
    ctx.fillText('?', S / 2, S / 2 + 6)
    return c
  })
}

// ---------------------------------------------------------------------------
// Decorado
// ---------------------------------------------------------------------------

export function texturaLadrillo(color = 0xc0563c, junta = 0xe8dfc8) {
  return memo(`ladrillo:${color}:${junta}`, () => {
    const S = 256
    const c = crearCanvas(S, S)
    const ctx = c.getContext('2d')
    ctx.fillStyle = hex(junta)
    ctx.fillRect(0, 0, S, S)
    const filas = 8
    const h = S / filas
    const r = rng(700)
    for (let f = 0; f < filas; f++) {
      const off = (f % 2) * (S / 8)
      for (let i = -1; i < 4; i++) {
        const x = off + i * (S / 4)
        ctx.fillStyle = mezcla(color, 0x000000, r() * 0.18)
        ctx.fillRect(x + 3, f * h + 3, S / 4 - 6, h - 6)
      }
    }
    pintarGrano(ctx, S, S, 8, 15)
    return c
  })
}

export function texturaMadera(color = 0xb5793f) {
  return memo(`madera:${color}`, () => {
    const S = 256
    const c = crearCanvas(S, S)
    const ctx = c.getContext('2d')
    ctx.fillStyle = hex(color)
    ctx.fillRect(0, 0, S, S)
    const r = rng(202)
    for (let i = 0; i < 90; i++) {
      ctx.strokeStyle = mezcla(color, 0x3a2410, 0.2 + r() * 0.5)
      ctx.globalAlpha = 0.15 + r() * 0.3
      ctx.lineWidth = 0.6 + r() * 2
      ctx.beginPath()
      const x0 = r() * S
      for (let y = 0; y <= S; y += 12) {
        const x = x0 + Math.sin(y * 0.03 + i) * 4 + ruido2D(i, y * 0.05, 9) * 6
        y === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
      }
      ctx.stroke()
    }
    ctx.globalAlpha = 1
    pintarGrano(ctx, S, S, 7, 19)
    return c
  })
}

export function texturaCorteza() {
  return memo('corteza', () => texturaMadera(0x6b4a2a))
}

/** Sprite sheet de público: filas de cabezas de colores animables por offset. */
export function texturaPublico(semilla = 5) {
  return memo(`publico:${semilla}`, () => {
    const W = 512
    const H = 128
    const c = crearCanvas(W, H)
    const ctx = c.getContext('2d')
    ctx.clearRect(0, 0, W, H)
    const r = rng(semilla)
    const pieles = ['#f3c9a0', '#e0a878', '#a8703f', '#6b4423', '#ffd9b5']
    const ropas = ['#ff3b30', '#ffcc00', '#2fb8ff', '#3dcf6a', '#ff6fae', '#ffffff', '#7b2ff7']
    for (let i = 0; i < 130; i++) {
      const x = r() * W
      const y = 26 + r() * (H - 50)
      const s = 10 + r() * 9
      // Cuerpo
      ctx.fillStyle = ropas[(r() * ropas.length) | 0]
      ctx.beginPath()
      ctx.roundRect(x - s * 0.55, y, s * 1.1, s * 1.5, s * 0.35)
      ctx.fill()
      // Cabeza
      ctx.fillStyle = pieles[(r() * pieles.length) | 0]
      ctx.beginPath()
      ctx.arc(x, y - s * 0.35, s * 0.5, 0, TAU)
      ctx.fill()
      // Pelo
      ctx.fillStyle = ['#2b1b12', '#4a2c17', '#111', '#8a5a2c'][(r() * 4) | 0]
      ctx.beginPath()
      ctx.arc(x, y - s * 0.5, s * 0.48, Math.PI, TAU)
      ctx.fill()
    }
    return c
  })
}

/** Cartel publicitario de la cooperativa con texto. */
export function texturaCartel(texto = 'COOPERATIVA', fondo = 0xe8402a, tinta = 0xffffff) {
  return memo(`cartel:${texto}:${fondo}:${tinta}`, () => {
    const W = 512
    const H = 128
    const c = crearCanvas(W, H)
    const ctx = c.getContext('2d')
    const g = ctx.createLinearGradient(0, 0, 0, H)
    g.addColorStop(0, mezcla(fondo, 0xffffff, 0.25))
    g.addColorStop(1, mezcla(fondo, 0x000000, 0.2))
    ctx.fillStyle = g
    ctx.fillRect(0, 0, W, H)
    ctx.strokeStyle = 'rgba(255,255,255,0.9)'
    ctx.lineWidth = 8
    ctx.strokeRect(8, 8, W - 16, H - 16)
    ctx.fillStyle = hex(tinta)
    ctx.font = 'bold 62px system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.shadowColor = 'rgba(0,0,0,0.35)'
    ctx.shadowBlur = 8
    ctx.shadowOffsetY = 4
    ctx.fillText(texto, W / 2, H / 2 + 4)
    return c
  })
}

/** Cielo en degradado vertical para el domo. */
export function texturaCieloDegradado(cenit, medio, horizonte) {
  return memo(`cielo:${cenit}:${medio}:${horizonte}`, () => {
    const W = 32
    const H = 512
    const c = crearCanvas(W, H)
    const ctx = c.getContext('2d')
    const g = ctx.createLinearGradient(0, 0, 0, H)
    g.addColorStop(0, hex(cenit))
    g.addColorStop(0.55, hex(medio))
    g.addColorStop(1, hex(horizonte))
    ctx.fillStyle = g
    ctx.fillRect(0, 0, W, H)
    return c
  })
}

/** Nubes cartoon con alfa, para planos billboard en el cielo. */
export function texturaNube(semilla = 3) {
  return memo(`nube:${semilla}`, () => {
    const W = 256
    const H = 128
    const c = crearCanvas(W, H)
    const ctx = c.getContext('2d')
    ctx.clearRect(0, 0, W, H)
    const r = rng(semilla)
    ctx.fillStyle = '#ffffff'
    const bolas = 9 + ((r() * 5) | 0)
    for (let i = 0; i < bolas; i++) {
      const t = i / (bolas - 1)
      const x = 34 + t * (W - 68) + (r() - 0.5) * 18
      const y = H * 0.62 - Math.sin(t * Math.PI) * (18 + r() * 16)
      const rad = 20 + Math.sin(t * Math.PI) * 26 + r() * 8
      ctx.beginPath()
      ctx.arc(x, y, rad, 0, TAU)
      ctx.fill()
    }
    ctx.fillRect(30, H * 0.6, W - 60, H * 0.28)
    // Sombra inferior suave
    ctx.globalCompositeOperation = 'source-atop'
    const g = ctx.createLinearGradient(0, 0, 0, H)
    g.addColorStop(0, 'rgba(255,255,255,0)')
    g.addColorStop(1, 'rgba(180,215,240,0.75)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, W, H)
    ctx.globalCompositeOperation = 'source-over'
    return c
  })
}

/** Sombra circular suave con alfa (blob shadow bajo los karts). */
export function texturaSombra() {
  return memo('sombra', () => {
    const S = 128
    const c = crearCanvas(S, S)
    const ctx = c.getContext('2d')
    const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2)
    g.addColorStop(0, 'rgba(0,0,0,0.55)')
    g.addColorStop(0.55, 'rgba(0,0,0,0.32)')
    g.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, S, S)
    return c
  })
}

/** Destello radial para chispas, humo y partículas. Blanco con alfa. */
export function texturaDestello(dureza = 0.25) {
  return memo(`destello:${dureza}`, () => {
    const S = 128
    const c = crearCanvas(S, S)
    const ctx = c.getContext('2d')
    const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2)
    g.addColorStop(0, 'rgba(255,255,255,1)')
    g.addColorStop(dureza, 'rgba(255,255,255,0.9)')
    g.addColorStop(0.6, 'rgba(255,255,255,0.25)')
    g.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, S, S)
    return c
  })
}

/** Puff de humo cartoon (círculos irregulares) con alfa. */
export function texturaHumo(semilla = 4) {
  return memo(`humo:${semilla}`, () => {
    const S = 128
    const c = crearCanvas(S, S)
    const ctx = c.getContext('2d')
    ctx.clearRect(0, 0, S, S)
    const r = rng(semilla)
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * TAU
      const d = 22 + r() * 12
      const x = S / 2 + Math.cos(a) * d
      const y = S / 2 + Math.sin(a) * d
      const rad = 20 + r() * 16
      const g = ctx.createRadialGradient(x, y, 0, x, y, rad)
      g.addColorStop(0, 'rgba(255,255,255,0.95)')
      g.addColorStop(1, 'rgba(255,255,255,0)')
      ctx.fillStyle = g
      ctx.beginPath()
      ctx.arc(x, y, rad, 0, TAU)
      ctx.fill()
    }
    const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, 34)
    g.addColorStop(0, 'rgba(255,255,255,1)')
    g.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.arc(S / 2, S / 2, 34, 0, TAU)
    ctx.fill()
    return c
  })
}

/** Anillo de onda expansiva. */
export function texturaAnillo() {
  return memo('anillo', () => {
    const S = 256
    const c = crearCanvas(S, S)
    const ctx = c.getContext('2d')
    const g = ctx.createRadialGradient(S / 2, S / 2, S * 0.28, S / 2, S / 2, S * 0.5)
    g.addColorStop(0, 'rgba(255,255,255,0)')
    g.addColorStop(0.55, 'rgba(255,255,255,0.9)')
    g.addColorStop(0.75, 'rgba(255,255,255,0.5)')
    g.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, S, S)
    return c
  })
}

/** Estrella de 4 puntas (destello anisotrópico) con alfa. */
export function texturaEstrellaDestello() {
  return memo('estrellaDestello', () => {
    const S = 256
    const c = crearCanvas(S, S)
    const ctx = c.getContext('2d')
    ctx.clearRect(0, 0, S, S)
    ctx.translate(S / 2, S / 2)
    for (let k = 0; k < 2; k++) {
      ctx.save()
      ctx.rotate((k * Math.PI) / 4)
      for (let i = 0; i < 4; i++) {
        ctx.rotate(Math.PI / 2)
        const g = ctx.createLinearGradient(0, 0, 0, -S / 2)
        g.addColorStop(0, 'rgba(255,255,255,0.95)')
        g.addColorStop(1, 'rgba(255,255,255,0)')
        ctx.fillStyle = g
        ctx.beginPath()
        ctx.moveTo(-S * (k ? 0.02 : 0.045), 0)
        ctx.lineTo(0, -S * (k ? 0.34 : 0.5))
        ctx.lineTo(S * (k ? 0.02 : 0.045), 0)
        ctx.closePath()
        ctx.fill()
      }
      ctx.restore()
    }
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, S * 0.14)
    g.addColorStop(0, 'rgba(255,255,255,1)')
    g.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.arc(0, 0, S * 0.14, 0, TAU)
    ctx.fill()
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    return c
  })
}

// ---------------------------------------------------------------------------
// Mapas de normales derivados de una altura
// ---------------------------------------------------------------------------

/**
 * Deriva un normal map del brillo de un canvas. `fuerza` controla el relieve.
 * Devuelve un canvas nuevo listo para usarse como normalMap (espacio tangente).
 */
export function normalDesdeCanvas(canvas, fuerza = 2.2) {
  const w = canvas.width
  const h = canvas.height
  const src = canvas.getContext('2d').getImageData(0, 0, w, h).data
  const out = crearCanvas(w, h)
  const octx = out.getContext('2d')
  const img = octx.createImageData(w, h)
  const d = img.data
  const alt = (x, y) => {
    const xi = (x + w) % w
    const yi = (y + h) % h
    const i = (yi * w + xi) * 4
    return (src[i] * 0.299 + src[i + 1] * 0.587 + src[i + 2] * 0.114) / 255
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = (alt(x - 1, y) - alt(x + 1, y)) * fuerza
      const dy = (alt(x, y - 1) - alt(x, y + 1)) * fuerza
      const len = Math.sqrt(dx * dx + dy * dy + 1)
      const i = (y * w + x) * 4
      d[i] = ((dx / len) * 0.5 + 0.5) * 255
      d[i + 1] = ((dy / len) * 0.5 + 0.5) * 255
      d[i + 2] = (1 / len) * 0.5 * 255 + 127.5
      d[i + 3] = 255
    }
  }
  octx.putImageData(img, 0, 0)
  return out
}

/** Mapa de rugosidad a partir del brillo invertido de un canvas. */
export function rugosidadDesdeCanvas(canvas, min = 0.4, max = 1) {
  const w = canvas.width
  const h = canvas.height
  const src = canvas.getContext('2d').getImageData(0, 0, w, h).data
  const out = crearCanvas(w, h)
  const octx = out.getContext('2d')
  const img = octx.createImageData(w, h)
  const d = img.data
  for (let i = 0; i < d.length; i += 4) {
    const l = (src[i] * 0.299 + src[i + 1] * 0.587 + src[i + 2] * 0.114) / 255
    const v = lerp(max, min, l) * 255
    d[i] = d[i + 1] = d[i + 2] = v
    d[i + 3] = 255
  }
  octx.putImageData(img, 0, 0)
  return out
}

// ---------------------------------------------------------------------------
// API pública: texturas de three ya configuradas
// ---------------------------------------------------------------------------

/**
 * Devuelve un juego {map, normalMap, roughnessMap} cacheado para una superficie.
 * `repeat` se aplica a los tres mapas.
 */
export function materialMaps(nombre, repeat = [1, 1], opciones = {}) {
  const clave = `maps:${nombre}:${repeat[0]}x${repeat[1]}:${JSON.stringify(opciones)}`
  return memo(clave, () => {
    const base = canvasPorNombre(nombre, opciones)
    const map = comoTextura(base, { repeat })
    const res = { map }
    if (opciones.normal !== false) {
      res.normalMap = comoTextura(normalDesdeCanvas(base, opciones.fuerzaNormal ?? 2.2), {
        repeat,
        srgb: false,
      })
    }
    if (opciones.rugosidad !== false) {
      res.roughnessMap = comoTextura(
        rugosidadDesdeCanvas(base, opciones.rugMin ?? 0.45, opciones.rugMax ?? 1),
        { repeat, srgb: false },
      )
    }
    return res
  })
}

function canvasPorNombre(nombre, o = {}) {
  switch (nombre) {
    case 'asfalto':
      return texturaAsfalto(o.tono)
    case 'cesped':
      return texturaCesped(o.base, o.oscuro, o.claro)
    case 'tierra':
      return texturaTierra()
    case 'arena':
      return texturaArena()
    case 'rocaVolcanica':
      return texturaRocaVolcanica()
    case 'lava':
      return texturaLava()
    case 'agua':
      return texturaAgua()
    case 'damero':
      return texturaDamero(o.filas, o.colorA, o.colorB)
    case 'bordillo':
      return texturaBordillo(o.rayas)
    case 'ladrillo':
      return texturaLadrillo(o.color, o.junta)
    case 'madera':
      return texturaMadera(o.color)
    case 'corteza':
      return texturaCorteza()
    default:
      throw new Error(`Textura desconocida: ${nombre}`)
  }
}

/** Textura simple (solo color) por nombre. */
export function textura(nombre, repeat = [1, 1], opciones = {}) {
  const clave = `tex:${nombre}:${repeat[0]}x${repeat[1]}:${JSON.stringify(opciones)}`
  return memo(clave, () => comoTextura(canvasPorNombre(nombre, opciones), { repeat }))
}

/** Texturas con alfa (partículas, sprites). No llevan normal ni rugosidad. */
export function sprite(nombre, opciones = {}) {
  const clave = `sprite:${nombre}:${JSON.stringify(opciones)}`
  return memo(clave, () => {
    let c
    switch (nombre) {
      case 'sombra':
        c = texturaSombra()
        break
      case 'destello':
        c = texturaDestello(opciones.dureza)
        break
      case 'humo':
        c = texturaHumo(opciones.semilla)
        break
      case 'anillo':
        c = texturaAnillo()
        break
      case 'estrella':
        c = texturaEstrellaDestello()
        break
      case 'nube':
        c = texturaNube(opciones.semilla)
        break
      case 'publico':
        c = texturaPublico(opciones.semilla)
        break
      case 'cajaItem':
        c = texturaCajaItem()
        break
      case 'flechasTurbo':
        c = texturaFlechasTurbo()
        break
      case 'cartel':
        c = texturaCartel(opciones.texto, opciones.fondo, opciones.tinta)
        break
      default:
        throw new Error(`Sprite desconocido: ${nombre}`)
    }
    const t = comoTextura(c, { repeat: [1, 1] })
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping
    return t
  })
}

/** Textura de cielo en degradado, ya configurada para el domo. */
export function texturaCielo(cenit, medio, horizonte) {
  const clave = `skytex:${cenit}:${medio}:${horizonte}`
  return memo(clave, () => {
    const t = new THREE.CanvasTexture(texturaCieloDegradado(cenit, medio, horizonte))
    t.wrapS = THREE.RepeatWrapping
    t.wrapT = THREE.ClampToEdgeWrapping
    t.colorSpace = THREE.SRGBColorSpace
    return t
  })
}

export default {
  textura,
  materialMaps,
  sprite,
  texturaCielo,
  limpiarTexturas,
  crearCanvas,
  normalDesdeCanvas,
  rugosidadDesdeCanvas,
}
