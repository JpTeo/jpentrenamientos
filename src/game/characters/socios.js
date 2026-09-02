// Los cuatro socios de la cooperativa: identidad, look y estadísticas.
//
// El aspecto está calcado de las fotos reales del equipo. El modelo 3D se
// genera de forma paramétrica a partir del bloque `aspecto`, así que para
// afinar el parecido alcanza con tocar estos valores (no la geometría).
//
// Estilos de pelo: 'corto' | 'rapado' | 'ondulado' | 'largo' | 'rodete' |
//   'crespo' | 'flequillo' | 'colaDeCaballo' | 'entradas'
// Barbas: 'ninguna' | 'candado' | 'corta' | 'tupida' | 'bigote' | 'sombra'
// Accesorios: 'gorra' | 'lentes' | 'lentesSol' | 'vincha' | 'aros' | 'bufanda'
//
// Los cuatro usan la remera negra de la cooperativa (logo "teo" en el pecho);
// el color de firma de cada uno vive en el kart, el casco y los detalles.
import { COLORES_PERSONAJE } from '../assets/paleta.js'

/** Remera negra oficial de la cooperativa. */
export const REMERA_COOPE = 0x17171d
export const LOGO_COOPE = 'teo'

export const SOCIOS = [
  {
    id: 'jp',
    nombre: 'Jp',
    nombreCompleto: 'Juan Pablo Palacios',
    lema: '¡Vamos que se puede!',
    colores: COLORES_PERSONAJE.jp,
    kart: { nombre: 'Fuego Cooperativo', chasis: 'estandar', rueda: 'estandar', aleron: 'medio' },
    // Peso medio-alto: rápido en recta, algo duro de girar.
    estadisticas: { velocidad: 4, aceleracion: 3, peso: 4, manejo: 3, traccion: 3 },
    aspecto: {
      altura: 1.02,
      complexion: 1.04,
      // Piel bronceada, cara larga y sonrisa muy marcada (dientes visibles).
      piel: 0xd9a578,
      pelo: { color: 0x5a3a22, estilo: 'ondulado', largo: 0.58, volumen: 1.25, raya: 'media' },
      vello: { barba: 'corta', color: 0x452a18, densidad: 0.85, bigote: true },
      ojos: { color: 0x53381f, tamano: 1.0, separacion: 1.0 },
      cejas: { grosor: 1.15, angulo: 0.08, color: 0x3d2515 },
      boca: { sonrisa: 1.25, dientes: true },
      accesorios: [],
      ropa: { remera: REMERA_COOPE, detalle: 0xe8402a, pantalon: 0x232838, logo: LOGO_COOPE },
      casco: { color: 0xe8402a, visor: 0x1b2c3a, franja: 0xffcc00 },
    },
  },
  {
    id: 'male',
    nombre: 'Male',
    nombreCompleto: 'Malena Romero',
    lema: 'Con curva y sin miedo.',
    colores: COLORES_PERSONAJE.male,
    kart: { nombre: 'Rosa Turbo', chasis: 'deportivo', rueda: 'slick', aleron: 'alto' },
    // Liviana y muy ágil: acelera y gira mejor que nadie.
    estadisticas: { velocidad: 3, aceleracion: 5, peso: 2, manejo: 5, traccion: 4 },
    aspecto: {
      altura: 0.95,
      complexion: 0.9,
      // Piel clara, pelo castaño caoba largo recogido en cola, con mechones
      // sueltos enmarcando la cara.
      piel: 0xf0cba8,
      pelo: {
        color: 0x6b3a24,
        estilo: 'colaDeCaballo',
        largo: 0.95,
        volumen: 1.05,
        raya: 'media',
        mechones: true,
      },
      vello: { barba: 'ninguna' },
      ojos: { color: 0x6b4a2e, tamano: 1.1, separacion: 1.0, pestanas: true },
      cejas: { grosor: 0.95, angulo: 0.05, color: 0x4a2a18 },
      boca: { sonrisa: 0.85, dientes: false, labial: 0xc4626c },
      accesorios: ['aros'],
      ropa: { remera: REMERA_COOPE, detalle: 0xff6fae, pantalon: 0x2f2a3c, logo: LOGO_COOPE },
      casco: { color: 0xff6fae, visor: 0x3a2438, franja: 0x7b2ff7 },
    },
  },
  {
    id: 'keke',
    nombre: 'Keke',
    nombreCompleto: 'Ezequiel Leiter',
    lema: 'Tranqui, los paso a todos.',
    colores: COLORES_PERSONAJE.keke,
    kart: { nombre: 'Celeste Relámpago', chasis: 'clasico', rueda: 'ancha', aleron: 'bajo' },
    // Equilibrado, el todoterreno del grupo.
    estadisticas: { velocidad: 4, aceleracion: 4, peso: 3, manejo: 4, traccion: 3 },
    aspecto: {
      altura: 1.0,
      complexion: 1.02,
      // Pelo negro corto con onda, barba oscura corta y cerrada.
      piel: 0xe3b087,
      pelo: { color: 0x241a14, estilo: 'ondulado', largo: 0.34, volumen: 1.1, raya: 'lado' },
      vello: { barba: 'tupida', color: 0x1f1710, densidad: 1.0, bigote: true },
      ojos: { color: 0x3a2c20, tamano: 1.0, separacion: 1.02 },
      cejas: { grosor: 1.3, angulo: 0.12, color: 0x1f1710 },
      boca: { sonrisa: 1.0, dientes: true },
      accesorios: [],
      ropa: { remera: REMERA_COOPE, detalle: 0x2fb8ff, pantalon: 0x1f2a38, logo: LOGO_COOPE },
      casco: { color: 0x2fb8ff, visor: 0x123246, franja: 0xffffff },
    },
  },
  {
    id: 'mati',
    nombre: 'Mati',
    nombreCompleto: 'Matías Goffi',
    lema: 'Tracción total, siempre.',
    colores: COLORES_PERSONAJE.mati,
    kart: { nombre: 'Verde Montaña', chasis: 'todoterreno', rueda: 'taco', aleron: 'medio' },
    // Pesado: aguanta empujones y no pierde agarre fuera del asfalto.
    estadisticas: { velocidad: 5, aceleracion: 2, peso: 5, manejo: 2, traccion: 5 },
    aspecto: {
      altura: 1.03,
      complexion: 0.94,
      // Piel clara, pelo muy corto con entradas marcadas, perilla y anteojos
      // de marco negro rectangular: su rasgo más reconocible.
      piel: 0xf2cba6,
      pelo: { color: 0x3a2a1e, estilo: 'entradas', largo: 0.12, volumen: 0.8, raya: 'ninguna' },
      vello: { barba: 'candado', color: 0x4a3524, densidad: 0.8, bigote: true },
      ojos: { color: 0x4a5a52, tamano: 1.0, separacion: 1.0 },
      cejas: { grosor: 1.05, angulo: 0.06, color: 0x3a2a1e },
      boca: { sonrisa: 0.9, dientes: false },
      accesorios: ['lentes'],
      lentes: { marco: 0x14141a, forma: 'rectangular', grosor: 1.15, cristal: 0xdff0ff },
      ropa: { remera: REMERA_COOPE, detalle: 0x3dcf6a, pantalon: 0x24352b, logo: LOGO_COOPE },
      casco: { color: 0x3dcf6a, visor: 0x1c3a28, franja: 0xffe066 },
    },
  },
]

export const SOCIOS_POR_ID = Object.fromEntries(SOCIOS.map((s) => [s.id, s]))
export const IDS_SOCIOS = SOCIOS.map((s) => s.id)

export function socio(id) {
  return SOCIOS_POR_ID[id] || SOCIOS[0]
}

export default SOCIOS
