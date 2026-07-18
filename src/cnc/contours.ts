// Shared contour geometry for the CNC contour follower.
//
// A contour is a flattened polyline in file units (mm once transformed to
// robot space). Curves from SVG/DXF sources are flattened here with a chord
// tolerance, then simplified with Ramer–Douglas–Peucker so the generated
// program stays a reasonable size.

export type Pt = { x: number; y: number };

export type Contour = {
  points: Pt[];
  /** True when the source shape was closed (first point == last point). */
  closed: boolean;
};

export type ContourBounds = { minX: number; minY: number; maxX: number; maxY: number };

/** Default chord tolerance (file units) used when flattening curves. */
export const FLATTEN_TOLERANCE = 0.1;

/** Default RDP simplification tolerance in mm (applied post-transform). */
export const SIMPLIFY_TOLERANCE = 0.05;

// ── Bounds & transforms ───────────────────────────────────────────────────────

export function boundsOf(contours: Contour[]): ContourBounds | null {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const c of contours)
    for (const p of c.points) {
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    }
  return minX === Infinity ? null : { minX, minY, maxX, maxY };
}

export type ContourTransform = {
  scale: number;
  offsetX: number;
  offsetY: number;
  /** Mirror Y about the file's vertical center — SVG is y-down, robots are y-up. */
  flipY: boolean;
};

/**
 * Map raw file-space contours into robot space: normalize so the file's
 * lower-left corner sits at (offsetX, offsetY), scaled uniformly.
 */
export function transformContours(contours: Contour[], t: ContourTransform): Contour[] {
  const b = boundsOf(contours);
  if (!b) return [];
  return contours.map(c => ({
    closed: c.closed,
    points: c.points.map(p => ({
      x: t.offsetX + (p.x - b.minX) * t.scale,
      y: t.offsetY + (t.flipY ? (b.maxY - p.y) : (p.y - b.minY)) * t.scale,
    })),
  }));
}

// ── Ramer–Douglas–Peucker simplification ─────────────────────────────────────

function perpDistSq(p: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x, dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq < 1e-12) {
    const ex = p.x - a.x, ey = p.y - a.y;
    return ex * ex + ey * ey;
  }
  const cross = (p.x - a.x) * dy - (p.y - a.y) * dx;
  return (cross * cross) / lenSq;
}

export function simplify(points: Pt[], tolerance: number): Pt[] {
  if (points.length <= 2 || tolerance <= 0) return points;
  const tolSq = tolerance * tolerance;
  const keep = new Array<boolean>(points.length).fill(false);
  keep[0] = keep[points.length - 1] = true;

  const stack: Array<[number, number]> = [[0, points.length - 1]];
  while (stack.length > 0) {
    const [start, end] = stack.pop()!;
    let maxDist = -1, maxIdx = -1;
    for (let i = start + 1; i < end; i++) {
      const d = perpDistSq(points[i], points[start], points[end]);
      if (d > maxDist) { maxDist = d; maxIdx = i; }
    }
    if (maxDist > tolSq) {
      keep[maxIdx] = true;
      stack.push([start, maxIdx], [maxIdx, end]);
    }
  }
  return points.filter((_, i) => keep[i]);
}

export function simplifyContours(contours: Contour[], tolerance: number): Contour[] {
  return contours
    .map(c => ({ ...c, points: simplify(c.points, tolerance) }))
    .filter(c => c.points.length >= 2);
}

// ── Curve flattening primitives ───────────────────────────────────────────────

/** Sample a circular arc (CCW when sweep > 0) with the given chord tolerance. */
export function flattenArc(
  cx: number, cy: number, r: number,
  startAngle: number, sweep: number,
  tolerance: number,
): Pt[] {
  if (r <= 0 || sweep === 0) return [];
  // Chord error e = r(1 - cos(θ/2))  →  θ = 2·acos(1 - e/r)
  const maxStep = 2 * Math.acos(Math.max(0, Math.min(1, 1 - tolerance / r)));
  const steps = Math.max(2, Math.ceil(Math.abs(sweep) / Math.max(maxStep, 1e-3)));
  const pts: Pt[] = [];
  for (let i = 0; i <= steps; i++) {
    const a = startAngle + (sweep * i) / steps;
    pts.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) });
  }
  return pts;
}

