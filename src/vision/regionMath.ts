// Region geometry for the vision editor: converting between the wire Region (docs/vision-tools.md)
// and the draw canvas's geometry, outlines in pixels, and fixture transforms.
//
// A dependent tool's region is stored in its fixture's *reference* space (where the fixture was
// when its reference was set). At run time the controller moves it by the transform from the
// reference pose to the pose found now — a similarity (shift + rotate + scale), or a perspective
// map when both poses carry a quad. The editor needs the same maths in both directions:
//   - to show/edit a stored region where it appears on the current image (forward), and
//   - to store a region drawn on the current image back in reference space (inverse),
// so a region stays exactly where it was drawn.
//
// Angles: pose angles and rect rotations are both degrees in image space (y down), positive turning
// from +x towards +y — the OpenCV / atan2(dy, dx) convention the controller uses. ANGLE_SIGN flips
// that in one place if the controller ever reports the other way.

import type { Pose, Region, VPoint } from "@/src/models/visionTools";
import { quadCellQuad, type Pt } from "./homography";

export const ANGLE_SIGN = 1;

// ── Canvas geometry ──────────────────────────────────────────────────────────

export type DrawShape = "Rectangle" | "Circle" | "Polygon" | "Quad";

/** The draw canvas's working geometry (src/vision/visionHtml.ts) — every field always present. */
export type DrawGeometry = {
  shape: DrawShape;
  x: number; y: number; width: number; height: number; rotation?: number;
  cx: number; cy: number; radius: number;
  points: [number, number][];
};

export type DrawGrid = { rows: number; cols: number };

export function regionToDraw(r: Region): DrawGeometry {
  const pts = (r.points ?? []).map(p => [p.x, p.y] as [number, number]);
  const base: DrawGeometry = {
    shape: "Rectangle", x: 0.1, y: 0.1, width: 0.8, height: 0.8, rotation: 0,
    cx: 0.5, cy: 0.5, radius: 0.3, points: [],
  };
  switch (r.shape) {
    case "circle":  return { ...base, shape: "Circle", cx: r.cx ?? 0.5, cy: r.cy ?? 0.5, radius: r.radius ?? 0.25 };
    case "polygon": return { ...base, shape: "Polygon", points: pts };
    case "quad":    return { ...base, shape: "Quad", points: pts };
    default:        return { ...base, x: r.x ?? 0, y: r.y ?? 0, width: r.width ?? 1, height: r.height ?? 1, rotation: r.rotation ?? 0 };
  }
}

export function drawToRegion(g: DrawGeometry): Region {
  const pts = (g.points ?? []).map(([x, y]) => ({ x, y }));
  switch (g.shape) {
    case "Circle":  return { shape: "circle", cx: g.cx, cy: g.cy, radius: g.radius };
    case "Polygon": return { shape: "polygon", points: pts };
    case "Quad":    return { shape: "quad", points: pts };
    default:        return { shape: "rect", x: g.x, y: g.y, width: g.width, height: g.height, rotation: g.rotation ?? 0 };
  }
}

// ── Outlines ─────────────────────────────────────────────────────────────────

/** A region's outline in pixels of a W×H frame (rect corners TL, TR, BR, BL; circle as a 32-gon). */
export function regionOutlinePx(r: Region, W: number, H: number): VPoint[] {
  if (r.shape === "circle") {
    const cx = (r.cx ?? 0.5) * W, cy = (r.cy ?? 0.5) * H, rad = (r.radius ?? 0.25) * Math.min(W, H);
    return Array.from({ length: 32 }, (_, i) => {
      const a = (i / 32) * Math.PI * 2;
      return { x: cx + rad * Math.cos(a), y: cy + rad * Math.sin(a) };
    });
  }
  if (r.shape === "polygon" || r.shape === "quad") return (r.points ?? []).map(p => ({ x: p.x * W, y: p.y * H }));
  const w = (r.width ?? 1) * W, h = (r.height ?? 1) * H;
  const cx = (r.x ?? 0) * W + w / 2, cy = (r.y ?? 0) * H + h / 2;
  const a = ((r.rotation ?? 0) * Math.PI) / 180, cs = Math.cos(a), sn = Math.sin(a);
  return [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]]
    .map(([lx, ly]) => ({ x: cx + lx * cs - ly * sn, y: cy + lx * sn + ly * cs }));
}

