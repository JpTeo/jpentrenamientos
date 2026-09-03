// Karts y conductores del MVP: geometría primitiva, sombreado plano y un
// rasgo distintivo por socio para que se reconozcan de un vistazo.
// Nada de modelos externos: todo se arma con cajas, esferas y cilindros.
import * as THREE from 'three'
import { socio } from '../characters/socios.js'
import { KART } from '../core/constantes.js'
import { clamp, damp, lerp } from '../core/utils.js'

const cacheMat = new Map()
function mat(color, opciones = {}) {
  const clave = `${color}:${JSON.stringify(opciones)}`
  if (cacheMat.has(clave)) return cacheMat.get(clave)
  const m = new THREE.MeshStandardMaterial({
    color,
    roughness: opciones.roughness ?? 0.65,
    metalness: opciones.metalness ?? 0.05,
    flatShading: opciones.flatShading ?? true,
    ...(opciones.emissive ? { emissive: opciones.emissive, emissiveIntensity: 1 } : {}),
  })
  cacheMat.set(clave, m)
  return m
}

function caja(w, h, d, color, o = {}) {
  return new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color, o))
}
function esfera(r, color, seg = 12, o = {}) {
  return new THREE.Mesh(new THREE.SphereGeometry(r, seg, Math.max(6, seg / 2)), mat(color, o))
}
function cilindro(rt, rb, h, color, seg = 12, o = {}) {
  return new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat(color, o))
}

/** Textura del logo redondo "teo" del pecho, dibujada al vuelo. */
let texLogo = null
function logoTeo() {
  if (texLogo) return texLogo
  if (typeof document === 'undefined') return null
  const c = document.createElement('canvas')
  c.width = c.height = 128
  const g = c.getContext('2d')
  g.clearRect(0, 0, 128, 128)
  g.fillStyle = '#ffffff'
  g.beginPath()
  g.arc(64, 64, 58, 0, Math.PI * 2)
  g.fill()
  g.fillStyle = '#14121f'
  g.font = 'bold 62px system-ui, sans-serif'
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.fillText('teo', 64, 70)
  texLogo = new THREE.CanvasTexture(c)
  texLogo.colorSpace = THREE.SRGBColorSpace
  return texLogo
}

// ---------------------------------------------------------------------------
// Conductor
// ---------------------------------------------------------------------------

