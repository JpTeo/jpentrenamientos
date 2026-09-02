// Piezas geométricas reutilizables para armar personajes y accesorios.
//
// Reglas de la casa:
//  - Todo paramétrico: la misma función saca la cabeza de los cuatro socios.
//  - Low-poly redondeado (esferas deformadas, lathes, cápsulas y tubos).
//    Nada de cubos crudos: no hay una sola BoxGeometry en el archivo.
//  - Las geometrías se cachean por parámetros, así cuatro karts iguales
//    comparten buffers y el presupuesto de triángulos se respeta de verdad.
//
// Convención de ejes: Y arriba, el personaje mira a -Z (igual que el kart).
import * as THREE from 'three'
import { clamp, clamp01, lerp, smoothstep, TAU } from '../core/utils.js'
import {
  materialPelo,
  materialPiel,
  materialPlano,
  materialPlastico,
  materialVidrio,
} from './materiales.js'

// ---------------------------------------------------------------------------
// Infraestructura: caché de geometrías y deformadores
// ---------------------------------------------------------------------------

const geometrias = new Map()

/** Redondea un número para usarlo como clave de caché estable. */
const k = (v, d = 3) => Number(v).toFixed(d)

function memoGeo(clave, fabrica) {
  const previa = geometrias.get(clave)
  if (previa) return previa
  const g = fabrica()
  g.userData.clave = clave
  geometrias.set(clave, g)
  return g
}

/** Libera todas las geometrías cacheadas (al desmontar el juego). */
export function limpiarGeometrias() {
  for (const g of geometrias.values()) g.dispose()
  geometrias.clear()
}

const _v = new THREE.Vector3()

/** Aplica una función de deformación vértice a vértice y recalcula normales. */
export function deformar(geo, fn) {
  const pos = geo.attributes.position
  for (let i = 0; i < pos.count; i++) {
    _v.fromBufferAttribute(pos, i)
    fn(_v, i)
    pos.setXYZ(i, _v.x, _v.y, _v.z)
  }
  pos.needsUpdate = true
  geo.computeVertexNormals()
  geo.computeBoundingSphere()
  return geo
}

/** Marca el nivel de detalle de un objeto (lo lee `aplicarLOD`). */
export function detalle(objeto, nivel) {
  objeto.userData.detalle = nivel
  return objeto
}

function malla(geo, material, { sombra = true, nombre = '' } = {}) {
  const m = new THREE.Mesh(geo, material)
  m.castShadow = sombra
  m.receiveShadow = false
  if (nombre) m.name = nombre
  return m
}

/** Rectángulo de esquinas redondeadas como `THREE.Shape` (marcos, placas). */
export function formaRedondeada(ancho, alto, radio) {
  const r = Math.min(radio, Math.min(ancho, alto) * 0.49)
  const x = -ancho / 2
  const y = -alto / 2
  const s = new THREE.Shape()
  s.moveTo(x + r, y)
  s.lineTo(x + ancho - r, y)
  s.quadraticCurveTo(x + ancho, y, x + ancho, y + r)
  s.lineTo(x + ancho, y + alto - r)
  s.quadraticCurveTo(x + ancho, y + alto, x + ancho - r, y + alto)
  s.lineTo(x + r, y + alto)
  s.quadraticCurveTo(x, y + alto, x, y + alto - r)
  s.lineTo(x, y + r)
  s.quadraticCurveTo(x, y, x + r, y)
  return s
}

/** Tubo suave a lo largo de una lista de puntos (mechones, caños, cables). */
export function tubo(puntos, radio, segmentos = 6, radiales = 4, cerrado = false) {
  const curva = new THREE.CatmullRomCurve3(puntos.map((p) => p.clone()))
  return new THREE.TubeGeometry(curva, segmentos, radio, radiales, cerrado)
}

// ---------------------------------------------------------------------------
// Cuerpo
// ---------------------------------------------------------------------------

/**
 * Cráneo: esfera deformada por los parámetros de la cara. Es la pieza que
 * define el parecido, así que expone bastante control.
 */
export function cabeza(params = {}) {
  const {
    radio = 0.172,
    largoCara = 1,
    anchoMandibula = 1,
    menton = 0.5,
    pomulos = 1,
    frente = 1,
    material,
  } = params
  const clave = `craneo:${k(radio)}:${k(largoCara)}:${k(anchoMandibula)}:${k(menton)}:${k(pomulos)}:${k(frente)}`
  const geo = memoGeo(clave, () => {
    const g = new THREE.SphereGeometry(radio, 12, 9)
    return deformar(g, (v) => {
      const yn = v.y / radio // -1 abajo, 1 arriba
      const frontal = clamp01(-v.z / radio) // 1 en la cara, 0 en la nuca
      const lateral = clamp01(Math.abs(v.x) / radio)

      // Alargue general de la cara (Jp y Mati son de cara larga).
      v.y *= lerp(1, largoCara, 0.5 + 0.5 * clamp(yn, -1, 1) * -1 + 0.5)
      v.y *= 1

      // Mandíbula: se ensancha o se afina de la mitad para abajo.
      const tMand = smoothstep((-yn - 0.05) / 0.75)
      const escMand = lerp(1, anchoMandibula, tMand)
      v.x *= escMand
      v.z *= lerp(1, anchoMandibula * 0.94 + 0.06, tMand)

      // Pómulos: ensanche puntual a la altura de los ojos.
      const tPom = Math.exp(-Math.pow((yn - 0.02) / 0.3, 2))
      v.x *= lerp(1, pomulos, tPom * 0.85)

      // Mentón: empuja la barbilla hacia adelante y la afina.
      const tMen = smoothstep((-yn - 0.5) / 0.45)
      v.z -= tMen * frontal * menton * radio * 0.3
      v.x *= lerp(1, 0.82, tMen * 0.8)
      v.y -= tMen * radio * 0.06 * largoCara

      // Frente: sube y aplana la parte alta de la cara.
      const tFre = smoothstep((yn - 0.28) / 0.6)
      v.y *= lerp(1, frente, tFre)
      v.z += tFre * frontal * radio * 0.04

      // Plano de la cara y nuca un poco chata: la esfera pura queda a globo.
      v.z *= lerp(1, 0.9, frontal * 0.8)
      v.z *= lerp(1, 0.95, clamp01(v.z / radio))
      // Las sienes se meten un poco.
      v.x *= lerp(1, 0.97, lateral * tFre)
    })
  })
  return malla(geo, material || materialPiel(), { nombre: 'craneo' })
}

