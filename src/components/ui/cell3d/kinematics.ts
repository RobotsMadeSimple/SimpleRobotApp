// Pure pose math for the 3D cell viewer — no three.js, so it can be checked from node
// (scripts/check-cell3d.mjs). Mirrors FusionRobotSim's lib/robot.py (forward kinematics) and
// lib/frames.py (controller poses) exactly:
//
//   q = (status[field] − zero) × scale
//   revolute:  turn by q° about `axis` through `origin`      (Rodrigues)
//   prismatic: slide by q mm along `axis` (normalised)
//   link pose = parent pose × joint motion
//
// Matrices are row-major 4×4 number[16] (m[r*4+c]) like robot.py's tuples; the viewer transposes
// into three.js's column-major Matrix4 with `Matrix4.set(...)` (which takes row-major arguments).

import type { CellAdjust, CellDef, CellPose, CellTool, RobotAdjustable, RobotDef, RobotJoint, Vec3 } from "./cellTypes";

export type Mat4 = number[];

export const IDENTITY: Mat4 = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

export function mul(a: Mat4, b: Mat4): Mat4 {
  const o = new Array(16).fill(0);
  for (let i = 0; i < 4; i++)
    for (let j = 0; j < 4; j++) {
      let s = 0;
      for (let k = 0; k < 4; k++) s += a[i * 4 + k] * b[k * 4 + j];
      o[i * 4 + j] = s;
    }
  return o;
}

export function translation(v: ArrayLike<number>): Mat4 {
  return [1, 0, 0, v[0], 0, 1, 0, v[1], 0, 0, 1, v[2], 0, 0, 0, 1];
}

/** Rotation about a (normalised) axis through the origin, degrees (Rodrigues — robot.py `rotation`). */
export function rotation(axis: ArrayLike<number>, degrees: number): Mat4 {
  const n = Math.hypot(axis[0], axis[1], axis[2]) || 1;
  const x = axis[0] / n, y = axis[1] / n, z = axis[2] / n;
  const t = (degrees * Math.PI) / 180;
  const c = Math.cos(t), s = Math.sin(t), k = 1 - c;
  return [
    c + x * x * k, x * y * k - z * s, x * z * k + y * s, 0,
    y * x * k + z * s, c + y * y * k, y * z * k - x * s, 0,
    z * x * k - y * s, z * y * k + x * s, c + z * z * k, 0,
    0, 0, 0, 1,
  ];
}

export function apply(m: Mat4, p: ArrayLike<number>): Vec3 {
  return [
    m[0] * p[0] + m[1] * p[1] + m[2] * p[2] + m[3],
    m[4] * p[0] + m[5] * p[1] + m[6] * p[2] + m[7],
    m[8] * p[0] + m[9] * p[1] + m[10] * p[2] + m[11],
  ];
}

/** Inverse of a rigid transform (rotation + translation). */
export function invertRigid(m: Mat4): Mat4 {
  const r = [m[0], m[4], m[8], m[1], m[5], m[9], m[2], m[6], m[10]]; // Rᵀ row-major
  const t = [m[3], m[7], m[11]];
  return [
    r[0], r[1], r[2], -(r[0] * t[0] + r[1] * t[1] + r[2] * t[2]),
    r[3], r[4], r[5], -(r[3] * t[0] + r[4] * t[1] + r[5] * t[2]),
    r[6], r[7], r[8], -(r[6] * t[0] + r[7] * t[1] + r[8] * t[2]),
    0, 0, 0, 1,
  ];
}

// ── controller poses (frames.py) ─────────────────────────────────────────────

/** 4×4 for a position and R = Rz(rz)·Ry(ry)·Rx(rx), degrees — the controller's LocalFrame rotation. */
export function eulerPose(x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0): Mat4 {
  const d = Math.PI / 180;
  const a = rz * d, b = ry * d, g = rx * d;
  const ca = Math.cos(a), sa = Math.sin(a), cb = Math.cos(b), sb = Math.sin(b), cg = Math.cos(g), sg = Math.sin(g);
  return [
    ca * cb, ca * sb * sg - sa * cg, ca * sb * cg + sa * sg, x,
    sa * cb, sa * sb * sg + ca * cg, sa * sb * cg - ca * sg, y,
    -sb, cb * sg, cb * cg, z,
    0, 0, 0, 1,
  ];
}

export function poseOf(p: CellPose): Mat4 {
  return eulerPose(num(p.x), num(p.y), num(p.z), num(p.rx), num(p.ry), num(p.rz));
}

/** The TCP the controller reports (x, y, z, rz — a 4-axis arm only yaws), or null without one. */
export function tcpFromStatus(status: Record<string, any> | null | undefined): Mat4 | null {
  if (!status || typeof status.x !== "number") return null;
  return eulerPose(status.x, num(status.y), num(status.z), 0, 0, num(status.rz));
}

// ── forward kinematics (robot.py) ────────────────────────────────────────────

export type JointValues = Record<string, number | null>;

export function jointValues(robot: RobotDef, status: Record<string, any> | null | undefined, prefix = ""): JointValues {
  const out: JointValues = {};
  for (const j of robot.joints) {
    const v = j.value ?? {};
    const field = v.field ? (prefix ? prefix + v.field[0].toUpperCase() + v.field.slice(1) : v.field) : null;
    const raw = field && status ? status[field] : undefined;
    out[j.name] = raw == null || !Number.isFinite(Number(raw)) ? null : (Number(raw) - num(v.zero)) * (v.scale ?? 1);
  }
  return out;
}

