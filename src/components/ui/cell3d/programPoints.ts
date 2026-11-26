import type { BuiltProgram, Grid, Point, ProgramStep, RobotStack } from "@/src/models/robotModels";
import { walkSteps } from "@/src/models/stepTree";

/**
 * The saved points a program refers to, by stable id, for the 3D view's point filter: move
 * targets and MoveC via points (by id, else the step's cached name), grid / stack base points,
 * and the same for every routine it calls (followed by routine id, once each).
 */
export function programPointIds(
  program: BuiltProgram | null,
  all: BuiltProgram[],
  points: Point[],
  grids: Grid[],
  stacks: RobotStack[],
): string[] {
  if (!program) return [];
  const byName = new Map<string, string>();
  for (const p of points) if (p.id && !byName.has(p.name)) byName.set(p.name, p.id);
  const known = new Set(points.map(p => p.id).filter(Boolean));
  const out = new Set<string>();
  const add = (id: string | undefined, name: string | undefined) => {
    const v = id && known.has(id) ? id : name ? byName.get(name) : undefined;
    if (v) out.add(v);
  };

  const seen = new Set<string>();
  const visit = (steps: ProgramStep[] | undefined) => {
    for (const { step } of walkSteps(steps)) {
      add(step.pointId, step.pointName);
      add(step.viaPointId, step.viaPointName);
      if (step.gridPoint?.gridId) add(undefined, grids.find(g => g.id === step.gridPoint!.gridId)?.basePointName);
      if (step.stackPoint?.stackId) add(undefined, stacks.find(s => s.id === step.stackPoint!.stackId)?.basePointName);
      if (step.type === "CallRoutine") {
        const r = all.find(p => (step.routineId ? p.id === step.routineId : p.name === step.routineName));
        const key = r?.id || r?.name;
        if (r && key && !seen.has(key)) { seen.add(key); visit(r.steps); }
      }
    }
  };
  seen.add(program.id || program.name);
  visit(program.steps);
  return [...out];
}

/**
 * The saved point the robot is heading for while it moves: the running move step's point when it
 * names one, else a point within 0.5 mm of the reported target. Null when idle or unknown.
 */
export function movingToPointId(
  step: ProgramStep | undefined,
  status: { moving?: boolean; targetX?: number; targetY?: number; targetZ?: number } | undefined,
  points: Point[],
): string | null {
  if (!status?.moving) return null;
  if (step?.pointId && points.some(p => p.id === step.pointId)) return step.pointId;
  if (step?.pointName) {
    const p = points.find(q => q.name === step.pointName);
    if (p?.id) return p.id;
  }
  const { targetX, targetY, targetZ } = status;
  if (typeof targetX !== "number" || typeof targetY !== "number" || typeof targetZ !== "number") return null;
  const hit = points.find(p => Math.abs(p.x - targetX) < 0.5 && Math.abs(p.y - targetY) < 0.5 && Math.abs(p.z - targetZ) < 0.5);
  return hit?.id || null;
}