function crearConductor(s) {
  const a = s.aspecto
  const g = new THREE.Group()

  // Torso: la remera negra de la cooperativa.
  const torso = caja(0.62 * a.complexion, 0.56, 0.42, a.ropa.remera, { roughness: 0.9 })
  torso.position.y = 0.28
  g.add(torso)

  // Logo redondo en el pecho.
  const tex = logoTeo()
  if (tex) {
    const logo = new THREE.Mesh(
      new THREE.CircleGeometry(0.1, 16),
      new THREE.MeshStandardMaterial({ map: tex, transparent: true, roughness: 0.9 }),
    )
    logo.position.set(-0.13, 0.36, -0.215)
    logo.rotation.y = Math.PI
    g.add(logo)
  }

  // Brazos hacia el volante.
  for (const lado of [-1, 1]) {
    const brazo = caja(0.13, 0.13, 0.44, a.ropa.remera, { roughness: 0.9 })
    brazo.position.set(lado * 0.28, 0.36, -0.24)
    brazo.rotation.x = -0.5
    g.add(brazo)
    const mano = esfera(0.09, a.piel, 8)
    mano.position.set(lado * 0.26, 0.46, -0.44)
    g.add(mano)
  }

  // Cabeza.
  const cabeza = new THREE.Group()
  cabeza.position.y = 0.72
  g.add(cabeza)

  const craneo = esfera(0.24, a.piel, 16)
  craneo.scale.set(0.92, 1.06, 0.95)
  cabeza.add(craneo)

  // Ojos (y anteojos si corresponde).
  for (const lado of [-1, 1]) {
    const ojo = esfera(0.045, 0xffffff, 8)
    ojo.position.set(lado * 0.088, 0.03, -0.205)
    ojo.scale.set(1, 1.15, 0.5)
    cabeza.add(ojo)
    const pupila = esfera(0.026, a.ojos.color, 8)
    pupila.position.set(lado * 0.09, 0.03, -0.232)
    cabeza.add(pupila)
    const ceja = caja(0.1, 0.022, 0.03, a.cejas.color || 0x2a1a12)
    ceja.position.set(lado * 0.09, 0.095, -0.215)
    ceja.rotation.z = lado * a.cejas.angulo
    cabeza.add(ceja)
  }

  // Nariz.
  const nariz = esfera(0.04, a.piel, 8)
  nariz.position.set(0, -0.02, -0.235)
  cabeza.add(nariz)

  // Boca: sonrisa con dientes o línea cerrada.
  if (a.boca.dientes) {
    const boca = caja(0.13, 0.05, 0.02, 0xffffff, { roughness: 0.5 })
    boca.position.set(0, -0.105, -0.222)
    cabeza.add(boca)
  } else {
    const boca = caja(0.09, 0.018, 0.02, a.boca.labial || 0x8a4a44)
    boca.position.set(0, -0.105, -0.226)
    cabeza.add(boca)
  }

  // Orejas.
  for (const lado of [-1, 1]) {
    const oreja = esfera(0.055, a.piel, 8)
    oreja.position.set(lado * 0.215, -0.01, 0)
    oreja.scale.set(0.5, 1, 0.7)
    cabeza.add(oreja)
  }

  // Pelo: cada estilo cambia la silueta, que es lo que hace reconocible al socio.
  const cPelo = a.pelo.color
  if (a.pelo.estilo === 'entradas') {
    // Mati: frente despejada, sólo pelo corto en los costados y la nuca.
    const corona = esfera(0.245, cPelo, 14)
    corona.scale.set(0.95, 0.62, 0.98)
    corona.position.set(0, 0.02, 0.05)
    cabeza.add(corona)
  } else {
    const casquete = esfera(0.252, cPelo, 14)
    const vol = a.pelo.volumen || 1
    casquete.scale.set(0.98 * vol, 0.86 * vol, 1.0 * vol)
    casquete.position.y = 0.06
    cabeza.add(casquete)
    if (a.pelo.estilo === 'ondulado' || a.pelo.estilo === 'colaDeCaballo') {
      // Mechones sueltos sobre la frente.
      for (const lado of [-1, 1]) {
        const mecha = caja(0.13, 0.08, 0.09, cPelo)
        mecha.position.set(lado * 0.11, 0.16, -0.17)
        mecha.rotation.z = lado * 0.4
        cabeza.add(mecha)
      }
    }
  }
  if (a.pelo.estilo === 'colaDeCaballo') {
    // Male: la cola baja es su rasgo más reconocible.
    const cola = cilindro(0.07, 0.055, 0.46, cPelo, 10)
    cola.position.set(0, -0.02, 0.28)
    cola.rotation.x = -0.5
    cabeza.add(cola)
    const mechonIzq = caja(0.07, 0.34, 0.1, cPelo)
    mechonIzq.position.set(-0.2, -0.1, -0.05)
    cabeza.add(mechonIzq)
    const mechonDer = mechonIzq.clone()
    mechonDer.position.x = 0.2
    cabeza.add(mechonDer)
  }

  // Barba.
  if (a.vello.barba !== 'ninguna') {
    const cBarba = a.vello.color
    const tupida = a.vello.barba === 'tupida'
    const barba = esfera(0.235, cBarba, 14)
    barba.scale.set(0.95, tupida ? 0.62 : 0.5, 0.92)
    barba.position.set(0, tupida ? -0.115 : -0.135, -0.02)
    cabeza.add(barba)
    if (a.vello.bigote) {
      const bigote = caja(0.14, 0.035, 0.03, cBarba)
      bigote.position.set(0, -0.062, -0.225)
      cabeza.add(bigote)
    }
    if (a.vello.barba === 'candado') {
      // Perilla corta: sólo mentón y bigote, sin patillas.
      barba.scale.set(0.52, 0.4, 0.7)
      barba.position.set(0, -0.14, -0.12)
    }
  }

  // Anteojos de marco negro (Mati).
  if (a.accesorios.includes('lentes')) {
    const l = a.lentes || { marco: 0x14141a, cristal: 0xdff0ff }
    const puente = caja(0.075, 0.022, 0.02, l.marco, { roughness: 0.3 })
    puente.position.set(0, 0.028, -0.232)
    cabeza.add(puente)
    for (const lado of [-1, 1]) {
      const marco = caja(0.115, 0.085, 0.022, l.marco, { roughness: 0.3 })
      marco.position.set(lado * 0.095, 0.028, -0.235)
      cabeza.add(marco)
      const cristal = new THREE.Mesh(
        new THREE.PlaneGeometry(0.095, 0.065),
        new THREE.MeshStandardMaterial({
          color: l.cristal,
          transparent: true,
          opacity: 0.32,
          roughness: 0.1,
          metalness: 0.4,
        }),
      )
      cristal.position.set(lado * 0.095, 0.028, -0.248)
      cabeza.add(cristal)
      const patilla = caja(0.02, 0.02, 0.16, l.marco, { roughness: 0.3 })
      patilla.position.set(lado * 0.185, 0.028, -0.15)
      cabeza.add(patilla)
    }
  }

  // Aros (Male).
  if (a.accesorios.includes('aros')) {
    for (const lado of [-1, 1]) {
      const aro = new THREE.Mesh(
        new THREE.TorusGeometry(0.032, 0.008, 6, 12),
        mat(0xffd24a, { metalness: 0.8, roughness: 0.25 }),
      )
      aro.position.set(lado * 0.222, -0.07, 0)
      aro.rotation.y = Math.PI / 2
      cabeza.add(aro)
    }
  }

  g.scale.setScalar(a.altura)
  return { grupo: g, cabeza }
}

