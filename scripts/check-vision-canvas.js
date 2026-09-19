// The zone-editor canvas lives inside a template literal in src/vision/visionHtml.ts,
// so tsc never parses it and a typo there is invisible until the editor is opened on a
// device. This runs the two checks tsc cannot: that every <script> block is valid JS,
// and that the draw/edit geometry actually behaves.
//
//   npm run check:vision
//
// Phase 2 drives the canvas logic headlessly against a 100x100 image in a 100x100
// canvas, so screen pixels map 1:1 to percent and every expectation reads by eye.
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', 'src', 'vision', 'visionHtml.ts');
const src = fs.readFileSync(SRC, 'utf8');

const blocks = [...src.matchAll(/<script>([\s\S]*?)<\\\/script>/g)];
if (blocks.length === 0) {
  console.error('FAILED: found no <script> blocks — did the extraction regex go stale?');
  process.exit(1);
}

let fails = 0;
function check(label, actual, expected) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  const ok = a === e;
  if (!ok) fails++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${ok ? '' : `\n       got ${a}\n       want ${e}`}`);
}

// ── Phase 1: every script block parses ───────────────────────────────────────
console.log('syntax');
blocks.forEach((m, i) => {
  // ${JSON.stringify(x)} placeholders become a literal value at render time.
  const body = m[1].replace(/\$\{[^}]*\}/g, 'null');
  try {
    new Function(body);
    console.log(`ok   block ${i + 1} parses (${body.split('\n').length} lines)`);
  } catch (e) {
    fails++;
    console.error(`FAIL block ${i + 1}: ${e.message}`);
  }
});

if (fails) {
  console.log(`\nRESULT: ${fails} FAILED — skipping behaviour checks, the script does not parse`);
  process.exit(1);
}

// ── Phase 2: draw/edit behaviour ─────────────────────────────────────────────
const body = blocks[0][1].replace(/\$\{[^}]*\}/g, 'null');

function build(initialGeometry) {
  const noop = () => {};
  const ctx = new Proxy({}, { get: () => noop });
  const canvas = {
    width: 100, height: 100, getContext: () => ctx,
    addEventListener: noop, setPointerCapture: noop,
  };
  const win = {
    innerWidth: 100, innerHeight: 100, addEventListener: noop,
    ReactNativeWebView: { postMessage: noop },
  };
  const doc = { getElementById: () => canvas };
  function FakeImage() { this.naturalWidth = 100; this.naturalHeight = 100; this.complete = true; }

  // Seed initialGeometry by rewriting the declarations the template interpolates.
  const seeded = body
    .replace('var zones=null;', 'var zones=[];')
    .replace('var geom=null;', 'var geom=' + JSON.stringify(initialGeometry ?? null) + ';')
    .replace('var drawShape=null;', 'var drawShape=' + JSON.stringify(initialGeometry?.shape ?? 'Rectangle') + ';');

  const api = new Function('window', 'document', 'Image',
    seeded + '\nreturn {onDown:onDown,onMove:onMove,onUp:onUp,' +
    'geom:function(){return geom;},editing:function(){return editing;},' +
    'pts:function(){return polyPts.length;},' +
    'corners:function(){return rectCorners(geom);},' +
    'cellQuad:function(rows,cols,r,c){return cellQuad(geom,rows,cols,r,c);},' +
    'inside:inside,snapAngle:snapAngle,handles:handles};'
  )(win, doc, FakeImage);
  api.window = win;
  return api;
}

const r2 = (n) => Math.round(n * 1000) / 1000;
const rect = (g) => [r2(g.x), r2(g.y), r2(g.width), r2(g.height)];
const poly = (g) => g.points.map(p => p.map(r2));
const quad = (q) => q.map(p => [r2(p.x), r2(p.y)]);

function drag(api, from, to) {
  api.onDown({ x: from[0], y: from[1] });
  api.onMove({ x: to[0], y: to[1] });
  api.onUp();
}

const seedRect = { shape: 'Rectangle', x: 0.1, y: 0.1, width: 0.2, height: 0.2, cx: 0.5, cy: 0.5, radius: 0.25, points: [] };

console.log('\nrectangle');
let a = build(null);
drag(a, [10, 10], [50, 40]);
check('draw rect', rect(a.geom()), [0.1, 0.1, 0.4, 0.3]);
check('draw rect enters edit mode', a.editing(), true);

drag(a, [50, 40], [80, 80]);           // SE handle out
check('drag SE corner', rect(a.geom()), [0.1, 0.1, 0.7, 0.7]);

drag(a, [80, 80], [0, 0]);             // SE handle dragged past NW
check('SE past NW flips instead of collapsing', rect(a.geom()), [0, 0, 0.1, 0.1]);

a = build(seedRect);
check('seeded rect starts in edit mode', a.editing(), true);
drag(a, [20, 20], [40, 40]);           // interior drag = move
check('body move keeps size', rect(a.geom()), [0.3, 0.3, 0.2, 0.2]);
drag(a, [40, 40], [400, 400]);         // shove far off-frame
check('body move clamps without deforming', rect(a.geom()), [0.8, 0.8, 0.2, 0.2]);

a = build(null);
a.onDown({ x: 50, y: 50 }); a.onUp();  // tap, no drag
check('a tap creates nothing', a.geom(), null);

a = build(seedRect);
drag(a, [90, 90], [95, 95]);           // far outside the shape
check('tap outside an existing shape is inert', rect(a.geom()), [0.1, 0.1, 0.2, 0.2]);

console.log('\ncircle');
a = build(null);
a.window.setShape('Circle');
drag(a, [50, 50], [50, 70]);
check('draw circle', [r2(a.geom().cx), r2(a.geom().cy), r2(a.geom().radius)], [0.5, 0.5, 0.2]);
drag(a, [70, 50], [80, 50]);           // east radius handle
check('drag radius handle', r2(a.geom().radius), 0.3);
drag(a, [50, 50], [30, 30]);           // centre handle
check('drag centre handle', [r2(a.geom().cx), r2(a.geom().cy)], [0.3, 0.3]);
check('moving the centre leaves the radius alone', r2(a.geom().radius), 0.3);

console.log('\npolygon');
a = build(null);
a.window.setShape('Polygon');
[[10, 10], [50, 10], [30, 40]].forEach(p => { a.onDown({ x: p[0], y: p[1] }); a.onUp(); });
check('three taps queued', a.pts(), 3);
check('still drafting', a.editing(), false);
a.window.closePolygon();
check('close shape enters edit mode', a.editing(), true);
check('polygon points', poly(a.geom()), [[0.1, 0.1], [0.5, 0.1], [0.3, 0.4]]);

drag(a, [50, 10], [60, 20]);           // move one vertex only
check('drag a single vertex', poly(a.geom()), [[0.1, 0.1], [0.6, 0.2], [0.3, 0.4]]);

a = build({ shape: 'Polygon', x: 0, y: 0, width: 1, height: 1, cx: 0.5, cy: 0.5, radius: 0.25,
            points: [[0.1, 0.1], [0.5, 0.1], [0.3, 0.4]] });
drag(a, [30, 20], [40, 30]);           // near the centroid, well inside the triangle
check('polygon body move is rigid', poly(a.geom()), [[0.2, 0.2], [0.6, 0.2], [0.4, 0.5]]);
drag(a, [40, 30], [500, 500]);         // shove far off-frame
check('polygon move clamps rigidly', poly(a.geom()), [[0.6, 0.7], [1, 0.7], [0.8, 1]]);

console.log('\nrotation');
// Deliberately not square (50 wide x 30 tall in screen px, centred on 50,50) — a square
// would hide a rectangle that rotates into the wrong footprint.
const seedTilt = (rotation) => ({
  shape: 'Rectangle', x: 0.25, y: 0.35, width: 0.5, height: 0.3, rotation,
  cx: 0.5, cy: 0.5, radius: 0.25, points: [],
});

a = build(seedTilt(0));
check('untilted corners are the rectangle', quad(a.corners()),
      [[25, 35], [75, 35], [75, 65], [25, 65]]);

// The grip sits ROT_ARM above the top edge midpoint; dragging it to due-east of the
// centre asks for a quarter turn.
drag(a, [50, 1], [90, 50]);
check('dragging the grip rotates', r2(a.geom().rotation), 90);
check('a quarter turn swaps the footprint', quad(a.corners()),
      [[65, 25], [65, 75], [35, 75], [35, 25]]);

check('rotation snaps onto 15-degree marks when close', a.snapAngle(104), 105);
check('rotation is left alone when it is not close', a.snapAngle(110), 110);
check('rotation wraps rather than running away', a.snapAngle(365), 5);

// Containment must follow the tilt, or a point outside the zone still measures inside it.
a = build(seedTilt(90));
check('a point the tilt moved out reads outside', a.inside(70, 50), false);
check('a point the tilt moved in reads inside',   a.inside(50, 70), true);

// Corner drag on a tilt: the dragged corner lands under the finger, the opposite corner
// does not move, and the angle survives. Measuring along the screen axes instead would
// square the rectangle back up the moment you touched a corner.
a = build(seedTilt(90));
drag(a, [65, 25], [75, 25]);
check('tilted corner drag keeps the angle', r2(a.geom().rotation), 90);
check('tilted corner drag anchors the opposite corner', quad(a.corners()),
      [[75, 25], [75, 75], [35, 75], [35, 25]]);

// Body move on a tilt is rigid and bounded by the real footprint, not by width/height.
a = build(seedTilt(90));
drag(a, [50, 50], [55, 55]);
check('tilted body move is rigid', quad(a.corners()),
      [[70, 30], [70, 80], [40, 80], [40, 30]]);

a = build(seedTilt(90));
drag(a, [50, 50], [500, 500]);
check('tilted body move clamps on the real footprint', quad(a.corners()),
      [[100, 50], [100, 100], [70, 100], [70, 50]]);

// The lattice is built in the rectangle's own frame, so cell corners must coincide with
// the rectangle's corners — not with a box re-derived from the tilted bounding box.
a = build(seedTilt(90));
check('first cell starts at the rectangle corner', quad(a.cellQuad(2, 2, 0, 0))[0], [65, 25]);
check('last cell ends at the opposite corner',    quad(a.cellQuad(2, 2, 1, 1))[2], [35, 75]);

// The grip is only meaningful on a rectangle.
a = build({ shape: 'Circle', x: 0, y: 0, width: 1, height: 1, rotation: 0,
            cx: 0.5, cy: 0.5, radius: 0.2, points: [] });
check('circles get no rotation grip', a.handles().some(h => h.id === 'rotate'), false);

console.log(fails ? `\nRESULT: ${fails} FAILED` : '\nRESULT: all passed');
process.exit(fails ? 1 : 0);