/**
 * Torso hecho con LatheGeometry: perfil de cadera → cintura → pecho → hombros.
 * Se aplasta en Z para que el cuerpo sea más ancho que profundo, pero las UV
 * quedan intactas (por eso el logo de la remera cae siempre en el mismo lugar).
 */
export function torso(params = {}) {
  const {
    alto = 0.56,
    cadera = 0.135,
    cintura = 0.126,
    pecho = 0.168,
    hombros = 0.176,
    cuello = 0.055,
    complexion = 1,
    material,
  } = params
  const clave = `torso:${k(alto)}:${k(cadera)}:${k(cintura)}:${k(pecho)}:${k(hombros)}:${k(cuello)}:${k(complexion)}`
  const geo = memoGeo(clave, () => {
    const c = complexion
    const p = [
      new THREE.Vector2(0.02, -0.03 * alto),
      new THREE.Vector2(cadera * c, 0),
      new THREE.Vector2(cintura * c, alto * 0.29),
      new THREE.Vector2(pecho * c, alto * 0.55), // v = 3/7 ≈ 0.43
      new THREE.Vector2(hombros * c, alto * 0.76), // v = 4/7 ≈ 0.57
      new THREE.Vector2(hombros * c * 0.8, alto * 0.9),
      new THREE.Vector2(cuello * 1.5, alto * 0.97),
      new THREE.Vector2(cuello, alto),
    ]
    return new THREE.LatheGeometry(p, 12)
  })
  const m = malla(geo, material || materialPlastico(0x17171d), { nombre: 'torso' })
  m.scale.z = 0.74
  return m
}

/** V del cuello, para que la cabeza no flote sobre el torso. */
export function cuello(params = {}) {
  const { radio = 0.052, alto = 0.09, material } = params
  const geo = memoGeo(`cuello:${k(radio)}:${k(alto)}`, () =>
    new THREE.CylinderGeometry(radio * 0.92, radio * 1.15, alto, 8, 1, true).translate(0, alto / 2, 0)
  )
  const m = malla(geo, material || materialPiel(), { nombre: 'cuello' })
  m.material.side = THREE.DoubleSide
  return m
}

/** Segmento de brazo (o antebrazo): cápsula con el pivote en el extremo alto. */
export function brazo(params = {}) {
  const { largo = 0.2, radio = 0.045, conico = 0.86, material } = params
  const clave = `brazo:${k(largo)}:${k(radio)}:${k(conico)}`
  const geo = memoGeo(clave, () => {
    const g = new THREE.CapsuleGeometry(radio, Math.max(0.001, largo - radio * 2), 2, 7)
    g.translate(0, -largo / 2, 0)
    return deformar(g, (v) => {
      const t = clamp01(-v.y / largo)
      const e = lerp(1, conico, t)
      v.x *= e
      v.z *= e
    })
  })
  return malla(geo, material || materialPiel(), { nombre: 'brazo' })
}

/** Puño cerrado agarrando el volante. */
export function mano(params = {}) {
  const { radio = 0.05, material } = params
  const geo = memoGeo(`mano:${k(radio)}`, () => {
    const g = new THREE.SphereGeometry(radio, 7, 5)
    g.translate(0, -radio * 0.6, 0)
    return deformar(g, (v) => {
      v.x *= 0.86
      v.z *= 1.12
      v.y *= 1.05
    })
  })
  return malla(geo, material || materialPiel(), { nombre: 'mano' })
}

/** Segmento de pierna (muslo o pantorrilla). */
export function pierna(params = {}) {
  const { largo = 0.26, radio = 0.062, conico = 0.78, material } = params
  const clave = `pierna:${k(largo)}:${k(radio)}:${k(conico)}`
  const geo = memoGeo(clave, () => {
    const g = new THREE.CapsuleGeometry(radio, Math.max(0.001, largo - radio * 2), 2, 7)
    g.translate(0, -largo / 2, 0)
    return deformar(g, (v) => {
      const t = clamp01(-v.y / largo)
      const e = lerp(1, conico, t)
      v.x *= e
      v.z *= e
    })
  })
  return malla(geo, material || materialPlastico(0x232838), { nombre: 'pierna' })
}

