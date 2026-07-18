// DXF → contours for the CNC contour follower.
//
// Uses dxf-parser (already a dependency of the CNC builder) and flattens the
// common drawable entities into polylines:
//   LINE, LWPOLYLINE / POLYLINE (with bulge arcs), ARC, CIRCLE, ELLIPSE,
//   SPLINE (sampled as a uniform cubic B-spline, or via fit points).
// DXF coordinates are y-up, so no flip is needed when mapping to robot space.

import DxfParser from "dxf-parser";
import { Contour, FLATTEN_TOLERANCE, Pt, flattenArc } from "./contours";

const DEG = Math.PI / 180;

// ── Entity flattening ─────────────────────────────────────────────────────────

/** Bulge arc between two polyline vertices (bulge = tan(sweep/4)). */
function bulgeArc(a: Pt, b: Pt, bulge: number, tolerance: number): Pt[] {
  if (Math.abs(bulge) < 1e-9) return [b];
  const chord = Math.hypot(b.x - a.x, b.y - a.y);
  if (chord < 1e-9) return [b];

  const sweep = 4 * Math.atan(bulge);            // signed included angle
  const r = chord / (2 * Math.sin(Math.abs(sweep) / 2));

  // Center is perpendicular to the chord midpoint
  const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
  const d = Math.sqrt(Math.max(0, r * r - (chord / 2) * (chord / 2)));
  const nx = -(b.y - a.y) / chord, ny = (b.x - a.x) / chord;
  const side = (Math.abs(sweep) > Math.PI ? -1 : 1) * Math.sign(bulge);
  const cx = mx - nx * d * side;
  const cy = my - ny * d * side;

  const start = Math.atan2(a.y - cy, a.x - cx);
  const pts = flattenArc(cx, cy, r, start, sweep, tolerance);
  pts.shift();                                    // drop the duplicated start
  if (pts.length === 0 || Math.hypot(pts[pts.length - 1].x - b.x, pts[pts.length - 1].y - b.y) > 1e-6)
    pts.push({ ...b });
  return pts;
}

function polylineToContour(vertices: any[], closed: boolean, tolerance: number): Contour | null {
  if (!vertices || vertices.length < 2) return null;
  const pts: Pt[] = [{ x: vertices[0].x ?? 0, y: vertices[0].y ?? 0 }];
  for (let i = 0; i < vertices.length - 1; i++) {
    const a = { x: vertices[i].x ?? 0, y: vertices[i].y ?? 0 };
    const b = { x: vertices[i + 1].x ?? 0, y: vertices[i + 1].y ?? 0 };
    pts.push(...bulgeArc(a, b, vertices[i].bulge ?? 0, tolerance));
  }
  if (closed) {
    const a = { x: vertices[vertices.length - 1].x ?? 0, y: vertices[vertices.length - 1].y ?? 0 };
    const b = { x: vertices[0].x ?? 0, y: vertices[0].y ?? 0 };
    pts.push(...bulgeArc(a, b, vertices[vertices.length - 1].bulge ?? 0, tolerance));
  }
  return pts.length >= 2 ? { points: pts, closed } : null;
}

/** Sample a clamped/uniform cubic B-spline through its control points. */
function sampleSpline(controlPoints: Pt[], degree: number, knots: number[] | undefined, samplesPerSpan: number): Pt[] {
  const n = controlPoints.length;
  if (n < 2) return [];
  if (n === 2) return [controlPoints[0], controlPoints[1]];

  const p = Math.min(Math.max(1, degree || 3), n - 1);
  // Fall back to a clamped uniform knot vector when the file omits one
  let k = knots && knots.length === n + p + 1 ? knots : undefined;
  if (!k) {
    k = [];
    for (let i = 0; i <= n + p; i++) {
      if (i < p + 1) k.push(0);
      else if (i > n - 1) k.push(n - p);
      else k.push(i - p);
    }
  }

  const tMin = k[p], tMax = k[n];
  const totalSamples = Math.max(8, (n - p) * samplesPerSpan);
  const out: Pt[] = [];
  for (let s = 0; s <= totalSamples; s++) {
    const t = tMin + ((tMax - tMin) * s) / totalSamples;
    out.push(deBoor(t, p, controlPoints, k));
  }
  return out;
}

