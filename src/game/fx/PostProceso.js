// Post-proceso de Teo Kart.
//
// Cadena:
//   RenderPass -> UnrealBloomPass -> SombreadorPantalla -> SMAAPass -> OutputPass
//
// `SombreadorPantalla` junta en un único pase las cuatro cosas que en otros
// motores serían cuatro: desenfoque radial de velocidad, aberración cromática
// radial, líneas de velocidad (las rayas blancas del hongo) y la corrección de
// color + viñeta. Un solo pase = un solo blit de pantalla completa.
import * as THREE from 'three'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js'
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'
import { clamp01, damp } from '../core/utils.js'
import { PasadaProfundidad } from './Particulas.js'

const VERTEX_PANTALLA = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const FRAGMENT_PANTALLA = /* glsl */ `
  uniform sampler2D tDiffuse;
  uniform vec2  uResolucion;
  uniform float uTiempo;
  uniform float uVelocidad;     // 0..1 desenfoque + rayas + aberración
  uniform float uVineta;
  uniform float uSaturacion;
  uniform float uContraste;
  uniform float uTemperatura;   // + cálido, - frío
  uniform float uAberracion;
  uniform float uLineas;        // peso de las rayas radiales
  uniform vec3  uDestelloColor;
  uniform float uDestelloFuerza;

  varying vec2 vUv;

  float azar(float n) {
    return fract(sin(n * 127.1) * 43758.5453123);
  }

  void main() {
    vec2 uv = vUv;
    vec2 d = uv - vec2(0.5);
    float aspecto = uResolucion.x / max(uResolucion.y, 1.0);
    vec2 da = vec2(d.x * aspecto, d.y);
    float r = length(da) / 0.72;          // ~0 en el centro, ~1 en los bordes
    float vel = clamp(uVelocidad, 0.0, 1.0);

    // ---- Desenfoque radial + aberración cromática radial -------------------
    vec3 col;
    #if MUESTRAS > 1
      float fuerza = vel * 0.060 * smoothstep(0.05, 0.95, r);
      float ab = uAberracion * (0.0016 + 0.0090 * r) * (0.25 + 0.75 * vel);
      col = vec3(0.0);
      float total = 0.0;
      for (int i = 0; i < MUESTRAS; i++) {
        float t = float(i) / float(MUESTRAS - 1);
        float w = 1.0 - t * 0.62;
        vec2 off = d * (-fuerza * t);
        col.r += texture2D(tDiffuse, uv + off + d * ab).r * w;
        col.g += texture2D(tDiffuse, uv + off).g * w;
        col.b += texture2D(tDiffuse, uv + off - d * ab).b * w;
        total += w;
      }
      col /= total;
    #else
      col = texture2D(tDiffuse, uv).rgb;
    #endif

    // ---- Rayas blancas radiales (estilo hongo de Mario Kart) ---------------
    float rayas = 0.0;
    if (uLineas * vel > 0.003) {
      const float N = 88.0;
      float ang = atan(da.y, da.x);
      float sec = (ang / 6.2831853 + 0.5) * N;
      float id = floor(sec);
      float f = fract(sec) - 0.5;
      float h1 = azar(id);
      float h2 = azar(id + 41.7);
      float ciclo = fract(h1 + uTiempo * (0.85 + h2 * 1.5) * (0.35 + 0.65 * vel));
      float largo = 0.20 + h2 * 0.45;
      float radioExt = mix(1.45, 0.22, ciclo);
      float radioInt = radioExt - largo;
      float banda = smoothstep(radioInt - 0.05, radioInt + 0.03, r) *
                    (1.0 - smoothstep(radioExt - 0.03, radioExt + 0.05, r));
      float grosor = 0.09 + h1 * 0.20;
      float perfil = 1.0 - smoothstep(0.0, grosor, abs(f));
      float aparicion = sin(ciclo * 3.14159265);
      rayas = banda * perfil * aparicion * smoothstep(0.18, 0.80, r);
      col += vec3(1.0, 0.99, 0.96) * rayas * uLineas * vel * (0.55 + 0.85 * vel);
    }

    // ---- Corrección de color (en espacio perceptual aproximado) ------------
    vec3 g = pow(max(col, vec3(0.0)), vec3(0.4545));
    g += vec3(uTemperatura * 0.055, uTemperatura * 0.008, -uTemperatura * 0.050);
    g = (g - 0.5) * uContraste + 0.5;
    float luma = dot(g, vec3(0.2126, 0.7152, 0.0722));
    g = mix(vec3(luma), g, uSaturacion);
    col = pow(max(g, vec3(0.0)), vec3(2.2));

    // ---- Viñeta ------------------------------------------------------------
    col *= 1.0 - uVineta * smoothstep(0.30, 1.28, r);

    // ---- Destello a pantalla completa --------------------------------------
    float df = clamp(uDestelloFuerza, 0.0, 1.0);
    if (df > 0.001) {
      col = mix(col, uDestelloColor, df * 0.72);
      col += uDestelloColor * df * 0.55;
    }

    gl_FragColor = vec4(col, 1.0);
  }
`