/** Zapatilla: esfera estirada hacia la punta (el personaje mira a -Z). */
export function pie(params = {}) {
  const { largo = 0.15, ancho = 0.075, alto = 0.075, material } = params
  const clave = `pie:${k(largo)}:${k(ancho)}:${k(alto)}`
  const geo = memoGeo(clave, () => {
    const g = new THREE.SphereGeometry(0.5, 7, 5)
    return deformar(g, (v) => {
      const adelante = clamp01(-v.z * 2)
      v.z *= largo * 2
      v.x *= ancho * 2
      v.y *= alto * 2 * lerp(1, 0.62, adelante)
      v.y = Math.max(v.y, -alto * 0.5) // suela plana
      v.z -= adelante * largo * 0.18
    })
  })
  return malla(geo, material || materialPlastico(0x2a2a33), { nombre: 'pie' })
}

/** Oreja: media esfera aplastada, con hueco insinuado. */
export function oreja(params = {}) {
  const { radio = 0.038, material } = params
  const geo = memoGeo(`oreja:${k(radio)}`, () => {
    const g = new THREE.SphereGeometry(radio, 6, 4)
    return deformar(g, (v) => {
      v.x *= 0.34
      v.z *= 0.72
      v.y *= 1.18
      if (v.x < 0) v.x *= 0.5 // se pega al cráneo
    })
  })
  return malla(geo, material || materialPiel(), { nombre: 'oreja' })
}

/** Nariz: cuña redondeada con el tabique hacia -Z. */
export function nariz(params = {}) {
  const { largo = 0.052, ancho = 0.038, alto = 0.06, respingada = 0.25, material } = params
  const clave = `nariz:${k(largo)}:${k(ancho)}:${k(alto)}:${k(respingada)}`
  const geo = memoGeo(clave, () => {
    const g = new THREE.SphereGeometry(0.5, 7, 4)
    return deformar(g, (v) => {
      const abajo = clamp01(-v.y * 2)
      v.x *= ancho * 2 * lerp(0.62, 1, abajo)
      v.y *= alto * 2
      v.z *= largo * 2 * lerp(0.55, 1, abajo)
      v.z -= abajo * largo * respingada
    })
  })
  return malla(geo, material || materialPiel(), { nombre: 'nariz' })
}

// ---------------------------------------------------------------------------
// Cara
// ---------------------------------------------------------------------------

/**
 * Ojo completo: esclerótica + iris + pupila + brillo especular (plano
 * billboard) + párpado móvil para el parpadeo y las expresiones.
 * Devuelve un Group con `userData.parpado` e `userData.iris`.
 */
export function ojo(params = {}) {
  const {
    radio = 0.031,
    color = 0x53381f,
    tamanoIris = 0.62,
    piel = 0xf0cba8,
    pestanas = false,
    material,
  } = params
  const g = new THREE.Group()
  g.name = 'ojo'

  const geoGlobo = memoGeo(`globoOjo:${k(radio)}`, () => {
    const s = new THREE.SphereGeometry(radio, 6, 4)
    return deformar(s, (v) => {
      v.z *= 0.82
      v.x *= 1.06
    })
  })
  const globo = malla(geoGlobo, material || materialPlano(0xf6f2ee), { sombra: false })
  g.add(globo)

  const rIris = radio * tamanoIris
  const geoIris = memoGeo(`iris:${k(rIris)}`, () => new THREE.CircleGeometry(rIris, 9))
  const iris = malla(geoIris, materialPlano(color), { sombra: false })
  iris.position.z = -radio * 0.78
  iris.rotation.y = Math.PI
  g.add(iris)

  const geoPupila = memoGeo(`pupila:${k(rIris * 0.52)}`, () =>
    new THREE.CircleGeometry(rIris * 0.52, 7)
  )
  const pupila = malla(geoPupila, materialPlano(0x120d0a), { sombra: false })
  pupila.position.z = -radio * 0.83
  pupila.rotation.y = Math.PI
  g.add(pupila)

  const geoBrillo = memoGeo(`brilloOjo:${k(rIris * 0.34)}`, () =>
    new THREE.PlaneGeometry(rIris * 0.68, rIris * 0.68)
  )
  const brillo = malla(geoBrillo, materialPlano(0xffffff, { toneMapped: false }), { sombra: false })
  brillo.position.set(-rIris * 0.34, rIris * 0.36, -radio * 0.88)
  brillo.rotation.y = Math.PI
  detalle(brillo, 2)
  g.add(brillo)

  // Párpado: casquete de piel que baja para parpadear y para gestualizar.
  const geoParpado = memoGeo(`parpado:${k(radio)}`, () => {
    const s = new THREE.SphereGeometry(radio * 1.09, 7, 3, 0, TAU, 0, Math.PI * 0.55)
    return deformar(s, (v) => {
      v.z *= 0.86
      v.x *= 1.08
    })
  })
  const parpado = malla(geoParpado, materialPiel(piel), { sombra: false })
  parpado.rotation.x = -0.22
  g.add(parpado)
  g.userData.parpado = parpado
  g.userData.iris = iris
  g.userData.pupila = pupila
  g.userData.brillo = brillo

  if (pestanas) {
    const geoPest = memoGeo(`pestanas:${k(radio)}`, () => {
      const s = new THREE.SphereGeometry(radio * 1.14, 7, 2, 0, TAU, 0, Math.PI * 0.3)
      return deformar(s, (v) => {
        v.z *= 0.9
        v.x *= 1.12
        v.y -= radio * 0.06
      })
    })
    const pest = malla(geoPest, materialPelo(0x1d1410), { sombra: false })
    pest.rotation.x = -0.34
    detalle(pest, 1)
    g.add(pest)
    g.userData.pestanas = pest
  }
  return g
}

