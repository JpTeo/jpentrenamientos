#!/usr/bin/env node
// Saca capturas de Teo Kart en Chromium (WebGL por software) para poder
// revisar cómo queda sin abrir el navegador a mano.
//   node tools/capturas.mjs [--segundos=25] [--salida=capturas]
import { spawn } from 'node:child_process'
import { mkdirSync, rmSync, existsSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { chromium } from 'playwright'

const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
const RAIZ = resolve(import.meta.dirname, '..')
const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, '').split('=')
    return [k, v === undefined ? true : v]
  }),
)
const SALIDA = resolve(RAIZ, args.salida || 'capturas')
const ANCHO = Number(args.ancho || 1440)
const ALTO = Number(args.alto || 810)

async function esperar(url, intentos = 120) {
  for (let i = 0; i < intentos; i++) {
    try {
      const r = await fetch(url)
      if (r.ok || r.status === 404) return true
    } catch { /* todavía no levantó */ }
    await new Promise((r) => setTimeout(r, 500))
  }
  return false
}

const vite = spawn('npx', ['vite', '--port', '5199', '--strictPort', '--host', '127.0.0.1'], {
  cwd: RAIZ,
  stdio: ['ignore', 'pipe', 'pipe'],
  env: { ...process.env, BROWSER: 'none' },
})
let logVite = ''
vite.stdout.on('data', (d) => (logVite += d))
vite.stderr.on('data', (d) => (logVite += d))
const cerrar = () => { try { vite.kill('SIGTERM') } catch { /* ya murió */ } }
process.on('exit', cerrar)

const base = 'http://127.0.0.1:5199'
if (!(await esperar(base + '/kart'))) {
  cerrar()
  console.error(logVite)
  process.exit(1)
}

if (existsSync(SALIDA)) rmSync(SALIDA, { recursive: true, force: true })
mkdirSync(SALIDA, { recursive: true })

const navegador = await chromium.launch({
  executablePath: CHROME,
  args: [
    '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
    '--ignore-gpu-blocklist', '--no-sandbox', '--disable-dev-shm-usage', '--hide-scrollbars',
  ],
})
const pagina = await navegador.newPage({ viewport: { width: ANCHO, height: ALTO } })
const problemas = []
pagina.on('console', (m) => { if (m.type() === 'error') problemas.push(m.text()) })
pagina.on('pageerror', (e) => problemas.push(`pageerror: ${e.message}`))

await pagina.goto(base + '/kart', { waitUntil: 'networkidle' })
await pagina.screenshot({ path: join(SALIDA, '1-menu.png') })
console.log('[capturas] menú listo')

await pagina.getByRole('button', { name: /A correr/i }).click()
await pagina.waitForTimeout(4000)
await pagina.screenshot({ path: join(SALIDA, '2-largada.png') })

const momentos = [6, 12, 20, 32, 48]
let previo = 4
for (const s of momentos) {
  await pagina.waitForTimeout((s - previo) * 1000)
  previo = s
  await pagina.screenshot({ path: join(SALIDA, `3-carrera-${String(s).padStart(2, '0')}s.png`) })
  console.log(`[capturas] ${s}s`)
}

// Estado interno, para saber si la carrera realmente avanza.
const info = await pagina.evaluate(() => {
  const t = document.querySelector('.tk__tabla')
  const v = document.querySelector('.tk__vueltas')
  const k = document.querySelector('.tk__kmh')
  return { tabla: t && t.innerText, vuelta: v && v.innerText, kmh: k && k.innerText }
})
console.log('[capturas] estado:', JSON.stringify(info))
writeFileSync(join(SALIDA, 'informe.json'), JSON.stringify({ info, problemas }, null, 2))
if (problemas.length) console.error('[capturas] errores de consola:\n' + problemas.slice(0, 10).join('\n'))

await navegador.close()
cerrar()
console.log('[capturas] listo en', SALIDA)
