# Contratos de módulos — Kart Cooperativa

Documento normativo. Cada módulo del juego se implementa contra estas
interfaces y **no puede cambiarlas** sin actualizar este archivo. Todo el
código y los comentarios van en español. Unidades: metros, segundos, radianes.
Sistema de coordenadas: **Y arriba**, pista sobre el plano XZ, kart avanzando
hacia su **-Z local** (`objeto.getWorldDirection()` devuelve el frente).

Reglas generales:

- Cero assets externos. Todas las texturas salen de `src/game/assets/texturas.js`.
- Todo lo aleatorio del mundo usa `rng(semilla)` de `core/utils.js` (determinista).
- Nada de `import` de React dentro de `world/`, `physics/`, `items/`, `fx/`, `ai/`.
- Ningún módulo crea su propio bucle: se registran en el `Engine`.
- Reutilizar vectores temporales; no asignar objetos dentro del bucle fijo.

---

## 1. Personajes registrados

`src/game/characters/socios.js` (ya existe, no modificar la forma):

```js
SOCIOS = [
  { id: 'jp',   nombre: 'Jp',   ... },
  { id: 'male', nombre: 'Male', ... },
  { id: 'keke', nombre: 'Keke', ... },
  { id: 'mati', nombre: 'Mati', ... },
]
```

Los `id` (`'jp' | 'male' | 'keke' | 'mati'`) son la clave usada por red, HUD,
física y modelos.

---

## 2. Pista — `PistaRuntime`

Producido por `crearPista(ctx)` de cada módulo en `src/game/world/tracks/`.
`ctx = { escena: THREE.Scene, calidad: 'alta'|'media'|'baja', semilla: number }`.

```ts
interface Superficie {
  y: number                 // altura del suelo en ese punto
  normal: THREE.Vector3     // normal del suelo (normalizada)
  tipo: TipoSuperficie
  enPista: boolean          // true si está sobre calzada o bordillo
  distanciaCentro: number   // |lateral| en metros
  anchoAqui: number         // semiancho de calzada en ese punto
}

type TipoSuperficie =
  | 'asfalto' | 'bordillo' | 'cesped' | 'tierra' | 'arena'
  | 'turbo'   | 'rampa'    | 'agua'   | 'lava'   | 'vacio'

interface Progreso {
  s: number                 // distancia recorrida sobre el eje central (m)
  t: number                 // s / longitud, 0..1
  lateral: number           // desplazamiento lateral con signo (+ derecha)
  tangente: THREE.Vector3   // dirección de avance de la pista
  indice: number            // índice del segmento
}

interface PistaRuntime {
  id: string
  nombre: string
  vueltas: number
  longitud: number                 // metros de una vuelta
  grupo: THREE.Group               // TODO el escenario cuelga de acá
  limites: THREE.Box3

  // Consultas (deben ser baratas: se llaman ~8 veces por cuadro fijo)
  muestrear(x: number, z: number, out?: Superficie): Superficie
  progreso(x: number, z: number, out?: Progreso): Progreso
  puntoEn(s: number, out?): { posicion, tangente, normal, ancho }

  // Colisión contra paredes/objetos sólidos del escenario
  colisionar(posicion: THREE.Vector3, radio: number, out?):
    { golpe: boolean, correccion: THREE.Vector3, normal: THREE.Vector3 }

  puestosSalida: Array<{ posicion: THREE.Vector3, rotacionY: number }> // >= 8
  cajasItem: Array<{ posicion: THREE.Vector3 }>
  monedas: Array<{ posicion: THREE.Vector3 }>
  puntosControl: number            // nº de checkpoints repartidos por la vuelta
  checkpointEn(s: number): number

  actualizar(dt: number, tiempo: number, camara: THREE.Camera): void
  destruir(): void
}
```

Cada módulo de pista exporta:

```js
export const META = { id, nombre, descripcion, vueltas, dificultad, emoji, colorUI }
export function crearPista(ctx) { /* ... */ return pistaRuntime }
export default { META, crearPista }
```

Y `src/game/world/tracks/index.js` exporta `PISTAS = [meta1, meta2]` y
`cargarPista(id, ctx)`.

---

## 3. Física — `FisicaKart`

`src/game/physics/KartPhysics.js`

