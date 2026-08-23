const inputClass =
  'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500'
const labelClass = 'mb-1 block text-xs font-medium text-slate-500'

function ExercisePicker({ exerciseGroups, exerciseId, name, onPick, onNameChange }) {
  return (
    <div className="flex-1">
      <label className={labelClass}>Ejercicio (de tu librería)</label>
      <select
        value={exerciseId}
        onChange={(e) => onPick(e.target.value)}
        className={`${inputClass} mb-2`}
      >
        <option value="">Elegí o escribí abajo</option>
        {exerciseGroups.map(([groupName, exs]) => (
          <optgroup key={groupName} label={groupName}>
            {exs.map((ex) => (
              <option key={ex.id} value={ex.id}>
                {ex.name}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
      <input
        value={name}
        onChange={(e) => onNameChange(e.target.value)}
        placeholder="Nombre del ejercicio"
        className={inputClass}
      />
    </div>
  )
}

function ModeSelect({ mode, onChange }) {
  return (
    <div>
      <label className={labelClass}>Tipo</label>
      <select value={mode} onChange={(e) => onChange(e.target.value)} className={inputClass}>
        <option value="reps">Reps</option>
        <option value="time">Tiempo</option>
      </select>
    </div>
  )
}

function ValuesRow({ title, values, placeholder, onChange, onRepeatFirst, label }) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-2">
        <label className={labelClass}>{title}</label>
        {values.length > 1 && (
          <button
            type="button"
            onClick={onRepeatFirst}
            title="Copiar el valor de la primera a todas las demás"
            className="text-xs font-medium text-slate-500 hover:text-slate-700"
          >
            Repetir →
          </button>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        {values.map((v, i) => (
          <div key={i} className="flex flex-col items-center">
            <span className="mb-0.5 text-[10px] text-slate-400">
              {label} {i + 1}
            </span>
            <input
              value={v}
              onChange={(e) => onChange(i, e.target.value)}
              placeholder={placeholder}
              className="w-16 rounded-lg border border-slate-300 px-2 py-1.5 text-sm outline-none focus:border-slate-500"
            />
          </div>
        ))}
      </div>
    </div>
  )
}

export default function PlanItemsEditor({ planItems, exerciseGroups, exerciseById }) {
  const {
    items,
    addExercise,
    addCircuit,
    removeBlock,
    updateExerciseBlock,
    updateExerciseValue,
    repeatExerciseValues,
    updateExerciseWeight,
    repeatExerciseWeights,
    updateExerciseRest,
    repeatExerciseRests,
    pickExercise,
    updateCircuitField,
    updateCircuitRounds,
    addCircuitExercise,
    removeCircuitExercise,
    updateCircuitExercise,
    updateCircuitExerciseValue,
    repeatCircuitExerciseValues,
    updateCircuitExerciseWeight,
    repeatCircuitExerciseWeights,
    updateCircuitExerciseRest,
    repeatCircuitExerciseRests,
    pickCircuitExercise,
  } = planItems

  return (
    <div className="rounded-2xl bg-white p-6 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-900">Ejercicios</h2>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={addExercise}
            className="rounded-lg px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100"
          >
            + Agregar ejercicio
          </button>
          <button
            type="button"
            onClick={addCircuit}
            className="rounded-lg bg-slate-100 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-200"
          >
            + Agregar circuito
          </button>
        </div>
      </div>

      <div className="space-y-4">
        {items.map((block, index) =>
          block.type === 'circuit' ? (
            <div key={index} className="rounded-xl border-2 border-slate-200 bg-slate-50 p-4">
              <div className="mb-3 flex items-start justify-between gap-3">
                <div className="grid flex-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className={labelClass}>Nombre del circuito</label>
                    <input
                      value={block.name}
                      onChange={(e) => updateCircuitField(index, { name: e.target.value })}
                      placeholder="Circuito 1"
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Rondas</label>
                    <input
                      type="number"
                      min="1"
                      value={block.rounds}
                      onChange={(e) => updateCircuitRounds(index, e.target.value)}
                      className={inputClass}
                    />
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => removeBlock(index)}
                  className="mt-5 rounded-lg px-2 py-1 text-sm text-red-500 hover:bg-red-50"
                >
                  Quitar circuito
                </button>
              </div>

              <div className="space-y-3">
                {block.exercises.map((ex, exIndex) => (
                  <div key={exIndex} className="rounded-lg border border-slate-200 bg-white p-3">
                    <div className="mb-2 flex items-start gap-3">
                      <ExercisePicker
                        exerciseGroups={exerciseGroups}
                        exerciseId={ex.exerciseId}
                        name={ex.name}
                        onPick={(idVal) =>
                          pickCircuitExercise(index, exIndex, exerciseById[idVal])
                        }
                        onNameChange={(name) =>
                          updateCircuitExercise(index, exIndex, { name, exerciseId: '' })
                        }
                      />
                      <ModeSelect
                        mode={ex.mode}
                        onChange={(mode) => updateCircuitExercise(index, exIndex, { mode })}
                      />
                      {block.exercises.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeCircuitExercise(index, exIndex)}
                          className="mt-5 rounded-lg px-2 py-1 text-sm text-red-500 hover:bg-red-50"
                        >
                          Quitar
                        </button>
                      )}
                    </div>
                    <div className="space-y-3">
                      <ValuesRow
                        title={ex.mode === 'time' ? 'Tiempo por ronda' : 'Repeticiones por ronda'}
                        values={ex.values}
                        label="Ronda"
                        placeholder={ex.mode === 'time' ? '30s' : '12'}
                        onChange={(setIndex, value) =>
                          updateCircuitExerciseValue(index, exIndex, setIndex, value)
                        }
                        onRepeatFirst={() => repeatCircuitExerciseValues(index, exIndex)}
                      />
                      {ex.mode === 'time' && (
                        <ValuesRow
                          title="Descanso por ronda"
                          values={ex.rests}
                          label="Ronda"
                          placeholder="10s"
                          onChange={(setIndex, value) =>
                            updateCircuitExerciseRest(index, exIndex, setIndex, value)
                          }
                          onRepeatFirst={() => repeatCircuitExerciseRests(index, exIndex)}
                        />
                      )}
                      <ValuesRow
                        title="Peso por ronda"
                        values={ex.weights}
                        label="Ronda"
                        placeholder="20kg"
                        onChange={(setIndex, value) =>
                          updateCircuitExerciseWeight(index, exIndex, setIndex, value)
                        }
                        onRepeatFirst={() => repeatCircuitExerciseWeights(index, exIndex)}
                      />
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div>
                          <label className={labelClass}>Ritmo</label>
                          <input
                            value={ex.tempo}
                            onChange={(e) =>
                              updateCircuitExercise(index, exIndex, { tempo: e.target.value })
                            }
                            placeholder="2-1-2-0"
                            className={inputClass}
                          />
                        </div>
                        <div>
                          <label className={labelClass}>Comentarios</label>
                          <input
                            value={ex.notes}
                            onChange={(e) =>
                              updateCircuitExercise(index, exIndex, { notes: e.target.value })
                            }
                            placeholder="Indicaciones para este ejercicio"
                            className={inputClass}
                          />
                        </div>
                      </div>
                    </div>
                    {ex.imageUrl && (
                      <img
                        src={ex.imageUrl}
                        alt={ex.name}
                        className="mt-3 h-16 w-16 rounded-lg object-cover"
                      />
                    )}
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => addCircuitExercise(index)}
                  className="rounded-lg px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100"
                >
                  + Agregar ejercicio al circuito
                </button>
              </div>

              <div className="mt-3">
                <label className={labelClass}>Comentarios del circuito</label>
                <input
                  value={block.notes}
                  onChange={(e) => updateCircuitField(index, { notes: e.target.value })}
                  placeholder="Ej: descanso 60s entre rondas"
                  className={inputClass}
                />
              </div>
            </div>
          ) : (
            <div key={index} className="rounded-xl border border-slate-100 p-4">
              <div className="mb-3 flex items-start gap-3">
                <ExercisePicker
                  exerciseGroups={exerciseGroups}
                  exerciseId={block.exerciseId}
                  name={block.name}
                  onPick={(idVal) => pickExercise(index, exerciseById[idVal])}
                  onNameChange={(name) => updateExerciseBlock(index, { name, exerciseId: '' })}
                />
                <ModeSelect
                  mode={block.mode}
                  onChange={(mode) => updateExerciseBlock(index, { mode })}
                />
                <button
                  type="button"
                  onClick={() => removeBlock(index)}
                  className="mt-5 rounded-lg px-2 py-1 text-sm text-red-500 hover:bg-red-50"
                >
                  Quitar
                </button>
              </div>
              <div className="space-y-3">
                <div className="sm:w-32">
                  <label className={labelClass}>Series</label>
                  <input
                    type="number"
                    min="1"
                    value={block.sets}
                    onChange={(e) => updateExerciseBlock(index, { sets: e.target.value })}
                    className={inputClass}
                  />
                </div>
                <ValuesRow
                  title={block.mode === 'time' ? 'Tiempo por serie' : 'Repeticiones por serie'}
                  values={block.values}
                  label="Serie"
                  placeholder={block.mode === 'time' ? '30s' : '12'}
                  onChange={(setIndex, value) => updateExerciseValue(index, setIndex, value)}
                  onRepeatFirst={() => repeatExerciseValues(index)}
                />
                {block.mode === 'time' && (
                  <ValuesRow
                    title="Descanso por serie"
                    values={block.rests}
                    label="Serie"
                    placeholder="10s"
                    onChange={(setIndex, value) => updateExerciseRest(index, setIndex, value)}
                    onRepeatFirst={() => repeatExerciseRests(index)}
                  />
                )}
                <ValuesRow
                  title="Peso por serie"
                  values={block.weights}
                  label="Serie"
                  placeholder="20kg"
                  onChange={(setIndex, value) => updateExerciseWeight(index, setIndex, value)}
                  onRepeatFirst={() => repeatExerciseWeights(index)}
                />
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className={labelClass}>Ritmo</label>
                    <input
                      value={block.tempo}
                      onChange={(e) => updateExerciseBlock(index, { tempo: e.target.value })}
                      placeholder="2-1-2-0"
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Comentarios</label>
                    <input
                      value={block.notes}
                      onChange={(e) => updateExerciseBlock(index, { notes: e.target.value })}
                      placeholder="Indicaciones para este ejercicio"
                      className={inputClass}
                    />
                  </div>
                </div>
              </div>
              {block.imageUrl && (
                <img
                  src={block.imageUrl}
                  alt={block.name}
                  className="mt-3 h-16 w-16 rounded-lg object-cover"
                />
              )}
            </div>
          ),
        )}
      </div>
    </div>
  )
}
