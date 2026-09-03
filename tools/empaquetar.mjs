#!/usr/bin/env node
// Empaqueta Teo Kart en UN solo archivo HTML autocontenido (JavaScript y CSS
// embebidos, cero pedidos de red), para poder abrirlo con doble clic o subirlo
// a cualquier lado.  ->  dist-suelto/teo-kart.html
import { build } from 'vite'
import react from '@vitejs/plugin-react'
import { readFileSync, writeFileSync, mkdirSync, rmSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'

const RAIZ = resolve(import.meta.dirname, '..')
const TMP = join(RAIZ, '.tmp-suelto')
const SALIDA = join(RAIZ, 'dist-suelto')

rmSync(TMP, { recursive: true, force: true })
await build({
  root: join(RAIZ, 'suelto'),
  plugins: [react()],
  base: './',
  logLevel: 'warn',
  build: {
    outDir: TMP,
    emptyOutDir: true,
    assetsInlineLimit: 100_000_000, // que no quede ningún asset suelto
    cssCodeSplit: false,
    rolldownOptions: { output: { codeSplitting: false, entryFileNames: 'app.js' } },
  },
})

let html = readFileSync(join(TMP, 'index.html'), 'utf8')

/** Todos los .js y .css que emitió la build, estén o no en assets/. */
function emitidos(dir) {
  const salida = []
  for (const entrada of readdirSync(dir, { withFileTypes: true })) {
    const ruta = join(dir, entrada.name)
    if (entrada.isDirectory()) salida.push(...emitidos(ruta))
    else if (/\.(js|css)$/.test(entrada.name)) salida.push(ruta)
  }
  return salida
}

for (const ruta of emitidos(TMP)) {
  const nombre = ruta.slice(TMP.length + 1).replace(/\\/g, '/')
  const contenido = readFileSync(ruta, 'utf8')
  const escapado = nombre.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  if (nombre.endsWith('.js')) {
    html = html.replace(
      new RegExp(`<script[^>]*src="[^"]*${escapado}"[^>]*></script>`),
      () => `<script type="module">\n${contenido}\n</script>`,
    )
  } else {
    html = html.replace(
      new RegExp(`<link[^>]*href="[^"]*${escapado}"[^>]*>`),
      () => `<style>\n${contenido}\n</style>`,
    )
  }
}

// Sólo miramos etiquetas reales: dentro del JavaScript embebido hay cadenas
// como `href="` que no son referencias del documento.
const sueltas = [
  ...html.matchAll(/<script\b[^>]*\bsrc="(?!data:)([^"]+)"/g),
  ...html.matchAll(/<link\b[^>]*\bhref="(?!data:)([^"]+)"/g),
].map((m) => m[1])
if (sueltas.length) {
  console.error('Quedaron referencias externas en el HTML:\n' + sueltas.join('\n'))
  process.exit(1)
}

mkdirSync(SALIDA, { recursive: true })
const destino = join(SALIDA, 'teo-kart.html')
writeFileSync(destino, html)

// Variante para publicar como página: sólo el contenido, porque el envoltorio
// (doctype, html, head, body) lo pone el servicio.
const dentroDelBody = html
  .slice(html.indexOf('<body>') + 6, html.indexOf('</body>'))
  .replace(/<script[\s\S]*?<\/script>/g, '')
  .trim()
// Vite deja el script del módulo en el <head>, así que los buscamos en todo el
// documento y no sólo dentro del body.
const estilos = [...html.matchAll(/<style>[\s\S]*?<\/style>/g)].map((m) => m[0]).join('\n')
const guiones = [...html.matchAll(/<script[\s\S]*?<\/script>/g)].map((m) => m[0]).join('\n')
const fragmento = `<title>Teo Kart</title>\n${estilos}\n${dentroDelBody}\n${guiones}\n`
const destinoPagina = join(SALIDA, 'teo-kart-pagina.html')
writeFileSync(destinoPagina, fragmento)

rmSync(TMP, { recursive: true, force: true })
console.log(`Listo: ${destino} (${(html.length / 1024 / 1024).toFixed(2)} MB)`)
console.log(`Listo: ${destinoPagina} (${(fragmento.length / 1024 / 1024).toFixed(2)} MB)`)