```ts
interface Control {           // producido por Input o por la IA
  acelerar: number            // 0..1
  frenar: number              // 0..1
  giro: number                // -1..1
  derrape: boolean
  derrapeAbajo: boolean       // flanco de bajada
  item: boolean               // flanco
  mirarAtras: boolean
  pausa: boolean
}

interface EstadoKart {
  id: string                  // id del corredor
  personaje: string           // 'jp' | 'male' | 'keke' | 'mati'
  posicion: THREE.Vector3
  quaternion: THREE.Quaternion
  velocidad: THREE.Vector3    // m/s en mundo
  rapidez: number             // componente hacia adelante, m/s (puede ser < 0)
  rapidezMax: number
  giroVisual: number          // -1..1 para inclinar el modelo y girar ruedas
  enSuelo: boolean
  superficie: TipoSuperficie
  saltando: boolean
  derrapando: boolean
  ladoDerrape: -1 | 0 | 1
  cargaDerrape: number        // segundos acumulados
  nivelDerrape: 0 | 1 | 2 | 3 // 0 sin chispa, 1 azul, 2 naranja, 3 rosa
  turbo: number               // segundos de turbo restantes
  estrella: number            // segundos de invencibilidad
  aplastado: number           // segundos encogido (rayo)
  girando: number             // segundos de trompo
  aturdido: number            // segundos sin control (choque)
  vueltasRueda: number        // radianes acumulados
  balanceo: number            // roll visual
  cabeceo: number             // pitch visual
  progreso: Progreso
  vuelta: number              // 1..vueltas
  puesto: number              // 1..N
  terminado: boolean
  tiempoTotal: number         // ms
  tiempos: number[]           // ms por vuelta
  monedas: number             // 0..10
}
```

```js
class FisicaKart {
  constructor(pista, { id, personaje, estadisticas })
  estado: EstadoKart
  colocarEn(posicion, rotacionY)
  step(dt, control, mundo)   // mundo = { karts: EstadoKart[], gravedad?: number }
  darTurbo(segundos, fuerza = 1)
  golpear(tipo)              // 'giro' | 'aplastar' | 'volcar' | 'empuje'
  aplicarImpulso(vector)
  reubicar()                 // rescate fuera de pista
}
```

`step` **no** toca la escena: sólo muta `estado`. El render lee `estado`.

Estadísticas por personaje (`src/game/physics/params.js`) — objeto
`{ velocidad, aceleracion, peso, manejo, traccion }`, cada uno 1..5.

---

## 4. Modelos — personajes y karts

`src/game/characters/CharacterFactory.js`

```js
crearPersonaje(id, opciones) -> {
  grupo: THREE.Group,            // pivote en la cadera, mirando a -Z
  actualizar(dt, vis),           // vis = EstadoVisual (ver abajo)
  destruir()
}

crearKart(id, opciones) -> {
  grupo: THREE.Group,            // pivote en el centro del chasis, a nivel de suelo
  ruedas: THREE.Object3D[],      // [delIzq, delDer, trasIzq, trasDer]
  asiento: THREE.Object3D,       // dónde se monta el personaje
  actualizar(dt, vis),
  destruir()
}

crearCorredor(id, opciones) -> {
  grupo, kart, personaje, actualizar(dt, vis), destruir()
}
```

```ts
interface EstadoVisual {
  giro: number          // -1..1
  rapidez: number       // m/s
  rapidezNorm: number   // 0..1
  derrapando: boolean
  nivelDerrape: 0|1|2|3
  turbo: number
  enSuelo: boolean
  aturdido: number
  girando: number
  aplastado: number
  estrella: number
  vueltasRueda: number
  puesto: number
  terminado: boolean
  festejo: boolean
  dt: number
}
```

Presupuesto: **≤ 2500 triángulos por personaje** y ≤ 2000 por kart, todo
generado con geometría primitiva de three (sin cargar modelos).

---

## 5. Ítems — `SistemaItems`

`src/game/items/Items.js`

```ts
type IdItem = 'banana' | 'caparazonVerde' | 'caparazonRojo' | 'triple'
            | 'hongo' | 'hongoTriple' | 'rayo' | 'estrella' | 'bomba'
            | 'bala' | 'monedas'
```

