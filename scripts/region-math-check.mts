// Numeric check of src/vision/regionMath.ts: fixture transforms round-trip, so a region drawn on
// the current image and stored in the fixture's reference space shows exactly where it was drawn.
//   npx tsx scripts/region-math-check.mts
import { fixtureTransform, invertTransform, regionOutlinePx, transformRegion } from "../src/vision/regionMath.ts";
import type { Pose, Region } from "../src/models/visionTools.ts";

let fails = 0;
const ok = (cond: boolean, what: string) => { console.log((cond ? "PASS " : "FAIL ") + what); if (!cond) fails++; };
const W = 640, H = 480;
const outlineNear = (a: Region, b: Region, eps = 1e-6) => {
  const pa = regionOutlinePx(a, W, H), pb = regionOutlinePx(b, W, H);
  return pa.length === pb.length && pa.every((p, i) => Math.hypot(p.x - pb[i].x, p.y - pb[i].y) < eps);
};

// Similarity: rotate 5° about the reference point, shift and scale.
const ref: Pose = { x: 320, y: 140, angle: 0, scale: 1 };
const now: Pose = { x: 326, y: 144, angle: 5, scale: 1.1 };
const T = fixtureTransform(ref, now)!;
const inv = invertTransform(T)!;
const regions: Region[] = [
  { shape: "rect", x: 0.25, y: 0.31, width: 0.5, height: 0.47, rotation: 0 },
  { shape: "rect", x: 0.1, y: 0.2, width: 0.2, height: 0.1, rotation: 30 },
  { shape: "circle", cx: 0.5, cy: 0.6, radius: 0.2 },
  { shape: "polygon", points: [{ x: 0.2, y: 0.2 }, { x: 0.5, y: 0.25 }, { x: 0.3, y: 0.6 }] },
  { shape: "quad", points: [{ x: 0.3, y: 0.3 }, { x: 0.7, y: 0.3 }, { x: 0.8, y: 0.8 }, { x: 0.2, y: 0.8 }] },
];
for (const r of regions) {
  const moved = transformRegion(r, T, W, H);
  ok(moved.shape === r.shape, `similarity keeps a ${r.shape} a ${r.shape}`);
  ok(outlineNear(transformRegion(moved, inv, W, H), r, 1e-3), `similarity round-trips a ${r.shape}`);
}
// The reference point itself moves onto the found pose.
const dot: Region = { shape: "circle", cx: ref.x / W, cy: ref.y / H, radius: 0.01 };
const dotMoved = transformRegion(dot, T, W, H);
ok(Math.abs(dotMoved.cx! * W - now.x) < 1e-6 && Math.abs(dotMoved.cy! * H - now.y) < 1e-6, "reference point lands on the found pose");
// A rect turns by the pose's angle change, in the same sense as its own rotation.
ok(Math.abs((transformRegion(regions[0], T, W, H).rotation ?? 0) - 5) < 1e-6, "rect rotation follows the pose angle");

// Perspective: both poses carry a quad.
const refQ: Pose = { x: 320, y: 240, angle: 0, quad: [{ x: 100, y: 100 }, { x: 540, y: 100 }, { x: 540, y: 380 }, { x: 100, y: 380 }] };
const nowQ: Pose = { x: 320, y: 240, angle: 0, quad: [{ x: 160, y: 90 }, { x: 500, y: 110 }, { x: 580, y: 400 }, { x: 60, y: 380 }] };
const P = fixtureTransform(refQ, nowQ)!;
ok(P.kind === "persp", "two quads give a perspective transform");
const full: Region = { shape: "quad", points: refQ.quad!.map(p => ({ x: p.x / W, y: p.y / H })) };
const fullMoved = transformRegion(full, P, W, H);
ok(fullMoved.points!.every((p, i) => Math.hypot(p.x * W - nowQ.quad![i].x, p.y * H - nowQ.quad![i].y) < 1e-6), "reference quad maps onto the found quad");
const back = transformRegion(transformRegion(regions[4], P, W, H), invertTransform(P)!, W, H);
ok(outlineNear(back, regions[4], 1e-3), "perspective round-trips a quad");

console.log(fails ? `${fails} failed` : "all passed");
process.exit(fails ? 1 : 0);