// ---------------------------------------------------------------------------
// Kart
// ---------------------------------------------------------------------------

function crearKart(s) {
  const c = s.colores
  const g = new THREE.Group()
  const W = KART.ancho
  const L = KART.largo
  const R = KART.radioRueda

  // Chasis principal.
  const chasis = caja(W * 0.78, 0.3, L * 0.82, c.principal, { roughness: 0.45, metalness: 0.25 })
  chasis.position.y = R + 0.05
  chasis.castShadow = true
  g.add(chasis)

  // Morro afinado adelante.
  const morro = caja(W * 0.52, 0.22, 0.55, c.principal, { roughness: 0.45, metalness: 0.25 })
  morro.position.set(0, R + 0.02, -L * 0.52)
  morro.castShadow = true
  g.add(morro)

  // Pontones laterales.
  for (const lado of [-1, 1]) {
    const pon = caja(0.2, 0.24, L * 0.5, c.oscuro, { roughness: 0.5 })
    pon.position.set(lado * W * 0.44, R + 0.02, 0.05)
    g.add(pon)
  }

  // Asiento.
  const asiento = caja(0.5, 0.36, 0.14, 0x24242c, { roughness: 0.9 })
  asiento.position.set(0, R + 0.35, 0.32)
  g.add(asiento)
  const base = caja(0.5, 0.1, 0.42, 0x2c2c36, { roughness: 0.9 })
  base.position.set(0, R + 0.2, 0.16)
  g.add(base)

  // Volante.
  const volante = new THREE.Mesh(
    new THREE.TorusGeometry(0.16, 0.032, 6, 14),
    mat(0x1b1b22, { roughness: 0.6 }),
  )
  volante.position.set(0, R + 0.46, -0.42)
  volante.rotation.x = -1.05
  g.add(volante)

  // Alerón trasero.
  const soporte1 = caja(0.06, 0.24, 0.06, c.oscuro)
  soporte1.position.set(-0.3, R + 0.36, L * 0.44)
  const soporte2 = soporte1.clone()
  soporte2.position.x = 0.3
  const ala = caja(W * 0.82, 0.06, 0.28, c.acento, { roughness: 0.4 })
  ala.position.set(0, R + 0.5, L * 0.44)
  g.add(soporte1, soporte2, ala)

  // Escapes con boquillas que se encienden con el turbo.
  const boquillas = []
  for (const lado of [-1, 1]) {
    const tubo = cilindro(0.07, 0.07, 0.3, 0x9aa0a8, 8, { metalness: 0.8, roughness: 0.3 })
    tubo.rotation.x = Math.PI / 2
    tubo.position.set(lado * 0.22, R + 0.14, L * 0.5)
    g.add(tubo)
    const fuego = cilindro(0.075, 0.02, 0.34, 0xff8a2a, 8, { emissive: 0xff6a00 })
    fuego.rotation.x = -Math.PI / 2
    fuego.position.set(lado * 0.22, R + 0.14, L * 0.62)
    fuego.visible = false
    g.add(fuego)
    boquillas.push(fuego)
  }

  // Ruedas: las delanteras giran con el volante.
  const geoRueda = new THREE.CylinderGeometry(R, R, KART.anchoRueda, 14)
  geoRueda.rotateZ(Math.PI / 2)
  const matRueda = mat(0x1c1c22, { roughness: 0.95, flatShading: false })
  const geoLlanta = new THREE.CylinderGeometry(R * 0.5, R * 0.5, KART.anchoRueda + 0.02, 10)
  geoLlanta.rotateZ(Math.PI / 2)
  const ruedas = []
  const pivotes = []
  const posiciones = [
    [-KART.viaDelantera / 2, -KART.distanciaEjes / 2, true],
    [KART.viaDelantera / 2, -KART.distanciaEjes / 2, true],
    [-KART.viaTrasera / 2, KART.distanciaEjes / 2, false],
    [KART.viaTrasera / 2, KART.distanciaEjes / 2, false],
  ]
  for (const [x, z, delantera] of posiciones) {
    const pivote = new THREE.Group()
    pivote.position.set(x, R, z)
    g.add(pivote)
    const rueda = new THREE.Group()
    const goma = new THREE.Mesh(geoRueda, matRueda)
    goma.castShadow = true
    const llanta = new THREE.Mesh(geoLlanta, mat(c.claro, { metalness: 0.6, roughness: 0.3 }))
    rueda.add(goma, llanta)
    if (!delantera) rueda.scale.set(1.15, 1.08, 1.08)
    pivote.add(rueda)
    ruedas.push(rueda)
    if (delantera) pivotes.push(pivote)
  }

  // Sombra de apoyo: un plano oscuro barato, mucho más liviano que una sombra real.
  const sombra = new THREE.Mesh(
    new THREE.PlaneGeometry(W * 1.5, L * 1.3),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.28 }),
  )
  sombra.rotation.x = -Math.PI / 2
  sombra.position.y = 0.02
  g.add(sombra)

  return { grupo: g, ruedas, pivotes, boquillas, sombra }
}

