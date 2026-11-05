// Numeric check of src/vision/homography.ts (and that its HOMOGRAPHY_JS copy agrees).
//   npx tsx scripts/homography-check.mts
import { HOMOGRAPHY_JS, applyH, isConvexQuad, quadCellQuad, squareToQuad, type Pt } from "../src/vision/homography.ts";

let fails = 0;
const ok = (cond: boolean, what: string) => { console.log((cond ? "PASS " : "FAIL ") + what); if (!cond) fails++; };
const near = (a: Pt, b: Pt, eps = 1e-9) => Math.hypot(a[0] - b[0], a[1] - b[1]) < eps;

// A board seen from the side: far edge (top) much narrower than the near edge.
const q: Pt[] = [[0.35, 0.2], [0.65, 0.2], [0.9, 0.85], [0.1, 0.85]];
const H = squareToQuad(q);
ok(near(applyH(H, 0, 0), q[0]) && near(applyH(H, 1, 0), q[1]) && near(applyH(H, 1, 1), q[2]) && near(applyH(H, 0, 1), q[3]),
  "unit-square corners land on TL, TR, BR, BL");

// Perspective: the centre of the quad's diagonals is the image of (0.5, 0.5).
const inter = (p1: Pt, p2: Pt, p3: Pt, p4: Pt): Pt => {
  const d = (p1[0] - p2[0]) * (p3[1] - p4[1]) - (p1[1] - p2[1]) * (p3[0] - p4[0]);
  const t = ((p1[0] - p3[0]) * (p3[1] - p4[1]) - (p1[1] - p3[1]) * (p3[0] - p4[0])) / d;
  return [p1[0] + t * (p2[0] - p1[0]), p1[1] + t * (p2[1] - p1[1])];
};
ok(near(applyH(H, 0.5, 0.5), inter(q[0], q[2], q[1], q[3])), "centre = diagonals' intersection (true perspective, not bilinear)");

// Rows nearer the camera (bottom) are taller than far rows.
const top = quadCellQuad(q, 8, 8, 0, 0), bottom = quadCellQuad(q, 8, 8, 7, 0);
ok(bottom[3][1] - bottom[0][1] > 1.5 * (top[3][1] - top[0][1]), "near rows are taller than far rows");

// Cells tile: neighbours share corners exactly.
const a = quadCellQuad(q, 8, 8, 3, 4), right = quadCellQuad(q, 8, 8, 3, 5), below = quadCellQuad(q, 8, 8, 4, 4);
ok(near(a[1], right[0]) && near(a[2], right[3]) && near(a[3], below[0]) && near(a[2], below[1]), "cells tile with shared corners");

// A parallelogram stays affine (g = h = 0) and an axis-aligned rect gives an even lattice.
const par = squareToQuad([[0.1, 0.1], [0.6, 0.2], [0.7, 0.7], [0.2, 0.6]]);
ok(Math.abs(par[6]) < 1e-12 && Math.abs(par[7]) < 1e-12, "parallelogram → affine");
const rect = quadCellQuad([[0, 0], [1, 0], [1, 1], [0, 1]], 4, 4, 2, 1);
ok(near(rect[0], [0.25, 0.5]) && near(rect[2], [0.5, 0.75]), "upright square → even lattice");

// Scaling the corners scales the cells (normalized vs pixel space agree).
const W = 640, Hh = 480;
const qp = q.map(([x, y]) => [x * W, y * Hh] as Pt);
const cn = quadCellQuad(q, 8, 8, 5, 2), cp = quadCellQuad(qp, 8, 8, 5, 2);
ok(cn.every((p, i) => near([p[0] * W, p[1] * Hh], cp[i], 1e-6)), "normalized and pixel space agree");

ok(isConvexQuad(q) && !isConvexQuad([[0, 0], [1, 1], [1, 0], [0, 1]]) && !isConvexQuad([[0, 0], [1, 0], [1, 1]]), "convexity check");

// The canvas copy computes the same thing.
const js = new Function(HOMOGRAPHY_JS + "; return { squareToQuad, applyH, quadCellQuad, isConvexQuad };")();
const jc = js.quadCellQuad(q, 8, 8, 5, 2) as Pt[];
ok(jc.every((p, i) => near(p, cn[i])) && js.isConvexQuad(q) === true, "HOMOGRAPHY_JS matches the TS functions");

console.log(fails ? `${fails} FAILED` : "ALL PASSED");
process.exit(fails ? 1 : 0);
