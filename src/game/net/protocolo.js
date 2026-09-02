// Protocolo binario de Teo Kart.
//
// Este módulo es DELIBERADAMENTE puro: no importa Firebase, ni three, ni nada
// del juego. Se puede cargar en Node sin entorno para correr tests:
//
//   node --input-type=module -e "import('./src/game/net/protocolo.js')"
//
// Se encarga de dos cosas:
//   1. Empaquetar el estado de un kart en 42 bytes (canal NO fiable, ~20 Hz).
//   2. Empaquetar los eventos de juego (canal fiable, esporádicos).
//
// Todo va en little-endian. Las unidades del juego son metros / segundos /
// radianes (ver CONTRATOS.md); acá se cuantizan a enteros.

/** Versión del protocolo. Subirla rompe compatibilidad con clientes viejos. */
export const VERSION_PROTOCOLO = 1

/** Versión mínima con la que este cliente se sabe entender. */
export const VERSION_MINIMA = 1

/** Firma de 16 bits al principio de cada datagrama ("TK" = Teo Kart). */
export const MAGIA = 0x544b

// ---------------------------------------------------------------------------
// Tablas de enumerados. El índice ES el valor que viaja por la red, así que
// SÓLO se puede agregar al final; reordenar obliga a subir VERSION_PROTOCOLO.
// ---------------------------------------------------------------------------