// ---------------------------------------------------------------------------
// Corredor = kart + conductor, con animación procedural
// ---------------------------------------------------------------------------

export function crearCorredor(id) {
  const s = socio(id)
  const raiz = new THREE.Group()
  const cuerpo = new THREE.Group() // se inclina; la sombra queda fuera
  raiz.add(cuerpo)

  const kart = crearKart(s)
  cuerpo.add(kart.grupo)
  const conductor = crearConductor(s)
  conductor.grupo.position.set(0, KART.radioRueda + 0.3, 0.16)
  cuerpo.add(conductor.grupo)

  let balanceo = 0
  let cabeceo = 0
  let giroCabeza = 0
  let parpadeo = 1.6 + Math.random() * 3

  return {
    id,
    grupo: raiz,
    actualizar(dt, vis) {
      const giro = clamp(vis.giro || 0, -1, 1)
      const derrape = vis.derrapando ? vis.ladoDerrape || Math.sign(giro) || 1 : 0

      // Ruedas: giran con el avance, las delanteras además doblan.
      for (const r of kart.ruedas) r.rotation.x = vis.vueltasRueda || 0
      const anguloDireccion = -giro * 0.45 + derrape * -0.28
      for (const p of kart.pivotes) p.rotation.y = damp(p.rotation.y, anguloDireccion, 14, dt)

      // Inclinación del chasis: en curva y, sobre todo, en derrape.
      const balObjetivo = -giro * 0.1 - derrape * 0.14
      balanceo = damp(balanceo, balObjetivo, 8, dt)
      // Cabeceo: se hunde atrás al acelerar, adelante al frenar.
      const cabObjetivo = clamp((vis.aceleracion || 0) * -0.05 + (vis.frenado || 0) * 0.07, -0.09, 0.09)
      cabeceo = damp(cabeceo, cabObjetivo, 7, dt)
      cuerpo.rotation.z = balanceo
      cuerpo.rotation.x = cabeceo

      // Al derrapar, el kart se cruza respecto de su trayectoria.
      cuerpo.rotation.y = damp(cuerpo.rotation.y, derrape * -0.32, 9, dt)

      // El conductor mira hacia donde va la curva: detalle barato y muy visible.
      giroCabeza = damp(giroCabeza, giro * 0.45 + derrape * 0.25, 7, dt)
      conductor.cabeza.rotation.y = giroCabeza
      conductor.grupo.rotation.x = clamp(-(vis.rapidezNorm || 0) * 0.12 + cabeceo * 0.5, -0.2, 0.2)

      // Parpadeo.
      parpadeo -= dt
      const cerrado = parpadeo < 0 && parpadeo > -0.11
      conductor.cabeza.scale.y = cerrado ? 0.94 : 1
      if (parpadeo < -0.11) parpadeo = 1.8 + Math.random() * 3.4

      // Turbo: se encienden los escapes.
      const conTurbo = (vis.turbo || 0) > 0
      for (const b of kart.boquillas) {
        b.visible = conTurbo
        if (conTurbo) b.scale.setScalar(0.8 + Math.sin(performance.now() * 0.03) * 0.25)
      }

      // Golpe: trompo visual y encogimiento.
      if ((vis.girando || 0) > 0) cuerpo.rotation.y += (vis.girando || 0) * 3
      const escala = (vis.aplastado || 0) > 0 ? 0.5 : 1
      cuerpo.scale.y = damp(cuerpo.scale.y, escala, 9, dt)

      // La sombra sigue pegada al piso aunque el cuerpo se incline.
      kart.sombra.position.y = 0.02 - (raiz.position.y - (vis.alturaSuelo ?? raiz.position.y))
    },
    destruir() {
      raiz.traverse((o) => {
        if (o.geometry) o.geometry.dispose()
      })
    },
  }
}

/** Versión estática y de pie para la pantalla de selección. */
export function crearRetrato(id) {
  const s = socio(id)
  const g = new THREE.Group()
  const c = crearConductor(s)
  c.grupo.position.y = -0.35
  g.add(c.grupo)
  // Piernas simples: sólo se ven en el retrato.
  for (const lado of [-1, 1]) {
    const pierna = caja(0.16, 0.42, 0.18, s.aspecto.ropa.pantalon, { roughness: 0.9 })
    pierna.position.set(lado * 0.16, -0.56, 0)
    g.add(pierna)
  }
  g.scale.setScalar(lerp(1, 1.05, 0.5))
  return { grupo: g, cabeza: c.cabeza }
}

export default { crearCorredor, crearRetrato }
