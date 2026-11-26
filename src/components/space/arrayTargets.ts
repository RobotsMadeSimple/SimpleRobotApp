import type { Cell3DTarget } from "@/src/components/ui/cell3d/bridge";
import type { Grid, Local, Point, RobotStack } from "@/src/models/robotModels";

/**
 * Grid-cell / stack-slot target maths, a line-for-line port of the controller's
 * MoveTargetResolver.GridCell / StackSlot and LocalFrame.Apply. The 3D view draws cells from it
 * (space3d.tsx gridSet / stackSet), and a manual move to a cell sends its result as the fallback
 * x…rz for a controller that cannot resolve `{ grid, row, col }` / `{ stack, index }` itself.
 */

export type Pose6 = { x: number; y: number; z: number; rx: number; ry: number; rz: number };

/** One grid cell or stack slot, by the array's stable id; zero-based, as programs index them. */
export type ArrayCell =
  | { kind: "grid"; id: string; row: number; col: number }
  | { kind: "stack"; id: string; index: number };

const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);

/** The array cell a 3D pick names, or null (a point, a local, a whole-array target, empty space). */
export function cellFromTarget(t: Cell3DTarget | null | undefined): ArrayCell | null {
  if (!t?.id) return null;
  if (t.kind === "grid" && Number.isInteger(t.row) && Number.isInteger(t.col)) return { kind: "grid", id: t.id, row: t.row!, col: t.col! };
  if (t.kind === "stack" && Number.isInteger(t.index)) return { kind: "stack", id: t.id, index: t.index! };
  return null;
}

/** The 3D highlight for a cell (just that cell is emphasised). */
export function cellTarget(c: ArrayCell): Cell3DTarget {
  return c.kind === "grid" ? { kind: "grid", id: c.id, row: c.row, col: c.col } : { kind: "stack", id: c.id, index: c.index };
}

/** MoveTargetResolver.GridCell: row / column offsets rotated about the base point's Z axis. */
export function gridCellPose(grid: Grid, base: Point, row: number, col: number): Pose6 {
  const rawX = row * n(grid.rowOffsetX) + col * n(grid.colOffsetX);
  const rawY = row * n(grid.rowOffsetY) + col * n(grid.colOffsetY);
  const rawZ = row * n(grid.rowOffsetZ) + col * n(grid.colOffsetZ);
  const t = (n(grid.rotation) * Math.PI) / 180;
  return {
    x: n(base.x) + rawX * Math.cos(t) - rawY * Math.sin(t),
    y: n(base.y) + rawX * Math.sin(t) + rawY * Math.cos(t),
    z: n(base.z) + rawZ,
    rx: n(base.rx), ry: n(base.ry), rz: n(base.rz),
  };
}

/** MoveTargetResolver.StackSlot: base + index × offset (the index wraps when there is a max count). */
export function stackSlotPose(stack: RobotStack, base: Point, index: number): Pose6 {
  const max = stack.maxCount && stack.maxCount > 0 ? stack.maxCount : 0;
  const i = max ? ((index % max) + max) % max : index;
  return {
    x: n(base.x) + i * n(stack.offsetX), y: n(base.y) + i * n(stack.offsetY), z: n(base.z) + i * n(stack.offsetZ),
    rx: n(base.rx), ry: n(base.ry), rz: n(base.rz),
  };
}

/** LocalFrame.Apply: local pose → world (full R = Rz·Ry·Rx rotation + translation; yaw adds). */
export function applyLocal(local: Pose6, p: Pose6): Pose6 {
  const a = (local.rz * Math.PI) / 180, b = (local.ry * Math.PI) / 180, g = (local.rx * Math.PI) / 180;
  const ca = Math.cos(a), sa = Math.sin(a), cb = Math.cos(b), sb = Math.sin(b), cg = Math.cos(g), sg = Math.sin(g);
  return {
    x: local.x + ca * cb * p.x + (ca * sb * sg - sa * cg) * p.y + (ca * sb * cg + sa * sg) * p.z,
    y: local.y + sa * cb * p.x + (sa * sb * sg + ca * cg) * p.y + (sa * sb * cg - ca * sg) * p.z,
    z: local.z - sb * p.x + cb * sg * p.y + cb * cg * p.z,
    rx: p.rx, ry: p.ry, rz: p.rz + local.rz,
  };
}

/** A cell resolved for display and for a manual move to it. */
export type ResolvedCell = {
  cell: ArrayCell;
  /** The array's name (a display alias — the move goes by id). */
  arrayName: string;
  /** "Tray · row 2, col 3" / "Parts · slot 4" (1-based for people). */
  title: string;
  /** "row 1, col 2" / "index 3": the zero-based index a program uses. */
  programIndex: string;
  /** Base frame (the saved geometry, as the 3D view draws it). */
  pose: Pose6;
  /** Where the TCP ends up: the pose through the active local, as the controller resolves it. */
  world: Pose6;
  /** The cell is past the array's count (only possible for a stale pick). */
  outside: boolean;
};

export type CellSources = { grids: Grid[]; stacks: RobotStack[]; points: Point[]; locals: Local[]; activeLocal?: string | null };

/** The active local frame as the controller applies it (by the name it reports), or null. */
export function activeLocalPose(locals: Local[], activeLocal: string | null | undefined): Pose6 | null {
  if (!activeLocal || activeLocal.toLowerCase() === "none") return null;
  const l = locals.find(x => x.name === activeLocal);
  return l ? { x: n(l.x), y: n(l.y), z: n(l.z), rx: n(l.rx), ry: n(l.ry), rz: n(l.rz) } : null;
}

export function cellTitle(arrayName: string, c: ArrayCell): string {
  return c.kind === "grid" ? `${arrayName} · row ${c.row + 1}, col ${c.col + 1}` : `${arrayName} · slot ${c.index + 1}`;
}

/**
 * Resolves a cell of a grid / stack (looked up by stable id in `src`, or the given unsaved item)
 * to its base-frame and world poses. Null when the array or its base point is missing.
 */
export function resolveCell(c: ArrayCell, src: CellSources, item?: Grid | RobotStack | null): ResolvedCell | null {
  const local = activeLocalPose(src.locals, src.activeLocal);
  let pose: Pose6, name: string, outside: boolean;
  if (c.kind === "grid") {
    const g = (item as Grid | null | undefined) ?? src.grids.find(x => x.id === c.id);
    const base = g && src.points.find(p => p.name === g.basePointName);
    if (!g || !base) return null;
    pose = gridCellPose(g, base, c.row, c.col);
    name = g.name;
    outside = c.row < 0 || c.col < 0 || (!!g.rowCount && g.rowCount > 0 && c.row >= g.rowCount) || (!!g.colCount && g.colCount > 0 && c.col >= g.colCount);
  } else {
    const s = (item as RobotStack | null | undefined) ?? src.stacks.find(x => x.id === c.id);
    const base = s && src.points.find(p => p.name === s.basePointName);
    if (!s || !base) return null;
    pose = stackSlotPose(s, base, c.index);
    name = s.name;
    outside = c.index < 0 || (!!s.maxCount && s.maxCount > 0 && c.index >= s.maxCount);
  }
  return {
    cell: c,
    arrayName: name,
    title: cellTitle(name, c),
    programIndex: c.kind === "grid" ? `row ${c.row}, col ${c.col}` : `index ${c.index}`,
    pose,
    world: local ? applyLocal(local, pose) : pose,
    outside,
  };
}
