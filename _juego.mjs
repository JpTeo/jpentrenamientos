// Prueba de juego: mantiene el acelerador y corrige el volante como lo haría
// una persona, para verificar que se puede completar la carrera.
import { chromium } from 'playwright'
const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-sandbox'] })
const p = await b.newPage({ viewport:{width:1280,height:720} })
const errores=[]
p.on('pageerror', e=>errores.push(e.message))
p.on('console', m=>{ if(m.type()==='error') errores.push(m.text()) })
await p.goto('http://127.0.0.1:5199/kart', { waitUntil:'networkidle' })
await p.getByRole('button', { name: /A correr/i }).click()
await p.waitForFunction(()=>window.__teokart, null, {timeout:60000})

// Un "piloto" simple: acelera siempre y dirige hacia el eje de la pista.
await p.evaluate(() => {
  const c = window.__teokart
  c.input.habilitado = false
  const THREE = c.engine.escena.constructor
  c.input.leer = () => {
    const e = c.jugador.estado
    const pista = c.pista
    const mira = pista.puntoEn(e.progreso.s + 12 + Math.abs(e.rapidez) * 0.6)
    const f = { x: 0, z: -1 }
    const q = e.quaternion
    // dirección frontal desde el quaternion
    const fx = 2 * (q.x * q.z + q.w * q.y)
    const fz = 1 - 2 * (q.x * q.x + q.y * q.y)
    const rumbo = Math.atan2(-fx, -fz)
    const obj = Math.atan2(mira.posicion.x - e.posicion.x, mira.posicion.z - e.posicion.z)
    let d = obj - rumbo
    while (d > Math.PI) d -= Math.PI * 2
    while (d < -Math.PI) d += Math.PI * 2
    void f
    return { acelerar: 1, frenar: 0, giro: Math.max(-1, Math.min(1, d * 2.2)),
             derrape: Math.abs(d) > 0.30 && Math.abs(e.rapidez) > 12,
             derrapeAbajo: false, item: false, mirarAtras: false, pausa: false }
  }
})

const muestras = []
for (let i = 0; i < 24; i++) {
  await p.waitForTimeout(5000)
  const s = await p.evaluate(() => {
    const c = window.__teokart
    const e = c.jugador.estado
    return { t: +c.tiempo.toFixed(1), fase: c.fase, vuelta: e.vuelta, puesto: e.puesto,
      kmh: Math.round(Math.abs(e.rapidez) * 3.6), sup: e.superficie, fps: Math.round(c.engine.fps),
      orden: c.orden.map(x => `${x.id}:v${x.estado.vuelta}`).join(' '),
      terminados: c.corredores.filter(x=>x.estado.terminado).length }
  })
  muestras.push(s)
  console.log(JSON.stringify(s))
  if (s.fase === 'fin') break
  if (i === 3) await p.screenshot({ path: 'capturas/juego-carrera.png' })
}
await p.screenshot({ path: 'capturas/juego-final.png' })
if (errores.length) console.log('ERRORES:', errores.slice(0,5).join(' | '))
await b.close()