/** Flatten a cubic bezier via adaptive subdivision. Returns points EXCLUDING p0. */
export function flattenCubic(p0: Pt, p1: Pt, p2: Pt, p3: Pt, tolerance: number): Pt[] {
  const out: Pt[] = [];
  const tolSq = tolerance * tolerance;

  function recurse(a: Pt, b: Pt, c: Pt, d: Pt, depth: number) {
    // Flat enough when both control points are within tolerance of chord a-d
    if (depth > 18 || (perpDistSq(b, a, d) <= tolSq && perpDistSq(c, a, d) <= tolSq)) {
      out.push(d);
      return;
    }
    const ab  = mid(a, b),  bc  = mid(b, c),  cd  = mid(c, d);
    const abc = mid(ab, bc), bcd = mid(bc, cd);
    const abcd = mid(abc, bcd);
    recurse(a, ab, abc, abcd, depth + 1);
    recurse(abcd, bcd, cd, d, depth + 1);
  }
  recurse(p0, p1, p2, p3, 0);
  return out;
}

/** Flatten a quadratic bezier by elevating it to a cubic. */
export function flattenQuadratic(p0: Pt, p1: Pt, p2: Pt, tolerance: number): Pt[] {
  const c1 = { x: p0.x + (2 / 3) * (p1.x - p0.x), y: p0.y + (2 / 3) * (p1.y - p0.y) };
  const c2 = { x: p2.x + (2 / 3) * (p1.x - p2.x), y: p2.y + (2 / 3) * (p1.y - p2.y) };
  return flattenCubic(p0, c1, c2, p2, tolerance);
}

