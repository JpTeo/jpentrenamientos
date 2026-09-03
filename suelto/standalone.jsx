// Punto de entrada de la versión suelta de Teo Kart: monta el juego solo, sin
// router, sin Firebase y sin el resto de la app. Se empaqueta en un único
// archivo HTML con `node tools/empaquetar.mjs`.
import { createRoot } from 'react-dom/client'
import JuegoTeoKart from '../src/game/mvp/JuegoTeoKart.jsx'

createRoot(document.getElementById('root')).render(<JuegoTeoKart />)
