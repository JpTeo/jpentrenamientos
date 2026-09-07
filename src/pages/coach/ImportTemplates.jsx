import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  collection,
  query,
  where,
  onSnapshot,
  doc,
  writeBatch,
  serverTimestamp,
} from 'firebase/firestore'
import { db } from '../../firebase/config'
import { useAuth } from '../../contexts/useAuth'
import { parsePlanText, collectExerciseNames, buildDayItems, normalizeName } from '../../lib/importPlanText'
import { parseWorkbook } from '../../lib/importPlanExcel'

const inputClass =
  'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500'
const labelClass = 'mb-1 block text-xs font-medium text-slate-500'

const EXAMPLE_TEXT = `Día 1

Circuito 1
Abdominales bisagra con disco de 5kg 30x3
Plancha alta tocando Pie contrario 20x3
Sentadilla con barra 12-10-8`

function chunk(list, size) {
  const chunks = []
  for (let i = 0; i < list.length; i += size) chunks.push(list.slice(i, i + size))
  return chunks
}

export default function ImportTemplates() {
  const { user } = useAuth()
  const navigate = useNavigate()

  const [mode, setMode] = useState('text')
  const [text, setText] = useState('')
  const [file, setFile] = useState(null)
  const [prefix, setPrefix] = useState('')
  const [exercises, setExercises] = useState([])
  const [days, setDays] = useState(null)
  const [parseError, setParseError] = useState('')
  const [importing, setImporting] = useState(false)
  const [importError, setImportError] = useState('')
  const [importResult, setImportResult] = useState('')

  useEffect(() => {
    const q = query(collection(db, 'exercises'), where('createdBy', '==', user.uid))
    const unsub = onSnapshot(q, (snap) => {
      setExercises(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    })
    return unsub
  }, [user.uid])

  const existingByName = new Map(exercises.map((ex) => [normalizeName(ex.name), ex]))

  async function handleAnalyze() {
    setParseError('')
    setImportResult('')
    setDays(null)
    try {
      if (mode === 'text') {
        if (!text.trim()) {
          setParseError('Pegá el texto de la planificación primero.')
          return
        }
        const parsed = parsePlanText(text)
        if (parsed.length === 0) {
          setParseError('No encontré ningún día o ejercicio en el texto.')
          return
        }
        setDays(parsed)
      } else {
        if (!file) {
          setParseError('Elegí un archivo Excel primero.')
          return
        }
        const buffer = await file.arrayBuffer()
        const parsed = parseWorkbook(buffer)
        if (parsed.length === 0) {
          setParseError('No encontré ningún día en el Excel (esperaba filas "Día N" y "Ejercicio").')
          return
        }
        setDays(parsed)
      }
    } catch {
      setParseError('No pude leer el archivo o el texto. Revisá el formato.')
    }
  }

  function titleFor(day) {
    return prefix.trim() ? `${prefix.trim()} - ${day.title}` : day.title
  }

  async function handleImport() {
    if (!days || days.length === 0) return
    setImporting(true)
    setImportError('')
    setImportResult('')
    try {
      const allNames = Array.from(collectExerciseNames(days))
      const missingNames = allNames.filter((name) => !existingByName.has(normalizeName(name)))

      const nameToExercise = new Map(existingByName)
      for (const batchNames of chunk(missingNames, 400)) {
        const batch = writeBatch(db)
        for (const name of batchNames) {
          const ref = doc(collection(db, 'exercises'))
          batch.set(ref, {
            name,
            category: null,
            imageUrl: null,
            createdBy: user.uid,
            createdAt: serverTimestamp(),
          })
          nameToExercise.set(normalizeName(name), { id: ref.id, name, imageUrl: null })
        }
        await batch.commit()
      }

      for (const dayBatch of chunk(days, 400)) {
        const batch = writeBatch(db)
        for (const day of dayBatch) {
          const ref = doc(collection(db, 'planTemplates'))
          batch.set(ref, {
            title: titleFor(day),
            coachId: user.uid,
            items: buildDayItems(day, nameToExercise),
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          })
        }
        await batch.commit()
      }

      setImportResult(
        `Se crearon ${days.length} plantilla${days.length === 1 ? '' : 's'}` +
          (missingNames.length > 0
            ? ` y ${missingNames.length} ejercicio${missingNames.length === 1 ? '' : 's'} nuevo${missingNames.length === 1 ? '' : 's'} en tu librería.`
            : '.'),
      )
      setDays(null)
      setText('')
      setFile(null)
    } catch {
      setImportError('No se pudo completar la importación. Intentá de nuevo.')
    } finally {
      setImporting(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-900">Importar plantillas</h2>
        <button
          type="button"
          onClick={() => navigate('/coach/plantillas')}
          className="rounded-lg px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100"
        >
          Volver a plantillas
        </button>
      </div>

      <div className="rounded-2xl bg-white p-6 shadow-sm">
        <div className="mb-4 flex gap-2">
          <button
            type="button"
            onClick={() => {
              setMode('text')
              setDays(null)
              setParseError('')
            }}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
              mode === 'text' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700'
            }`}
          >
            Pegar texto
          </button>
          <button
            type="button"
            onClick={() => {
              setMode('excel')
              setDays(null)
              setParseError('')
            }}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
              mode === 'excel' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700'
            }`}
          >
            Subir Excel
          </button>
        </div>

        <div>
          <label className={labelClass}>Prefijo (opcional)</label>
          <input
            value={prefix}
            onChange={(e) => setPrefix(e.target.value)}
            placeholder="Ej: Full Body"
            className={`${inputClass} mb-4 max-w-sm`}
          />
        </div>

        {mode === 'text' ? (
          <div className="space-y-3">
            <p className="text-sm text-slate-500">
              Pegá uno o varios días, con "Día N", "Circuito N" y cada ejercicio con sus
              repeticiones (ej: 12-10-8 o 20x3). Ejemplo:
            </p>
            <pre className="whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-xs text-slate-500">
              {EXAMPLE_TEXT}
            </pre>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={12}
              placeholder="Pegá acá la planificación completa..."
              className={inputClass}
            />
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-slate-500">
              Subí el Excel con las planificaciones. Cada hoja puede tener varios "Día N", y cada
              bloque de ejercicios (con una fila "Ejercicio") se carga como un circuito.
            </p>
            <input
              type="file"
              accept=".xlsx,.xls"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="text-sm text-slate-600"
            />
          </div>
        )}

        <button
          type="button"
          onClick={handleAnalyze}
          className="mt-4 rounded-lg bg-slate-100 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-200"
        >
          Analizar
        </button>
        {parseError && <p className="mt-3 text-sm text-red-600">{parseError}</p>}
      </div>

      {days && days.length > 0 && (
        <div className="rounded-2xl bg-white p-6 shadow-sm">
          <h3 className="mb-4 text-lg font-semibold text-slate-900">
            Vista previa · {days.length} plantilla{days.length === 1 ? '' : 's'}
          </h3>
          <div className="max-h-[32rem] space-y-4 overflow-y-auto">
            {days.map((day, i) => (
              <div key={i} className="rounded-xl border border-slate-100 p-4">
                <p className="mb-2 font-medium text-slate-900">{titleFor(day)}</p>
                <div className="space-y-2">
                  {day.blocks.map((block, bi) => (
                    <div key={bi} className="text-sm text-slate-600">
                      {block.type === 'circuit' ? (
                        <>
                          <span className="font-medium text-slate-700">{block.name}</span>
                          <ul className="ml-4 list-disc">
                            {block.exercises.map((ex, ei) => (
                              <li key={ei}>
                                {ex.name}
                                {!existingByName.has(normalizeName(ex.name)) && (
                                  <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-700">
                                    nuevo
                                  </span>
                                )}
                                <span className="text-slate-400"> · {ex.values.join('-')}</span>
                              </li>
                            ))}
                          </ul>
                        </>
                      ) : (
                        <div>
                          {block.name}
                          {!existingByName.has(normalizeName(block.name)) && (
                            <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-700">
                              nuevo
                            </span>
                          )}
                          <span className="text-slate-400"> · {block.values.join('-')}</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {importError && <p className="mt-4 text-sm text-red-600">{importError}</p>}
          {importResult && <p className="mt-4 text-sm text-emerald-700">{importResult}</p>}

          <button
            type="button"
            onClick={handleImport}
            disabled={importing}
            className="mt-4 rounded-lg bg-slate-900 px-5 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
          >
            {importing ? 'Importando…' : `Importar ${days.length} plantilla${days.length === 1 ? '' : 's'}`}
          </button>
        </div>
      )}

      {importResult && !days && <p className="text-sm text-emerald-700">{importResult}</p>}
    </div>
  )
}