function mid(a: Pt, b: Pt): Pt {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

// ── Duplicate removal ─────────────────────────────────────────────────────────

/**
 * Drop contours that duplicate one already seen — CAD files often contain the
 * same line twice (copy/paste, exploded blocks). A duplicate is a contour with
 * the same point sequence within `eps`, in either direction; closed loops also
 * match regardless of which vertex they start at.
 */
export function dedupeContours(contours: Contour[], eps = 1e-3): Contour[] {
  const q = (v: number) => Math.round(v / eps);

  function key(c: Contour): string {
    let pts = c.points;
    if (c.closed && pts.length > 1) pts = pts.slice(0, -1); // drop the closing duplicate
    const enc = pts.map(p => `${q(p.x)},${q(p.y)}`);
    if (c.closed && enc.length > 0) {
      // Rotation-invariant: rotate each direction so its smallest vertex leads
      const rot = (arr: string[]) => {
        let mi = 0;
        for (let i = 1; i < arr.length; i++) if (arr[i] < arr[mi]) mi = i;
        return arr.slice(mi).concat(arr.slice(0, mi)).join(";");
      };
      const fwd = rot(enc);
      const rev = rot([...enc].reverse());
      return "C:" + (fwd < rev ? fwd : rev);
    }
    const fwd = enc.join(";");
    const rev = [...enc].reverse().join(";");
    return "O:" + (fwd < rev ? fwd : rev);
  }

  const seen = new Set<string>();
  const out: Contour[] = [];
  for (const c of contours) {
    const k = key(c);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(c);
  }
  return out;
}

// ── Contour chaining ──────────────────────────────────────────────────────────

/**
 * Join open contours whose endpoints touch into single continuous polylines,
 * so connected line/arc segments from the source file run in one tool-down
 * pass instead of lifting at every joint. Segments are reversed as needed;
 * a chain that closes on itself is marked closed. Closed contours pass
 * through untouched. `eps` is the max endpoint gap in file units.
 */
export function chainContours(contours: Contour[], eps = 1e-3): Contour[] {
  const epsSq = eps * eps;
  const touches = (a: Pt, b: Pt) => {
    const dx = a.x - b.x, dy = a.y - b.y;
    return dx * dx + dy * dy <= epsSq;
  };

  const used = new Array<boolean>(contours.length).fill(false);
  const out: Contour[] = [];

  for (let i = 0; i < contours.length; i++) {
    if (used[i]) continue;
    used[i] = true;
    const c = contours[i];
    if (c.closed || c.points.length < 2) {
      out.push(c);
      continue;
    }

    let chain = [...c.points];
    let extended = true;
    while (extended) {
      extended = false;
      for (let j = 0; j < contours.length; j++) {
        if (used[j] || contours[j].closed) continue;
        const seg = contours[j].points;
        if (seg.length < 2) continue;
        const head = chain[0];
        const tail = chain[chain.length - 1];
        if (touches(tail, seg[0])) {
          chain = chain.concat(seg.slice(1));
        } else if (touches(tail, seg[seg.length - 1])) {
          chain = chain.concat([...seg].reverse().slice(1));
        } else if (touches(head, seg[seg.length - 1])) {
          chain = seg.slice(0, -1).concat(chain);
        } else if (touches(head, seg[0])) {
          chain = [...seg].reverse().slice(0, -1).concat(chain);
        } else {
          continue;
        }
        used[j] = true;
        extended = true;
      }
    }

    // A chain that loops back to its start is a closed contour
    let closed = false;
    if (chain.length >= 4 && touches(chain[0], chain[chain.length - 1])) {
      chain[chain.length - 1] = { ...chain[0] };
      closed = true;
    }
    out.push({ points: chain, closed });
  }

  return out;
}

// ── Direction & start-point control ───────────────────────────────────────────

/**
 * Re-orient a contour for execution: optionally rotate a closed loop so it
 * starts at the vertex nearest `startNear`, and/or reverse the travel
 * direction. Open contours ignore `startNear` (reversing swaps their ends).
 */
export function orientContour(c: Contour, opts: { reverse?: boolean; startNear?: Pt | null }): Contour {
  let pts = c.points;

  if (c.closed && opts.startNear && pts.length > 3) {
    const open = pts.slice(0, -1); // drop the closing duplicate
    let best = 0, bestD = Infinity;
    for (let i = 0; i < open.length; i++) {
      const d = (open[i].x - opts.startNear.x) ** 2 + (open[i].y - opts.startNear.y) ** 2;
      if (d < bestD) { bestD = d; best = i; }
    }
    const rotated = open.slice(best).concat(open.slice(0, best));
    rotated.push({ ...rotated[0] });
    pts = rotated;
  }

  if (opts.reverse) pts = [...pts].reverse();

  return { points: pts, closed: c.closed };
}

// ── Stats & preview helpers ───────────────────────────────────────────────────

export function totalPoints(contours: Contour[]): number {
  return contours.reduce((n, c) => n + c.points.length, 0);
}

export function totalLength(contours: Contour[]): number {
  let len = 0;
  for (const c of contours)
    for (let i = 1; i < c.points.length; i++)
      len += Math.hypot(c.points[i].x - c.points[i - 1].x, c.points[i].y - c.points[i - 1].y);
  return len;
}

/** Render a contour as an SVG path string ("M x y L x y …") for previews. */
export function contourToSvgPath(c: Contour, mapX: (x: number) => number, mapY: (y: number) => number): string {
  if (c.points.length === 0) return "";
  const parts = [`M ${mapX(c.points[0].x).toFixed(2)} ${mapY(c.points[0].y).toFixed(2)}`];
  for (let i = 1; i < c.points.length; i++)
    parts.push(`L ${mapX(c.points[i].x).toFixed(2)} ${mapY(c.points[i].y).toFixed(2)}`);
  if (c.closed) parts.push("Z");
  return parts.join(" ");
}
