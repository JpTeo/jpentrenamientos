// Arranque del juego en "modo captura": sin React, sin menús y determinista.
// Lo usa tools/capturas.mjs para fotografiar el juego y que los revisores
// puedan juzgar la calidad visual. No entra en el build de producción.
import * as THREE from 'three'
import { Engine, PASO_FIJO_S } from './core/Engine.js'
import { Carrera, FASE } from './core/Carrera.js'
import { controlVacio } from './core/Input.js'
import { PISTAS } from './world/tracks/index.js'

const params = new URLSearchParams(location.search)
const idPista = params.get('pista') || 'cooperativa'
const calidad = params.get('calidad') || 'alta'

const contenedor = document.getElementById('lienzo')

const api = {
  listo: false,
  error: null,
  engine: null,
  carrera: null,
  pistasDisponibles: PISTAS.map((p) => p.id),
}
window.__teokart = api

/** Control fijo para que los karts se muevan solos durante la simulación. */
function controlAutomatico() {
  const c = controlVacio()
  c.acelerar = 1
  return c
}

async function arrancar() {
  const engine = new Engine(contenedor, { antialias: true, maxPixelRatio: 1 })
  api.engine = engine

  const jugadores = [
    { id: 'jp', nombre: 'Jp', personaje: 'jp', tipo: 'cpu', personalidad: 'agresivo' },
    { id: 'male', nombre: 'Male', personaje: 'male', tipo: 'cpu', personalidad: 'prolijo' },
    { id: 'keke', nombre: 'Keke', personaje: 'keke', tipo: 'cpu', personalidad: 'tramposo' },
    { id: 'mati', nombre: 'Mati', personaje: 'mati', tipo: 'cpu', personalidad: 'prolijo' },
  ]
  // El primero hace de "local" para que la cámara lo siga.
  jugadores[0].tipo = 'local'

  const carrera = new Carrera({
    engine,
    idPista,
    jugadores,
    opciones: { calidad, vueltas: 3, semilla: 20260902, presentacion: false },
    input: { leer: () => controlAutomatico() },
    alCambiarFase: () => {},
  })
  api.carrera = carrera

  await carrera.cargar(() => {})

  // Saltamos la presentación y la cuenta atrás: queremos carrera, no espera.
  carrera.camara.modo = 'persecucion'
  carrera.fase = FASE.CUENTA
  carrera.cuenta = 0.05

  // Un par de cuadros para que todo se inicialice.
  simular(0.5)
  engine.renderer.compile(engine.escena, engine.camara)
  render()
  api.listo = true
}

/** Avanza la simulación N segundos sin dibujar (determinista). */
function simular(segundos) {
  const engine = api.engine
  const carrera = api.carrera
  if (!engine || !carrera) return
  const pasos = Math.round(segundos / PASO_FIJO_S)
  for (let i = 0; i < pasos; i++) {
    carrera.fixedUpdate(PASO_FIJO_S)
    engine.tiempo += PASO_FIJO_S
  }
  // Un update visual para poner los modelos en su lugar.
  carrera.update(PASO_FIJO_S)
}

/** Dibuja un cuadro. */
function render() {
  const engine = api.engine
  if (!engine) return
  engine.render(PASO_FIJO_S)
}

/**
 * Poses de cámara con nombre, para comparar siempre los mismos encuadres.
 * Devuelve false si la pose no existe.
 */
function pose(nombre) {
  const c = api.carrera
  if (!c) return false
  const cam = c.camara
  const local = c.corredores.get(c.idLocal)
  const e = local.estado
  const p = e.posicion
  const q = e.quaternion
  const frente = new THREE.Vector3(0, 0, -1).applyQuaternion(q)
  const derecha = new THREE.Vector3(1, 0, 0).applyQuaternion(q)

  switch (nombre) {
    case 'persecucion':
      cam.modo = 'persecucion'
      cam.encajar()
      cam.actualizar(PASO_FIJO_S, local.control)
      return true
    case 'atras':
      cam.modo = 'atras'
      cam.encajar()
      cam.actualizar(PASO_FIJO_S, local.control)
      return true
    case 'lateral':
      cam.fijar(
        p.clone().addScaledVector(derecha, 7).setY(p.y + 2.2),
        p.clone().setY(p.y + 0.8),
        50,
      )
      return true
    case 'frontal':
      cam.fijar(
        p.clone().addScaledVector(frente, 8).setY(p.y + 1.9),
        p.clone().setY(p.y + 0.9),
        45,
      )
      return true
    case 'retrato':
      cam.fijar(
        p.clone().addScaledVector(frente, 2.6).addScaledVector(derecha, 1.4).setY(p.y + 1.5),
        p.clone().setY(p.y + 1.05),
        32,
      )
      return true
    case 'aerea':
      cam.fijar(p.clone().setY(p.y + 42).addScaledVector(frente, -14), p.clone(), 60)
      return true
    case 'panoramica': {
      const centro = c.pista.limites.getCenter(new THREE.Vector3())
      const tam = c.pista.limites.getSize(new THREE.Vector3())
      const r = Math.max(tam.x, tam.z) * 0.62
      cam.fijar(
        new THREE.Vector3(centro.x + r, centro.y + r * 0.45, centro.z + r),
        centro,
        55,
      )
      return true
    }
    case 'curva': {
      // Un plano bajo, cerca del suelo, mirando cómo entra a la curva.
      cam.fijar(
        p.clone().addScaledVector(frente, -5).addScaledVector(derecha, 4.5).setY(p.y + 0.85),
        p.clone().setY(p.y + 0.7),
        42,
      )
      return true
    }
    default:
      return false
  }
}

api.simular = simular
api.render = render
api.pose = pose
api.fase = () => (api.carrera ? api.carrera.fase : null)
api.info = () => {
  const c = api.carrera
  if (!c) return null
  const r = api.engine.renderer.info
  return {
    pista: c.pista.nombre,
    longitud: Math.round(c.pista.longitud),
    corredores: c.corredores.size,
    llamadas: r.render.calls,
    triangulos: r.render.triangles,
    texturas: r.memory.textures,
    geometrias: r.memory.geometries,
    puestos: [...c.corredores.values()].map((x) => ({
      id: x.id,
      puesto: x.estado.puesto,
      vuelta: x.estado.vuelta,
      rapidez: Math.round(x.estado.rapidez * 3.6),
      superficie: x.estado.superficie,
    })),
  }
}

arrancar().catch((e) => {
  api.error = `${e && e.message}\n${e && e.stack}`
  api.listo = true
  console.error(e)
})
