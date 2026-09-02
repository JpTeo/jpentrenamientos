// Banco de pruebas de la física, con pistas falsas (un anillo y una recta
// infinita). Se corre a mano desde la raíz del repo:
//     node src/game/physics/__prueba.mjs
// No lo importa nadie: es una herramienta de desarrollo.
import * as THREE from 'three'
import { FisicaKart } from './KartPhysics.js'
import { controlVacio } from '../core/Input.js'

const R = 220 // radio del anillo
const ANCHO = 11
const LONG = 2 * Math.PI * R
const CP = 24

const pista = {
  id: 'falsa', nombre: 'Anillo', vueltas: 3, longitud: LONG, puntosControl: CP,
  limites: new THREE.Box3(new THREE.Vector3(-R-40,-2,-R-40), new THREE.Vector3(R+40,10,R+40)),
  muestrear(x, z, out = {}) {
    const d = Math.hypot(x, z)
    const lateral = d - R
    const abs = Math.abs(lateral)
    out.y = 0
    out.normal = out.normal || new THREE.Vector3(0, 1, 0)
    out.normal.set(0, 1, 0)
    out.tipo = abs <= ANCHO ? 'asfalto' : abs <= ANCHO + 1 ? 'bordillo' : 'cesped'
    out.enPista = abs <= ANCHO + 1
    out.distanciaCentro = abs
    out.anchoAqui = ANCHO
    return out
  },
  progreso(x, z, out = {}) {
    const ang = Math.atan2(x, z) // 0 en +Z
    let t = (ang / (2 * Math.PI) + 1) % 1
    out.s = t * LONG
    out.t = t
    out.lateral = Math.hypot(x, z) - R
    out.tangente = out.tangente || new THREE.Vector3()
    out.tangente.set(Math.cos(ang), 0, -Math.sin(ang)).normalize()
    out.indice = Math.floor(t * CP)
    return out
  },
  puntoEn(s, out = {}) {
    const t = (s / LONG) % 1
    const ang = t * 2 * Math.PI
    out.posicion = out.posicion || new THREE.Vector3()
    out.tangente = out.tangente || new THREE.Vector3()
    out.normal = out.normal || new THREE.Vector3(0, 1, 0)
    out.posicion.set(Math.sin(ang) * R, 0, Math.cos(ang) * R)
    out.tangente.set(Math.cos(ang), 0, -Math.sin(ang)).normalize()
    out.normal.set(0, 1, 0)
    out.ancho = ANCHO
    return out
  },
  colisionar(pos, radio, out = {}) {
    // Muros a ±(ANCHO+2) del centro del anillo.
    const d = Math.hypot(pos.x, pos.z)
    const lim = ANCHO + 2
    out.correccion = out.correccion || new THREE.Vector3()
    out.normal = out.normal || new THREE.Vector3()
    out.golpe = false
    out.correccion.set(0, 0, 0)
    const lateral = d - R
    if (Math.abs(lateral) + radio > lim) {
      const signo = Math.sign(lateral) || 1
      const dir = new THREE.Vector3(pos.x, 0, pos.z).normalize()
      const exceso = Math.abs(lateral) + radio - lim
      out.golpe = true
      out.normal.copy(dir).multiplyScalar(-signo)
      out.correccion.copy(out.normal).multiplyScalar(exceso)
    }
    return out
  },
  checkpointEn(s) { return Math.floor(((s / LONG) % 1) * CP) },
  puestosSalida: [{ posicion: new THREE.Vector3(0, 0, R), rotacionY: Math.PI / 2 }],
  cajasItem: [], monedas: [], grupo: null,
  actualizar() {}, destruir() {},
}


