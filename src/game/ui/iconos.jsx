// Íconos del juego dibujados a mano en SVG: nada de imágenes ni fuentes de
// íconos. Todos comparten el lienzo 0 0 64 64 y el contorno grueso oscuro
// que le da el aire de caricatura al HUD.

import { NOMBRE_ITEM } from './itemsUI.js'

const TINTA = '#0d0b16'

const trazo = { stroke: TINTA, strokeWidth: 3, strokeLinejoin: 'round', strokeLinecap: 'round' }
const trazoFino = { stroke: TINTA, strokeWidth: 2, strokeLinejoin: 'round', strokeLinecap: 'round' }

/* --- Piezas reutilizables ------------------------------------------------ */

function Caparazon({ color, x = 0, y = 0, k = 1 }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${k})`}>
      <ellipse cx="32" cy="41" rx="26" ry="16" fill="#fff6de" {...trazo} />
      <path d="M6 41a26 25 0 0 1 52 0Z" fill={color} {...trazo} />
      <path d="M20 41a12 12 0 0 1 24 0Z" fill="rgba(0,0,0,.22)" stroke="none" />
      <ellipse cx="21" cy="27" rx="7" ry="4" fill="#ffffff" opacity="0.55" transform="rotate(-22 21 27)" />
      <path d="M6 41h52" {...trazo} />
    </g>
  )
}

function Hongo({ x = 0, y = 0, k = 1 }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${k})`}>
      <path d="M23 36h18v10a9 8 0 0 1-18 0Z" fill="#fff2d0" {...trazo} />
      <circle cx="28" cy="43" r="2.2" fill={TINTA} stroke="none" />
      <circle cx="36" cy="43" r="2.2" fill={TINTA} stroke="none" />
      <path d="M7 37a25 23 0 0 1 50 0Z" fill="#ff5a5a" {...trazo} />
      <circle cx="32" cy="21" r="7" fill="#fff6de" {...trazoFino} />
      <circle cx="15" cy="32" r="4.5" fill="#fff6de" {...trazoFino} />
      <circle cx="49" cy="32" r="4.5" fill="#fff6de" {...trazoFino} />
    </g>
  )
}

/* --- Íconos de ítem ------------------------------------------------------ */

function DibujoBanana() {
  return (
    <g>
      <path
        d="M13 12c-2 20 8 36 30 38 6 1 9-3 8-7-1-3-5-3-9-4C25 35 21 24 22 12c0-3-3-5-5-4s-3 2-4 4Z"
        fill="#ffd400"
        {...trazo}
      />
      <path d="M14 11c-1 18 7 32 26 35" stroke="#ffe97a" strokeWidth="3" fill="none" strokeLinecap="round" />
      <path d="M13 12c0-3 4-5 6-3" stroke="#8a5a2c" strokeWidth="5" fill="none" strokeLinecap="round" />
      <path d="M50 43c3 0 4 2 3 4" stroke="#8a5a2c" strokeWidth="4" fill="none" strokeLinecap="round" />
    </g>
  )
}

function DibujoTriple() {
  return (
    <g>
      <Caparazon color="#ff3b30" x={2} y={26} k={0.46} />
      <Caparazon color="#ff3b30" x={30} y={26} k={0.46} />
      <Caparazon color="#ff3b30" x={16} y={2} k={0.52} />
    </g>
  )
}

function DibujoHongoTriple() {
  return (
    <g>
      <Hongo x={1} y={24} k={0.48} />
      <Hongo x={31} y={24} k={0.48} />
      <Hongo x={16} y={1} k={0.52} />
    </g>
  )
}

function DibujoRayo() {
  return (
    <g>
      <path d="M38 3 12 35h14l-5 26 27-35H33l8-23Z" fill="#fff05a" {...trazo} />
      <path d="M35 10 20 32h11" stroke="#fffbcf" strokeWidth="3" fill="none" strokeLinecap="round" />
    </g>
  )
}

function DibujoEstrella() {
  return (
    <g>
      <path
        d="M32 3 39.4 21.9 58.6 23.4 43.9 35.9 48.5 54.7 32 44.5 15.5 54.7 20.1 35.9 5.4 23.4 24.7 21.9Z"
        fill="#ffe83d"
        {...trazo}
      />
      <ellipse cx="25" cy="28" rx="3" ry="4" fill={TINTA} stroke="none" />
      <ellipse cx="39" cy="28" rx="3" ry="4" fill={TINTA} stroke="none" />
      <path d="M25 36q7 6 14 0" stroke={TINTA} strokeWidth="3" fill="none" strokeLinecap="round" />
    </g>
  )
}

function DibujoBomba() {
  return (
    <g>
      <path d="M40 20c6-6 5-12 2-15" stroke="#b98a4a" strokeWidth="5" fill="none" strokeLinecap="round" />
      <circle cx="32" cy="38" r="21" fill="#2b2b33" {...trazo} />
      <path d="M36 17h8v7h-8Z" fill="#5a5a68" {...trazo} />
      <ellipse cx="24" cy="30" rx="6" ry="4" fill="#ffffff" opacity="0.35" transform="rotate(-30 24 30)" />
      <circle cx="26" cy="38" r="4" fill="#fff6de" {...trazoFino} />
      <circle cx="38" cy="38" r="4" fill="#fff6de" {...trazoFino} />
      <circle cx="26.5" cy="38.5" r="1.8" fill={TINTA} stroke="none" />
      <circle cx="38.5" cy="38.5" r="1.8" fill={TINTA} stroke="none" />
      <path d="M44 4 47 9l5-2-2 5 5 3-5 2 2 5-5-2-3 5-3-5-5 2 2-5-5-3 5-2-2-5 5 2Z" fill="#ff8a00" {...trazoFino} />
    </g>
  )
}

