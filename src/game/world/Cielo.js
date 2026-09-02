// Cielo, atmósfera e iluminación general del circuito.
//
// Arma un domo con degradado procedural, sol/luna con destello, capas de nubes
// billboard que derivan lentamente, niebla exponencial acorde al tema y el par
// de luces (hemisférica + direccional) con la cámara de sombras encuadrada
// alrededor del jugador.
//
// Uso:  const cielo = crearCielo(escena, pista.tema, { calidad })
//       cielo.actualizar(dt, tiempo, posicionJugador)
import * as THREE from 'three'
import { PALETA } from '../assets/paleta.js'
import { sprite, texturaCielo } from '../assets/texturas.js'
import { clamp01, damp, rng, TAU } from '../core/utils.js'

/** Tema por defecto: mediodía de pradera. Cualquier campo se puede pisar. */
const TEMA_BASE = {
  nombre: 'pradera',
  cielo: { cenit: PALETA.cieloCenit, medio: PALETA.cieloDia, horizonte: PALETA.cieloHorizonte },
  sol: {
    color: 0xfff3d0,
    intensidad: 2.5,
    direccion: [-0.45, 0.78, 0.44],
    tamano: 130,
    halo: 1,
    visible: true,
  },
  luna: null,
  hemisferio: { cielo: PALETA.cieloDia, suelo: PALETA.cespedOscuro, intensidad: 1.15 },
  ambiente: 0.22,
  niebla: { color: PALETA.niebla, densidad: 0.0022 },
  nubes: { cantidad: 26, altura: 210, radio: 760, opacidad: 0.95, escala: 150, deriva: 0.0055 },
  radioDomo: 1500,
}

function mezclarTema(tema = {}) {
  return {
    ...TEMA_BASE,
    ...tema,
    cielo: { ...TEMA_BASE.cielo, ...(tema.cielo || {}) },
    sol: { ...TEMA_BASE.sol, ...(tema.sol || {}) },
    hemisferio: { ...TEMA_BASE.hemisferio, ...(tema.hemisferio || {}) },
    niebla: { ...TEMA_BASE.niebla, ...(tema.niebla || {}) },
    nubes: tema.nubes === null ? null : { ...TEMA_BASE.nubes, ...(tema.nubes || {}) },
    luna: tema.luna ? { color: 0xdfe8ff, tamano: 70, halo: 0.8, ...tema.luna } : null,
  }
}

/**
 * Crea el cielo, la niebla y las luces principales de la escena.
 * @param {THREE.Scene} escena
 * @param {object} tema objeto de tema de la pista (`pista.tema`)
 * @param {object} opciones `{ calidad:'alta'|'media'|'baja', luces:boolean, radioSombra }`
 */
