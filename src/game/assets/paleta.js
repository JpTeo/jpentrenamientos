// Paleta global del juego. Colores saturados y alegres, estilo kart arcade.
// Todos los valores son enteros hexadecimales listos para THREE.Color.

export const PALETA = {
  // Marca / UI
  marcaPrimario: 0xff3b30,
  marcaSecundario: 0xffcc00,
  marcaTerciario: 0x1e88ff,
  marcaVerde: 0x2ecc40,
  tinta: 0x14121f,
  papel: 0xfff8e7,

  // Cielo / atmósfera
  cieloDia: 0x63c6ff,
  cieloCenit: 0x1f6fd0,
  cieloHorizonte: 0xcdefff,
  cieloAtardecer: 0xff8a4c,
  cieloVolcan: 0x2a0f14,
  cenitVolcan: 0x0b0409,
  horizonteVolcan: 0xff5a1f,
  nube: 0xffffff,
  niebla: 0xbfe6ff,
  nieblaVolcan: 0x3a1410,

  // Superficies de pista
  asfalto: 0x4a4a58,
  asfaltoClaro: 0x5d5d6d,
  asfaltoOscuro: 0x33333f,
  bordeRojo: 0xe8402a,
  bordeBlanco: 0xf7f3e8,
  cesped: 0x53b93a,
  cespedOscuro: 0x3d8f2a,
  cespedClaro: 0x74d64f,
  tierra: 0xb07840,
  tierraOscura: 0x8a5a2c,
  arena: 0xe8cf90,
  roca: 0x6e6a66,
  rocaVolcan: 0x35262a,
  lava: 0xff5a12,
  lavaBrillo: 0xffd166,
  agua: 0x2aa9e0,

  // Elementos
  meta: 0xffffff,
  metaNegro: 0x1b1b22,
  cajaItem: 0x22d3ee,
  moneda: 0xffc90e,
  monedaBrillo: 0xfff3b0,
  turboNaranja: 0xff8a00,
  turboAzul: 0x2fb8ff,
  turboRosa: 0xff4fd8,
  chispaAzul: 0x4fc3ff,
  chispaNaranja: 0xffa726,
  chispaRosa: 0xff5ce1,
  estrella: 0xfff05a,

  // Personajes (colores de firma de cada socio)
  jp: 0xe8402a,
  male: 0xff6fae,
  keke: 0x2fb8ff,
  mati: 0x3dcf6a,
}

/** Colores de firma por personaje, con variantes para carrocería y detalles. */
export const COLORES_PERSONAJE = {
  jp: { principal: 0xe8402a, oscuro: 0xa62113, claro: 0xff8a6b, acento: 0xffcc00 },
  male: { principal: 0xff6fae, oscuro: 0xc03f7e, claro: 0xffb3d4, acento: 0x7b2ff7 },
  keke: { principal: 0x2fb8ff, oscuro: 0x1667a8, claro: 0x9fe4ff, acento: 0xffffff },
  mati: { principal: 0x3dcf6a, oscuro: 0x1e8546, claro: 0x9df0b6, acento: 0xffe066 },
}

/** Colores por rareza/tipo de ítem para HUD y partículas. */
export const COLORES_ITEM = {
  banana: 0xffd400,
  caparazonVerde: 0x2ecc40,
  caparazonRojo: 0xff3b30,
  triple: 0xff3b30,
  hongo: 0xff5a5a,
  hongoTriple: 0xff5a5a,
  rayo: 0xfff05a,
  estrella: 0xffe83d,
  bomba: 0x2b2b33,
  bala: 0xf0f0f0,
  monedas: 0xffc90e,
}

export default PALETA