/** Cell outlines of a rows×cols grid over an outline — perspective on a 4-point outline, else its bounding box. */
export function gridCells(outline: VPoint[], rows: number, cols: number, inset = 0): VPoint[][] {
  if (outline.length < 3 || rows < 1 || cols < 1) return [];
  let quad: Pt[];
  if (outline.length === 4) quad = outline.map(p => [p.x, p.y] as Pt);
  else {
    const xs = outline.map(p => p.x), ys = outline.map(p => p.y);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    quad = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
  }
  const t = Math.max(0, Math.min(0.45, inset));
  const cells: VPoint[][] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const full = quadCellQuad(quad, rows, cols, r, c);
      const cell = t === 0 ? full : shrinkQuad(full, t);
      cells.push(cell.map(([x, y]) => ({ x, y })));
    }
  }
  return cells;
}

function shrinkQuad(q: Pt[], t: number): Pt[] {
  // Bilinear inset: each corner moves t of the way along both of its edges.
  const lerp = (a: Pt, b: Pt, f: number): Pt => [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
  const [tl, tr, br, bl] = q;
  const top0 = lerp(tl, tr, t), top1 = lerp(tl, tr, 1 - t);
  const bot0 = lerp(bl, br, t), bot1 = lerp(bl, br, 1 - t);
  return [lerp(top0, bot0, t), lerp(top1, bot1, t), lerp(top1, bot1, 1 - t), lerp(top0, bot0, 1 - t)];
}

// ── Transforms ───────────────────────────────────────────────────────────────

type Mat3 = [number, number, number, number, number, number, number, number, number];

export type RegionTransform =
  | { kind: "sim"; from: VPoint; to: VPoint; rot: number; s: number }
  | { kind: "persp"; H: Mat3 };

function applyT(T: RegionTransform, p: VPoint): VPoint {
  if (T.kind === "sim") {
    const cs = Math.cos(T.rot), sn = Math.sin(T.rot);
    const dx = p.x - T.from.x, dy = p.y - T.from.y;
    return { x: T.to.x + T.s * (dx * cs - dy * sn), y: T.to.y + T.s * (dx * sn + dy * cs) };
  }
  const H = T.H, w = H[6] * p.x + H[7] * p.y + H[8];
  return { x: (H[0] * p.x + H[1] * p.y + H[2]) / w, y: (H[3] * p.x + H[4] * p.y + H[5]) / w };
}

function squareToQuadMat(q: VPoint[]): Mat3 {
  const [x0, y0] = [q[0].x, q[0].y], [x1, y1] = [q[1].x, q[1].y], [x2, y2] = [q[2].x, q[2].y], [x3, y3] = [q[3].x, q[3].y];
  const dx1 = x1 - x2, dx2 = x3 - x2, dx3 = x0 - x1 + x2 - x3;
  const dy1 = y1 - y2, dy2 = y3 - y2, dy3 = y0 - y1 + y2 - y3;
  let g = 0, h = 0;
  if (Math.abs(dx3) > 1e-12 || Math.abs(dy3) > 1e-12) {
    const den = dx1 * dy2 - dx2 * dy1;
    if (Math.abs(den) > 1e-18) { g = (dx3 * dy2 - dx2 * dy3) / den; h = (dx1 * dy3 - dx3 * dy1) / den; }
  }
  return [x1 - x0 + g * x1, x3 - x0 + h * x3, x0, y1 - y0 + g * y1, y3 - y0 + h * y3, y0, g, h, 1];
}

function mul(a: Mat3, b: Mat3): Mat3 {
  const r = new Array(9).fill(0) as Mat3;
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++)
    r[i * 3 + j] = a[i * 3] * b[j] + a[i * 3 + 1] * b[3 + j] + a[i * 3 + 2] * b[6 + j];
  return r;
}