/** Ítems (índice 0 = mano vacía). Coincide con `IdItem` de CONTRATOS.md §5. */
export const ITEMS = [
  null,
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

/** Tipos de golpe que acepta `FisicaKart.golpear()`. */
export const TIPOS_GOLPE = ['giro', 'aplastar', 'volcar', 'empuje']

/** Tipos de evento fiable. */
export const TIPOS_EVENTO = [
  'item', // alguien usó un ítem
  'impacto', // el anfitrión dictamina un golpe
  'caja', // alguien agarró una caja y le tocó tal ítem
  'vuelta', // se completó una vuelta
  'fin', // un corredor cruzó la meta
  'chat', // texto libre
  'arranque', // el anfitrión fija el instante de largada
]

/** Índice inverso: nombre -> número. */
export const INDICE_ITEM = Object.fromEntries(ITEMS.map((v, i) => [v, i]))
export const INDICE_GOLPE = Object.fromEntries(TIPOS_GOLPE.map((v, i) => [v, i]))
export const INDICE_EVENTO = Object.fromEntries(TIPOS_EVENTO.map((v, i) => [v, i]))

// ---------------------------------------------------------------------------
// Cuantización
// ---------------------------------------------------------------------------

/** Posiciones: centímetros en int32 (±21.474 km, error máx. 0,5 cm). */
export const ESCALA_POSICION = 100

/** Velocidades: cm/s en int16 (±327 m/s, error máx. 0,5 cm/s). */
export const ESCALA_VELOCIDAD = 100

/**
 * Quaternion: se guardan las 3 componentes chicas en int16 sobre el rango
 * ±1/√2. La resolución es 1/46340 ≈ 2,2e-5, muy por encima del 1/4096 pedido:
 * el error angular queda por debajo de 0,005°.
 */
export const RAIZ_MEDIO = Math.SQRT1_2
export const ESCALA_QUAT = 32767 / RAIZ_MEDIO

/** Bytes que ocupa un estado de kart. */
export const BYTES_ESTADO = 42

/** Bytes de la cabecera de un lote de estados. */
export const BYTES_CABECERA = 4

// Desplazamientos dentro del registro de estado (little-endian).
const OFF_BANDERAS = 0 // uint16
const OFF_RANURA = 2 // uint8
const OFF_VUELTA = 3 // uint8
const OFF_X = 4 // int32 cm
const OFF_Y = 8 // int32 cm
const OFF_Z = 12 // int32 cm
const OFF_QA = 16 // int16
const OFF_QB = 18 // int16
const OFF_QC = 20 // int16
const OFF_VX = 22 // int16 cm/s
const OFF_VY = 24 // int16 cm/s
const OFF_VZ = 26 // int16 cm/s
const OFF_RAPIDEZ = 28 // int16 cm/s
const OFF_GIRO = 30 // int8 (-127..127 = -1..1)
const OFF_MONEDAS = 31 // uint8
const OFF_ITEM = 32 // uint8
const OFF_PUESTO = 33 // uint8
const OFF_S = 34 // int32 cm sobre el eje central
const OFF_SELLO = 38 // uint32 ms

// Banderas de bits del estado.
export const B_EN_SUELO = 1 << 0
export const B_DERRAPANDO = 1 << 1
// bits 2-3: ladoDerrape + 1  (0 = izquierda, 1 = ninguno, 2 = derecha)
export const B_TURBO = 1 << 6
export const B_ESTRELLA = 1 << 7
export const B_APLASTADO = 1 << 8
export const B_GIRANDO = 1 << 9
export const B_TERMINADO = 1 << 10
export const B_MARCHA_ATRAS = 1 << 11
// bits 12-13: índice de la componente mayor del quaternion
export const B_SALTANDO = 1 << 14
export const B_ATURDIDO = 1 << 15

const DESPL_LADO = 2
const DESPL_NIVEL = 4
const DESPL_QUAT = 12

const limitar = (v, min, max) => (v < min ? min : v > max ? max : v)
const enteroSeguro = (v) => (Number.isFinite(v) ? Math.round(v) : 0)

// ---------------------------------------------------------------------------
// Quaternion comprimido: "el más grande implícito" (smallest three)
// ---------------------------------------------------------------------------

/**
 * Comprime un quaternion unitario a `{ indice, a, b, c }` con las tres
 * componentes chicas ya cuantizadas a int16.
 */
export function comprimirQuaternion(x, y, z, w) {
  // Normalizamos por las dudas: un quaternion sucio arruina la reconstrucción.
  let n = Math.hypot(x, y, z, w)
  if (!Number.isFinite(n) || n < 1e-8) {
    x = 0
    y = 0
    z = 0
    w = 1
    n = 1
  }
  let qx = x / n
  let qy = y / n
  let qz = z / n
  let qw = w / n

  const abs = [Math.abs(qx), Math.abs(qy), Math.abs(qz), Math.abs(qw)]
  let indice = 0
  for (let i = 1; i < 4; i++) if (abs[i] > abs[indice]) indice = i

  // q y -q representan la misma rotación: forzamos que la mayor sea positiva
  // para poder reconstruirla como +√(1 - a² - b² - c²).
  const comps = [qx, qy, qz, qw]
  if (comps[indice] < 0) {
    qx = -qx
    qy = -qy
    qz = -qz
    qw = -qw
    comps[0] = qx
    comps[1] = qy
    comps[2] = qz
    comps[3] = qw
  }

  const restantes = []
  for (let i = 0; i < 4; i++) if (i !== indice) restantes.push(comps[i])

  return {
    indice,
    a: limitar(enteroSeguro(restantes[0] * ESCALA_QUAT), -32767, 32767),
    b: limitar(enteroSeguro(restantes[1] * ESCALA_QUAT), -32767, 32767),
    c: limitar(enteroSeguro(restantes[2] * ESCALA_QUAT), -32767, 32767),
  }
}

/** Reconstruye `{ x, y, z, w }` desde el quaternion comprimido. */
export function descomprimirQuaternion(indice, a, b, c, salida = {}) {
  const ra = a / ESCALA_QUAT
  const rb = b / ESCALA_QUAT
  const rc = c / ESCALA_QUAT
  const resto = 1 - (ra * ra + rb * rb + rc * rc)
  const mayor = Math.sqrt(resto > 0 ? resto : 0)

  const comps = [0, 0, 0, 0]
  comps[indice] = mayor
  let k = 0
  const chicas = [ra, rb, rc]
  for (let i = 0; i < 4; i++) if (i !== indice) comps[i] = chicas[k++]

  // Renormalizamos: la cuantización deja el módulo levemente fuera de 1.
  const n = Math.hypot(comps[0], comps[1], comps[2], comps[3]) || 1
  salida.x = comps[0] / n
  salida.y = comps[1] / n
  salida.z = comps[2] / n
  salida.w = comps[3] / n
  return salida
}

// ---------------------------------------------------------------------------
// Estado de kart
// ---------------------------------------------------------------------------

/**
 * Escribe un estado de kart en una vista ya creada.
 * @param {DataView} vista
 * @param {number} desplazamiento byte inicial del registro
 * @param {object} estado EstadoKart (o parcial) según CONTRATOS.md §3
 * @param {number} ranura índice del corredor en la parrilla (0..255)
 */
export function escribirEstado(vista, desplazamiento, estado, ranura = estado.ranura ?? 0) {
  const p = estado.posicion || { x: 0, y: 0, z: 0 }
  const v = estado.velocidad || { x: 0, y: 0, z: 0 }
  const q = estado.quaternion || { x: 0, y: 0, z: 0, w: 1 }
  const rapidez = estado.rapidez || 0

  const { indice, a, b, c } = comprimirQuaternion(q.x, q.y, q.z, q.w)

  const lado = limitar(enteroSeguro(estado.ladoDerrape || 0), -1, 1) + 1
  const nivel = limitar(enteroSeguro(estado.nivelDerrape || 0), 0, 3)
  const marchaAtras = estado.marchaAtras ?? rapidez < -0.15

  let banderas = 0
  if (estado.enSuelo) banderas |= B_EN_SUELO
  if (estado.derrapando) banderas |= B_DERRAPANDO
  banderas |= lado << DESPL_LADO
  banderas |= nivel << DESPL_NIVEL
  if ((estado.turbo || 0) > 0) banderas |= B_TURBO
  if ((estado.estrella || 0) > 0) banderas |= B_ESTRELLA
  if ((estado.aplastado || 0) > 0) banderas |= B_APLASTADO
  if ((estado.girando || 0) > 0) banderas |= B_GIRANDO
  if (estado.terminado) banderas |= B_TERMINADO
  if (marchaAtras) banderas |= B_MARCHA_ATRAS
  banderas |= indice << DESPL_QUAT
  if (estado.saltando) banderas |= B_SALTANDO
  if ((estado.aturdido || 0) > 0) banderas |= B_ATURDIDO

  const s = estado.progreso ? estado.progreso.s || 0 : estado.s || 0
  const item = typeof estado.item === 'string' ? INDICE_ITEM[estado.item] || 0 : estado.item || 0

  vista.setUint16(desplazamiento + OFF_BANDERAS, banderas & 0xffff, true)
  vista.setUint8(desplazamiento + OFF_RANURA, ranura & 0xff)
  vista.setUint8(desplazamiento + OFF_VUELTA, limitar(enteroSeguro(estado.vuelta || 0), 0, 255))
  vista.setInt32(desplazamiento + OFF_X, enteroSeguro(p.x * ESCALA_POSICION), true)
  vista.setInt32(desplazamiento + OFF_Y, enteroSeguro(p.y * ESCALA_POSICION), true)
  vista.setInt32(desplazamiento + OFF_Z, enteroSeguro(p.z * ESCALA_POSICION), true)
  vista.setInt16(desplazamiento + OFF_QA, a, true)
  vista.setInt16(desplazamiento + OFF_QB, b, true)
  vista.setInt16(desplazamiento + OFF_QC, c, true)
  vista.setInt16(desplazamiento + OFF_VX, limitar(enteroSeguro(v.x * ESCALA_VELOCIDAD), -32768, 32767), true)
  vista.setInt16(desplazamiento + OFF_VY, limitar(enteroSeguro(v.y * ESCALA_VELOCIDAD), -32768, 32767), true)
  vista.setInt16(desplazamiento + OFF_VZ, limitar(enteroSeguro(v.z * ESCALA_VELOCIDAD), -32768, 32767), true)
  vista.setInt16(
    desplazamiento + OFF_RAPIDEZ,
    limitar(enteroSeguro(rapidez * ESCALA_VELOCIDAD), -32768, 32767),
    true,
  )
  vista.setInt8(desplazamiento + OFF_GIRO, limitar(enteroSeguro((estado.giroVisual || 0) * 127), -127, 127))
  vista.setUint8(desplazamiento + OFF_MONEDAS, limitar(enteroSeguro(estado.monedas || 0), 0, 255))
  vista.setUint8(desplazamiento + OFF_ITEM, limitar(item, 0, 255))
  vista.setUint8(desplazamiento + OFF_PUESTO, limitar(enteroSeguro(estado.puesto || 0), 0, 255))
  vista.setInt32(desplazamiento + OFF_S, enteroSeguro(s * ESCALA_POSICION), true)
  vista.setUint32(desplazamiento + OFF_SELLO, (estado.sello ?? estado.t ?? 0) >>> 0, true)
}

/** Lee un estado de kart desde una vista. Devuelve un objeto plano. */
export function leerEstado(vista, desplazamiento, salida = {}) {
  const banderas = vista.getUint16(desplazamiento + OFF_BANDERAS, true)
  const indice = (banderas >> DESPL_QUAT) & 0b11

  salida.ranura = vista.getUint8(desplazamiento + OFF_RANURA)
  salida.vuelta = vista.getUint8(desplazamiento + OFF_VUELTA)

  salida.posicion = salida.posicion || { x: 0, y: 0, z: 0 }
  salida.posicion.x = vista.getInt32(desplazamiento + OFF_X, true) / ESCALA_POSICION
  salida.posicion.y = vista.getInt32(desplazamiento + OFF_Y, true) / ESCALA_POSICION
  salida.posicion.z = vista.getInt32(desplazamiento + OFF_Z, true) / ESCALA_POSICION

  salida.quaternion = descomprimirQuaternion(
    indice,
    vista.getInt16(desplazamiento + OFF_QA, true),
    vista.getInt16(desplazamiento + OFF_QB, true),
    vista.getInt16(desplazamiento + OFF_QC, true),
    salida.quaternion || {},
  )

  salida.velocidad = salida.velocidad || { x: 0, y: 0, z: 0 }
  salida.velocidad.x = vista.getInt16(desplazamiento + OFF_VX, true) / ESCALA_VELOCIDAD
  salida.velocidad.y = vista.getInt16(desplazamiento + OFF_VY, true) / ESCALA_VELOCIDAD
  salida.velocidad.z = vista.getInt16(desplazamiento + OFF_VZ, true) / ESCALA_VELOCIDAD

  salida.rapidez = vista.getInt16(desplazamiento + OFF_RAPIDEZ, true) / ESCALA_VELOCIDAD
  salida.giroVisual = vista.getInt8(desplazamiento + OFF_GIRO) / 127
  salida.monedas = vista.getUint8(desplazamiento + OFF_MONEDAS)
  salida.item = ITEMS[vista.getUint8(desplazamiento + OFF_ITEM)] || null
  salida.puesto = vista.getUint8(desplazamiento + OFF_PUESTO)
  salida.s = vista.getInt32(desplazamiento + OFF_S, true) / ESCALA_POSICION
  salida.sello = vista.getUint32(desplazamiento + OFF_SELLO, true)

  salida.banderas = banderas
  salida.enSuelo = (banderas & B_EN_SUELO) !== 0
  salida.derrapando = (banderas & B_DERRAPANDO) !== 0
  salida.ladoDerrape = ((banderas >> DESPL_LADO) & 0b11) - 1
  salida.nivelDerrape = (banderas >> DESPL_NIVEL) & 0b11
  salida.turbo = (banderas & B_TURBO) !== 0
  salida.estrella = (banderas & B_ESTRELLA) !== 0
  salida.aplastado = (banderas & B_APLASTADO) !== 0
  salida.girando = (banderas & B_GIRANDO) !== 0
  salida.terminado = (banderas & B_TERMINADO) !== 0
  salida.marchaAtras = (banderas & B_MARCHA_ATRAS) !== 0
  salida.saltando = (banderas & B_SALTANDO) !== 0
  salida.aturdido = (banderas & B_ATURDIDO) !== 0
  return salida
}

/**
 * Empaqueta UN estado de kart. Devuelve un `ArrayBuffer` de 42 bytes.
 * Para mandarlo por la red conviene usar `empaquetarLote`, que agrega cabecera.
 */
export function empaquetarEstado(estado, ranura = estado.ranura ?? 0) {
  const buffer = new ArrayBuffer(BYTES_ESTADO)
  escribirEstado(new DataView(buffer), 0, estado, ranura)
  return buffer
}

/** Desempaqueta UN estado de kart (42 bytes, sin cabecera). */
export function desempaquetarEstado(buffer, desplazamiento = 0, salida = {}) {
  const vista = aVista(buffer)
  return leerEstado(vista, desplazamiento, salida)
}

/**
 * Empaqueta varios estados en un solo datagrama:
 * `[uint16 MAGIA][uint8 version][uint8 cantidad][estado]*`
 * Con 8 karts son 4 + 8·42 = 340 bytes: entra holgado en cualquier MTU.
 */
export function empaquetarLote(estados) {
  const n = Math.min(estados.length, 255)
  const buffer = new ArrayBuffer(BYTES_CABECERA + n * BYTES_ESTADO)
  const vista = new DataView(buffer)
  vista.setUint16(0, MAGIA, true)
  vista.setUint8(2, VERSION_PROTOCOLO)
  vista.setUint8(3, n)
  for (let i = 0; i < n; i++) {
    const e = estados[i]
    escribirEstado(vista, BYTES_CABECERA + i * BYTES_ESTADO, e, e.ranura ?? i)
  }
  return buffer
}

/** Desempaqueta un lote. Devuelve `null` si la firma o la versión no cuadran. */
export function desempaquetarLote(buffer) {
  const vista = aVista(buffer)
  if (vista.byteLength < BYTES_CABECERA) return null
  if (vista.getUint16(0, true) !== MAGIA) return null
  const version = vista.getUint8(2)
  if (!esCompatible(version)) return null
  const cantidad = vista.getUint8(3)
  if (vista.byteLength < BYTES_CABECERA + cantidad * BYTES_ESTADO) return null
  const estados = []
  for (let i = 0; i < cantidad; i++) {
    estados.push(leerEstado(vista, BYTES_CABECERA + i * BYTES_ESTADO))
  }
  return { version, estados }
}

// ---------------------------------------------------------------------------
// Eventos fiables
// ---------------------------------------------------------------------------
//
// Cabecera común (16 bytes):
//   [uint16 MAGIA][uint8 version][uint8 tipo][uint8 de][uint8 res][uint16 res]
//   [float64 t]   <- sello en tiempo de red (ms), sin truncar
// ...seguida de un cuerpo específico por tipo. Los tipos con texto (`chat`,
// `arranque`) terminan con una cadena UTF-8 precedida por su largo en uint16.

const BYTES_CAB_EVENTO = 16
const codificador = typeof TextEncoder !== 'undefined' ? new TextEncoder() : null
const decodificador = typeof TextDecoder !== 'undefined' ? new TextDecoder() : null

function textoABytes(texto) {
  if (!texto) return new Uint8Array(0)
  if (codificador) return codificador.encode(texto)
  // Respaldo mínimo (entornos sin TextEncoder): sólo ASCII.
  const salida = new Uint8Array(texto.length)
  for (let i = 0; i < texto.length; i++) salida[i] = texto.charCodeAt(i) & 0x7f
  return salida
}

function bytesATexto(bytes) {
  if (!bytes.length) return ''
  if (decodificador) return decodificador.decode(bytes)
  let s = ''
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i])
  return s
}

