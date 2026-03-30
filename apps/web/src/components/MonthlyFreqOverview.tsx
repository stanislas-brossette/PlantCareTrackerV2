const MONTHS = ["Jan", "Fev", "Mar", "Avr", "Mai", "Jun", "Jul", "Aou", "Sep", "Oct", "Nov", "Dec"];
const CURRENT_MONTH = new Date().getMonth();

function getMonthlyValues(values: number[] | null | undefined, fallback: number | null | undefined) {
  if (values && values.length === 12) {
    return values;
  }

  const baseValue = fallback ?? 0;
  return Array(12).fill(baseValue);
}

export default function MonthlyFreqOverview({
  label,
  emoji,
  values,
  fallbackDays,
  embedded = false,
}: {
  label: string;
  emoji: string;
  values: number[] | null | undefined;
  fallbackDays: number | null | undefined;
  embedded?: boolean;
}) {
  const monthlyValues = getMonthlyValues(values, fallbackDays);
  const maxValue = Math.max(...monthlyValues.filter((value) => value > 0), 1);
  const hasAnyCare = monthlyValues.some((value) => value > 0);

  return (
    <div className={embedded ? "" : "rounded-2xl bg-white p-4 shadow-sm dark:bg-gray-800"}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="text-sm font-semibold text-gray-900 dark:text-white">
          {emoji} {label}
        </div>
        <div className="text-xs text-gray-500 dark:text-gray-400">
          {values ? "Saisonnier" : fallbackDays ? `Tous les ${fallbackDays} jours` : "Non defini"}
        </div>
      </div>

      <div className="rounded-xl bg-gray-50 p-3 dark:bg-gray-900">
        <div className="mb-2 grid grid-cols-6 gap-1.5">
          {MONTHS.map((month, index) => (
            <div key={month} className="text-center">
              <div
                className={`mb-1 text-[11px] font-medium ${
                  index === CURRENT_MONTH ? "text-green-600 dark:text-green-400" : "text-gray-400"
                }`}
              >
                {month}
              </div>
              <div
                className={`rounded-lg border px-1 py-1.5 text-xs ${
                  index === CURRENT_MONTH
                    ? "border-green-400 bg-green-50 text-green-700 dark:border-green-600 dark:bg-green-950/40 dark:text-green-300"
                    : "border-gray-200 bg-white text-gray-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200"
                } ${monthlyValues[index] === 0 ? "opacity-50" : ""}`}
              >
                {monthlyValues[index] > 0 ? `${monthlyValues[index]}j` : "—"}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-3 flex h-10 items-end gap-0.5">
          {monthlyValues.map((value, index) => {
            const pct = value > 0 ? Math.max(Math.round((value / maxValue) * 100), 10) : 0;
            return (
              <div
                key={`${label}-${index}`}
                className="flex-1 rounded-sm transition-all"
                style={{
                  height: `${pct}%`,
                  minHeight: value > 0 ? "4px" : "0",
                  backgroundColor:
                    index === CURRENT_MONTH ? "#16a34a" : value === 0 ? "transparent" : "#86efac",
                  border: value === 0 ? "1px dashed #d1d5db" : "none",
                }}
                title={`${MONTHS[index]}: ${value > 0 ? `${value} jours` : "aucun soin"}`}
              />
            );
          })}
        </div>

        <div className="mt-1 flex justify-between text-[11px] text-gray-400">
          <span>Jan</span>
          <span>Dec</span>
        </div>

        {!hasAnyCare && (
          <div className="mt-2 text-xs text-gray-500 dark:text-gray-400">
            Aucun soin planifie pour le moment.
          </div>
        )}
      </div>
    </div>
  );
}