/** Pista plana infinita: todo asfalto, sin muros. Sirve para medir manejo. */
function pistaPlana(tipo = 'asfalto') {
  const L = 100000
  return {
    id: 'plana', nombre: 'Plana', vueltas: 3, longitud: L, puntosControl: CP,
    limites: new THREE.Box3(new THREE.Vector3(-1e4, -2, -1e4), new THREE.Vector3(1e4, 10, 1e4)),
    muestrear(x, z, out = {}) {
      out.y = 0
      out.normal = out.normal || new THREE.Vector3(0, 1, 0)
      out.normal.set(0, 1, 0)
      out.tipo = tipo
      out.enPista = tipo === 'asfalto' || tipo === 'bordillo'
      out.distanciaCentro = 0
      out.anchoAqui = 500
      return out
    },
    progreso(x, z, out = {}) {
      out.s = ((-z % L) + L) % L
      out.t = out.s / L
      out.lateral = x
      out.tangente = out.tangente || new THREE.Vector3()
      out.tangente.set(0, 0, -1)
      out.indice = Math.floor(out.t * CP)
      return out
    },
    puntoEn(s, out = {}) {
      out.posicion = out.posicion || new THREE.Vector3()
      out.tangente = out.tangente || new THREE.Vector3()
      out.normal = out.normal || new THREE.Vector3(0, 1, 0)
      out.posicion.set(0, 0, -s)
      out.tangente.set(0, 0, -1)
      out.normal.set(0, 1, 0)
      out.ancho = 500
      return out
    },
    colisionar(pos, radio, out = {}) {
      out.correccion = out.correccion || new THREE.Vector3()
      out.normal = out.normal || new THREE.Vector3()
      out.golpe = false
      out.correccion.set(0, 0, 0)
      return out
    },
    checkpointEn(s) { return Math.floor(((s / L) % 1) * CP) },
    puestosSalida: [{ posicion: new THREE.Vector3(0, 0, 0), rotacionY: 0 }],
    cajasItem: [], monedas: [], grupo: null,
    actualizar() {}, destruir() {},
  }
}

function nuevoPlano(tipo = 'asfalto', personaje = 'keke') {
  const f = new FisicaKart(pistaPlana(tipo), { id: 't', personaje })
  f.colocarEn(new THREE.Vector3(0, 0, 0), 0)
  return f
}

function nuevo(personaje = 'keke') {
  const f = new FisicaKart(pista, { id: 't', personaje })
  const p = pista.puntoEn(0)
  const yaw = Math.atan2(p.tangente.x, p.tangente.z)
  f.colocarEn(p.posicion, yaw)
  return f
}

const c = () => controlVacio()
const correr = (f, ctrl, seg) => { const n = Math.round(seg * 60); for (let i = 0; i < n; i++) f.step(1/60, ctrl, { karts: [f.estado] }) }

let fallos = 0
const ok = (cond, msg, extra = '') => { console.log(`${cond ? '  OK  ' : ' FALLA'} ${msg} ${extra}`); if (!cond) fallos++ }

// (a) alcanza el tope y no lo supera
{
  const f = nuevoPlano()
  const ctrl = c(); ctrl.acelerar = 1
  correr(f, ctrl, 14)
  const kmh = f.estado.rapidez * 3.6
  ok(kmh > 60 && kmh < 130, 'alcanza una velocidad tope razonable', `${kmh.toFixed(1)} km/h`)
  const antes = f.estado.rapidez
  correr(f, ctrl, 6)
  ok(f.estado.rapidez <= antes * 1.02, 'no supera su tope', `${(f.estado.rapidez*3.6).toFixed(1)} km/h`)
}

// (b) derrape sostenido da mini-turbo escalonado
{
  const f = nuevoPlano()
  const ctrl = c(); ctrl.acelerar = 1
  correr(f, ctrl, 6)
  ctrl.giro = 1; ctrl.derrape = true; ctrl.derrapeAbajo = true
  f.step(1/60, ctrl, { karts: [f.estado] })
  ctrl.derrapeAbajo = false
  correr(f, ctrl, 0.9)
  const n1 = f.estado.nivelDerrape
  correr(f, ctrl, 1.1)
  const n2 = f.estado.nivelDerrape
  correr(f, ctrl, 1.6)
  const n3 = f.estado.nivelDerrape
  ok(f.estado.derrapando, 'entra en derrape')
  ok(n1 >= 1, 'llega a nivel 1 (azul) cerca de 0,75 s', `n=${n1}`)
  ok(n2 >= 2, 'llega a nivel 2 (naranja)', `n=${n2}`)
  ok(n3 >= 3, 'llega a nivel 3 (rosa)', `n=${n3}`)
  ctrl.derrape = false
  f.step(1/60, ctrl, { karts: [f.estado] })
  ok(f.estado.turbo > 1.2, 'al soltar otorga turbo de nivel 3', `${f.estado.turbo.toFixed(2)} s`)
}