function aVista(buffer) {
  if (buffer instanceof DataView) return buffer
  if (ArrayBuffer.isView(buffer)) return new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength)
  return new DataView(buffer)
}

/**
 * Empaqueta un evento fiable `{ tipo, de, datos, t }`.
 * @returns {ArrayBuffer}
 */
export function empaquetarEvento(evento) {
  const tipo = INDICE_EVENTO[evento.tipo]
  if (tipo === undefined) throw new Error(`Tipo de evento desconocido: ${evento.tipo}`)
  const d = evento.datos || {}
  const de = (evento.de ?? 0) & 0xff
  const t = Number(evento.t ?? 0)

  let cuerpo = new Uint8Array(0)
  let texto = new Uint8Array(0)

  switch (evento.tipo) {
    case 'item': {
      cuerpo = new Uint8Array(3)
      cuerpo[0] = INDICE_ITEM[d.item] || 0
      cuerpo[1] = d.objetivo ?? 255
      cuerpo[2] = d.haciaAtras ? 1 : 0
      break
    }
    case 'impacto': {
      cuerpo = new Uint8Array(4)
      cuerpo[0] = d.objetivo ?? 255
      cuerpo[1] = INDICE_GOLPE[d.golpe] ?? 0
      cuerpo[2] = d.origen ?? 255
      cuerpo[3] = INDICE_ITEM[d.item] || 0
      break
    }
    case 'caja': {
      cuerpo = new Uint8Array(4)
      const v = new DataView(cuerpo.buffer)
      v.setUint16(0, (d.caja ?? 0) & 0xffff, true)
      cuerpo[2] = d.corredor ?? de
      cuerpo[3] = INDICE_ITEM[d.item] || 0
      break
    }
    case 'vuelta': {
      cuerpo = new Uint8Array(9)
      const v = new DataView(cuerpo.buffer)
      v.setUint8(0, (d.vuelta ?? 1) & 0xff)
      v.setUint32(1, (d.tiempoVuelta ?? 0) >>> 0, true)
      v.setUint32(5, (d.tiempoTotal ?? 0) >>> 0, true)
      break
    }
    case 'fin': {
      cuerpo = new Uint8Array(6)
      const v = new DataView(cuerpo.buffer)
      v.setUint8(0, (d.puesto ?? 0) & 0xff)
      v.setUint8(1, (d.corredor ?? de) & 0xff)
      v.setUint32(2, (d.tiempoTotal ?? 0) >>> 0, true)
      break
    }
    case 'arranque': {
      cuerpo = new Uint8Array(16)
      const v = new DataView(cuerpo.buffer)
      v.setFloat64(0, d.tArranque ?? 0, true)
      v.setUint32(8, (d.semilla ?? 0) >>> 0, true)
      v.setUint8(12, (d.vueltas ?? 3) & 0xff)
      v.setUint8(13, (d.corredores ?? 8) & 0xff)
      texto = textoABytes(d.pista || '')
      break
    }
    case 'chat': {
      texto = textoABytes(String(d.texto ?? '').slice(0, 240))
      break
    }
    default:
      break
  }

  const conTexto = evento.tipo === 'chat' || evento.tipo === 'arranque'
  const largoTexto = conTexto ? 2 + texto.length : 0
  const buffer = new ArrayBuffer(BYTES_CAB_EVENTO + cuerpo.length + largoTexto)
  const vista = new DataView(buffer)
  const bytes = new Uint8Array(buffer)

  vista.setUint16(0, MAGIA, true)
  vista.setUint8(2, VERSION_PROTOCOLO)
  vista.setUint8(3, tipo)
  vista.setUint8(4, de)
  vista.setUint8(5, 0)
  vista.setUint16(6, 0, true)
  vista.setFloat64(8, Number.isFinite(t) ? t : 0, true)
  bytes.set(cuerpo, BYTES_CAB_EVENTO)
  if (conTexto) {
    const off = BYTES_CAB_EVENTO + cuerpo.length
    vista.setUint16(off, texto.length, true)
    bytes.set(texto, off + 2)
  }
  return buffer
}

