// Teo Kart dentro de la app: el juego vive en src/game/mvp/JuegoTeoKart.jsx y
// acá sólo se le agrega la salida hacia el resto de la aplicación.
import { Link } from 'react-router-dom'
import JuegoTeoKart from '../game/mvp/JuegoTeoKart.jsx'

export default function Kart() {
  return (
    <JuegoTeoKart
      salida={
        <Link to="/login" className="tk__boton tk__boton--sec">
          Volver a la app
        </Link>
      }
    />
  )
}
