// SVG → contours for the CNC contour follower.
//
// Dependency-free parser that walks the SVG's element tree with a scanner,
// composes group transforms, and flattens every drawable shape into polylines:
//   <path> (full command set M L H V C S Q T A Z), <rect> (incl. rounded),
//   <circle>, <ellipse>, <line>, <polyline>, <polygon>.
// Coordinates come out in SVG user units, y-down (the caller flips Y when
// mapping into robot space).

import { Contour, FLATTEN_TOLERANCE, Pt, flattenArc, flattenCubic, flattenQuadratic } from "./contours";

// ── 2D affine transform: [a c e; b d f] ──────────────────────────────────────

type Mat = [number, number, number, number, number, number]; // a b c d e f

const IDENTITY: Mat = [1, 0, 0, 1, 0, 0];

function matMul(m: Mat, n: Mat): Mat {
  return [
    m[0] * n[0] + m[2] * n[1],
    m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3],
    m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4],
    m[1] * n[4] + m[3] * n[5] + m[5],
  ];
}

function matApply(m: Mat, p: Pt): Pt {
  return { x: m[0] * p.x + m[2] * p.y + m[4], y: m[1] * p.x + m[3] * p.y + m[5] };
}

/** Parse an SVG transform attribute into a matrix. */
function parseTransform(text: string): Mat {
  let m: Mat = IDENTITY;
  const re = /(matrix|translate|scale|rotate|skewX|skewY)\s*\(([^)]*)\)/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    const args = match[2].split(/[\s,]+/).filter(Boolean).map(Number);
    let t: Mat | null = null;
    switch (match[1]) {
      case "matrix":
        if (args.length === 6) t = args as Mat;
        break;
      case "translate":
        t = [1, 0, 0, 1, args[0] ?? 0, args[1] ?? 0];
        break;
      case "scale":
        t = [args[0] ?? 1, 0, 0, args[1] ?? args[0] ?? 1, 0, 0];
        break;
      case "rotate": {
        const a = ((args[0] ?? 0) * Math.PI) / 180;
        const cos = Math.cos(a), sin = Math.sin(a);
        t = [cos, sin, -sin, cos, 0, 0];
        if (args.length >= 3) {
          const [/*angle*/, cx, cy] = args;
          t = matMul(matMul([1, 0, 0, 1, cx, cy], t), [1, 0, 0, 1, -cx, -cy]);
        }
        break;
      }
      case "skewX":
        t = [1, 0, Math.tan(((args[0] ?? 0) * Math.PI) / 180), 1, 0, 0];
        break;
      case "skewY":
        t = [1, Math.tan(((args[0] ?? 0) * Math.PI) / 180), 0, 1, 0, 0];
        break;
    }
    if (t) m = matMul(m, t);
  }
  return m;
}

// ── Path data parser ──────────────────────────────────────────────────────────

function tokenizePathData(d: string): (string | number)[] {
  const tokens: (string | number)[] = [];
  const re = /([MmLlHhVvCcSsQqTtAaZz])|(-?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(d)) !== null) {
    if (match[1]) tokens.push(match[1]);
    else tokens.push(parseFloat(match[2]));
  }
  return tokens;
}

