// Simulación de una carrera completa sin navegador: verifica que la IA
// complete las vueltas, que el conteo funcione y que nadie se quede trabado.
//     node src/game/mvp/__prueba.mjs
import { crearPista } from './pista.js'
import { ConductorIA } from './ia.js'
import { FisicaKart } from '../physics/KartPhysics.js'
import { rng } from '../core/utils.js'
import { SOCIOS } from '../characters/socios.js'

const VUELTAS = 3
const PASO = 1 / 60
const pista = crearPista({ sinMallas: true })

const PERSONALIDAD = { jp: 'agresivo', male: 'prolijo', keke: 'tramposo', mati: 'prolijo' }

const corredores = SOCIOS.map((s, i) => {
  const p = pista.puestosSalida[i]
  const f = new FisicaKart(pista, { id: s.id, personaje: s.id })
  f.colocarEn(p.posicion, p.rotacionY)
  return {
    id: s.id,
    fisica: f,
    estado: f.estado,
    ia: new ConductorIA(pista, {
      personalidad: PERSONALIDAD[s.id],
      dificultad: 'normal',
      rng: rng(1000 + i * 977),
    }),
    fueraDePista: 0,
    tiempoLento: 0,
  }
})

let fallos = 0
const ok = (c, m, extra = '') => {
  console.log(`${c ? '  OK  ' : ' FALLA'} ${m} ${extra}`)
  if (!c) fallos++
}

const mundo = { karts: corredores.map((c) => c.estado) }
let t = 0
const LIMITE = 60 * 60 * 4 // 4 minutos simulados
let paso = 0
while (paso < LIMITE) {
  for (const c of corredores) {
    if (c.estado.vuelta > VUELTAS) continue
    const ctrl = c.ia.pensar(PASO, c.estado)
    c.fisica.step(PASO, ctrl, mundo)
    const sup = c.estado.superficie
    if (sup !== 'asfalto' && sup !== 'bordillo' && sup !== 'turbo') c.fueraDePista += PASO
    if (t > 3 && Math.abs(c.estado.rapidez) < 3) c.tiempoLento += PASO
    if (c.estado.vuelta > VUELTAS && !c.estado.terminado) {
      c.estado.terminado = true
      c.estado.tiempoTotal = t * 1000
    }
  }
  t += PASO
  paso++
  if (corredores.every((c) => c.estado.terminado)) break
}

console.log(`\nSimulados ${t.toFixed(1)} s de carrera. Longitud del circuito: ${Math.round(pista.longitud)} m\n`)
for (const c of corredores) {
  const e = c.estado
  const vueltas = e.tiempos.map((x) => (x / 1000).toFixed(1)).join(' / ')
  console.log(
    `  ${c.id.padEnd(5)} vuelta ${e.vuelta}  ${e.terminado ? (e.tiempoTotal / 1000).toFixed(1) + ' s' : 'sin terminar'}` +
      `  vueltas: ${vueltas || '-'}  fuera de pista: ${c.fueraDePista.toFixed(1)} s  lento: ${c.tiempoLento.toFixed(1)} s`,
  )
}
console.log('')

ok(corredores.every((c) => c.estado.terminado), 'los cuatro rivales terminan las 3 vueltas')
ok(
  corredores.every((c) => c.estado.tiempos.length === VUELTAS),
  'cada uno registra exactamente 3 tiempos de vuelta',
)
const tiempos = corredores.map((c) => c.estado.tiempoTotal / 1000)
ok(Math.min(...tiempos) > 60, 'nadie hace la carrera en menos de un minuto (no hay atajos rotos)',
   `mejor ${Math.min(...tiempos).toFixed(1)} s`)
ok(Math.max(...tiempos) < 220, 'nadie tarda más de 220 s', `peor ${Math.max(...tiempos).toFixed(1)} s`)
ok(
  corredores.every((c) => c.fueraDePista < 15),
  'ninguno pasa más de 15 s fuera de la pista',
  `máximo ${Math.max(...corredores.map((c) => c.fueraDePista)).toFixed(1)} s`,
)
ok(
  corredores.every((c) => c.tiempoLento < 6),
  'ninguno pasa más de 6 s casi parado',
  `máximo ${Math.max(...corredores.map((c) => c.tiempoLento)).toFixed(1)} s`,
)
const spread = Math.max(...tiempos) - Math.min(...tiempos)
ok(spread < 45, 'la carrera queda pareja entre rivales', `diferencia ${spread.toFixed(1)} s`)

console.log(fallos === 0 ? '\nTODO OK' : `\n${fallos} FALLAS`)
process.exit(fallos ? 1 : 0)
