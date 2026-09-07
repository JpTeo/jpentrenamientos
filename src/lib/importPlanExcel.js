import * as XLSX from 'xlsx'

const DIA_RE = /^d[íi]a\s+\d+/i
const EJERCICIO_RE = /^ejercicio\b/i

function cellText(cell) {
  if (cell === undefined || cell === null) return ''
  return String(cell).trim()
}

// Reads one sheet already converted to an array-of-rows (via
// XLSX.utils.sheet_to_json(ws, { header: 1 })) and splits it into day
// sections, in the same { title, blocks } shape parsePlanText produces.
// Each "Día N" row starts a new day; each "Ejercicio" header row starts a
// new circuit block (the row right after it is a numeric sub-header and is
// skipped); every following row with text in column A is an exercise, whose
// reps-per-set values are read from columns B–F.
export function parseSheetRows(rows, sheetLabel) {
  const days = []
  let currentDay = null
  let currentBlock = null
  let mode = 'seek' // 'seek' | 'skip-subheader' | 'collecting'
  let blockCount = 0

  function startDay(title) {
    currentDay = { title: `${sheetLabel} - ${title}`, blocks: [] }
    days.push(currentDay)
    currentBlock = null
    blockCount = 0
    mode = 'seek'
  }

  for (const row of rows || []) {
    const colA = cellText(row[0])
    if (!colA) continue

    if (DIA_RE.test(colA)) {
      startDay(colA)
      continue
    }

    if (EJERCICIO_RE.test(colA)) {
      if (!currentDay) startDay('Día 1')
      blockCount += 1
      currentBlock = { type: 'circuit', name: `Bloque ${blockCount}`, exercises: [] }
      currentDay.blocks.push(currentBlock)
      mode = 'skip-subheader'
      continue
    }

    if (mode === 'skip-subheader') {
      mode = 'collecting'
      continue
    }

    if (mode === 'collecting' && currentBlock) {
      // Stray metadata rows (block timing markers etc.) sit between the last
      // exercise of a block and the next "Ejercicio" header; a bare number in
      // column A is never a real exercise name, so skip it.
      if (/^\d+(\.\d+)?$/.test(colA)) continue
      const values = row.slice(1, 6).map(cellText).filter(Boolean)
      currentBlock.exercises.push({
        name: colA,
        sets: values.length || 1,
        values: values.length ? values : [''],
      })
    }
  }

  return days
}

// Parses an .xlsx file (as an ArrayBuffer) into the same day list shape
// parsePlanText returns, one entry per "Día" section found across all sheets.
export function parseWorkbook(arrayBuffer) {
  const workbook = XLSX.read(arrayBuffer, { type: 'array' })
  const days = []
  for (const sheetName of workbook.SheetNames) {
    const ws = workbook.Sheets[sheetName]
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: '' })
    days.push(...parseSheetRows(rows, sheetName))
  }
  return days
}
