// Constantes globales de escala y ritmo. Son la referencia común de todos los
// módulos: cambiar un valor de acá cambia el juego entero de forma coherente.

/** Escala del mundo. 1 unidad de three = 1 metro. */
export const METRO = 1

/** Dimensiones de referencia del kart (con conductor sentado). */
export const KART = {
  largo: 2.05,
  ancho: 1.45,
  alto: 0.72, // altura del chasis sin conductor
  radioRueda: 0.34,
  anchoRueda: 0.26,
  distanciaEjes: 1.35,
  viaDelantera: 1.18,
  viaTrasera: 1.34,
  alturaAsiento: 0.42,
  radioColision: 0.9, // cilindro de colisión en el plano XZ
  masaBase: 220, // kg
}

/** Altura del personaje de pie, en metros (caricatura ~4.5 cabezas). */
export const ALTURA_PERSONAJE = 1.62

/** Velocidades en m/s. 25 m/s ≈ 90 km/h de sensación arcade. */
export const VELOCIDAD = {
  base: 25.5, // tope sin turbo, personaje medio
  marchaAtras: 8,
  turbo: 36, // tope con mini-turbo/hongo
  estrella: 39,
  bala: 52,
  minimaParaDerrapar: 9,
}

/** Ritmo de la carrera. */
export const CARRERA = {
  vueltasPorDefecto: 3,
  corredores: 8, // 4 socios + 4 CPU si faltan humanos
  cuentaAtras: 3.2, // segundos de semáforo
  separacionParrilla: 4.2, // metros entre filas
  anchoParrilla: 3.0, // metros entre columnas
  tiempoRescate: 2.4, // segundos hasta que la grúa te devuelve a la pista
}

/** Parámetros del derrape (mini-turbo escalonado como en la saga). */
export const DERRAPE = {
  umbralNivel1: 0.75, // s de carga para chispa azul
  umbralNivel2: 1.75, // naranja
  umbralNivel3: 3.1, // rosa
  turboNivel: [0, 0.65, 1.15, 1.9], // segundos de turbo por nivel
  fuerzaNivel: [0, 1, 1.18, 1.4],
  anguloMax: 0.62, // radianes de contraderrape
}

/** Física general. */
export const FISICA = {
  gravedad: 26, // m/s² (arcade: más pesado que la realidad)
  gravedadCaida: 34, // al caer, para que no flote
  fuerzaSalto: 6.2,
  agarreAsfalto: 1,
  agarreBordillo: 0.94,
  agarreCesped: 0.62,
  agarreTierra: 0.72,
  agarreArena: 0.55,
  frenoMotor: 0.55,
  alturaSuspension: 0.28,
  rigidezSuspension: 190,
  amortiguacion: 22,
}

/** Multiplicadores de velocidad máxima según la superficie. */
export const PENALIZACION_SUPERFICIE = {
  asfalto: 1,
  bordillo: 0.985,
  turbo: 1,
  rampa: 1,
  cesped: 0.62,
  tierra: 0.74,
  arena: 0.55,
  agua: 0.45,
  lava: 0.5,
  vacio: 1,
}

/** Cámara de persecución. */
export const CAMARA = {
  distancia: 6.4,
  altura: 2.55,
  miraAltura: 1.15,
  fovBase: 62,
  fovTurbo: 78,
  suavizadoPos: 7.5,
  suavizadoMira: 11,
  distanciaAtras: 6.0,
}

/** Longitud objetivo de una vuelta, en metros. */
export const LARGO_VUELTA_OBJETIVO = 1450

/** Semiancho típico de la calzada. */
export const ANCHO_PISTA = { min: 7.5, normal: 11, max: 15 }

export default {
  KART,
  VELOCIDAD,
  CARRERA,
  DERRAPE,
  FISICA,
  CAMARA,
  PENALIZACION_SUPERFICIE,
  ANCHO_PISTA,
}
