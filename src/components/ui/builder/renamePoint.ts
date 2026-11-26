import { ProgramStep } from "@/src/models/robotModels";
import { mapStepTree } from "@/src/models/stepTree";

/**
 * Refresh the display name on every step that links to a renamed program point.
 *
 * Steps reference a point by BOTH `pointId` (stable) and `pointName` (display); resolution is
 * id-first, so the link itself already survives a rename. This keeps the stored name — and anything
 * that reads it for display — current. MoveC's via-point (`viaPointId`/`viaPointName`) is updated the
 * same way. Matching is by id, so only the renamed point's steps are touched.
 */
export function renameProgramPointInSteps(steps: ProgramStep[], pointId: string, newName: string): ProgramStep[] {
  if (!pointId) return steps;
  return steps.map(root => mapStepTree(root, s => {
    let out = s;
    if (s.pointId === pointId && s.pointName !== newName) out = { ...out, pointName: newName };
    const via = s as ProgramStep & { viaPointId?: string; viaPointName?: string };
    if (via.viaPointId === pointId && via.viaPointName !== newName) {
      out = { ...out, viaPointName: newName } as ProgramStep;
    }
    return out;
  }));
}
