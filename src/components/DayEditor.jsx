import { useImperativeHandle } from 'react'
import { Plus } from 'lucide-react'
import { usePlanItems } from '../hooks/usePlanItems'
import PlanItemsEditor from './PlanItemsEditor'

// One day's worth of exercises/circuits. Each day owns its own editor state
// and exposes getCleanItems() to the parent through `ref`, so the parent can
// collect every day's items at save time without lifting all that state up.
export default function DayEditor({ ref, initialItems, exerciseGroups, exerciseById }) {
  const planItems = usePlanItems(initialItems)
  useImperativeHandle(ref, () => ({ getCleanItems: () => planItems.buildCleanItems() }))
  return (
    <PlanItemsEditor
      planItems={planItems}
      exerciseGroups={exerciseGroups}
      exerciseById={exerciseById}
    />
  )
}

export function DayTabs({ days, activeKey, onSelect, onAdd, onRemove }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {days.map((day, index) => (
        <button
          key={day.key}
          type="button"
          onClick={() => onSelect(day.key)}
          className={`rounded-lg px-4 py-2 text-sm font-medium ${
            activeKey === day.key
              ? 'bg-slate-900 text-white'
              : 'bg-white text-slate-600 shadow-sm hover:bg-slate-100'
          }`}
        >
          Día {index + 1}
        </button>
      ))}
      <button
        type="button"
        onClick={onAdd}
        className="inline-flex items-center gap-1 rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100"
      >
        <Plus className="size-4" aria-hidden="true" /> Agregar día
      </button>
      {days.length > 1 && (
        <button
          type="button"
          onClick={() => onRemove(activeKey)}
          className="ml-auto rounded-lg px-3 py-2 text-sm font-medium text-red-500 hover:bg-red-50"
        >
          Quitar este día
        </button>
      )}
    </div>
  )
}
