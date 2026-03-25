import { useState, useEffect } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";

const MONTHS = ["Jan","Fév","Mar","Avr","Mai","Jun","Jul","Aoû","Sep","Oct","Nov","Déc"];
const CURRENT_MONTH = new Date().getMonth(); // 0-indexed

interface Props {
  label: string;
  emoji: string;
  value: number[] | null;           // 12 values or null
  scalarValue: string;              // fallback scalar (string from input)
  onChangeMonthly: (v: number[] | null) => void;
  onChangeScalar: (v: string) => void;
}

export default function MonthlyFreqEditor({
  label, emoji, value, scalarValue, onChangeMonthly, onChangeScalar,
}: Props) {
  const [expanded, setExpanded] = useState(!!value);

  // Expand automatically when value becomes available after async load
  useEffect(() => {
    if (value) setExpanded(true);
  }, [value]);

  // If monthly mode is active, initialise with current values or defaults
  const monthly = value ?? Array(12).fill(parseInt(scalarValue) || 7);

  const handleToggleMonthly = () => {
    if (expanded) {
      // Collapse → clear monthly, keep scalar
      onChangeMonthly(null);
      setExpanded(false);
    } else {
      // Expand → init monthly from scalar
      const base = parseInt(scalarValue) || 7;
      onChangeMonthly(Array(12).fill(base));
      setExpanded(true);
    }
  };

  const handleCellChange = (idx: number, raw: string) => {
    const v = parseInt(raw);
    const next = [...monthly];
    next[idx] = isNaN(v) ? 0 : Math.max(0, v);
    onChangeMonthly(next);
  };

  return (
    <div className="space-y-2">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
          {emoji} {label}
        </label>
        <button
          type="button"
          onClick={handleToggleMonthly}
          className={`flex items-center gap-1 text-xs px-2 py-1 rounded-lg transition-colors ${
            expanded
              ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400"
              : "bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400"
          }`}
        >
          {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          {expanded ? "Saisonnalité activée" : "Activer la saisonnalité"}
        </button>
      </div>

      {/* Scalar fallback (always visible when not in monthly mode) */}
      {!expanded && (
        <input
          type="number"
          value={scalarValue}
          onChange={(e) => onChangeScalar(e.target.value)}
          placeholder="ex: 7"
          min="1"
          className="w-full border border-gray-200 dark:border-gray-600 rounded-xl px-3 py-2.5 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-green-500"
        />
      )}

      {/* Monthly grid */}
      {expanded && (
        <div className="bg-gray-50 dark:bg-gray-900 rounded-xl p-3">
          <p className="text-xs text-gray-400 mb-2">
            Nombre de jours entre chaque soin. Mettre <strong>0</strong> pour les mois sans soin.
          </p>
          <div className="grid grid-cols-6 gap-1.5">
            {MONTHS.map((month, idx) => (
              <div key={idx} className="flex flex-col items-center gap-1">
                <span
                  className={`text-xs font-medium ${
                    idx === CURRENT_MONTH
                      ? "text-green-600 dark:text-green-400"
                      : "text-gray-400"
                  }`}
                >
                  {month}
                </span>
                <input
                  type="number"
                  value={monthly[idx] === 0 ? "" : monthly[idx]}
                  onChange={(e) => handleCellChange(idx, e.target.value)}
                  placeholder="—"
                  min="0"
                  className={`w-full text-center border rounded-lg px-1 py-1.5 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-green-500 ${
                    idx === CURRENT_MONTH
                      ? "border-green-400 dark:border-green-600 ring-1 ring-green-300"
                      : "border-gray-200 dark:border-gray-600"
                  } ${monthly[idx] === 0 ? "opacity-40" : ""}`}
                />
              </div>
            ))}
          </div>

          {/* Visual summary bar */}
          <div className="mt-3 flex gap-0.5 h-8 items-end">
            {monthly.map((v, idx) => {
              const maxVal = Math.max(...monthly.filter(Boolean), 1);
              const pct = v > 0 ? Math.round((v / maxVal) * 100) : 0;
              return (
                <div
                  key={idx}
                  className="flex-1 rounded-sm transition-all"
                  style={{
                    height: `${pct}%`,
                    minHeight: v > 0 ? "4px" : "0",
                    backgroundColor:
                      idx === CURRENT_MONTH
                        ? "#16a34a"
                        : v === 0
                        ? "transparent"
                        : "#86efac",
                    border: v === 0 ? "1px dashed #d1d5db" : "none",
                  }}
                  title={`${MONTHS[idx]}: ${v > 0 ? `${v}j` : "aucun soin"}`}
                />
              );
            })}
          </div>
          <div className="flex justify-between text-xs text-gray-300 mt-0.5">
            <span>Jan</span><span>Déc</span>
          </div>
        </div>
      )}
    </div>
  );
}