/** Ceja: barra redondeada, con grosor y ángulo paramétricos. */
export function ceja(params = {}) {
  const { largo = 0.062, grosor = 1, color = 0x3d2515 } = params
  const r = 0.009 * grosor
  const clave = `ceja:${k(largo)}:${k(r)}`
  const geo = memoGeo(clave, () => {
    const g = new THREE.CapsuleGeometry(r, largo, 1, 6)
    g.rotateZ(Math.PI / 2)
    return deformar(g, (v) => {
      v.y *= 1.15
      v.z *= 0.7
      // Curvita natural: los extremos caen un pelín.
      v.y -= Math.pow(clamp01(Math.abs(v.x) / (largo * 0.6)), 2) * r * 1.4
    })
  })
  return malla(geo, materialPelo(color), { sombra: false, nombre: 'ceja' })
}

/**
 * Boca. `abierta` da la sonrisa con dientes (el rasgo de Jp y Keke) y la
 * cerrada, una línea curva de labios (Male y Mati).
 * Devuelve un Group con el pivote en el centro de la boca.
 */
export function boca(params = {}) {
  const {
    ancho = 0.062,
    sonrisa = 1,
    dientes = false,
    color = 0x8f4a45,
    labial = null,
  } = params
  const g = new THREE.Group()
  g.name = 'boca'
  const arco = clamp(0.9 + sonrisa * 0.55, 0.7, 2.1)
  const radio = ancho * 0.98
  const tubo0 = ancho * (dientes ? 0.1 : 0.115)

  const geoLabios = memoGeo(`labios:${k(radio)}:${k(tubo0)}:${k(arco)}`, () => {
    const t = new THREE.TorusGeometry(radio, tubo0, 4, 8, arco)
    t.rotateZ(-Math.PI / 2 - arco / 2)
    return deformar(t, (v) => {
      v.z *= 0.6
      v.y += radio * 0.55
    })
  })
  const labios = malla(geoLabios, materialPlano(labial || color), { sombra: false })
  g.add(labios)
  g.userData.labios = labios

  if (dientes) {
    // Interior oscuro y una franja de dientes arriba: la sonrisa abierta.
    const geoInterior = memoGeo(`bocaInterior:${k(radio)}:${k(arco)}`, () => {
      const c = new THREE.CircleGeometry(radio * 0.94, 8, -Math.PI / 2 - arco / 2, arco)
      c.rotateY(Math.PI)
      return c.translate(0, radio * 0.55, 0)
    })
    const interior = malla(geoInterior, materialPlano(0x40161a), { sombra: false })
    interior.position.z = 0.004
    g.add(interior)

    const geoDientes = memoGeo(`dientes:${k(radio)}:${k(arco)}`, () => {
      const r0 = new THREE.RingGeometry(
        radio * 0.5,
        radio * 0.94,
        8,
        1,
        -Math.PI / 2 - arco / 2,
        arco * 0.62
      )
      r0.rotateZ(Math.PI)
      r0.rotateY(Math.PI)
      return r0.translate(0, radio * 0.55, 0)
    })
    const dientesMesh = malla(geoDientes, materialPlano(0xfbf7f0), { sombra: false })
    dientesMesh.position.z = -0.001
    g.add(dientesMesh)
    g.userData.dientes = dientesMesh
  }
  return g
}

/** Hoyuelos: dos marquitas a los costados de una sonrisa muy abierta. */
export function hoyuelo(params = {}) {
  const { radio = 0.011, piel = 0xd9a578 } = params
  const geo = memoGeo(`hoyuelo:${k(radio)}`, () => {
    const s = new THREE.SphereGeometry(radio, 5, 3)
    return deformar(s, (v) => {
      v.z *= 0.5
      v.y *= 1.5
    })
  })
  const m = malla(geo, materialPiel(piel), { sombra: false, nombre: 'hoyuelo' })
  m.material = materialPlano(new THREE.Color(piel).multiplyScalar(0.78).getHex())
  return detalle(m, 2)
}

// ---------------------------------------------------------------------------
// Pelo
// ---------------------------------------------------------------------------