/** Desempaqueta un evento. Devuelve `null` si no es un evento válido. */
export function desempaquetarEvento(buffer) {
  const vista = aVista(buffer)
  const bytes = new Uint8Array(vista.buffer, vista.byteOffset, vista.byteLength)
  if (vista.byteLength < BYTES_CAB_EVENTO) return null
  if (vista.getUint16(0, true) !== MAGIA) return null
  const version = vista.getUint8(2)
  if (!esCompatible(version)) return null
  const tipo = TIPOS_EVENTO[vista.getUint8(3)]
  if (!tipo) return null
  const de = vista.getUint8(4)
  const t = vista.getFloat64(8, true)

  const datos = {}
  let off = BYTES_CAB_EVENTO
  switch (tipo) {
    case 'item':
      datos.item = ITEMS[bytes[off]] || null
      datos.objetivo = bytes[off + 1]
      datos.haciaAtras = bytes[off + 2] === 1
      off += 3
      break
    case 'impacto':
      datos.objetivo = bytes[off]
      datos.golpe = TIPOS_GOLPE[bytes[off + 1]] || 'empuje'
      datos.origen = bytes[off + 2]
      datos.item = ITEMS[bytes[off + 3]] || null
      off += 4
      break
    case 'caja':
      datos.caja = vista.getUint16(off, true)
      datos.corredor = bytes[off + 2]
      datos.item = ITEMS[bytes[off + 3]] || null
      off += 4
      break
    case 'vuelta':
      datos.vuelta = vista.getUint8(off)
      datos.tiempoVuelta = vista.getUint32(off + 1, true)
      datos.tiempoTotal = vista.getUint32(off + 5, true)
      off += 9
      break
    case 'fin':
      datos.puesto = vista.getUint8(off)
      datos.corredor = vista.getUint8(off + 1)
      datos.tiempoTotal = vista.getUint32(off + 2, true)
      off += 6
      break
    case 'arranque': {
      datos.tArranque = vista.getFloat64(off, true)
      datos.semilla = vista.getUint32(off + 8, true)
      datos.vueltas = vista.getUint8(off + 12)
      datos.corredores = vista.getUint8(off + 13)
      off += 16
      const largo = vista.getUint16(off, true)
      datos.pista = bytesATexto(bytes.subarray(off + 2, off + 2 + largo))
      off += 2 + largo
      break
    }
    case 'chat': {
      const largo = vista.getUint16(off, true)
      datos.texto = bytesATexto(bytes.subarray(off + 2, off + 2 + largo))
      off += 2 + largo
      break
    }
    default:
      break
  }

  return { tipo, de, datos, t, version }
}

