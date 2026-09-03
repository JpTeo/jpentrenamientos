// Teo Kart — pantalla única del juego: elegís personaje, corrés y ves el
// resultado. Todo el 3D vive fuera de React; acá sólo se monta el lienzo y se
// dibuja la interfaz a partir del resumen que publica la carrera.
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { MARCA } from '../game/marca.js'
import { SOCIOS } from '../game/characters/socios.js'
import { Carrera, FASE } from '../game/mvp/carrera.js'
import { META_PISTA } from '../game/mvp/pista.js'
import '../game/mvp/juego.css'

const ESTADISTICAS = [
  ['Velocidad', 'velocidad'],
  ['Aceleración', 'aceleracion'],
  ['Peso', 'peso'],
  ['Manejo', 'manejo'],
  ['Tracción', 'traccion'],
]

const TEXTO_AVISO = {
  vuelta: '¡VUELTA NUEVA!',
  ultimaVuelta: '¡ÚLTIMA VUELTA!',
  turboLargada: '¡LARGADA PERFECTA!',
  largadaQuemada: 'TE PASASTE DE VUELTAS',
  adelantaste: '¡LO PASASTE!',
  tePasaron: '¡TE PASARON!',
}

export default function Kart() {
  const [pantalla, setPantalla] = useState('menu') // menu | carrera | fin
  const [personaje, setPersonaje] = useState('jp')
  const [hud, setHud] = useState(null)
  const contenedor = useRef(null)
  const carrera = useRef(null)

  // --- Ciclo de vida de la carrera -----------------------------------------
  useEffect(() => {
    if (pantalla !== 'carrera' || !contenedor.current) return
    const c = new Carrera(contenedor.current, { personaje })
    carrera.current = c
    let vivo = true
    const refrescar = () => {
      if (!vivo) return
      setHud(c.estadoHUD())
      requestAnimationFrame(refrescar)
    }
    refrescar()
    return () => {
      vivo = false
      c.destruir()
      carrera.current = null
    }
  }, [pantalla, personaje])

  // Cuando el jugador cruza la meta, mostramos el resultado tras unos segundos.
  useEffect(() => {
    if (pantalla !== 'carrera' || !hud || hud.fase !== FASE.FIN) return
    const t = setTimeout(() => setPantalla('fin'), 3500)
    return () => clearTimeout(t)
  }, [pantalla, hud])

  const volver = useCallback(() => {
    setHud(null)
    setPantalla('menu')
  }, [])

  if (pantalla === 'menu') {
    return <Menu personaje={personaje} elegir={setPersonaje} jugar={() => setPantalla('carrera')} />
  }

  return (
    <div className="tk">
      <div className="tk__lienzo" ref={contenedor} />
      {pantalla === 'carrera' && hud && <Hud e={hud} />}
      {pantalla === 'carrera' && (
        <button className="tk__boton tk__boton--sec tk__salir" onClick={volver}>
          Salir
        </button>
      )}
      {pantalla === 'fin' && hud && (
        <Resultados
          e={hud}
          revancha={() => {
            setHud(null)
            setPantalla('menu')
            setTimeout(() => setPantalla('carrera'), 30)
          }}
          volver={volver}
        />
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------

function Menu({ personaje, elegir, jugar }) {
  return (
    <div className="tk">
      <div className="tk__capa">
        <h1 className="tk__logo">{MARCA.nombre}</h1>
        <p className="tk__bajada">{MARCA.subtitulo} · {META_PISTA.nombre}</p>

        <div className="tk__socios">
          {SOCIOS.map((s) => {
            const color = `#${s.colores.principal.toString(16).padStart(6, '0')}`
            const activo = s.id === personaje
            return (
              <button
                key={s.id}
                className="tk__socio"
                style={{ '--color': color }}
                aria-pressed={activo}
                onClick={() => elegir(s.id)}
              >
                <div className="tk__socioAvatar">{s.nombre[0]}</div>
                <p className="tk__socioNombre">{s.nombre}</p>
                <p className="tk__socioReal">{s.nombreCompleto}</p>
                {ESTADISTICAS.map(([etiqueta, clave]) => (
                  <div className="tk__barra" key={clave}>
                    <span>{etiqueta}</span>
                    <div className="tk__barraCanal">
                      <div
                        className="tk__barraRelleno"
                        style={{ width: `${(s.estadisticas[clave] / 5) * 100}%` }}
                      />
                    </div>
                  </div>
                ))}
              </button>
            )
          })}
        </div>

        <button className="tk__boton" onClick={jugar}>
          ¡A correr!
        </button>

        <p className="tk__ayuda">
          <kbd>↑</kbd> acelerar · <kbd>↓</kbd> frenar · <kbd>←</kbd> <kbd>→</kbd> doblar ·{' '}
          <kbd>Espacio</kbd> derrapar · <kbd>C</kbd> mirar atrás
          <br />
          Mantené el derrape en las curvas: cuando las chispas pasan de azul a naranja y a rosa,
          soltá para llevarte el mini-turbo.
        </p>
        <Link to="/login" className="tk__boton tk__boton--sec">
          Volver a la app
        </Link>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------

const COLOR_DERRAPE = ['transparent', '#4fc3ff', '#ffa726', '#ff5ce1']

function Hud({ e }) {
  const aviso = e.avisos.length ? e.avisos[e.avisos.length - 1] : null
  const avisoFresco = aviso && e.tiempoTotal / 1000 - aviso.t < 1.8 ? aviso : null

  return (
    <div className="tk__hud">
      <div className="tk__panel tk__vueltas">
        VUELTA <b>{e.vuelta}</b>/{e.vueltas}
      </div>

      <div className="tk__panel tk__tiempos">
        <b>{e.textoTotal}</b>
        <br />
        vuelta {e.textoVuelta}
        <br />
        mejor {e.mejorVuelta}
      </div>

      <div className="tk__panel tk__tabla">
        {e.tabla.map((c) => (
          <div key={c.id} className={`tk__fila${c.esJugador ? ' tk__fila--yo' : ''}`}>
            <span style={{ width: '1.1rem' }}>{c.puesto}</span>
            <span className="tk__pip" style={{ background: c.color }} />
            <span>{c.nombre}</span>
          </div>
        ))}
      </div>

      <Minimapa trazado={e.trazado} puntos={e.minimapa} />

      <div className="tk__puesto">
        <span className="tk__puestoNum">{e.puesto}</span>
        <span className="tk__puestoOrd">º</span>
      </div>

      <div className="tk__panel tk__velocimetro">
        <div className={`tk__kmh${e.turbo ? ' turbo' : ''}`}>
          {e.velocidad}
          <small>km/h</small>
        </div>
        <div className="tk__derrape">
          <div
            className="tk__derrapeRelleno"
            style={{
              width: `${(e.derrape / 3) * 100}%`,
              background: COLOR_DERRAPE[e.derrape] || 'transparent',
            }}
          />
        </div>
      </div>

      {e.fase === FASE.CUENTA && (
        <div className="tk__cuenta" key={e.cuenta}>
          {e.cuenta > 0 ? e.cuenta : '¡YA!'}
        </div>
      )}

      {e.sentidoContrario && <div className="tk__aviso">¡SENTIDO CONTRARIO!</div>}
      {!e.sentidoContrario && avisoFresco && TEXTO_AVISO[avisoFresco.tipo] && (
        <div className="tk__aviso" key={avisoFresco.id}>
          {TEXTO_AVISO[avisoFresco.tipo]}
        </div>
      )}
    </div>
  )
}

function Minimapa({ trazado, puntos }) {
  if (!trazado || !trazado.length) return null
  const d = trazado.map((p, i) => `${i ? 'L' : 'M'}${(p.x * 100).toFixed(1)} ${(p.z * 100).toFixed(1)}`).join(' ')
  const en = (t) => {
    const i = Math.min(trazado.length - 1, Math.max(0, Math.floor(t * trazado.length)))
    return trazado[i]
  }
  return (
    <div className="tk__panel tk__minimapa">
      <svg viewBox="-8 -8 116 116" width="100%" height="100%" aria-label="Minimapa del circuito">
        <path d={`${d} Z`} fill="none" stroke="rgba(255,255,255,.35)" strokeWidth="9" strokeLinejoin="round" />
        <path d={`${d} Z`} fill="none" stroke="#3a3a48" strokeWidth="6" strokeLinejoin="round" />
        {puntos.map((p) => {
          const pos = en(p.t)
          return (
            <circle
              key={p.id}
              cx={pos.x * 100}
              cy={pos.z * 100}
              r={p.esJugador ? 6 : 4.5}
              fill={p.color}
              stroke="#14121f"
              strokeWidth={p.esJugador ? 3 : 2}
            />
          )
        })}
      </svg>
    </div>
  )
}

// ---------------------------------------------------------------------------

function Resultados({ e, revancha, volver }) {
  const yo = e.tabla.find((c) => c.esJugador)
  const titulo =
    yo.puesto === 1 ? '¡GANASTE!' : yo.puesto === e.total ? 'Último…' : `${yo.puesto}º puesto`

  return (
    <div className="tk__capa tk__resultados">
      <h1 className="tk__logo" style={{ fontSize: 'clamp(2.4rem, 8vw, 4.6rem)' }}>
        {titulo}
      </h1>
      <div className="tk__podio">
        {e.tabla.map((c) => (
          <div key={c.id} className={`tk__resFila${c.esJugador ? ' tk__resFila--yo' : ''}`}>
            <span className="tk__resPuesto">{c.puesto}º</span>
            <span className="tk__pip" style={{ background: c.color }} />
            <span>{c.nombre}</span>
            <span className="tk__resTiempo">{c.tiempo || 'no terminó'}</span>
          </div>
        ))}
      </div>
      <p className="tk__bajada">Mejor vuelta: {e.mejorVuelta}</p>
      <div style={{ display: 'flex', gap: '0.8rem', flexWrap: 'wrap', justifyContent: 'center' }}>
        <button className="tk__boton" onClick={revancha}>
          Revancha
        </button>
        <button className="tk__boton tk__boton--sec" onClick={volver}>
          Cambiar personaje
        </button>
      </div>
    </div>
  )
}