/** Casquete base que abraza el cráneo; después cada estilo lo retoca. */
function casquete(radio, thetaLength, params) {
  const {
    retroceso = 0,
    entradas = 0,
    volumen = 1,
    onda = 0,
    raya = 'ninguna',
    aplaste = 1,
  } = params
  const clave = `casquete:${k(radio)}:${k(thetaLength)}:${k(retroceso)}:${k(entradas)}:${k(volumen)}:${k(onda)}:${raya}:${k(aplaste)}`
  return memoGeo(clave, () => {
    const g = new THREE.SphereGeometry(radio, 11, 6, 0, TAU, 0, thetaLength)
    return deformar(g, (v) => {
      const yn = v.y / radio
      const frontal = clamp01(-v.z / radio)
      const ax = clamp01(Math.abs(v.x) / radio)

      // Volumen general (Jp lleva mucho pelo, Mati casi nada).
      const infla = 1 + (volumen - 1) * 0.5 * clamp01(yn + 0.4)
      v.x *= infla
      v.z *= infla
      v.y *= lerp(1, volumen, 0.35) * aplaste

      // Onda: pequeñas crestas alrededor del cráneo.
      if (onda > 0) {
        const ang = Math.atan2(v.x, v.z)
        const ola = Math.sin(ang * 3.5) * Math.cos(yn * 4.2)
        v.x += ola * onda * radio * 0.09
        v.z += ola * onda * radio * 0.09
        v.y += Math.sin(ang * 5) * onda * radio * 0.05
      }

      // Línea de nacimiento: retrocede en el frente y forma la "M" de las
      // entradas (los laterales suben más que el centro).
      const bajo = clamp01((0.35 - yn) / 0.9)
      const subida = retroceso + entradas * (0.28 + 1.15 * Math.pow(ax, 1.4))
      v.y += frontal * bajo * subida * radio
      v.z += frontal * bajo * (retroceso + entradas * 0.5) * radio * 0.35

      // Raya: un surco al medio o al costado.
      if (raya === 'media') {
        v.y -= Math.exp(-Math.pow(v.x / (radio * 0.16), 2)) * radio * 0.1 * clamp01(yn)
      } else if (raya === 'lado') {
        v.y -= Math.exp(-Math.pow((v.x - radio * 0.42) / (radio * 0.2), 2)) * radio * 0.09 * clamp01(yn)
      }
    })
  })
}

function mechonTubo(puntos, radio, material, segmentos = 5, radiales = 4) {
  const clave = `mechon:${puntos.map((p) => `${k(p.x, 2)}_${k(p.y, 2)}_${k(p.z, 2)}`).join('|')}:${k(radio)}:${segmentos}:${radiales}`
  const geo = memoGeo(clave, () => tubo(puntos, radio, segmentos, radiales))
  return malla(geo, material, { nombre: 'mechon' })
}

const V = (x, y, z) => new THREE.Vector3(x, y, z)

/**
 * Pelo completo. `estilo` ∈ 'corto' | 'rapado' | 'ondulado' | 'largo' |
 * 'rodete' | 'crespo' | 'flequillo' | 'colaDeCaballo' | 'entradas'.
 * Devuelve un Group con el pivote en el centro del cráneo; los mechones
 * sueltos quedan en `userData.mechones` para que la animación los sacuda.
 */