/** Convert an SVG endpoint-parameterized arc into sampled points (excl. start). */
function flattenSvgArc(
  p0: Pt, rx: number, ry: number, xRotDeg: number,
  largeArc: boolean, sweepFlag: boolean, p1: Pt, tolerance: number,
): Pt[] {
  // Degenerate radii → straight line (per SVG spec)
  if (rx === 0 || ry === 0) return [p1];
  rx = Math.abs(rx); ry = Math.abs(ry);

  const phi = (xRotDeg * Math.PI) / 180;
  const cosPhi = Math.cos(phi), sinPhi = Math.sin(phi);

  // Endpoint → center parameterization (SVG implementation notes F.6.5)
  const dx2 = (p0.x - p1.x) / 2, dy2 = (p0.y - p1.y) / 2;
  const x1p =  cosPhi * dx2 + sinPhi * dy2;
  const y1p = -sinPhi * dx2 + cosPhi * dy2;

  // Scale radii up if they can't span the endpoints
  const lambda = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry);
  if (lambda > 1) { const s = Math.sqrt(lambda); rx *= s; ry *= s; }

  const num = rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p;
  const den = rx * rx * y1p * y1p + ry * ry * x1p * x1p;
  let coef = den > 0 ? Math.sqrt(Math.max(0, num / den)) : 0;
  if (largeArc === sweepFlag) coef = -coef;

  const cxp = (coef * rx * y1p) / ry;
  const cyp = (-coef * ry * x1p) / rx;
  const cx = cosPhi * cxp - sinPhi * cyp + (p0.x + p1.x) / 2;
  const cy = sinPhi * cxp + cosPhi * cyp + (p0.y + p1.y) / 2;

  const angleOf = (ux: number, uy: number) => Math.atan2(uy, ux);
  const theta1 = angleOf((x1p - cxp) / rx, (y1p - cyp) / ry);
  const theta2 = angleOf((-x1p - cxp) / rx, (-y1p - cyp) / ry);
  let dTheta = theta2 - theta1;
  if (!sweepFlag && dTheta > 0) dTheta -= 2 * Math.PI;
  else if (sweepFlag && dTheta < 0) dTheta += 2 * Math.PI;

  // Sample by angle with the tolerance applied to the larger radius
  const rMax = Math.max(rx, ry);
  const maxStep = 2 * Math.acos(Math.max(0, Math.min(1, 1 - tolerance / rMax)));
  const steps = Math.max(2, Math.ceil(Math.abs(dTheta) / Math.max(maxStep, 1e-3)));
  const pts: Pt[] = [];
  for (let i = 1; i <= steps; i++) {
    const t = theta1 + (dTheta * i) / steps;
    const ex = rx * Math.cos(t), ey = ry * Math.sin(t);
    pts.push({
      x: cosPhi * ex - sinPhi * ey + cx,
      y: sinPhi * ex + cosPhi * ey + cy,
    });
  }
  return pts;
}

/** Flatten one path `d` attribute into contours (path-local coordinates). */
export function flattenPathData(d: string, tolerance = FLATTEN_TOLERANCE): Contour[] {
  const tokens = tokenizePathData(d);
  const contours: Contour[] = [];

  let current: Pt[] = [];
  let cursor: Pt = { x: 0, y: 0 };
  let start: Pt = { x: 0, y: 0 };
  let prevCubicCtrl: Pt | null = null;   // reflection ref for S/s
  let prevQuadCtrl: Pt | null = null;    // reflection ref for T/t
  let i = 0;
  let cmd = "";

  const num = () => {
    const t = tokens[i++];
    return typeof t === "number" ? t : 0;
  };

  function finish(closed: boolean) {
    if (current.length >= 2) contours.push({ points: current, closed });
    current = [];
  }

  while (i < tokens.length) {
    const tok = tokens[i];
    if (typeof tok === "string") { cmd = tok; i++; }
    // else: implicit command repeat (M→L per spec)
    else if (cmd === "M") cmd = "L";
    else if (cmd === "m") cmd = "l";

    const rel = cmd === cmd.toLowerCase();
    const C = cmd.toUpperCase();

    if (C === "Z") {
      if (current.length > 0) {
        cursor = { ...start };
        if (current.length >= 2) {
          const first = current[0], last = current[current.length - 1];
          if (Math.hypot(first.x - last.x, first.y - last.y) > 1e-9) current.push({ ...first });
        }
        finish(true);
        current = [{ ...cursor }];
      }
      prevCubicCtrl = prevQuadCtrl = null;
      continue;
    }

    switch (C) {
      case "M": {
        const x = num(), y = num();
        finish(false);
        cursor = rel ? { x: cursor.x + x, y: cursor.y + y } : { x, y };
        start = { ...cursor };
        current = [{ ...cursor }];
        prevCubicCtrl = prevQuadCtrl = null;
        break;
      }
      case "L": {
        const x = num(), y = num();
        cursor = rel ? { x: cursor.x + x, y: cursor.y + y } : { x, y };
        current.push({ ...cursor });
        prevCubicCtrl = prevQuadCtrl = null;
        break;
      }
      case "H": {
        const x = num();
        cursor = { x: rel ? cursor.x + x : x, y: cursor.y };
        current.push({ ...cursor });
        prevCubicCtrl = prevQuadCtrl = null;
        break;
      }
      case "V": {
        const y = num();
        cursor = { x: cursor.x, y: rel ? cursor.y + y : y };
        current.push({ ...cursor });
        prevCubicCtrl = prevQuadCtrl = null;
        break;
      }
      case "C": {
        const x1 = num(), y1 = num(), x2 = num(), y2 = num(), x = num(), y = num();
        const p1 = rel ? { x: cursor.x + x1, y: cursor.y + y1 } : { x: x1, y: y1 };
        const p2 = rel ? { x: cursor.x + x2, y: cursor.y + y2 } : { x: x2, y: y2 };
        const p3 = rel ? { x: cursor.x + x,  y: cursor.y + y  } : { x, y };
        current.push(...flattenCubic(cursor, p1, p2, p3, tolerance));
        prevCubicCtrl = p2; prevQuadCtrl = null;
        cursor = p3;
        break;
      }
      case "S": {
        const x2 = num(), y2 = num(), x = num(), y = num();
        const p1 = prevCubicCtrl
          ? { x: 2 * cursor.x - prevCubicCtrl.x, y: 2 * cursor.y - prevCubicCtrl.y }
          : { ...cursor };
        const p2 = rel ? { x: cursor.x + x2, y: cursor.y + y2 } : { x: x2, y: y2 };
        const p3 = rel ? { x: cursor.x + x,  y: cursor.y + y  } : { x, y };
        current.push(...flattenCubic(cursor, p1, p2, p3, tolerance));
        prevCubicCtrl = p2; prevQuadCtrl = null;
        cursor = p3;
        break;
      }
      case "Q": {
        const x1 = num(), y1 = num(), x = num(), y = num();
        const p1 = rel ? { x: cursor.x + x1, y: cursor.y + y1 } : { x: x1, y: y1 };
        const p2 = rel ? { x: cursor.x + x,  y: cursor.y + y  } : { x, y };
        current.push(...flattenQuadratic(cursor, p1, p2, tolerance));
        prevQuadCtrl = p1; prevCubicCtrl = null;
        cursor = p2;
        break;
      }
      case "T": {
        const x = num(), y = num();
        const p1: Pt = prevQuadCtrl
          ? { x: 2 * cursor.x - prevQuadCtrl.x, y: 2 * cursor.y - prevQuadCtrl.y }
          : { ...cursor };
        const p2 = rel ? { x: cursor.x + x, y: cursor.y + y } : { x, y };
        current.push(...flattenQuadratic(cursor, p1, p2, tolerance));
        prevQuadCtrl = p1; prevCubicCtrl = null;
        cursor = p2;
        break;
      }
      case "A": {
        const rx = num(), ry = num(), rot = num(), laf = num(), sf = num(), x = num(), y = num();
        const p1 = rel ? { x: cursor.x + x, y: cursor.y + y } : { x, y };
        current.push(...flattenSvgArc(cursor, rx, ry, rot, laf !== 0, sf !== 0, p1, tolerance));
        cursor = p1;
        prevCubicCtrl = prevQuadCtrl = null;
        break;
      }
      default:
        // Unknown command — abort this path safely
        i = tokens.length;
        break;
    }
  }
  finish(false);
  return contours.filter(c => c.points.length >= 2);
}

