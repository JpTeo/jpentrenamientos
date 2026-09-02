#!/usr/bin/env node
// Arnés de capturas de Teo Kart.
//
// Levanta el servidor de Vite, abre /captura.html en Chromium con WebGL por
// software y fotografía el juego en encuadres fijos y momentos determinados.
// Las imágenes quedan en capturas/<pista>/<momento>-<pose>.png para que los
// revisores puedan juzgar la calidad visual y comparar entre iteraciones.
//
// Uso:
//   node tools/capturas.mjs                       # las dos pistas, set completo
//   node tools/capturas.mjs --pista=volcan        # una sola pista
//   node tools/capturas.mjs --salida=capturas/v3  # carpeta de salida
//   node tools/capturas.mjs --ancho=1600 --alto=900
import { spawn } from 'node:child_process'
import { mkdirSync, rmSync, existsSync } from 'node:fs'
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

const ANCHO = Number(args.ancho || 1600)
const ALTO = Number(args.alto || 900)
const SALIDA = resolve(RAIZ, args.salida || 'capturas')
const PISTAS = args.pista ? [String(args.pista)] : ['cooperativa', 'volcan']
const LIMPIAR = args.limpiar !== 'no'

/** Momentos de la carrera que queremos ver, y con qué encuadres. */
const MOMENTOS = [
  { id: 'largada', simular: 0.0, poses: ['persecucion', 'lateral', 'retrato'] },
  { id: 'primera-recta', simular: 6.0, poses: ['persecucion', 'curva'] },
  { id: 'en-curva', simular: 14.0, poses: ['persecucion', 'curva', 'lateral'] },
  { id: 'pelea', simular: 26.0, poses: ['persecucion', 'atras', 'frontal'] },
  { id: 'media-vuelta', simular: 42.0, poses: ['persecucion', 'aerea'] },
  { id: 'circuito', simular: 2.0, poses: ['panoramica'] },
]

function log(...m) {
  console.log('[capturas]', ...m)
}

async function esperarServidor(url, intentos = 90) {
  for (let i = 0; i < intentos; i++) {
    try {
      const r = await fetch(url)
      if (r.ok || r.status === 404) return true
    } catch {
      /* todavía no levantó */
    }
    await new Promise((r) => setTimeout(r, 500))
  }
  return false
}

async function main() {
  if (LIMPIAR && existsSync(SALIDA)) rmSync(SALIDA, { recursive: true, force: true })
  mkdirSync(SALIDA, { recursive: true })

  log('levantando vite…')
  const vite = spawn('npx', ['vite', '--port', '5199', '--strictPort', '--host', '127.0.0.1'], {
    cwd: RAIZ,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, BROWSER: 'none' },
  })
  let salidaVite = ''
  vite.stdout.on('data', (d) => (salidaVite += d))
  vite.stderr.on('data', (d) => (salidaVite += d))

  const cerrar = () => {
    try {
      vite.kill('SIGTERM')
    } catch {
      /* ya murió */
    }
  }
  process.on('exit', cerrar)

  const base = 'http://127.0.0.1:5199'
  if (!(await esperarServidor(base + '/captura.html'))) {
    cerrar()
    console.error(salidaVite)
    throw new Error('Vite no levantó a tiempo')
  }
  log('vite listo')

  const navegador = await chromium.launch({
    executablePath: CHROME,
    args: [
      '--use-gl=angle',
      '--use-angle=swiftshader',
      '--enable-unsafe-swiftshader',
      '--ignore-gpu-blocklist',
      '--no-sandbox',
      '--disable-dev-shm-usage',
      '--hide-scrollbars',
    ],
  })

  const informe = { fecha: new Date().toISOString(), pistas: {}, errores: [] }

  for (const pista of PISTAS) {
    const dir = join(SALIDA, pista)
    mkdirSync(dir, { recursive: true })
    log(`--- pista ${pista} ---`)

    const pagina = await navegador.newPage({ viewport: { width: ANCHO, height: ALTO } })
    const consola = []
    pagina.on('console', (m) => {
      if (m.type() === 'error' || m.type() === 'warning') consola.push(`${m.type()}: ${m.text()}`)
    })
    pagina.on('pageerror', (e) => consola.push(`pageerror: ${e.message}`))

    await pagina.goto(`${base}/captura.html?pista=${pista}&calidad=alta`, {
      waitUntil: 'domcontentloaded',
    })

    try {
      await pagina.waitForFunction(() => window.__teokart && window.__teokart.listo, null, {
        timeout: 180000,
      })
    } catch (e) {
      const err = `[${pista}] el juego no arrancó: ${e.message}`
      informe.errores.push(err, ...consola)
      console.error(err)
      console.error(consola.join('\n'))
      await pagina.screenshot({ path: join(dir, 'ERROR.png') })
      await pagina.close()
      continue
    }

    const fallo = await pagina.evaluate(() => window.__teokart.error)
    if (fallo) {
      informe.errores.push(`[${pista}] ${fallo}`)
      console.error(`[${pista}] error en el arranque:\n${fallo}`)
      await pagina.close()
      continue
    }

    let acumulado = 0
    const infoPista = { momentos: [], consola: [] }
    for (const m of MOMENTOS.slice().sort((a, b) => a.simular - b.simular)) {
      const avance = Math.max(0, m.simular - acumulado)
      if (avance > 0) {
        await pagina.evaluate((s) => window.__teokart.simular(s), avance)
        acumulado = m.simular
      }
      for (const pose of m.poses) {
        const ok = await pagina.evaluate((p) => {
          const r = window.__teokart.pose(p)
          window.__teokart.render()
          return r
        }, pose)
        if (!ok) continue
        // Dos cuadros más: algunos efectos necesitan un tick para asentarse.
        await pagina.evaluate(() => window.__teokart.render())
        const archivo = join(dir, `${m.id}--${pose}.png`)
        await pagina.screenshot({ path: archivo })
        process.stdout.write('.')
      }
      infoPista.momentos.push(m.id)
    }
    process.stdout.write('\n')

    infoPista.info = await pagina.evaluate(() => window.__teokart.info())
    infoPista.consola = consola.slice(0, 40)
    informe.pistas[pista] = infoPista
    log(`${pista}:`, JSON.stringify(infoPista.info && { ...infoPista.info, puestos: undefined }))
    if (consola.length) log(`avisos de consola (${consola.length}):`, consola.slice(0, 6).join(' | '))

    await pagina.close()
  }

  await navegador.close()
  cerrar()

  const { writeFileSync } = await import('node:fs')
  writeFileSync(join(SALIDA, 'informe.json'), JSON.stringify(informe, null, 2))
  log('capturas en', SALIDA)
  if (informe.errores.length) {
    console.error('\nHUBO ERRORES:\n' + informe.errores.join('\n'))
    process.exitCode = 1
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