export function pelo(estilo = 'corto', params = {}) {
  const {
    radio = 0.176,
    color = 0x5a3a22,
    largo = 0.4,
    volumen = 1,
    raya = 'media',
    mechones = false,
  } = params
  const mat = materialPelo(color)
  const g = new THREE.Group()
  g.name = `pelo:${estilo}`
  const sueltos = []
  g.userData.mechones = sueltos

  // Perfil de casquete por estilo.
  const perfiles = {
    rapado: { theta: 0.94, retroceso: 0.04, entradas: 0.02, onda: 0, aplaste: 1, esc: 1.015 },
    corto: { theta: 1.05, retroceso: 0.05, entradas: 0.03, onda: 0.15, aplaste: 1, esc: 1.04 },
    ondulado: { theta: 1.12, retroceso: 0.05, entradas: 0.04, onda: 0.85, aplaste: 1.02, esc: 1.05 },
    crespo: { theta: 1.16, retroceso: 0.06, entradas: 0.03, onda: 1.35, aplaste: 1.06, esc: 1.07 },
    largo: { theta: 1.22, retroceso: 0.03, entradas: 0, onda: 0.35, aplaste: 1, esc: 1.05 },
    rodete: { theta: 1.06, retroceso: 0.03, entradas: 0, onda: 0.1, aplaste: 0.98, esc: 1.03 },
    flequillo: { theta: 1.1, retroceso: -0.06, entradas: 0, onda: 0.2, aplaste: 1, esc: 1.05 },
    colaDeCaballo: { theta: 1.14, retroceso: 0.02, entradas: 0, onda: 0.3, aplaste: 0.99, esc: 1.04 },
    entradas: { theta: 1.0, retroceso: 0.16, entradas: 0.5, onda: 0.1, aplaste: 0.97, esc: 1.02 },
  }
  const p = perfiles[estilo] || perfiles.corto
  const rc = radio * p.esc
  const capa = malla(
    casquete(rc, p.theta, {
      retroceso: p.retroceso,
      entradas: p.entradas,
      volumen,
      onda: p.onda,
      raya,
      aplaste: p.aplaste,
    }),
    mat,
    { nombre: 'casquete' }
  )
  g.add(capa)
  g.userData.casquete = capa

  const rm = radio * 0.028 * lerp(0.9, 1.3, volumen - 0.5)

  // Melena larga: masa que cae por la nuca y los hombros.
  if (estilo === 'largo' || estilo === 'colaDeCaballo' || estilo === 'rodete') {
    const caida = estilo === 'largo' ? largo : largo * 0.35
    const geoMelena = memoGeo(`melena:${k(rc)}:${k(caida)}:${estilo}`, () => {
      const s = new THREE.SphereGeometry(rc * 0.98, 10, 5, 0, TAU, 0, Math.PI * 0.62)
      return deformar(s, (v) => {
        const atras = clamp01(v.z / rc)
        const bajo = clamp01(0.4 - v.y / rc)
        v.y -= atras * bajo * caida * 1.5
        v.z += atras * bajo * caida * 0.22
        v.x *= lerp(1, 1.06, atras)
      })
    })
    const melena = malla(geoMelena, mat, { nombre: 'melena' })
    melena.position.y = -radio * 0.12
    g.add(melena)
    g.userData.melena = melena
  }

  if (estilo === 'colaDeCaballo') {
    // Cola baja atada en la nuca, con inercia propia.
    const cola = new THREE.Group()
    cola.position.set(0, -radio * 0.34, radio * 0.86)
    const geoAtado = memoGeo(`atado:${k(radio)}`, () => new THREE.SphereGeometry(radio * 0.26, 7, 5))
    cola.add(malla(geoAtado, mat))
    const l = largo
    const geoCola = memoGeo(`cola:${k(l)}:${k(radio)}`, () =>
      tubo(
        [
          V(0, 0, 0),
          V(0.008, -l * 0.3, radio * 0.34),
          V(-0.01, -l * 0.62, radio * 0.3),
          V(0.006, -l * 0.92, radio * 0.12),
        ],
        radio * 0.2,
        6,
        6
      )
    )
    const trenza = malla(geoCola, mat, { nombre: 'cola' })
    deformar(geoCola, (v) => v) // asegura normales
    cola.add(trenza)
    g.add(cola)
    sueltos.push({ objeto: cola, eje: 'x', factor: 1 })
    g.userData.cola = cola
  }

  if (estilo === 'rodete') {
    const bollo = new THREE.Group()
    bollo.position.set(0, radio * 0.42, radio * 0.82)
    const geoBollo = memoGeo(`rodete:${k(radio)}`, () => {
      const s = new THREE.SphereGeometry(radio * 0.42, 8, 6)
      return deformar(s, (v) => {
        v.z *= 0.86
        v.y *= 0.92
      })
    })
    bollo.add(malla(geoBollo, mat))
    g.add(bollo)
    sueltos.push({ objeto: bollo, eje: 'x', factor: 0.5 })
  }

  if (estilo === 'crespo') {
    // Racimo de rulos: esferitas repartidas por la coronilla.
    const geoRulo = memoGeo(`rulo:${k(radio)}`, () => new THREE.SphereGeometry(radio * 0.3, 6, 4))
    const posiciones = [
      [-0.62, 0.62, -0.42],
      [0.62, 0.6, -0.4],
      [0, 0.78, -0.62],
      [-0.72, 0.42, 0.5],
      [0.74, 0.44, 0.48],
      [0, 0.6, 0.78],
    ]
    for (const [x, y, z] of posiciones) {
      const r = malla(geoRulo, mat)
      r.position.set(x * radio, y * radio, z * radio)
      detalle(r, 1)
      g.add(r)
    }
  }

  if (estilo === 'flequillo') {
    const geoFlequillo = memoGeo(`flequillo:${k(rc)}`, () => {
      const c = new THREE.CylinderGeometry(rc * 1.0, rc * 1.02, rc * 0.7, 10, 1, true, Math.PI * 0.62, Math.PI * 0.76)
      return deformar(c, (v) => {
        const bajo = clamp01(0.5 - v.y / (rc * 0.7))
        v.y -= bajo * rc * 0.22
        v.z *= 0.95
      })
    })
    const fl = malla(geoFlequillo, mat, { nombre: 'flequillo' })
    fl.material = mat
    fl.position.y = radio * 0.12
    g.add(fl)
    sueltos.push({ objeto: fl, eje: 'x', factor: 0.4 })
  }

  // Mechones sueltos sobre la frente / enmarcando la cara.
  if (mechones || estilo === 'ondulado' || estilo === 'largo' || estilo === 'colaDeCaballo') {
    const enmarca = estilo === 'colaDeCaballo' || estilo === 'largo'
    const trazos = enmarca
      ? [
          [
            V(-radio * 0.72, radio * 0.5, -radio * 0.42),
            V(-radio * 0.96, radio * 0.05, -radio * 0.46),
            V(-radio * 0.88, -radio * 0.62, -radio * 0.36),
            V(-radio * 0.7, -radio * 1.15, -radio * 0.18),
          ],
          [
            V(radio * 0.72, radio * 0.5, -radio * 0.42),
            V(radio * 0.98, radio * 0.05, -radio * 0.44),
            V(radio * 0.9, -radio * 0.6, -radio * 0.34),
            V(radio * 0.74, -radio * 1.1, -radio * 0.16),
          ],
        ]
      : [
          [
            V(-radio * 0.5, radio * 0.86, -radio * 0.3),
            V(-radio * 0.66, radio * 0.72, -radio * 0.7),
            V(-radio * 0.5, radio * 0.5, -radio * 0.92),
          ],
          [
            V(radio * 0.16, radio * 0.94, -radio * 0.26),
            V(radio * 0.3, radio * 0.76, -radio * 0.72),
            V(radio * 0.12, radio * 0.56, -radio * 0.95),
          ],
          [
            V(radio * 0.6, radio * 0.82, -radio * 0.3),
            V(radio * 0.82, radio * 0.62, -radio * 0.6),
            V(radio * 0.78, radio * 0.4, -radio * 0.84),
          ],
        ]
    for (const trazo of trazos) {
      const m = mechonTubo(trazo, rm * (enmarca ? 1.6 : 1.35), mat, 5, 4)
      detalle(m, 1)
      const pivote = new THREE.Group()
      pivote.add(m)
      g.add(pivote)
      sueltos.push({ objeto: pivote, eje: 'x', factor: enmarca ? 0.8 : 0.55 })
    }
  }
  return g
}

