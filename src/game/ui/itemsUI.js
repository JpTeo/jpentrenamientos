// Tablas de datos de los ítems para la interfaz. Viven en un módulo aparte
// (sin JSX) para no romper el refresco rápido de los componentes.

/** Orden canónico de los 11 ítems (el mismo que usa la ruleta). */
export const ORDEN_ITEMS_UI = [
  'banana',
  'caparazonVerde',
  'caparazonRojo',
  'triple',
  'hongo',
  'hongoTriple',
  'rayo',
  'estrella',
  'bomba',
  'bala',
  'monedas',
]

/** Nombre visible de cada ítem, para `aria-label` y para el lobby. */
export const NOMBRE_ITEM = {
  banana: 'Banana',
  caparazonVerde: 'Caparazón verde',
  caparazonRojo: 'Caparazón rojo',
  triple: 'Caparazones triples',
  hongo: 'Hongo',
  hongoTriple: 'Hongo triple',
  rayo: 'Rayo',
  estrella: 'Estrella',
  bomba: 'Bomba',
  bala: 'Bala',
  monedas: 'Monedas',
}

/** Color CSS de cada ítem (espejo de COLORES_ITEM de la paleta). */
export const COLOR_ITEM_UI = {
  banana: '#ffd400',
  caparazonVerde: '#2ecc40',
  caparazonRojo: '#ff3b30',
  triple: '#ff3b30',
  hongo: '#ff5a5a',
  hongoTriple: '#ff5a5a',
  rayo: '#fff05a',
  estrella: '#ffe83d',
  bomba: '#2b2b33',
  bala: '#f0f0f0',
  monedas: '#ffc90e',
}