/** Descriptor del pase propio (uniforms + shaders), listo para ShaderPass. */
export function crearSombreadorPantalla(muestras = 8) {
  return {
    defines: { MUESTRAS: Math.max(1, muestras | 0) },
    uniforms: {
      tDiffuse: { value: null },
      uResolucion: { value: new THREE.Vector2(1920, 1080) },
      uTiempo: { value: 0 },
      uVelocidad: { value: 0 },
      uVineta: { value: 0.42 },
      uSaturacion: { value: 1.12 },
      uContraste: { value: 1.06 },
      uTemperatura: { value: 0.05 },
      uAberracion: { value: 1 },
      uLineas: { value: 1 },
      uDestelloColor: { value: new THREE.Color(0xffffff) },
      uDestelloFuerza: { value: 0 },
    },
    vertexShader: VERTEX_PANTALLA,
    fragmentShader: FRAGMENT_PANTALLA,
  }
}

/** Ajustes por perfil de calidad. */
const PERFILES = {
  alta: { muestras: 8, bloom: 1, smaa: true, fuerzaBloom: 0.62, radioBloom: 0.62, umbral: 0.82, profundidad: true },
  media: { muestras: 4, bloom: 0.5, smaa: false, fuerzaBloom: 0.55, radioBloom: 0.7, umbral: 0.86, profundidad: false },
  baja: { muestras: 1, bloom: 0, smaa: false, fuerzaBloom: 0, radioBloom: 0, umbral: 1, profundidad: false },
}

/**
 * Crea la cadena de post-proceso y la deja lista para `engine.post`.
 *
 * @param {import('../core/Engine.js').Engine} engine
 * @param {object} [opciones]
 * @param {'alta'|'media'|'baja'} [opciones.calidad]
 * @param {boolean} [opciones.softParticles] fuerza la pasada de profundidad
 * @returns {object} api de post-proceso
 */