function inv(m: Mat3): Mat3 | null {
  const [a, b, c, d, e, f, g, h, i] = m;
  const A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g;
  const det = a * A + b * B + c * C;
  if (Math.abs(det) < 1e-18) return null;
  return [A / det, -(b * i - c * h) / det, (b * f - c * e) / det,
          B / det, (a * i - c * g) / det, -(a * f - c * d) / det,
          C / det, -(a * h - b * g) / det, (a * e - b * d) / det];
}

const hasQuad = (p: Pose) => Array.isArray(p.quad) && p.quad.length === 4;

/** The transform that moves a region from a fixture's reference pose to the pose found now (pixels). */
export function fixtureTransform(ref: Pose, now: Pose): RegionTransform | null {
  if (hasQuad(ref) && hasQuad(now)) {
    const Hr = inv(squareToQuadMat(ref.quad!));
    if (!Hr) return null;
    return { kind: "persp", H: mul(squareToQuadMat(now.quad!), Hr) };
  }
  const s = (now.scale || 1) / (ref.scale || 1);
  return { kind: "sim", from: { x: ref.x, y: ref.y }, to: { x: now.x, y: now.y }, rot: ANGLE_SIGN * ((now.angle - ref.angle) * Math.PI) / 180, s };
}

export function invertTransform(T: RegionTransform): RegionTransform | null {
  if (T.kind === "sim") return { kind: "sim", from: T.to, to: T.from, rot: -T.rot, s: 1 / (T.s || 1) };
  const H = inv(T.H);
  return H ? { kind: "persp", H } : null;
}

const clamp01 = (v: number) => Math.max(-0.5, Math.min(1.5, v));

/** A region (normalized, W×H frame) moved by a pixel-space transform. */
export function transformRegion(r: Region, T: RegionTransform, W: number, H: number): Region {
  const toN = (p: VPoint): VPoint => ({ x: clamp01(p.x / W), y: clamp01(p.y / H) });
  if (T.kind === "sim") {
    if (r.shape === "rect") {
      const w = (r.width ?? 1) * W, h = (r.height ?? 1) * H;
      const c = applyT(T, { x: (r.x ?? 0) * W + w / 2, y: (r.y ?? 0) * H + h / 2 });
      const nw = w * T.s, nh = h * T.s;
      let rot = (r.rotation ?? 0) + (T.rot * 180) / Math.PI;
      rot = ((rot + 180) % 360 + 360) % 360 - 180;
      return { shape: "rect", x: (c.x - nw / 2) / W, y: (c.y - nh / 2) / H, width: nw / W, height: nh / H, rotation: Math.round(rot * 10) / 10 };
    }
    if (r.shape === "circle") {
      const c = applyT(T, { x: (r.cx ?? 0.5) * W, y: (r.cy ?? 0.5) * H });
      return { shape: "circle", cx: c.x / W, cy: c.y / H, radius: (r.radius ?? 0.25) * T.s };
    }
    return { shape: r.shape, points: (r.points ?? []).map(p => toN(applyT(T, { x: p.x * W, y: p.y * H }))) };
  }
  // Perspective: a rectangle stays four corners (a quad), a circle becomes a polygon.
  const outline = regionOutlinePx(r, W, H).map(p => toN(applyT(T, p)));
  if (r.shape === "rect" || r.shape === "quad") return { shape: "quad", points: outline };
  return { shape: "polygon", points: outline };
}

/** Moves a pose (pixels) by a transform — for re-basing a chained fixture's reference. */
export function transformPose(p: Pose, T: RegionTransform): Pose {
  const c = applyT(T, p);
  if (T.kind === "sim") return { ...p, x: c.x, y: c.y, angle: p.angle + (ANGLE_SIGN * T.rot * 180) / Math.PI, scale: (p.scale ?? 1) * T.s };
  return { ...p, x: c.x, y: c.y, quad: p.quad ? p.quad.map(q => applyT(T, q)) : p.quad };
}

/** True when every coordinate looks normalized (0..1) rather than pixels. */
export function looksNormalized(pts: VPoint[] | undefined): boolean {
  if (!pts || pts.length === 0) return false;
  return pts.every(p => Math.abs(p.x) <= 1.0001 && Math.abs(p.y) <= 1.0001);
}