export function motion(joint: RobotJoint, q: number): Mat4 {
  if (joint.type === "prismatic") {
    const a = joint.axis;
    const n = Math.hypot(a[0], a[1], a[2]) || 1;
    return translation([(a[0] / n) * q, (a[1] / n) * q, (a[2] / n) * q]);
  }
  const o = joint.origin ?? [0, 0, 0];
  return mul(mul(translation(o), rotation(joint.axis, q)), translation([-o[0], -o[1], -o[2]]));
}

/** The base link: the one link no joint moves (robot.py requires exactly one). */
export function baseLink(robot: RobotDef): string {
  const children = new Set(robot.joints.map(j => j.child));
  const roots = robot.links.map(l => l.name).filter(n => !children.has(n));
  return roots[0] ?? robot.links[0]?.name ?? "";
}

export function flangeLink(robot: RobotDef): string {
  return robot.flange || robot.joints[robot.joints.length - 1]?.child || baseLink(robot);
}

/** {link name: pose in the base frame} for joint values {name: q} (missing / null = 0). */
export function poses(robot: RobotDef, values: JointValues): Record<string, Mat4> {
  const base = baseLink(robot);
  const out: Record<string, Mat4> = { [base]: IDENTITY };
  const jointOf: Record<string, RobotJoint> = {};
  for (const j of robot.joints) jointOf[j.child] = j;
  let pending = robot.links.map(l => l.name).filter(n => n !== base);
  while (pending.length) {
    let progressed = false;
    for (const link of [...pending]) {
      const j = jointOf[link];
      if (!j) { out[link] = IDENTITY; pending = pending.filter(n => n !== link); progressed = true; continue; }
      if (out[j.parent]) {
        out[link] = mul(out[j.parent], motion(j, values[j.name] ?? 0));
        pending = pending.filter(n => n !== link);
        progressed = true;
      }
    }
    if (!progressed) { for (const l of pending) out[l] = IDENTITY; break; } // unconnected: draw at zero pose
  }
  return out;
}

// ── adjustable axes (§3.1) ───────────────────────────────────────────────────

/** Δ = setting − nominal per adjustable axis id (0 when the setting is unknown). */
export function adjustDeltas(robot: RobotDef | null | undefined, settings: Record<string, number | null> | undefined): Record<string, { delta: number; dir: Vec3 }> {
  const out: Record<string, { delta: number; dir: Vec3 }> = {};
  for (const a of (robot?.adjustable ?? []) as RobotAdjustable[]) {
    const v = settings?.[a.setting];
    const n = Math.hypot(a.direction[0], a.direction[1], a.direction[2]) || 1;
    const dir: Vec3 = [a.direction[0] / n, a.direction[1] / n, a.direction[2] / n];
    out[a.id] = { delta: typeof v === "number" && Number.isFinite(v) ? v - num(a.nominal) : 0, dir };
  }
  return out;
}

/**
 * An axis-aligned box after an adjust tag: "stretch" moves the face further along `dir` by Δ (the
 * near face stays), "end" translates the whole box by Δ·dir.
 */
export function adjustBox(min: Vec3, max: Vec3, tag: CellAdjust | undefined, deltas: ReturnType<typeof adjustDeltas>): { min: Vec3; max: Vec3 } {
  const a = tag ? deltas[tag.id] : undefined;
  if (!a || !a.delta) return { min: [...min] as Vec3, max: [...max] as Vec3 };
  const lo = [...min] as Vec3, hi = [...max] as Vec3;
  for (let i = 0; i < 3; i++) {
    const d = a.dir[i] * a.delta;
    if (!d) continue;
    if (tag!.role === "end") { lo[i] += d; hi[i] += d; }
    else if (a.dir[i] > 0) hi[i] += d; // the far face is the max side
    else lo[i] += d;                   // dir negative: the far face is the min side
  }
  return { min: lo, max: hi };
}

// ── tools (§3.2) ─────────────────────────────────────────────────────────────

/**
 * The tool model to show: the one whose controllerTool is the active tool's id; else one without a
 * controllerTool; a package with one tool and no ids always shows it.
 */
export function pickTool(cell: CellDef | null | undefined, activeToolId: string | null | undefined): CellTool | null {
  const tools = cell?.tools ?? [];
  if (!tools.length) return null;
  if (activeToolId) {
    const hit = tools.find(t => t.controllerTool && t.controllerTool === activeToolId);
    if (hit) return hit;
  }
  return tools.find(t => !t.controllerTool) ?? null;
}

/**
 * Where the flange sits relative to the reported TCP: the controller adds the tool offset in the
 * TCP's own frame, as (x, −y, z) in the operator frame (ASTROKinematics: tool = Rz(J1+J4)·offset in
 * the math frame; operator Y = −math Y). Rotations of the tool offset don't enter its kinematics.
 */
export function toolOffsetMatrix(offset: { x?: number; y?: number; z?: number } | null | undefined): Mat4 {
  if (!offset) return IDENTITY;
  return translation([num(offset.x), -num(offset.y), num(offset.z)]);
}

function num(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}