// ---------------------------------------------------------------------------
// Compatibilidad
// ---------------------------------------------------------------------------

/** ¿Podemos hablar con un par que anuncia esta versión? */
export function esCompatible(version) {
  return Number.isInteger(version) && version >= VERSION_MINIMA && version <= VERSION_PROTOCOLO
}

/** Saludo que se intercambia al abrir el canal de eventos (va como JSON). */
export function saludo(extra = {}) {
  return { hola: 'teokart', version: VERSION_PROTOCOLO, minima: VERSION_MINIMA, ...extra }
}

/**
 * Verifica el saludo del otro par.
 * @returns {{ ok: boolean, motivo?: string }}
 */
export function verificarSaludo(mensaje) {
  if (!mensaje || mensaje.hola !== 'teokart') return { ok: false, motivo: 'no es un cliente de Teo Kart' }
  if (!esCompatible(mensaje.version)) {
    return {
      ok: false,
      motivo: `versión de protocolo incompatible (la suya ${mensaje.version}, la nuestra ${VERSION_PROTOCOLO})`,
    }
  }
  return { ok: true }
}

export default {
  VERSION_PROTOCOLO,
  BYTES_ESTADO,
  empaquetarEstado,
  desempaquetarEstado,
  empaquetarLote,
  desempaquetarLote,
  empaquetarEvento,
  desempaquetarEvento,
  esCompatible,
  saludo,
  verificarSaludo,
}