export function crearPostProceso(engine, opciones = {}) {
  const renderer = engine.renderer
  const escena = engine.escena
  const camara = engine.camara

  // Puente cortés: si el estudio de luces se creó sin renderer, se lo damos.
  const estudio = escena.userData && escena.userData.estudio
  if (estudio && estudio.establecerRenderer) estudio.establecerRenderer(renderer)

  let calidad = opciones.calidad || 'alta'
  let perfil = PERFILES[calidad] || PERFILES.alta

  const ancho = engine.ancho || renderer.domElement.width || 1280
  const alto = engine.alto || renderer.domElement.height || 720

  const composer = new EffectComposer(renderer)
  composer.setSize(ancho, alto)

  const pasoRender = new RenderPass(escena, camara)
  const bloom = new UnrealBloomPass(
    new THREE.Vector2(ancho, alto),
    perfil.fuerzaBloom,
    perfil.radioBloom,
    perfil.umbral,
  )
  const descriptor = crearSombreadorPantalla(perfil.muestras)
  let pasoPantalla = new ShaderPass(descriptor)
  const pasoSmaa = new SMAAPass()
  const pasoSalida = new OutputPass()

  /** @type {PasadaProfundidad|null} */
  let profundidad = null
  const quiereProfundidad = opciones.softParticles ?? perfil.profundidad
  if (quiereProfundidad) {
    profundidad = new PasadaProfundidad(renderer, escena, opciones.escalaProfundidad ?? 0.5)
    profundidad.setSize(ancho, alto)
  }

  // Estado suavizado.
  let velocidadObjetivo = 0
  let velocidadActual = 0
  let impulsoLineas = 0
  let destelloFuerza = 0
  let destelloDecaimiento = 0
  let tiempo = 0
  const colorDestello = new THREE.Color(0xffffff)
  const tamano = new THREE.Vector2()

  function armar() {
    composer.passes.length = 0
    composer.addPass(pasoRender)
    if (perfil.bloom > 0) composer.addPass(bloom)
    composer.addPass(pasoPantalla)
    if (perfil.smaa) composer.addPass(pasoSmaa)
    composer.addPass(pasoSalida)
  }
  armar()

  function aplicarTamano(w, h) {
    if (!w || !h) return
    composer.setSize(w, h)
    const rp = renderer.getPixelRatio()
    if (perfil.bloom > 0) bloom.setSize(w * rp * perfil.bloom, h * rp * perfil.bloom)
    renderer.getDrawingBufferSize(tamano)
    pasoPantalla.uniforms.uResolucion.value.copy(tamano)
    if (profundidad) profundidad.setSize(tamano.x, tamano.y)
  }
  aplicarTamano(ancho, alto)

  const api = {
    composer,
    bloom,
    pasoPantalla,
    get calidad() {
      return calidad
    },
    /** Textura de profundidad de la escena (soft particles). */
    get texturaProfundidad() {
      return profundidad ? profundidad.textura : null
    },
    /** Uniforms del pase propio, por si la UI quiere trastear en vivo. */
    get uniforms() {
      return pasoPantalla.uniforms
    },

    /** Velocidad normalizada 0..1: desenfoque, rayas y aberración. */
    establecerVelocidad(v) {
      velocidadObjetivo = clamp01(v || 0)
    },
    /** Empujón puntual de líneas de velocidad (hongo, turbo, bala). */
    establecerImpulso(v) {
      impulsoLineas = Math.max(impulsoLineas, clamp01(v || 0))
    },
    /** Flash a pantalla completa. `fuerza` 0..1, decae solo. */
    establecerDestello(color, fuerza, duracion = 0.25) {
      if (color !== undefined && color !== null) colorDestello.set(color)
      destelloFuerza = Math.max(destelloFuerza, clamp01(fuerza ?? 1))
      destelloDecaimiento = 1 / Math.max(0.04, duracion)
    },
    /** Ajustes de grado de color. */
    grado({ vineta, saturacion, contraste, temperatura, aberracion, lineas } = {}) {
      const u = pasoPantalla.uniforms
      if (vineta !== undefined) u.uVineta.value = vineta
      if (saturacion !== undefined) u.uSaturacion.value = saturacion
      if (contraste !== undefined) u.uContraste.value = contraste
      if (temperatura !== undefined) u.uTemperatura.value = temperatura
      if (aberracion !== undefined) u.uAberracion.value = aberracion
      if (lineas !== undefined) u.uLineas.value = lineas
    },

    /** Cambia el perfil de calidad rehaciendo sólo lo necesario. */
    ajustar(nuevaCalidad) {
      const p = PERFILES[nuevaCalidad]
      if (!p) return
      calidad = nuevaCalidad
      perfil = p

      if (pasoPantalla.material.defines.MUESTRAS !== p.muestras) {
        const viejo = pasoPantalla
        const uniformsViejos = viejo.uniforms
        pasoPantalla = new ShaderPass(crearSombreadorPantalla(p.muestras))
        for (const k in uniformsViejos) {
          if (k === 'tDiffuse') continue
          const u = pasoPantalla.uniforms[k]
          if (!u) continue
          if (u.value && u.value.copy && uniformsViejos[k].value) u.value.copy(uniformsViejos[k].value)
          else u.value = uniformsViejos[k].value
        }
        api.pasoPantalla = pasoPantalla
        viejo.dispose()
      }

      if (p.bloom > 0) {
        bloom.strength = p.fuerzaBloom
        bloom.radius = p.radioBloom
        bloom.threshold = p.umbral
      }

      const quiere = opciones.softParticles ?? p.profundidad
      if (quiere && !profundidad) {
        profundidad = new PasadaProfundidad(renderer, escena, opciones.escalaProfundidad ?? 0.5)
      } else if (!quiere && profundidad) {
        profundidad.dispose()
        profundidad = null
      }

      armar()
      aplicarTamano(engine.ancho || ancho, engine.alto || alto)
    },

    setSize(w, h) {
      aplicarTamano(w, h)
    },

    render(dt) {
      const paso = Math.min(dt || 0.016, 0.1)
      tiempo += paso

      // Suavizado de la velocidad: subir rápido, bajar despacio (se siente mejor).
      const objetivo = Math.max(velocidadObjetivo, impulsoLineas)
      velocidadActual = damp(velocidadActual, objetivo, objetivo > velocidadActual ? 7 : 3.2, paso)
      impulsoLineas = Math.max(0, impulsoLineas - paso * 1.35)

      if (destelloFuerza > 0) {
        destelloFuerza = Math.max(0, destelloFuerza - paso * destelloDecaimiento)
      }

      const u = pasoPantalla.uniforms
      u.uTiempo.value = tiempo
      u.uVelocidad.value = velocidadActual
      u.uDestelloFuerza.value = destelloFuerza
      u.uDestelloColor.value.copy(colorDestello)

      // El bloom sube un pelín con la velocidad: el turbo "quema" más.
      if (perfil.bloom > 0) {
        bloom.strength = perfil.fuerzaBloom * (1 + velocidadActual * 0.45)
      }

      // La cámara puede haber cambiado (presentación, podio).
      if (pasoRender.camera !== engine.camara) pasoRender.camera = engine.camara

      if (profundidad) profundidad.render(engine.camara)
      composer.render(paso)
    },

    dispose() {
      composer.passes.length = 0
      pasoRender.dispose && pasoRender.dispose()
      bloom.dispose()
      pasoPantalla.dispose()
      pasoSmaa.dispose()
      pasoSalida.dispose()
      if (profundidad) profundidad.dispose()
      composer.renderTarget1.dispose()
      composer.renderTarget2.dispose()
    },
  }

  return api
}

export default crearPostProceso