```js
class SistemaItems {
  constructor({ escena, pista, corredores, fx, audio, esAnfitrion, rng })
  // corredores: Map<id, { fisica: FisicaKart, estado: EstadoKart, esLocal: boolean }>
  sortear(puesto, total, vuelta)   // -> IdItem (probabilidades tipo MK)
  usar(idCorredor, item, haciaAtras)
  actualizar(dt, tiempo)
  alImpacto: (idCorredor, tipoGolpe, idOrigen) => void   // callback asignable
  alRecogerCaja: (idCorredor) => void
  serializar() / aplicar(datos)    // sincronización de red
  destruir()
}
```

---

## 6. Efectos — `FX`

`src/game/fx/FX.js`

```js
class FX {
  constructor(engine, { calidad })
  // Emisores (posición en mundo)
  chispasDerrape(posicion, direccion, nivel)
  polvo(posicion, tipoSuperficie, intensidad)
  estela(idCorredor, activa, color)
  impacto(posicion, color)
  ondaExpansiva(posicion, color, radioMax)
  moneda(posicion)
  humo(posicion, intensidad)
  // Pantalla
  lineasVelocidad(intensidad)     // 0..1
  sacudirCamara(fuerza, duracion)
  destello(color, duracion)
  actualizar(dt, tiempo)
  destruir()
}
```

`src/game/fx/PostProceso.js` exporta `crearPostProceso(engine, opciones)` que
devuelve `{ render(dt), setSize(w,h), dispose(), bloom, ajustar(calidad) }` y se
asigna a `engine.post`.

---

## 7. Red — `Red`

`src/game/net/Netcode.js`. Señalización por Firestore (ya configurado en
`src/firebase/config.js`), transporte WebRTC DataChannel en malla.

```js
class Red {
  constructor({ db, id, nombre })
  esAnfitrion: boolean
  codigo: string | null
  jugadores: Array<{ id, nombre, personaje, listo, ping, esAnfitrion }>
  crearSala({ nombre, personaje, pista })    // -> Promise<codigo>
  unirse(codigo, { nombre, personaje })      // -> Promise<void>
  elegirPersonaje(personaje)
  marcarListo(listo)
  elegirPista(idPista)                       // sólo anfitrión
  comenzar()                                 // sólo anfitrión
  enviarEstado(estadoComprimido)             // no fiable, ~20 Hz
  enviarEvento(evento)                       // fiable
  on(evento, cb)  // 'jugadores'|'estado'|'evento'|'comenzar'|'error'|'salir'
  salir()
}
```

Los eventos de juego (`evento`) tienen la forma
`{ tipo, de, datos, t }` con `tipo` ∈ `'item'|'impacto'|'caja'|'vuelta'|'fin'|'chat'`.

El estado por cuadro se comprime a un array plano de números
(`[x,y,z, qy, qw, vel, banderas, ...]`) — ver `net/protocolo.js`.

---

## 8. IA — `ConductorIA`

`src/game/ai/DriverIA.js`

```js
class ConductorIA {
  constructor(pista, { personalidad, dificultad })
  pensar(dt, estado, mundo) -> Control    // misma forma que Input.leer()
}
```

Rellena los puestos que no ocupan humanos. Debe derrapar, usar ítems y elegir
una trazada creíble, sin ser imposible de ganar.

---

## 9. Audio — `Audio`

`src/game/audio/Audio.js`, 100% WebAudio sintetizado (sin archivos).

```js
class Audio {
  constructor()
  desbloquear()                       // llamar tras un gesto del usuario
  motor(id, { rpm, carga, activo })
  sonido(nombre, { volumen, tono, posicion })
  musica(nombre)                      // 'menu' | 'carrera' | 'final' | null
  volumen(maestro, musica, efectos)
  destruir()
}
```

Nombres de efecto: `derrapeCarga`, `turbo`, `salto`, `choque`, `item`,
`caja`, `banana`, `caparazon`, `explosion`, `rayo`, `estrella`, `moneda`,
`cuenta`, `largada`, `vuelta`, `ultimaVuelta`, `meta`, `ui`, `uiConfirmar`.

---

## 10. Orquestación

`src/game/core/Carrera.js` (lo integra el coordinador) crea la pista, los
corredores, la cámara, el HUD y conecta física ↔ ítems ↔ FX ↔ red.
`src/game/GameRoot.jsx` monta todo en React en la ruta `/kart`.
