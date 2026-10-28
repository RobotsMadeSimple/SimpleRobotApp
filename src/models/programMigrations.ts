// In-place upgrades of saved program steps whose block the editor no longer has. Mirrors
// ProgramMigrations.cs in the controller, which does the same at startup and on save; the app
// applies it when a program is opened so a program the controller has not re-saved yet (or a
// local one) still opens in its modern form.
import { IoDeviceState, ProgramStep, ioPinSymbol } from "./robotModels";

const condId = () => Math.random().toString(36).slice(2, 10);

/** The nano and pin names an expression reads a step's load cell by, if it is a named load cell on a named nano. */
function loadCellNames(step: ProgramStep, ioDevices: IoDeviceState[]): { nano: string; pin: string } | null {
  if (!step.loadCellDeviceId || step.loadCellPin == null) return null;
  const dev = ioDevices.find(d => d.id === step.loadCellDeviceId);
  if (!dev?.name) return null;
  const pin = (dev.pins ?? []).find(p => p.pin === step.loadCellPin && p.type === "LoadCell");
  return pin?.name ? { nano: dev.name, pin: pin.name } : null;
}

/**
 * "Move with Force" (press along an axis until a load cell reads a target) as the move it was
 * shorthand for: a MoveL from the current position, offset along that axis by the old max travel
 * at the old approach speed, stopping on `$io.<nano>.<cell> >= <grams>`. Keeps the id, name and
 * comment; drops the hold phase, which has no equivalent. Returns null when the step is not a
 * force move or cannot be expressed (no named load cell on a named nano, no target force) — it then
 * stays as it is and the controller's legacy handler still runs it.
 */
export function legacyForceMoveToMoveL(step: ProgramStep, ioDevices: IoDeviceState[]): ProgramStep | null {
  if (step.type !== "MoveWithForce") return null;
  const target = step.forceTargetGrams ?? 0;
  const cell = loadCellNames(step, ioDevices);
  if (!cell || target <= 0) return null;

  const axis = (step.forceAxis ?? "Z").toUpperCase();
  const dir = (step.forceDirection ?? -1) < 0 ? -1 : 1;
  const travel = dir * (step.forceMaxTravelMm ?? 10);
  const offsetKey = ({ X: "offsetX", Y: "offsetY", Z: "offsetZ", RX: "offsetRX", RY: "offsetRY", RZ: "offsetRZ" } as const)[axis as "X"] ?? "offsetZ";

  const {
    forceAxis: _a, forceDirection: _d, forceTargetGrams: _t, forceToleranceGrams: _tol, forceMaxTravelMm: _m,
    forceApproachSpeed: _s, forceHoldMs: _h, forceTimeoutMs: _to, loadCellDeviceId: _ld, loadCellPin: _lp, loadCellUnit: _lu,
    ...rest
  } = step;
  return {
    ...rest,
    type: "MoveL",
    pointName: undefined,
    pointId: undefined,
    [offsetKey]: travel,
    speed: step.forceApproachSpeed ?? 5,
    moveStopCondition: { combinator: "ALL", items: [{ id: condId(), expr: `${ioPinSymbol(cell.nano, cell.pin)} >= ${target}` }] },
    moveStopMode: "stop",
  };
}

/**
 * Every legacy step in `steps` upgraded (recursing into loop, if / else-if / else and CNC bodies).
 * Returns the same array when nothing changed, so callers can keep referential equality.
 */
export function migrateLegacySteps(steps: ProgramStep[], ioDevices: IoDeviceState[]): ProgramStep[] {
  let changed = false;
  const out = steps.map(s => {
    let next = s;
    const converted = legacyForceMoveToMoveL(s, ioDevices);
    if (converted) next = converted;
    const loopSteps      = s.loopSteps      ? migrateLegacySteps(s.loopSteps, ioDevices)      : s.loopSteps;
    const ifSteps        = s.ifSteps        ? migrateLegacySteps(s.ifSteps, ioDevices)        : s.ifSteps;
    const elseSteps      = s.elseSteps      ? migrateLegacySteps(s.elseSteps, ioDevices)      : s.elseSteps;
    const cncProgramSteps = s.cncProgramSteps ? migrateLegacySteps(s.cncProgramSteps, ioDevices) : s.cncProgramSteps;
    let elseIfBranches = s.elseIfBranches;
    if (s.elseIfBranches) {
      let branchChanged = false;
      const branches = s.elseIfBranches.map(b => {
        const bs = migrateLegacySteps(b.steps, ioDevices);
        if (bs !== b.steps) branchChanged = true;
        return bs !== b.steps ? { ...b, steps: bs } : b;
      });
      if (branchChanged) elseIfBranches = branches;
    }
    if (loopSteps !== s.loopSteps || ifSteps !== s.ifSteps || elseSteps !== s.elseSteps
        || cncProgramSteps !== s.cncProgramSteps || elseIfBranches !== s.elseIfBranches) {
      next = { ...next, loopSteps, ifSteps, elseSteps, cncProgramSteps, elseIfBranches };
    }
    if (next !== s) changed = true;
    return next;
  });
  return changed ? out : steps;
}