function deBoor(t: number, p: number, ctrl: Pt[], knots: number[]): Pt {
  const n = ctrl.length;
  // Find knot span index
  let span = p;
  for (let i = p; i < n; i++) {
    if (t >= knots[i] && t < knots[i + 1]) { span = i; break; }
    if (i === n - 1) span = n - 1;
  }
  const d: Pt[] = [];
  for (let j = 0; j <= p; j++) d[j] = { ...ctrl[span - p + j] };
  for (let r = 1; r <= p; r++) {
    for (let j = p; j >= r; j--) {
      const i = span - p + j;
      const denom = knots[i + p - r + 1] - knots[i];
      const alpha = denom < 1e-12 ? 0 : (t - knots[i]) / denom;
      d[j] = {
        x: (1 - alpha) * d[j - 1].x + alpha * d[j].x,
        y: (1 - alpha) * d[j - 1].y + alpha * d[j].y,
      };
    }
  }
  return d[p];
}

// ── Public entry point ────────────────────────────────────────────────────────

/** Parse DXF text into flattened contours (file units, y-up). */
export function dxfToContours(dxfText: string, tolerance = FLATTEN_TOLERANCE): Contour[] {
  let dxf: any;
  try {
    dxf = new DxfParser().parseSync(dxfText);
  } catch {
    return [];
  }
  if (!dxf?.entities) return [];

  const contours: Contour[] = [];

  for (const e of dxf.entities as any[]) {
    switch (e.type) {
      case "LINE": {
        const v = e.vertices;
        if (v?.length >= 2)
          contours.push({
            closed: false,
            points: [{ x: v[0].x ?? 0, y: v[0].y ?? 0 }, { x: v[1].x ?? 0, y: v[1].y ?? 0 }],
          });
        break;
      }
      case "LWPOLYLINE":
      case "POLYLINE": {
        const closed = !!(e.shape || e.closed || ((e.flag ?? 0) & 1));
        const c = polylineToContour(e.vertices ?? [], closed, tolerance);
        if (c) contours.push(c);
        break;
      }
      case "ARC": {
        const cx = e.center?.x ?? 0, cy = e.center?.y ?? 0, r = e.radius ?? 0;
        // dxf-parser reports angles in radians
        let sweep = (e.endAngle ?? 0) - (e.startAngle ?? 0);
        if (sweep <= 0) sweep += 2 * Math.PI;
        const pts = flattenArc(cx, cy, r, e.startAngle ?? 0, sweep, tolerance);
        if (pts.length >= 2) contours.push({ points: pts, closed: false });
        break;
      }
      case "CIRCLE": {
        const pts = flattenArc(e.center?.x ?? 0, e.center?.y ?? 0, e.radius ?? 0, 0, 2 * Math.PI, tolerance);
        if (pts.length >= 2) contours.push({ points: pts, closed: true });
        break;
      }
      case "ELLIPSE": {
        const cx = e.center?.x ?? 0, cy = e.center?.y ?? 0;
        const mx = e.majorAxisEndPoint?.x ?? 0, my = e.majorAxisEndPoint?.y ?? 0;
        const rMajor = Math.hypot(mx, my);
        const ratio = e.axisRatio ?? 1;
        if (rMajor <= 0) break;
        const rot = Math.atan2(my, mx);
        const a0 = e.startAngle ?? 0;
        let sweep = (e.endAngle ?? 2 * Math.PI) - a0;
        if (sweep <= 0) sweep += 2 * Math.PI;
        const unit = flattenArc(0, 0, 1, a0, sweep, tolerance / rMajor);
        const cosR = Math.cos(rot), sinR = Math.sin(rot);
        const pts = unit.map(p => {
          const ex = p.x * rMajor, ey = p.y * rMajor * ratio;
          return { x: cx + ex * cosR - ey * sinR, y: cy + ex * sinR + ey * cosR };
        });
        if (pts.length >= 2)
          contours.push({ points: pts, closed: Math.abs(sweep - 2 * Math.PI) < 1e-6 });
        break;
      }
      case "SPLINE": {
        // Prefer fit points when present; otherwise sample the B-spline
        const fit: Pt[] = (e.fitPoints ?? []).map((p: any) => ({ x: p.x ?? 0, y: p.y ?? 0 }));
        let pts: Pt[];
        if (fit.length >= 2) {
          pts = fit;
        } else {
          const ctrl: Pt[] = (e.controlPoints ?? []).map((p: any) => ({ x: p.x ?? 0, y: p.y ?? 0 }));
          pts = sampleSpline(ctrl, e.degreeOfSplineCurve ?? 3, e.knotValues, 16);
        }
        if (pts.length >= 2) {
          const closed = !!(((e.flag ?? 0) & 1) || e.closed);
          if (closed && Math.hypot(pts[0].x - pts[pts.length - 1].x, pts[0].y - pts[pts.length - 1].y) > 1e-9)
            pts.push({ ...pts[0] });
          contours.push({ points: pts, closed });
        }
        break;
      }
    }
  }

  return contours;
}

export { DEG };