function DibujoBala() {
  return (
    <g>
      <path d="M14 18h20a16 14 0 0 1 0 28H14a4 4 0 0 1-4-4V22a4 4 0 0 1 4-4Z" fill="#3a3a44" {...trazo} />
      <path d="M4 26h8v12H4Z" fill="#3a3a44" {...trazo} />
      <ellipse cx="24" cy="25" rx="9" ry="3.5" fill="#ffffff" opacity="0.3" />
      <circle cx="34" cy="29" r="5" fill="#fff6de" {...trazoFino} />
      <circle cx="34" cy="41" r="5" fill="#fff6de" {...trazoFino} />
      <circle cx="35" cy="29.5" r="2.3" fill={TINTA} stroke="none" />
      <circle cx="35" cy="40.5" r="2.3" fill={TINTA} stroke="none" />
      <path d="M46 32h10M48 24l8-4M48 40l8 4" stroke="#f0f0f0" strokeWidth="3" strokeLinecap="round" fill="none" />
    </g>
  )
}

function DibujoMonedas() {
  return (
    <g>
      <ellipse cx="24" cy="42" rx="16" ry="16" fill="#c79200" {...trazo} />
      <ellipse cx="24" cy="42" rx="9" ry="10" fill="#ffe07a" {...trazoFino} />
      <ellipse cx="38" cy="26" rx="18" ry="18" fill="#ffc90e" {...trazo} />
      <ellipse cx="38" cy="26" rx="10" ry="11.5" fill="#fff3b0" {...trazoFino} />
      <ellipse cx="32" cy="17" rx="4" ry="2.5" fill="#ffffff" opacity="0.7" transform="rotate(-30 32 17)" />
    </g>
  )
}

const DIBUJOS = {
  banana: DibujoBanana,
  caparazonVerde: () => <Caparazon color="#2ecc40" />,
  caparazonRojo: () => <Caparazon color="#ff3b30" />,
  triple: DibujoTriple,
  hongo: () => <Hongo />,
  hongoTriple: DibujoHongoTriple,
  rayo: DibujoRayo,
  estrella: DibujoEstrella,
  bomba: DibujoBomba,
  bala: DibujoBala,
  monedas: DibujoMonedas,
}

/**
 * Ícono de un ítem. Si el id no existe devuelve `null` para que el que llama
 * pueda dibujar la caja vacía.
 */
export function IconoItem({ item = null, titulo = null }) {
  const Dibujo = item ? DIBUJOS[item] : null
  if (!Dibujo) return null
  const etiqueta = titulo || NOMBRE_ITEM[item] || 'Ítem'
  return (
    <svg viewBox="0 0 64 64" role="img" aria-label={etiqueta} focusable="false">
      <title>{etiqueta}</title>
      <Dibujo />
    </svg>
  )
}

/** Kart de perfil, para la pantalla de carga y los remates decorativos. */
export function IconoKart({ color = '#e8402a' }) {
  return (
    <svg viewBox="0 0 96 56" role="img" aria-label="Kart" focusable="false">
      <title>Kart</title>
      {/* Casco y cabeza del piloto */}
      <circle cx="50" cy="17" r="10" fill={color} {...trazo} />
      <path d="M42 17a8 8 0 0 1 16 0Z" fill="#fff6de" stroke="none" opacity="0.25" />
      <path d="M52 13h8v7h-8Z" fill="#1b2c3a" {...trazoFino} />
      {/* Chasis */}
      <path d="M10 40h6l6-11h44l8 11h12v6H10Z" fill={color} {...trazo} />
      <path d="M28 29h26l5 11H24Z" fill="#2c2742" stroke="none" opacity="0.45" />
      {/* Alerón */}
      <path d="M70 22h16v6H70Z" fill="#ffcc00" {...trazo} />
      <path d="M76 28v6" {...trazo} />
      {/* Ruedas */}
      <circle cx="24" cy="45" r="10" fill="#1d1a2c" {...trazo} />
      <circle cx="24" cy="45" r="4" fill="#8d87a8" stroke="none" />
      <circle cx="72" cy="45" r="10" fill="#1d1a2c" {...trazo} />
      <circle cx="72" cy="45" r="4" fill="#8d87a8" stroke="none" />
    </svg>
  )
}

/** Moneda suelta, para el contador del HUD. */
export function IconoMoneda() {
  return (
    <svg viewBox="0 0 64 64" width="22" height="22" role="img" aria-label="Monedas" focusable="false">
      <title>Monedas</title>
      <ellipse cx="32" cy="32" rx="22" ry="24" fill="#ffc90e" {...trazo} />
      <ellipse cx="32" cy="32" rx="12" ry="15" fill="#fff3b0" {...trazoFino} />
      <ellipse cx="25" cy="19" rx="5" ry="3" fill="#ffffff" opacity="0.75" transform="rotate(-30 25 19)" />
    </svg>
  )
}