// ── Element scanner ───────────────────────────────────────────────────────────

type Attrs = Record<string, string>;

function parseAttrs(tag: string): Attrs {
  const attrs: Attrs = {};
  const re = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*("([^"]*)"|'([^']*)')/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(tag)) !== null) attrs[m[1]] = m[3] ?? m[4] ?? "";
  return attrs;
}

function numAttr(a: Attrs, name: string, fallback = 0): number {
  const v = parseFloat(a[name] ?? "");
  return isNaN(v) ? fallback : v;
}

function parsePointsAttr(text: string): Pt[] {
  const nums = (text.match(/-?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/g) ?? []).map(Number);
  const pts: Pt[] = [];
  for (let i = 0; i + 1 < nums.length; i += 2) pts.push({ x: nums[i], y: nums[i + 1] });
  return pts;
}

/**
 * Parse an SVG document into flattened contours (SVG user units, y-down).
 * Elements inside <defs> or <clipPath> are skipped.
 */
export function svgToContours(svgText: string, tolerance = FLATTEN_TOLERANCE): Contour[] {
  const contours: Contour[] = [];

  // Strip comments and CDATA so the tag scanner can't trip on them
  const src = svgText.replace(/<!--[\s\S]*?-->/g, "").replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, "");

  const tagRe = /<\s*(\/?)\s*([a-zA-Z_][-a-zA-Z0-9_:]*)([^>]*?)(\/?)\s*>/g;
  const matStack: Mat[] = [IDENTITY];
  let skipDepth = 0; // >0 while inside defs/clipPath/mask/symbol

  const emit = (pts: Pt[], closed: boolean) => {
    if (skipDepth > 0 || pts.length < 2) return;
    const m = matStack[matStack.length - 1];
    contours.push({ closed, points: pts.map(p => matApply(m, p)) });
  };

  let m: RegExpExecArray | null;
  while ((m = tagRe.exec(src)) !== null) {
    const closing = m[1] === "/";
    const name = m[2].toLowerCase();
    const attrs = closing ? {} : parseAttrs(m[3]);
    const selfClosed = m[4] === "/";
    const skipContainer = name === "defs" || name === "clippath" || name === "mask" || name === "symbol";

    if (closing) {
      if (skipContainer) skipDepth = Math.max(0, skipDepth - 1);
      else if (name === "g" || name === "svg" || name === "a") {
        if (matStack.length > 1) matStack.pop();
      }
      continue;
    }

    if (skipContainer) {
      if (!selfClosed) skipDepth++;
      continue;
    }

    const local = attrs.transform ? parseTransform(attrs.transform) : IDENTITY;
    const composed = matMul(matStack[matStack.length - 1], local);

    // Containers push their transform for children
    if ((name === "g" || name === "svg" || name === "a") && !selfClosed) {
      matStack.push(composed);
      continue;
    }

    // Drawable leaves — apply the composed transform to their own geometry
    const withMat = (fn: () => void) => {
      matStack.push(composed);
      fn();
      matStack.pop();
    };

    switch (name) {
      case "path": {
        if (!attrs.d) break;
        withMat(() => {
          for (const c of flattenPathData(attrs.d, tolerance)) emit(c.points, c.closed);
        });
        break;
      }
      case "rect": {
        const x = numAttr(attrs, "x"), y = numAttr(attrs, "y");
        const w = numAttr(attrs, "width"), h = numAttr(attrs, "height");
        if (w <= 0 || h <= 0) break;
        let rx = numAttr(attrs, "rx", NaN), ry = numAttr(attrs, "ry", NaN);
        if (isNaN(rx) && isNaN(ry)) { rx = 0; ry = 0; }
        else if (isNaN(rx)) rx = ry;
        else if (isNaN(ry)) ry = rx;
        rx = Math.min(Math.max(0, rx), w / 2);
        ry = Math.min(Math.max(0, ry), h / 2);
        withMat(() => {
          if (rx <= 0 || ry <= 0) {
            emit([
              { x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }, { x, y },
            ], true);
          } else {
            // Rounded rect via four quarter-ellipse corners
            const d =
              `M ${x + rx} ${y} H ${x + w - rx} A ${rx} ${ry} 0 0 1 ${x + w} ${y + ry} ` +
              `V ${y + h - ry} A ${rx} ${ry} 0 0 1 ${x + w - rx} ${y + h} H ${x + rx} ` +
              `A ${rx} ${ry} 0 0 1 ${x} ${y + h - ry} V ${y + ry} A ${rx} ${ry} 0 0 1 ${x + rx} ${y} Z`;
            for (const c of flattenPathData(d, tolerance)) emit(c.points, c.closed);
          }
        });
        break;
      }
      case "circle": {
        const cx = numAttr(attrs, "cx"), cy = numAttr(attrs, "cy"), r = numAttr(attrs, "r");
        if (r <= 0) break;
        withMat(() => emit(flattenArc(cx, cy, r, 0, 2 * Math.PI, tolerance), true));
        break;
      }
      case "ellipse": {
        const cx = numAttr(attrs, "cx"), cy = numAttr(attrs, "cy");
        const rx = numAttr(attrs, "rx"), ry = numAttr(attrs, "ry");
        if (rx <= 0 || ry <= 0) break;
        withMat(() => {
          const circle = flattenArc(0, 0, 1, 0, 2 * Math.PI, tolerance / Math.max(rx, ry));
          emit(circle.map(p => ({ x: cx + p.x * rx, y: cy + p.y * ry })), true);
        });
        break;
      }
      case "line": {
        const pts = [
          { x: numAttr(attrs, "x1"), y: numAttr(attrs, "y1") },
          { x: numAttr(attrs, "x2"), y: numAttr(attrs, "y2") },
        ];
        withMat(() => emit(pts, false));
        break;
      }
      case "polyline":
      case "polygon": {
        const pts = parsePointsAttr(attrs.points ?? "");
        if (pts.length < 2) break;
        const closed = name === "polygon";
        if (closed) pts.push({ ...pts[0] });
        withMat(() => emit(pts, closed));
        break;
      }
    }
  }

  return contours;
}