export function crearCielo(escena, tema = {}, opciones = {}) {
  const t = mezclarTema(tema)
  const calidad = opciones.calidad || 'alta'
  const conLuces = opciones.luces !== false
  const azar = rng(opciones.semilla ?? 20260902)

  const grupo = new THREE.Group()
  grupo.name = 'cielo'
  grupo.matrixAutoUpdate = true
  escena.add(grupo)

  const desechables = []
  const guardar = (x) => {
    desechables.push(x)
    return x
  }

  // -------------------------------------------------------------------------
  // Domo
  // -------------------------------------------------------------------------
  const radio = t.radioDomo
  const geoDomo = guardar(new THREE.SphereGeometry(radio, 40, 24))
  const matDomo = guardar(
    new THREE.MeshBasicMaterial({
      map: texturaCielo(t.cielo.cenit, t.cielo.medio, t.cielo.horizonte),
      side: THREE.BackSide,
      fog: false,
      depthWrite: false,
      toneMapped: false,
    }),
  )
  const domo = new THREE.Mesh(geoDomo, matDomo)
  domo.name = 'domoCielo'
  domo.renderOrder = -1000
  domo.frustumCulled = false
  grupo.add(domo)

  // -------------------------------------------------------------------------
  // Sol / luna con destello
  // -------------------------------------------------------------------------
  const dirSol = new THREE.Vector3(...t.sol.direccion).normalize()
  const astros = new THREE.Group()
  astros.name = 'astros'
  grupo.add(astros)

  function crearAstro(color, tamano, halo, direccion) {
    const g = new THREE.Group()
    const geoHalo = guardar(new THREE.PlaneGeometry(tamano * 5.2, tamano * 5.2))
    const matHalo = guardar(
      new THREE.MeshBasicMaterial({
        map: sprite('destello', { dureza: 0.08 }),
        color,
        transparent: true,
        opacity: 0.55 * halo,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        depthTest: false,
        fog: false,
        toneMapped: false,
      }),
    )
    const halo1 = new THREE.Mesh(geoHalo, matHalo)
    g.add(halo1)

    const geoEstrella = guardar(new THREE.PlaneGeometry(tamano * 9, tamano * 9))
    const matEstrella = guardar(
      new THREE.MeshBasicMaterial({
        map: sprite('estrella'),
        color,
        transparent: true,
        opacity: 0.3 * halo,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        depthTest: false,
        fog: false,
        toneMapped: false,
      }),
    )
    const estrella = new THREE.Mesh(geoEstrella, matEstrella)
    g.add(estrella)

    const geoDisco = guardar(new THREE.CircleGeometry(tamano * 0.5, 32))
    const matDisco = guardar(
      new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.95,
        depthWrite: false,
        depthTest: false,
        fog: false,
        toneMapped: false,
      }),
    )
    const disco = new THREE.Mesh(geoDisco, matDisco)
    disco.position.z = 0.5
    g.add(disco)

    g.position.copy(direccion).multiplyScalar(radio * 0.82)
    g.renderOrder = -900
    g.frustumCulled = false
    astros.add(g)
    return { grupo: g, estrella, halo: halo1 }
  }

  const sol = t.sol.visible === false ? null : crearAstro(t.sol.color, t.sol.tamano, t.sol.halo, dirSol)
  const luna = t.luna
    ? crearAstro(
        t.luna.color,
        t.luna.tamano,
        t.luna.halo,
        new THREE.Vector3(...(t.luna.direccion || [0.55, 0.62, -0.55])).normalize(),
      )
    : null

  // -------------------------------------------------------------------------
  // Nubes billboard
  // -------------------------------------------------------------------------
  const nubes = []
  if (t.nubes && calidad !== 'baja') {
    const cantidad = calidad === 'media' ? Math.round(t.nubes.cantidad * 0.6) : t.nubes.cantidad
    const capas = 3
    for (let capa = 0; capa < capas; capa++) {
      const tex = sprite('nube', { semilla: 3 + capa * 7 })
      const mat = guardar(
        new THREE.MeshBasicMaterial({
          map: tex,
          color: t.nubes.color ?? 0xffffff,
          transparent: true,
          opacity: t.nubes.opacidad,
          depthWrite: false,
          fog: false,
          toneMapped: false,
          side: THREE.DoubleSide,
        }),
      )
      const geo = guardar(new THREE.PlaneGeometry(1, 0.5))
      const porCapa = Math.max(1, Math.round(cantidad / capas))
      const inst = new THREE.InstancedMesh(geo, mat, porCapa)
      inst.frustumCulled = false
      inst.renderOrder = -800
      inst.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
      const datos = []
      for (let i = 0; i < porCapa; i++) {
        datos.push({
          angulo: azar() * TAU,
          radio: t.nubes.radio * (0.55 + azar() * 0.7) * (1 + capa * 0.22),
          altura: t.nubes.altura * (0.7 + azar() * 0.85) + capa * 55,
          escala: t.nubes.escala * (0.6 + azar() * 1.1),
          velocidad: t.nubes.deriva * (0.6 + azar() * 0.8) * (capa % 2 ? 1 : -0.75),
        })
      }
      nubes.push({ inst, datos })
      grupo.add(inst)
    }
  }

  // -------------------------------------------------------------------------
  // Niebla
  // -------------------------------------------------------------------------
  escena.fog = new THREE.FogExp2(t.niebla.color, t.niebla.densidad)
  escena.background = null

  // -------------------------------------------------------------------------
  // Luces
  // -------------------------------------------------------------------------
  let luzSol = null
  let luzHemisferio = null
  let luzAmbiente = null
  const radioSombra = opciones.radioSombra ?? 62 // ~120 m de lado
  if (conLuces) {
    luzHemisferio = new THREE.HemisphereLight(
      t.hemisferio.cielo,
      t.hemisferio.suelo,
      t.hemisferio.intensidad,
    )
    luzHemisferio.name = 'hemisferio'
    grupo.add(luzHemisferio)

    if (t.ambiente > 0) {
      luzAmbiente = new THREE.AmbientLight(t.cielo.medio, t.ambiente)
      grupo.add(luzAmbiente)
    }

    luzSol = new THREE.DirectionalLight(t.sol.color, t.sol.intensidad)
    luzSol.name = 'sol'
    luzSol.position.copy(dirSol).multiplyScalar(160)
    luzSol.castShadow = calidad !== 'baja'
    const mapa = calidad === 'alta' ? 2048 : 1024
    luzSol.shadow.mapSize.set(mapa, mapa)
    luzSol.shadow.camera.left = -radioSombra
    luzSol.shadow.camera.right = radioSombra
    luzSol.shadow.camera.top = radioSombra
    luzSol.shadow.camera.bottom = -radioSombra
    luzSol.shadow.camera.near = 1
    luzSol.shadow.camera.far = 460
    luzSol.shadow.bias = -0.0006
    luzSol.shadow.normalBias = 0.035
    luzSol.shadow.camera.updateProjectionMatrix()
    grupo.add(luzSol)
    grupo.add(luzSol.target)
  }

  // -------------------------------------------------------------------------
  // Actualización
  // -------------------------------------------------------------------------
  const _centro = new THREE.Vector3()
  const _m = new THREE.Matrix4()
  const _q = new THREE.Quaternion()
  const _e = new THREE.Euler(0, 0, 0, 'YXZ')
  const _esc = new THREE.Vector3(1, 1, 1)
  const _pos = new THREE.Vector3()
  let anguloCam = 0
  let tiempoAcum = 0

  /**
   * Reencuadra la cámara de sombras alrededor del jugador (~120 m de lado).
   * Se ajusta a la grilla de téxeles para que la sombra no "hierva".
   */
  function actualizarSombras(posicionJugador) {
    if (!luzSol || !posicionJugador) return
    const mapa = luzSol.shadow.mapSize.x || 1024
    const unidad = (radioSombra * 2) / mapa
    const x = Math.round(posicionJugador.x / unidad) * unidad
    const z = Math.round(posicionJugador.z / unidad) * unidad
    const y = posicionJugador.y
    luzSol.target.position.set(x, y, z)
    luzSol.position.set(x, y, z).addScaledVector(dirSol, 175)
    luzSol.target.updateMatrixWorld()
    luzSol.updateMatrixWorld()
  }

  /**
   * @param {number} dt
   * @param {number} tiempo
   * @param {THREE.Vector3|THREE.Camera} [referencia] posición del jugador (o cámara)
   */
  function actualizar(dt, tiempo, referencia) {
    tiempoAcum = tiempo
    const p = referencia && referencia.isCamera ? referencia.position : referencia
    if (p) {
      _centro.set(p.x, 0, p.z)
      grupo.position.set(_centro.x, 0, _centro.z)
      actualizarSombras(p)
      anguloCam = damp(anguloCam, Math.atan2(p.x - _centro.x, p.z - _centro.z), 6, dt)
    }

    // Nubes: derivan alrededor del jugador y siempre miran a cámara (eje Y).
    for (let c = 0; c < nubes.length; c++) {
      const capa = nubes[c]
      for (let i = 0; i < capa.datos.length; i++) {
        const d = capa.datos[i]
        d.angulo += d.velocidad * dt
        const x = Math.cos(d.angulo) * d.radio
        const z = Math.sin(d.angulo) * d.radio
        _pos.set(x, d.altura, z)
        _e.set(0, Math.atan2(x, z), 0)
        _q.setFromEuler(_e)
        _esc.set(d.escala, d.escala, d.escala)
        _m.compose(_pos, _q, _esc)
        capa.inst.setMatrixAt(i, _m)
      }
      capa.inst.instanceMatrix.needsUpdate = true
    }

    // Palpitación suave del halo del sol/luna, encarada siempre a cámara.
    if (sol) {
      sol.grupo.lookAt(grupo.position)
      const pulso = 1 + Math.sin(tiempoAcum * 0.7) * 0.045
      sol.estrella.scale.setScalar(pulso)
      sol.halo.scale.setScalar(1 + Math.sin(tiempoAcum * 1.3) * 0.03)
    }
    if (luna) {
      luna.grupo.lookAt(grupo.position)
      luna.halo.scale.setScalar(1 + Math.sin(tiempoAcum * 0.5) * 0.05)
    }
  }

  function destruir() {
    for (const d of desechables) if (d && d.dispose) d.dispose()
    for (const c of nubes) c.inst.dispose()
    if (grupo.parent) grupo.parent.remove(grupo)
    if (escena.fog) escena.fog = null
  }

  return {
    grupo,
    tema: t,
    domo,
    luzSol,
    luzHemisferio,
    luzAmbiente,
    direccionSol: dirSol,
    actualizar,
    actualizarSombras,
    destruir,
    /** Intensidad global (0..1) para transiciones de la UI. */
    atenuar(f) {
      const k = clamp01(f)
      if (luzSol) luzSol.intensity = t.sol.intensidad * k
      if (luzHemisferio) luzHemisferio.intensity = t.hemisferio.intensidad * k
      matDomo.color.setScalar(k)
    },
  }
}

export default { crearCielo }