/**
 * Barba. `tipo` ∈ 'ninguna' | 'candado' | 'corta' | 'tupida' | 'bigote' |
 * 'sombra'. Devuelve un Group (vacío si es 'ninguna').
 */
export function barba(tipo = 'ninguna', params = {}) {
  const { radio = 0.176, color = 0x2b1c12, densidad = 1, bigote = false, largoCara = 1 } = params
  const g = new THREE.Group()
  g.name = `barba:${tipo}`
  if (tipo === 'ninguna') return g

  const mat = materialPelo(color)
  const espesor = { sombra: 0.008, candado: 0.016, corta: 0.02, tupida: 0.03, bigote: 0.012 }[tipo] ?? 0.02
  const anchoAng = { sombra: 1.5, candado: 0.62, corta: 1.32, tupida: 1.55, bigote: 0.5 }[tipo] ?? 1.2
  const subeLados = { sombra: 0.55, candado: 0.1, corta: 0.6, tupida: 0.86, bigote: 0 }[tipo] ?? 0.5

  if (tipo !== 'bigote') {
    const r = radio + espesor * densidad
    const clave = `barbaShell:${tipo}:${k(r)}:${k(anchoAng)}:${k(subeLados)}:${k(densidad)}:${k(largoCara)}`
    const geo = memoGeo(clave, () => {
      const s = new THREE.SphereGeometry(
        r,
        10,
        4,
        Math.PI - anchoAng,
        anchoAng * 2,
        Math.PI * 0.46,
        Math.PI * 0.5
      )
      return deformar(s, (v) => {
        const yn = v.y / r
        const ax = clamp01(Math.abs(v.x) / r)
        v.y *= largoCara
        // La barba sube por las patillas y baja en el mentón.
        v.y += ax * subeLados * r * 0.5
        v.z *= 0.94
        v.y -= clamp01(-yn) * r * 0.08 * densidad
      })
    })
    const shell = malla(geo, mat, { nombre: 'barbaMasa' })
    if (tipo === 'sombra') {
      shell.material = materialPelo(color)
      detalle(shell, 1)
    }
    g.add(shell)
  }

  if (bigote || tipo === 'bigote') {
    const r = radio + espesor * densidad
    const geoBigote = memoGeo(`bigote:${k(r)}:${k(densidad)}`, () => {
      const t = new THREE.TorusGeometry(r * 0.3, r * 0.055 * (1 + densidad * 0.5), 3, 6, 1.9)
      t.rotateZ(-Math.PI / 2 - 0.95)
      return deformar(t, (v) => {
        v.z *= 0.55
        v.y += r * 0.16
      })
    })
    const b = malla(geoBigote, mat, { nombre: 'bigote' })
    b.position.set(0, -radio * 0.2, -radio * 0.86)
    detalle(b, 1)
    g.add(b)
  }
  return g
}

// ---------------------------------------------------------------------------
// Accesorios
// ---------------------------------------------------------------------------

/** Anteojos de marco grueso rectangular: el rasgo número uno de Mati. */
export function lentes(params = {}) {
  const {
    ancho = 0.062,
    alto = 0.044,
    grosor = 1.15,
    marco = 0x14141a,
    cristal = 0xdff0ff,
    separacion = 0.072,
    forma = 'rectangular',
  } = params
  const g = new THREE.Group()
  g.name = 'lentes'
  const mMarco = materialPlastico(marco, { rugosidad: 0.28 })
  const grueso = 0.007 * grosor
  const radioEsquina = forma === 'redonda' ? Math.min(ancho, alto) * 0.48 : Math.min(ancho, alto) * 0.26

  const geoAro = memoGeo(`aroLente:${k(ancho)}:${k(alto)}:${k(grueso)}:${k(radioEsquina)}`, () => {
    const externo = formaRedondeada(ancho + grueso * 2, alto + grueso * 2, radioEsquina + grueso)
    const interno = formaRedondeada(ancho, alto, radioEsquina)
    externo.holes.push(new THREE.Path(interno.getPoints(10).reverse()))
    const e = new THREE.ExtrudeGeometry(externo, {
      depth: 0.012,
      bevelEnabled: true,
      bevelSize: 0.0016,
      bevelThickness: 0.0016,
      bevelSegments: 1,
      curveSegments: 1,
      steps: 1,
    })
    e.center()
    return e
  })
  const geoCristal = memoGeo(`cristalLente:${k(ancho)}:${k(alto)}:${k(radioEsquina)}`, () =>
    new THREE.ShapeGeometry(formaRedondeada(ancho, alto, radioEsquina), 1)
  )

  for (const lado of [-1, 1]) {
    const aro = malla(geoAro, mMarco, { nombre: 'aroLente' })
    aro.position.set(lado * separacion * 0.5, 0, 0)
    g.add(aro)
    const vidrio = malla(geoCristal, materialVidrio(cristal, 0.26), { sombra: false })
    vidrio.position.set(lado * separacion * 0.5, 0, -0.001)
    detalle(vidrio, 1)
    g.add(vidrio)
  }

  const geoPuente = memoGeo(`puenteLente:${k(separacion)}`, () =>
    new THREE.CapsuleGeometry(0.0038 * grosor, separacion - ancho, 1, 5).rotateZ(Math.PI / 2)
  )
  const puente = malla(geoPuente, mMarco)
  puente.position.y = alto * 0.22
  g.add(puente)

  const geoPatilla = memoGeo(`patillaLente:${k(ancho)}`, () =>
    new THREE.CapsuleGeometry(0.0035 * grosor, 0.075, 1, 5).rotateX(Math.PI / 2)
  )
  for (const lado of [-1, 1]) {
    const pat = malla(geoPatilla, mMarco)
    pat.position.set(lado * (separacion * 0.5 + ancho * 0.5 + grueso), alto * 0.16, 0.044)
    pat.rotation.y = lado * 0.16
    detalle(pat, 1)
    g.add(pat)
  }
  return g
}