// (c) no atraviesa el muro
{
  const f = nuevo()
  const ctrl = c(); ctrl.acelerar = 1; ctrl.giro = 1
  correr(f, ctrl, 20)
  const lateral = Math.abs(Math.hypot(f.estado.posicion.x, f.estado.posicion.z) - R)
  ok(lateral <= ANCHO + 3.2, 'el kart queda dentro de los muros', `lateral=${lateral.toFixed(2)} m`)
}

// (d) conteo de vueltas y sentido contrario
{
  const f = nuevo()
  const ctrl = c(); ctrl.acelerar = 1
  // Guiado suave para que siga el anillo.
  for (let i = 0; i < 60 * 220; i++) {
    const p = f.estado.posicion
    const ang = Math.atan2(p.x, p.z)
    const tx = Math.cos(ang), tz = -Math.sin(ang)
    const yawObj = Math.atan2(tx, tz)
    const yawAct = Math.atan2(
      new THREE.Vector3(0,0,-1).applyQuaternion(f.estado.quaternion).x,
      new THREE.Vector3(0,0,-1).applyQuaternion(f.estado.quaternion).z)
    let d = yawObj - yawAct
    while (d > Math.PI) d -= 2*Math.PI
    while (d < -Math.PI) d += 2*Math.PI
    const lateral = Math.hypot(p.x, p.z) - R
    ctrl.giro = Math.max(-1, Math.min(1, -d * 2.2 - lateral * 0.05))
    f.step(1/60, ctrl, { karts: [f.estado] })
    if (f.estado.vuelta > 3) break
  }
  ok(f.estado.vuelta >= 3, 'completa al menos 3 vueltas guiado', `vuelta=${f.estado.vuelta}, tiempos=${f.estado.tiempos.map(t=>(t/1000).toFixed(1)).join('/')}`)
  ok(f.estado.tiempos.length >= 2, 'registra tiempos por vuelta')
}

// (e) marcha atrás no suma vueltas
{
  const f = nuevo()
  const ctrl = c(); ctrl.frenar = 1
  correr(f, ctrl, 25)
  ok(f.estado.vuelta === 1, 'yendo marcha atrás no suma vuelta', `vuelta=${f.estado.vuelta}`)
  ok(f.estado.marchaAtras === true || f.estado.rapidez < 0, 'detecta sentido contrario')
}

// (f) golpes
{
  const f = nuevoPlano()
  const ctrl = c(); ctrl.acelerar = 1
  correr(f, ctrl, 8)
  const v = f.estado.rapidez
  f.golpear('giro')
  correr(f, ctrl, 0.2)
  ok(f.estado.rapidez < v * 0.6, 'el trompo frena el kart', `${(v*3.6).toFixed(0)} -> ${(f.estado.rapidez*3.6).toFixed(0)} km/h`)
  correr(f, ctrl, 3)
  ok(f.estado.girando === 0, 'el trompo se termina solo')
}

// (g) césped ralentiza
{
  const f = nuevoPlano('asfalto'); const g = nuevoPlano('cesped')
  const ctrl = c(); ctrl.acelerar = 1
  correr(f, ctrl, 12)
  correr(g, ctrl, 12)
  ok(g.estado.rapidez < f.estado.rapidez * 0.8, 'en el césped anda más lento',
     `${(f.estado.rapidez*3.6).toFixed(0)} vs ${(g.estado.rapidez*3.6).toFixed(0)} km/h`)
}

console.log(fallos === 0 ? '\nTODO OK' : `\n${fallos} FALLAS`)
process.exit(fallos ? 1 : 0)
