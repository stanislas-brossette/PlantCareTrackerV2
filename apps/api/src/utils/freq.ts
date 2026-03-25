/**
 * Parse a JSON monthly frequency array stored as a string in SQLite.
 * Returns an array of 12 numbers or null.
 */
export function parseMonthlyFreq(json: string | null | undefined): number[] | null {
  if (!json) return null;
  try {
    const arr = JSON.parse(json);
    if (Array.isArray(arr) && arr.length === 12) return arr;
  } catch {}
  return null;
}

/**
 * Returns the effective watering/fertilizing frequency (in days) for a given date,
 * preferring the monthly array over the scalar fallback.
 */
export function getEffectiveFreq(
  monthly: string | null | undefined,
  scalar: number | null | undefined,
  date: Date = new Date()
): number | null {
  const arr = parseMonthlyFreq(monthly);
  if (arr) {
    const monthIndex = date.getMonth(); // 0 = January
    const val = arr[monthIndex];
    return typeof val === "number" && val > 0 ? val : null;
  }
  return scalar ?? null;
}

/**
 * Serialize a 12-value array to JSON string for storage.
 */
export function serializeMonthlyFreq(arr: number[] | null | undefined): string | null {
  if (!arr || arr.length !== 12) return null;
  return JSON.stringify(arr);
}

export const MONTH_NAMES = [
  "Jan", "Fév", "Mar", "Avr", "Mai", "Jun",
  "Jul", "Aoû", "Sep", "Oct", "Nov", "Déc",
];