/** Argollitas. Se cuelgan de los lóbulos. */
export function aros(params = {}) {
  const { radio = 0.016, color = 0xffd76a } = params
  const g = new THREE.Group()
  g.name = 'aros'
  const geo = memoGeo(`aro:${k(radio)}`, () => new THREE.TorusGeometry(radio, radio * 0.24, 3, 7))
  for (const lado of [-1, 1]) {
    const a = malla(geo, materialPlastico(color, { rugosidad: 0.16 }), { sombra: false })
    a.position.set(lado * 0.001, -radio, 0)
    a.rotation.y = Math.PI / 2
    detalle(a, 1)
    g.add(a)
  }
  return g
}

/** Gorra con visera. */
export function gorra(params = {}) {
  const { radio = 0.182, color = 0xe8402a, visera = 0x1b1b22 } = params
  const g = new THREE.Group()
  g.name = 'gorra'
  const geoCopa = memoGeo(`gorraCopa:${k(radio)}`, () => {
    const s = new THREE.SphereGeometry(radio, 10, 5, 0, TAU, 0, Math.PI * 0.52)
    return deformar(s, (v) => {
      v.y *= 1.1
    })
  })
  g.add(malla(geoCopa, materialPlastico(color, { rugosidad: 0.72 })))
  const geoVisera = memoGeo(`gorraVisera:${k(radio)}`, () => {
    const c = new THREE.CircleGeometry(radio * 1.02, 8, Math.PI * 0.25, Math.PI * 0.5)
    c.rotateX(-Math.PI / 2)
    return deformar(c, (v) => {
      v.z *= 1.15
      v.y -= clamp01(-v.z / radio) * radio * 0.16
    })
  })
  const vis = malla(geoVisera, materialPlastico(visera, { rugosidad: 0.6, doblecara: true }))
  vis.position.set(0, radio * 0.06, -radio * 0.1)
  vis.rotation.y = Math.PI
  g.add(vis)
  return g
}

/** Vincha elástica alrededor de la frente. */
export function vincha(params = {}) {
  const { radio = 0.178, color = 0xffffff, alto = 0.03 } = params
  const geo = memoGeo(`vincha:${k(radio)}:${k(alto)}`, () => {
    const c = new THREE.CylinderGeometry(radio * 1.02, radio * 1.02, alto, 11, 1, true)
    return deformar(c, (v) => {
      v.z *= 0.94
    })
  })
  const m = malla(geo, materialPlastico(color, { rugosidad: 0.85, doblecara: true }), {
    nombre: 'vincha',
  })
  m.position.y = radio * 0.34
  return m
}

/** Casco de carrera con visor y franja (opcional: tapa la cara). */
export function casco(params = {}) {
  const { radio = 0.196, color = 0xe8402a, visor = 0x1b2c3a, franja = 0xffcc00 } = params
  const g = new THREE.Group()
  g.name = 'casco'
  const geoCasco = memoGeo(`cascoCopa:${k(radio)}`, () => {
    const s = new THREE.SphereGeometry(radio, 12, 7, 0, TAU, 0, Math.PI * 0.68)
    return deformar(s, (v) => {
      v.y *= 1.06
      v.z *= 1.03
    })
  })
  g.add(malla(geoCasco, materialPlastico(color, { rugosidad: 0.22 })))

  const geoFranja = memoGeo(`cascoFranja:${k(radio)}`, () => {
    const s = new THREE.SphereGeometry(radio * 1.008, 12, 3, Math.PI * 0.46, Math.PI * 0.08, 0, Math.PI * 0.66)
    return s
  })
  const fr = malla(geoFranja, materialPlastico(franja, { rugosidad: 0.3, doblecara: true }), {
    sombra: false,
  })
  detalle(fr, 1)
  g.add(fr)

  const geoVisor = memoGeo(`cascoVisor:${k(radio)}`, () => {
    const s = new THREE.SphereGeometry(radio * 1.01, 12, 4, Math.PI * 0.62, Math.PI * 0.76, Math.PI * 0.3, Math.PI * 0.3)
    return deformar(s, (v) => {
      v.z *= 1.05
    })
  })
  const vz = malla(geoVisor, materialVidrio(visor, 0.72), { sombra: false })
  g.add(vz)
  g.userData.visor = vz
  return g
}

export default {
  cabeza,
  torso,
  cuello,
  brazo,
  mano,
  pierna,
  pie,
  oreja,
  nariz,
  ojo,
  ceja,
  boca,
  hoyuelo,
  pelo,
  barba,
  lentes,
  aros,
  gorra,
  vincha,
  casco,
}
