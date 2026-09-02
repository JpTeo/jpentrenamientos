// Opciones del jugador, persistidas en localStorage bajo `teokart.opciones`.
// Todo el acceso al almacenamiento va con try/catch: en modo privado o con
// las cookies bloqueadas, el juego tiene que arrancar igual.

export const CLAVE_OPCIONES = 'teokart.opciones'

export const OPCIONES_POR_DEFECTO = {
  calidad: 'alta', // 'alta' | 'media' | 'baja'
  volumenMaestro: 0.8, // 0..1
  volumenMusica: 0.6,
  volumenEfectos: 0.9,
  camara: 'cerca', // 'cerca' | 'lejos'
  mostrarFps: false,
  invertirMirarAtras: false,
}

/** Recorta y completa un objeto de opciones parcial o corrupto. */
export function sanearOpciones(parcial) {
  const o = { ...OPCIONES_POR_DEFECTO, ...(parcial && typeof parcial === 'object' ? parcial : {}) }
  const calidades = ['alta', 'media', 'baja']
  if (!calidades.includes(o.calidad)) o.calidad = OPCIONES_POR_DEFECTO.calidad
  if (o.camara !== 'cerca' && o.camara !== 'lejos') o.camara = OPCIONES_POR_DEFECTO.camara
  for (const k of ['volumenMaestro', 'volumenMusica', 'volumenEfectos']) {
    const v = Number(o[k])
    o[k] = Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : OPCIONES_POR_DEFECTO[k]
  }
  o.mostrarFps = !!o.mostrarFps
  o.invertirMirarAtras = !!o.invertirMirarAtras
  return o
}

/** Lee las opciones guardadas; si no hay o están rotas, devuelve las de fábrica. */
export function cargarOpciones() {
  try {
    const crudo = window.localStorage.getItem(CLAVE_OPCIONES)
    if (!crudo) return { ...OPCIONES_POR_DEFECTO }
    return sanearOpciones(JSON.parse(crudo))
  } catch {
    return { ...OPCIONES_POR_DEFECTO }
  }
}

/** Guarda las opciones. Devuelve el objeto saneado que quedó vigente. */
export function guardarOpciones(opciones) {
  const limpias = sanearOpciones(opciones)
  try {
    window.localStorage.setItem(CLAVE_OPCIONES, JSON.stringify(limpias))
  } catch {
    /* sin almacenamiento: las opciones valen sólo para esta sesión */
  }
  return limpias
}
