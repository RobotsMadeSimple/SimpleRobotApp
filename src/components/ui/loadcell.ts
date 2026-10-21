import type { LoadCellUnit } from "@/src/models/robotModels";

// Grams is the master unit everywhere behind the scenes; these convert to/from the display unit.
// N uses standard gravity (1 kgf = 9.80665 N), i.e. the force a mass exerts under Earth gravity.
const GRAMS_PER: Record<LoadCellUnit, number> = {
  g: 1,
  kg: 1000,
  oz: 28.349523125,
  lb: 453.59237,
  N: 1000 / 9.80665, // grams per newton
};

export const LOAD_CELL_UNITS: LoadCellUnit[] = ["g", "kg", "oz", "lb", "N"];

/** Convert grams → the given display unit. */
export function gramsToUnit(grams: number, unit: LoadCellUnit): number {
  return grams / (GRAMS_PER[unit] ?? 1);
}

/** Convert a value in the given display unit → grams. */
export function unitToGrams(value: number, unit: LoadCellUnit): number {
  return value * (GRAMS_PER[unit] ?? 1);
}

/** Decimal places that read well for each unit. */
function unitDecimals(unit: LoadCellUnit): number {
  switch (unit) {
    case "kg": return 3;
    case "lb": return 3;
    case "oz": return 2;
    case "N":  return 2;
    default:   return 1; // grams
  }
}

/** Format grams for display in the chosen unit, e.g. "123.4 g" / "1.235 kg". */
export function formatLoadCell(grams: number, unit: LoadCellUnit): string {
  const v = gramsToUnit(grams, unit);
  return `${v.toFixed(unitDecimals(unit))} ${unit}`;
}
