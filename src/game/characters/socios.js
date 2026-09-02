// Los cuatro socios de la cooperativa: identidad, look y estadísticas.
//
// AJUSTE CON FOTOS
// ----------------
// El modelo 3D de cada socio se genera de forma paramétrica a partir del
// bloque `aspecto`. Para que se parezca más a la foto real sólo hay que tocar
// estos valores (no hace falta editar la geometría):
//   piel, pelo.color, pelo.estilo, pelo.largo, vello.barba, ojos.color,
//   cejas, accesorios, altura, complexion.
// Estilos de pelo disponibles: 'corto' | 'rapado' | 'ondulado' | 'largo' |
//   'rodete' | 'crespo' | 'flequillo' | 'colaDeCaballo'
// Barbas: 'ninguna' | 'candado' | 'corta' | 'tupida' | 'bigote' | 'sombra'
// Accesorios: 'gorra' | 'lentes' | 'lentesSol' | 'vincha' | 'aros' | 'bufanda'
import { COLORES_PERSONAJE } from '../assets/paleta.js'

export const SOCIOS = [
  {
    id: 'jp',
    nombre: 'Jp',
    nombreCompleto: 'Juan Pablo',
    lema: '¡Vamos que se puede!',
    colores: COLORES_PERSONAJE.jp,
    kart: {
      nombre: 'Fuego Cooperativo',
      chasis: 'estandar',
      rueda: 'estandar',
      alerón: 'medio',
    },
    // Peso pesado moderado: rápido en recta, algo duro de girar.
    estadisticas: { velocidad: 4, aceleracion: 3, peso: 4, manejo: 3, traccion: 3 },
    aspecto: {
      altura: 1.0,
      complexion: 1.05,
      piel: 0xe8b48c,
      pelo: { color: 0x2f2018, estilo: 'corto', largo: 0.35 },
      vello: { barba: 'candado', color: 0x2a1a12 },
      ojos: { color: 0x4a3524, tamano: 1 },
      cejas: { grosor: 1.15, angulo: 0.1 },
      accesorios: ['gorra'],
      ropa: { remera: 0xe8402a, detalle: 0xffcc00, pantalon: 0x2b3346 },
      gorra: { color: 0xe8402a, visera: 0x1b1b22, letra: 'JP' },
    },
  },
  {
    id: 'male',
    nombre: 'Male',
    nombreCompleto: 'Malena',
    lema: 'Con curva y sin miedo.',
    colores: COLORES_PERSONAJE.male,
    kart: {
      nombre: 'Rosa Turbo',
      chasis: 'deportivo',
      rueda: 'slick',
      alerón: 'alto',
    },
    // Liviana y muy ágil: acelera y gira mejor que nadie.
    estadisticas: { velocidad: 3, aceleracion: 5, peso: 2, manejo: 5, traccion: 4 },
    aspecto: {
      altura: 0.95,
      complexion: 0.92,
      piel: 0xf0c4a0,
      pelo: { color: 0x4a2c17, estilo: 'ondulado', largo: 0.95 },
      vello: { barba: 'ninguna' },
      ojos: { color: 0x3c6e4f, tamano: 1.08 },
      cejas: { grosor: 0.9, angulo: 0.06 },
      accesorios: ['aros', 'lentesSol'],
      ropa: { remera: 0xff6fae, detalle: 0x7b2ff7, pantalon: 0x3a2a4a },
    },
  },
  {
    id: 'keke',
    nombre: 'Keke',
    nombreCompleto: 'Keke',
    lema: 'Tranqui, los paso a todos.',
    colores: COLORES_PERSONAJE.keke,
    kart: {
      nombre: 'Celeste Relámpago',
      chasis: 'clasico',
      rueda: 'ancha',
      alerón: 'bajo',
    },
    // Equilibrado, el todoterreno del grupo.
    estadisticas: { velocidad: 4, aceleracion: 4, peso: 3, manejo: 4, traccion: 3 },
    aspecto: {
      altura: 1.02,
      complexion: 1.0,
      piel: 0xdda87c,
      pelo: { color: 0x1b1410, estilo: 'crespo', largo: 0.5 },
      vello: { barba: 'corta', color: 0x1b1410 },
      ojos: { color: 0x2f2a25, tamano: 1 },
      cejas: { grosor: 1.2, angulo: 0.14 },
      accesorios: ['lentes'],
      ropa: { remera: 0x2fb8ff, detalle: 0xffffff, pantalon: 0x1f2a38 },
    },
  },
  {
    id: 'mati',
    nombre: 'Mati',
    nombreCompleto: 'Matías',
    lema: 'Traccion total, siempre.',
    colores: COLORES_PERSONAJE.mati,
    kart: {
      nombre: 'Verde Montaña',
      chasis: 'todoterreno',
      rueda: 'taco',
      alerón: 'medio',
    },
    // Pesado: aguanta empujones y no pierde agarre fuera del asfalto.
    estadisticas: { velocidad: 5, aceleracion: 2, peso: 5, manejo: 2, traccion: 5 },
    aspecto: {
      altura: 1.06,
      complexion: 1.12,
      piel: 0xf2c9a4,
      pelo: { color: 0x8a5a2c, estilo: 'flequillo', largo: 0.45 },
      vello: { barba: 'tupida', color: 0x7a4a22 },
      ojos: { color: 0x4d7ea8, tamano: 0.98 },
      cejas: { grosor: 1.3, angulo: 0.05 },
      accesorios: ['vincha'],
      ropa: { remera: 0x3dcf6a, detalle: 0xffe066, pantalon: 0x24352b },
    },
  },
]

export const SOCIOS_POR_ID = Object.fromEntries(SOCIOS.map((s) => [s.id, s]))
export const IDS_SOCIOS = SOCIOS.map((s) => s.id)

export function socio(id) {
  return SOCIOS_POR_ID[id] || SOCIOS[0]
}

export default SOCIOS
