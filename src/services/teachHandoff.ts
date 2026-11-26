// Ephemeral hand-off for teaching a PROGRAM point.
//
// Program points live in the builder's in-memory document (undo history), not in a server repo, so
// when the Jog page teaches one it can't write to the controller — it hands the captured pose back
// here. The builder opens the Jog page with the point's id, the Jog page's Teach writes the pose +
// id into this store and navigates back, and the builder consumes it on focus and commits it into
// the document. One slot: only one teach is ever in flight (you leave the builder to do it).

export type TeachedPose = { x: number; y: number; z: number; rx: number; ry: number; rz: number };

type Handoff = { pointId: string; pointName: string; pose: TeachedPose };

let pending: Handoff | null = null;

export const teachHandoff = {
  /** Jog page: record the captured pose for the point being taught. */
  set(pointId: string, pointName: string, pose: TeachedPose) {
    pending = { pointId, pointName, pose };
  },
  /** Builder: take (and clear) the pending result, optionally only if it matches `pointId`. */
  take(pointId?: string): Handoff | null {
    if (!pending) return null;
    if (pointId && pending.pointId !== pointId) return null;
    const v = pending;
    pending = null;
    return v;
  },
  /** Discard any pending result (e.g. the teach was cancelled). */
  clear() {
    pending = null;
  },
};
