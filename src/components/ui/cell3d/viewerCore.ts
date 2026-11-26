// The 3D cell viewer: three.js scene for a cell package (docs/cell-package.md) driven by live
// status. Runs inside a WebView / iframe / display page (webviewEntry.ts bundles it offline —
// scripts/build-cell3d.mjs); the app talks to it only through Cell3DCommand (bridge.ts).
//
// - The robot is drawn from its definition: link `shapes` (box, cylinder; holes ignored) and GLB
//   `meshes` (raw mm, Z up — no glTF unit/axis conversion), with the adjustable-axis rules (§3.1).
// - Each status update poses the links with kinematics.ts (robot.py's math); the drawn pose glides
//   to it over about one status interval, so 10 Hz polls look smooth.
// - The tool model rides the flange link; its moving parts follow a status field (animated).
// - The TCP triad is the controller's reported TCP (x, y, z, rz) pinned to the flange link, so a
//   point taught here lands exactly on it. Points / locals use the controller's frames (frames.py).
// - Renders on demand: a frame is drawn only when the pose, an animation or the camera changes.

import {
  AmbientLight,
  Box3,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DirectionalLight,
  EdgesGeometry,
  Float32BufferAttribute,
  Group,
  HemisphereLight,
  Line,
  LineBasicMaterial,
  LineSegments,
  Material,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  PerspectiveCamera,
  Scene,
  SphereGeometry,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
} from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

import type {
  Cell3DCommand,
  Cell3DController,
  Cell3DConveyor,
  Cell3DMountOptions,
  Cell3DOptions,
  Cell3DPreview,
  Cell3DSet,
  Cell3DTarget,
  Cell3DTheme,
  Cell3DToggle,
  Cell3DTool,
  Cell3DViewName,
} from "./bridge";
import type { CellDef, CellMeshRef, CellMoving, CellPose, CellShape, CellTool, RGB, RobotDef, Vec3 } from "./cellTypes";
import {
  adjustBox,
  adjustDeltas,
  flangeLink,
  invertRigid,
  jointValues,
  type JointValues,
  type Mat4,
  mul,
  pickTool,
  poseOf,
  poses,
  rotation,
  tcpFromStatus,
  toolOffsetMatrix,
  translation,
} from "./kinematics";

// ── theme (docs/display-design.md tokens) ────────────────────────────────────

type Palette = {
  bg: string; gridMinor: string; gridMajor: string; text: string; text2: string; muted: string;
  surface: string; border: string; accent: string; accentSoft: string; chipBg: string; edge: string; edgeOpacity: number;
  /** The highlighted / edited item. */
  hi: string;
  /** Grids and stacks. */
  set: string;
};

const PALETTES: Record<Cell3DTheme, Palette> = {
  light: {
    bg: "#EDEFF2", gridMinor: "#DCE0E5", gridMajor: "#C5CBD3", text: "#14171C", text2: "#4B5361", muted: "#868E9A",
    surface: "#FFFFFF", border: "#E2E5E9", accent: "#2563EB", accentSoft: "rgba(37,99,235,0.10)",
    chipBg: "rgba(255,255,255,0.86)", edge: "#14171C", edgeOpacity: 0.16, hi: "#EA580C", set: "#7C3AED",
  },
  dark: {
    bg: "#121519", gridMinor: "#1E232A", gridMajor: "#2C323B", text: "#E7E9EC", text2: "#A2A9B4", muted: "#6B7380",
    surface: "#16191E", border: "#262B33", accent: "#4C8DFF", accentSoft: "rgba(76,141,255,0.16)",
    chipBg: "rgba(22,25,30,0.86)", edge: "#000000", edgeOpacity: 0.35, hi: "#FF8B3D", set: "#A78BFA",
  },
};

const TOGGLE_LABELS: Record<Cell3DToggle, string> = { points: "Points", locals: "Locals", sets: "Arrays", trail: "Trail" };
const DEFAULT_TOGGLES: Cell3DToggle[] = ["points", "locals", "trail"];
const MAX_SET_POSITIONS = 2500;

const AXIS_COLORS = ["#E5484D", "#30A46C", "#3E63DD"]; // X red, Y green, Z blue (the CAD convention)

const VIEWS: { key: Cell3DViewName; label: string }[] = [
  { key: "iso", label: "Iso" },
  { key: "front", label: "Front" },
  { key: "side", label: "Side" },
  { key: "top", label: "Top" },
  { key: "follow", label: "Follow" },
];

const VIEW_DIRS: Record<Exclude<Cell3DViewName, "follow">, Vec3> = {
  // The robot reaches along −Y at its zero pose; "front" looks at it from there.
  front: [0, -1, 0.08],
  side: [1, 0, 0.08],
  top: [0, -0.0001, 1],
  iso: [1, -1.25, 0.95],
};

const TRAIL_MAX = 1500;
const TRAIL_MIN_STEP = 0.5; // mm
const MAX_LABELS = 80;

const STYLE_ID = "c3d-style";
const CSS = `
.c3d-host{position:relative;overflow:hidden;width:100%;height:100%;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;-webkit-user-select:none;user-select:none;-webkit-tap-highlight-color:transparent;}
.c3d-host canvas{display:block;width:100%;height:100%;touch-action:none;outline:none;}
.c3d-ov{position:absolute;display:flex;gap:6px;pointer-events:none;z-index:2;}
.c3d-ov>*{pointer-events:auto;}
.c3d-tl{left:10px;top:10px;flex-direction:column;align-items:flex-start;max-width:55%;}
.c3d-tr{right:10px;top:10px;flex-wrap:wrap;justify-content:flex-end;max-width:45%;}
.c3d-bl{left:10px;bottom:10px;right:96px;}
.c3d-br{right:10px;bottom:14px;}
.c3d-title{font-size:12px;font-weight:600;color:var(--c3d-text);background:var(--c3d-chip);border:1px solid var(--c3d-border);border-radius:999px;padding:4px 10px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%;box-sizing:border-box;}
.c3d-note{font-size:11px;color:var(--c3d-text2);padding:0 4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%;text-shadow:0 0 6px var(--c3d-bg);}
.c3d-seg{display:inline-flex;background:var(--c3d-chip);border:1px solid var(--c3d-border);border-radius:10px;padding:2px;gap:2px;overflow-x:auto;max-width:100%;scrollbar-width:none;}
.c3d-seg::-webkit-scrollbar{display:none;}
.c3d-btn{appearance:none;border:0;background:transparent;color:var(--c3d-text2);font-family:inherit;font-weight:600;font-size:12px;height:32px;min-width:44px;padding:0 10px;border-radius:8px;cursor:pointer;white-space:nowrap;}
.c3d-btn:hover{color:var(--c3d-text);}
.c3d-btn.on{background:var(--c3d-accent-soft);color:var(--c3d-accent);}
.c3d-tog{appearance:none;font-family:inherit;font-weight:600;font-size:12px;height:32px;padding:0 12px;border-radius:999px;cursor:pointer;background:var(--c3d-chip);color:var(--c3d-text2);border:1px solid var(--c3d-border);white-space:nowrap;}
.c3d-tog.on{color:var(--c3d-accent);border-color:transparent;background:var(--c3d-accent-soft);box-shadow:inset 0 0 0 1px var(--c3d-accent);}
.c3d-scale{font-size:11px;color:var(--c3d-muted);font-variant-numeric:tabular-nums;text-shadow:0 0 6px var(--c3d-bg);}
.c3d-msg{position:absolute;inset:0;display:none;align-items:center;justify-content:center;text-align:center;padding:24px;color:var(--c3d-text2);font-size:13px;line-height:18px;z-index:1;pointer-events:none;}
.c3d-labels{position:absolute;inset:0;pointer-events:none;overflow:hidden;z-index:1;}
.c3d-lbl{position:absolute;left:0;top:0;font-size:10px;font-weight:600;line-height:14px;color:var(--c3d-text2);background:var(--c3d-chip);border-radius:4px;padding:0 4px;white-space:nowrap;transform-origin:0 0;will-change:transform;}
.c3d-lbl.loc{color:var(--c3d-muted);}
.c3d-lbl.set{color:var(--c3d-set);}
.c3d-lbl.hi{color:#fff;background:var(--c3d-hi);font-size:11px;line-height:16px;padding:0 6px;z-index:2;box-shadow:0 1px 3px rgba(0,0,0,0.18);}
.c3d-compact .c3d-tr{max-width:60%;}
.c3d-compact .c3d-tog{height:28px;padding:0 9px;font-size:11px;}
.c3d-compact .c3d-btn{height:28px;min-width:38px;padding:0 7px;font-size:11px;}
.c3d-compact .c3d-note{display:none;}
`;

// ── helpers ──────────────────────────────────────────────────────────────────

const rgb = (c: RGB | undefined, fallback: RGB = [160, 164, 170]): Color => {
  const v = c ?? fallback;
  return new Color().setRGB(v[0] / 255, v[1] / 255, v[2] / 255, SRGBColorSpace);
};

/** Row-major Mat4 (kinematics.ts) → three.js Matrix4. */
const toM4 = (m: Mat4, out = new Matrix4()): Matrix4 =>
  out.set(m[0], m[1], m[2], m[3], m[4], m[5], m[6], m[7], m[8], m[9], m[10], m[11], m[12], m[13], m[14], m[15]);

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, parent?: HTMLElement): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.className = cls;
  if (parent) parent.appendChild(e);
  return e;
}

function niceStep(span: number): number {
  const target = span / 20;
  const pow = Math.pow(10, Math.floor(Math.log10(Math.max(target, 1e-6))));
  for (const m of [1, 2, 5, 10]) if (m * pow >= target) return m * pow;
  return 10 * pow;
}

type LinkGroup = { group: Group; ghost: Group | null };
type LoadedMesh = { scene: Group; hasMaterials: boolean };
type MovingState = { def: CellMoving; obj: Group; p: number; target: number };

export function createCellViewer(host: HTMLElement, init: Cell3DMountOptions = {}): Cell3DController {
  if (!document.getElementById(STYLE_ID)) {
    const st = document.createElement("style");
    st.id = STYLE_ID;
    st.textContent = CSS;
    document.head.appendChild(st);
  }
  const root = el("div", "c3d-host", host);
  const emit = init.onEvent ?? (() => {});

  let theme: Cell3DTheme = init.theme ?? "light";
  let options: Required<Cell3DOptions> = { trail: false, points: false, pointIds: null, locals: false, sets: true, controls: "full", toggles: DEFAULT_TOGGLES, fit: "robot", ...stripUndef(init.options) };
  let view: Cell3DViewName = init.view ?? "iso";
  let destroyed = false;

  // ── renderer ───────────────────────────────────────────────────────────────
  let renderer: WebGLRenderer;
  try {
    renderer = new WebGLRenderer({ antialias: true, alpha: false, powerPreference: "low-power" });
  } catch {
    const msg = el("div", "c3d-msg", root);
    msg.style.display = "flex";
    msg.textContent = "The 3D view needs WebGL, which this device's web view doesn't provide.";
    applyThemeVars();
    emit({ type: "error", message: "WebGL unavailable" });
    return { apply() {}, destroy() { root.remove(); } };
  }
  const android = /Android/i.test(navigator.userAgent);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, android ? 1.5 : 2));
  renderer.outputColorSpace = SRGBColorSpace;
  root.appendChild(renderer.domElement);

  const scene = new Scene();
  const camera = new PerspectiveCamera(38, 1, 2, 30000);
  camera.up.set(0, 0, 1); // the world is Z-up
  camera.position.set(900, -1100, 850);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.12;
  controls.screenSpacePanning = true;
  controls.target.set(0, -150, 250);
  controls.minDistance = 40;
  controls.maxDistance = 12000;

  // Soft, shadowless light: sky/ground fill plus a key and a rim.
  const hemi = new HemisphereLight(0xffffff, 0x8a8f98, 1.6);
  hemi.position.set(0, 0, 1);
  scene.add(hemi);
  scene.add(new AmbientLight(0xffffff, 0.35));
  const key = new DirectionalLight(0xffffff, 1.5);
  key.position.set(800, -1200, 1600);
  scene.add(key);
  const rim = new DirectionalLight(0xffffff, 0.55);
  rim.position.set(-1200, 900, 700);
  scene.add(rim);

  const world = new Group();          // robot + tool + fixtures (what "fit" frames)
  const fixtures = new Group();
  const robotRoot = new Group();
  const ghostRoot = new Group();
  const overlays = new Group();       // grid, trail, points, locals, triads
  world.add(robotRoot, fixtures);
  scene.add(world, ghostRoot, overlays);

  // ── overlay DOM ────────────────────────────────────────────────────────────
  const labelsLayer = el("div", "c3d-labels", root);
  const msgEl = el("div", "c3d-msg", root);
  const tl = el("div", "c3d-ov c3d-tl", root);
  const titleEl = el("div", "c3d-title", tl);
  const noteEl = el("div", "c3d-note", tl);
  const tr = el("div", "c3d-ov c3d-tr", root);
  const bl = el("div", "c3d-ov c3d-bl", root);
  const br = el("div", "c3d-ov c3d-br", root);
  const scaleEl = el("div", "c3d-scale", br);
  const seg = el("div", "c3d-seg", bl);
  const viewBtns: Partial<Record<Cell3DViewName, HTMLButtonElement>> = {};
  for (const v of VIEWS) {
    const b = el("button", "c3d-btn", seg);
    b.type = "button";
    b.textContent = v.label;
    b.addEventListener("click", () => { setView(v.key, true); notifyOptions(); });
    viewBtns[v.key] = b;
  }
  const togBtns: Partial<Record<Cell3DToggle, HTMLButtonElement>> = {};
  for (const k of ["points", "locals", "sets", "trail"] as const) {
    const b = el("button", "c3d-tog", tr);
    b.type = "button";
    b.textContent = TOGGLE_LABELS[k];
    b.addEventListener("click", () => {
      options = { ...options, [k]: !options[k] };
      if (k === "trail" && !options.trail) clearTrail();
      syncOverlayControls();
      rebuildMarkers();
      notifyOptions();
      request();
    });
    togBtns[k] = b;
  }
  titleEl.textContent = "Loading 3D model…";

  function notifyOptions() { emit({ type: "options", options: { ...options }, view }); }

  function syncOverlayControls() {
    tr.style.display = options.controls === "full" ? "flex" : "none";
    bl.style.display = options.controls === "none" ? "none" : "flex";
    for (const v of VIEWS) viewBtns[v.key]!.classList.toggle("on", v.key === view);
    const shown = Array.isArray(options.toggles) ? options.toggles : DEFAULT_TOGGLES;
    togBtns.points!.textContent = pointsChipLabel();
    for (const k of ["trail", "points", "locals", "sets"] as const) {
      togBtns[k]!.classList.toggle("on", !!options[k]);
      togBtns[k]!.style.display = shown.includes(k) ? "" : "none";
    }
    for (const k of shown) if (togBtns[k]) tr.appendChild(togBtns[k]!); // in the caller's order
  }

  /** The ids `points` is limited to (null = every saved point). */
  function pointFilter(): Set<string> | null {
    return Array.isArray(options.pointIds) ? new Set(options.pointIds.filter(x => typeof x === "string")) : null;
  }
  /** "Points", or "Points · N" when the caller limits them to N relevant ones. */
  function pointsChipLabel(): string {
    const f = pointFilter();
    if (!f) return TOGGLE_LABELS.points;
    let n = 0;
    for (const pt of points) if (pt.id && f.has(pt.id)) n++;
    return `${TOGGLE_LABELS.points} · ${n}`;
  }

  // ── state ──────────────────────────────────────────────────────────────────
  let cell: CellDef | null = null;
  let robot: RobotDef | null = null;
  let baseUrl: string | null = null;
  let links: Record<string, LinkGroup> = {};
  let flangeName = "";
  let status: Record<string, any> = {};
  let appTool: Cell3DTool = null;
  let points: CellPose[] = [];
  let locals: CellPose[] = [];
  let sets: Cell3DSet[] = [];
  let highlight: Cell3DTarget | null = null;
  let preview: Cell3DPreview | null = null;
  let focusPending = false;
  /** The flange link's world pose at the drawn pose (for the tool preview). */
  let flangeWorld: Mat4 | null = null;
  let toolShown: CellTool | null | undefined = undefined;
  let toolGroup: Group | null = null;
  let moving: MovingState[] = [];
  let meshErrors = 0;
  let cellNote = "";
  let fitted = false;

  // pose interpolation
  let qFrom: JointValues = {};
  let qTo: JointValues = {};
  let qNow: JointValues = {};
  let animStart = 0;
  let animDur = 100;
  let lastStatusAt = 0;
  let ghostQ: JointValues | null = null;
  /** The TCP relative to the flange link (from the latest status). */
  let tcpLocal: Mat4 | null = null;
  let lastFrame = 0;

  const tcpWorld = new Vector3();
  const lastFollow = new Vector3();
  let haveFollow = false;

  // ── shared resources ───────────────────────────────────────────────────────
  const matCache = new Map<string, MeshStandardMaterial>();
  const edgeMat = new LineBasicMaterial({ color: PALETTES[theme].edge, transparent: true, opacity: PALETTES[theme].edgeOpacity });
  const ghostMat = new MeshBasicMaterial({ color: PALETTES[theme].accent, transparent: true, opacity: 0.16, depthWrite: false });
  const ghostEdgeMat = new LineBasicMaterial({ color: PALETTES[theme].accent, transparent: true, opacity: 0.45, depthWrite: false });
  edgeMat.userData.shared = ghostMat.userData.shared = ghostEdgeMat.userData.shared = true;
  const meshCache = new Map<string, Promise<LoadedMesh | null>>();
  const loader = new GLTFLoader();

  function material(c: Color): MeshStandardMaterial {
    const k = c.getHexString();
    let m = matCache.get(k);
    if (!m) { m = new MeshStandardMaterial({ color: c, roughness: 0.62, metalness: 0.08 }); m.userData.shared = true; matCache.set(k, m); }
    return m;
  }

  // ── grid ───────────────────────────────────────────────────────────────────
  let grid: Group | null = null;
  let groundZ = 0;
  /** The robot's horizontal reach from the J1 axis at its zero pose (mm). */
  let reach = 400;

  function buildGrid(extent: number) {
    if (grid) { overlays.remove(grid); disposeTree(grid); }
    const minor = niceStep(extent * 2);         // ~20 cells across
    const major = minor * 5;
    const half = Math.ceil(extent / major) * major;
    const p = PALETTES[theme];
    grid = new Group();
    const mk = (step: number, color: string, opacity: number) => {
      const pos: number[] = [];
      for (let v = -half; v <= half + 1e-6; v += step) {
        if (step === minor && Math.abs(v / major - Math.round(v / major)) < 1e-6) continue;
        pos.push(-half, v, 0, half, v, 0, v, -half, 0, v, half, 0);
      }
      const g = new BufferGeometry();
      g.setAttribute("position", new Float32BufferAttribute(pos, 3));
      const ls = new LineSegments(g, new LineBasicMaterial({ color, transparent: opacity < 1, opacity, depthWrite: false }));
      ls.renderOrder = -1;
      return ls;
    };
    grid.add(mk(minor, p.gridMinor, 1), mk(major, p.gridMajor, 1));
    // Base-frame axes along the floor: X and Y from the J1 axis.
    const ax = new BufferGeometry();
    ax.setAttribute("position", new Float32BufferAttribute([0, 0, 0, half * 0.35, 0, 0, 0, 0, 0, 0, half * 0.35, 0], 3));
    ax.setAttribute("color", new Float32BufferAttribute([...hexRgb(AXIS_COLORS[0]), ...hexRgb(AXIS_COLORS[0]), ...hexRgb(AXIS_COLORS[1]), ...hexRgb(AXIS_COLORS[1])], 3));
    grid.add(new LineSegments(ax, new LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.7, depthWrite: false })));
    grid.position.z = groundZ - 0.2;
    overlays.add(grid);
    scaleEl.textContent = `Grid ${minor} mm`;
  }

  function hexRgb(h: string): [number, number, number] {
    const c = new Color(h);
    return [c.r, c.g, c.b];
  }

  // ── geometry ───────────────────────────────────────────────────────────────
  function shapeMesh(s: CellShape, color: Color, deltas: ReturnType<typeof adjustDeltas>, withGhost: boolean): { mesh: Object3D; ghost: Object3D | null } | null {
    let geo: BufferGeometry;
    const pos = new Vector3();
    if (s.type === "box") {
      const { min, max } = adjustBox(s.min, s.max, s.adjust, deltas);
      const dx = Math.abs(max[0] - min[0]), dy = Math.abs(max[1] - min[1]), dz = Math.abs(max[2] - min[2]);
      if (!(dx > 0 && dy > 0 && dz > 0)) return null;
      geo = new BoxGeometry(dx, dy, dz);
      pos.set((min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2);
    } else if (s.type === "cylinder") {
      // A cylinder's extent along each axis as a box, so adjust tags move it the same way.
      const r = s.radius;
      const { min, max } = adjustBox([s.center[0] - r, s.center[1] - r, s.z[0]], [s.center[0] + r, s.center[1] + r, s.z[1]], s.adjust, deltas);
      const h = Math.abs(max[2] - min[2]);
      if (!(r > 0 && h > 0)) return null;
      geo = new CylinderGeometry(r, r, h, 40, 1);
      geo.rotateX(Math.PI / 2); // three's cylinders run along Y; ours along Z
      pos.set((min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2);
    } else {
      return null;
    }
    const mesh = new Mesh(geo, material(s.color ? rgb(s.color) : color));
    mesh.position.copy(pos);
    const edges = new LineSegments(new EdgesGeometry(geo, 30), edgeMat);
    mesh.add(edges);
    let ghost: Object3D | null = null;
    if (withGhost) {
      ghost = new Mesh(geo, ghostMat);
      ghost.position.copy(pos);
      ghost.add(new LineSegments(edges.geometry, ghostEdgeMat));
    }
    return { mesh, ghost };
  }

  function loadMesh(path: string): Promise<LoadedMesh | null> {
    if (!baseUrl) return Promise.resolve(null);
    const url = baseUrl.replace(/\/?$/, "/") + path.split("/").map(encodeURIComponent).join("/");
    let p = meshCache.get(url);
    if (!p) {
      p = loader.loadAsync(url)
        .then(g => ({ scene: g.scene as unknown as Group, hasMaterials: ((g.parser?.json?.materials as unknown[] | undefined)?.length ?? 0) > 0 }))
        .catch(() => null);
      meshCache.set(url, p);
    }
    return p;
  }

  /** Add a package mesh to `parent` (async). Raw mm / Z-up: used as is, no glTF unit conversion. */
  function addMesh(ref: CellMeshRef, parent: Group, fallback: Color | null, deltas: ReturnType<typeof adjustDeltas>, ghostParent: Group | null) {
    loadMesh(ref.mesh).then(src => {
      if (destroyed) return;
      if (!src) { meshErrors++; updateTitle(); return; }
      const obj = src.scene.clone(true);
      // A colour in the package wins; a GLB with no materials of its own takes the link colour.
      if (ref.color || (!src.hasMaterials && fallback)) {
        const m = material(ref.color ? rgb(ref.color) : fallback!);
        obj.traverse(o => { if ((o as Mesh).isMesh) (o as Mesh).material = m; });
      }
      // §3.1 adjust on a mesh: stretch scales it along the axis from its near face; end translates.
      const a = ref.adjust ? deltas[ref.adjust.id] : undefined;
      if (a && a.delta) {
        const bb = new Box3().setFromObject(obj);
        const i = Math.abs(a.dir[0]) > 0.5 ? 0 : Math.abs(a.dir[1]) > 0.5 ? 1 : 2;
        const lo = bb.min.getComponent(i), hi = bb.max.getComponent(i);
        if (ref.adjust!.role === "end") {
          obj.position.setComponent(i, obj.position.getComponent(i) + a.dir[i] * a.delta);
        } else if (hi > lo) {
          const near = a.dir[i] > 0 ? lo : hi;
          const s = (hi - lo + Math.abs(a.dir[i] * a.delta)) / (hi - lo);
          const sc = new Vector3(1, 1, 1).setComponent(i, s);
          const off = new Vector3().setComponent(i, near);
          const m = new Matrix4().makeTranslation(off.x, off.y, off.z)
            .multiply(new Matrix4().makeScale(sc.x, sc.y, sc.z))
            .multiply(new Matrix4().makeTranslation(-off.x, -off.y, -off.z));
          obj.applyMatrix4(m);
        }
      }
      parent.add(obj);
      if (ghostParent) {
        const g = obj.clone(true);
        g.traverse(o => { if ((o as Mesh).isMesh) (o as Mesh).material = ghostMat; });
        ghostParent.add(g);
      }
      if (!fitted) fitView(view === "follow" ? "iso" : view);
      request();
    });
  }

  function buildRobot() {
    clearGroup(robotRoot);
    clearGroup(ghostRoot);
    links = {};
    toolGroup = null;
    toolShown = undefined;
    moving = [];
    meshErrors = 0;
    if (!robot) return;
    const deltas = adjustDeltas(robot, cell?.settings);
    flangeName = flangeLink(robot);
    for (const link of robot.links ?? []) {
      const group = new Group();
      group.matrixAutoUpdate = false;
      const ghost = new Group();
      ghost.matrixAutoUpdate = false;
      const col = rgb(link.color);
      for (const s of link.shapes ?? []) {
        const m = shapeMesh(s, col, deltas, true);
        if (!m) continue;
        group.add(m.mesh);
        if (m.ghost) ghost.add(m.ghost);
      }
      for (const ref of link.meshes ?? []) addMesh(ref, group, col, deltas, ghost);
      robotRoot.add(group);
      ghostRoot.add(ghost);
      links[link.name] = { group, ghost };
    }
    ghostRoot.visible = false;
  }

  function buildFixtures() {
    clearGroup(fixtures);
    const deltas = adjustDeltas(null, undefined);
    for (const f of cell?.fixtures ?? []) {
      const g = new Group();
      const col = rgb(undefined, [150, 155, 162]);
      for (const s of f.shapes ?? []) { const m = shapeMesh(s, col, deltas, false); if (m) g.add(m.mesh); }
      for (const ref of f.meshes ?? []) addMesh(ref, g, col, deltas, null);
      fixtures.add(g);
    }
  }

  /** Show the tool model for the active tool (§3.2) on the flange link. */
  function updateTool() {
    const activeId = (typeof status.activeToolId === "string" && status.activeToolId) || appTool?.id || null;
    const want = pickTool(cell, activeId);
    if (want === toolShown) return;
    toolShown = want;
    if (toolGroup) { toolGroup.parent?.remove(toolGroup); disposeTree(toolGroup); toolGroup = null; }
    moving = [];
    const flange = links[flangeName];
    if (!want || !flange) { request(); return; }
    toolGroup = new Group();
    const deltas = adjustDeltas(null, undefined);
    const col = rgb(undefined, [70, 72, 78]);
    for (const s of want.shapes ?? []) { const m = shapeMesh(s, col, deltas, false); if (m) toolGroup.add(m.mesh); }
    for (const ref of want.meshes ?? []) addMesh(ref, toolGroup, col, deltas, null);
    for (const mv of want.moving ?? []) {
      const obj = new Group();
      obj.matrixAutoUpdate = false;
      for (const s of mv.shapes ?? []) { const m = shapeMesh(s, col, deltas, false); if (m) obj.add(m.mesh); }
      for (const ref of mv.meshes ?? []) addMesh(ref, obj, col, deltas, null);
      toolGroup.add(obj);
      const t = drivenTarget(mv);
      const st: MovingState = { def: mv, obj, p: t, target: t };
      setMovingMatrix(st);
      moving.push(st);
    }
    flange.group.add(toolGroup);
    request();
  }

  /** 0 = actuated / home (status[field] == on), 1 = open. */
  function drivenTarget(mv: CellMoving): number {
    if (!mv.drive?.field) return 0;
    const v = status[mv.drive.field];
    const on = mv.drive.on ?? 1;
    const val = typeof v === "boolean" ? (v ? 1 : 0) : Number(v);
    const onV = typeof on === "boolean" ? (on ? 1 : 0) : Number(on);
    return val === onV ? 0 : 1;
  }

  function setMovingMatrix(st: MovingState) {
    const mv = st.def;
    let m: Mat4;
    if (mv.slide) {
      const d = mv.slide.direction;
      const n = Math.hypot(d[0], d[1], d[2]) || 1;
      const k = (mv.slide.travel * st.p) / n;
      m = translation([d[0] * k, d[1] * k, d[2] * k]);
    } else if (mv.rotate) {
      const o = mv.rotate.origin ?? [0, 0, 0];
      m = mul(mul(translation(o), rotation(mv.rotate.axis, mv.rotate.degrees * st.p)), translation([-o[0], -o[1], -o[2]]));
    } else return;
    toM4(m, st.obj.matrix);
    st.obj.matrixWorldNeedsUpdate = true;
  }

  // ── triads, trail, markers ─────────────────────────────────────────────────
  function triad(len: number, radius: number, onTop: boolean): Group {
    const g = new Group();
    g.matrixAutoUpdate = false;
    AXIS_COLORS.forEach((hex, i) => {
      const mat = new MeshBasicMaterial({ color: hex, depthTest: !onTop, depthWrite: !onTop, transparent: onTop });
      const shaft = new Mesh(new CylinderGeometry(radius, radius, len * 0.78, 10), mat);
      const head = new Mesh(new ConeGeometry(radius * 2.6, len * 0.22, 14), mat);
      shaft.position.y = len * 0.39;
      head.position.y = len * 0.89;
      const arm = new Group();
      arm.add(shaft, head);
      // Cylinders point +Y; turn each arm onto its axis.
      if (i === 0) arm.rotation.z = -Math.PI / 2;
      if (i === 2) arm.rotation.x = Math.PI / 2;
      if (onTop) { shaft.renderOrder = 10; head.renderOrder = 10; }
      g.add(arm);
    });
    return g;
  }

  const tcpTriad = triad(46, 1.4, true);
  const flangeTriad = triad(22, 0.9, true);
  const tcpLink = (() => {
    const g = new BufferGeometry();
    g.setAttribute("position", new Float32BufferAttribute([0, 0, 0, 0, 0, 0], 3));
    const l = new Line(g, new LineBasicMaterial({ color: "#868E9A", depthTest: false, transparent: true, opacity: 0.9 }));
    l.renderOrder = 9;
    l.frustumCulled = false;
    return l;
  })();
  overlays.add(tcpTriad, flangeTriad, tcpLink);
  tcpTriad.visible = flangeTriad.visible = tcpLink.visible = false;

  const trailPos = new Float32Array(TRAIL_MAX * 3);
  const trailCol = new Float32Array(TRAIL_MAX * 4);
  let trailN = 0;
  const trailGeo = new BufferGeometry();
  trailGeo.setAttribute("position", new BufferAttribute(trailPos, 3));
  trailGeo.setAttribute("color", new BufferAttribute(trailCol, 4));
  trailGeo.setDrawRange(0, 0);
  const trailLine = new Line(trailGeo, new LineBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false }));
  trailLine.frustumCulled = false;
  trailLine.renderOrder = 5;
  overlays.add(trailLine);

  function clearTrail() { trailN = 0; trailGeo.setDrawRange(0, 0); request(); }

  function pushTrail(p: Vector3) {
    if (trailN > 0) {
      const i = (trailN - 1) * 3;
      if (Math.hypot(trailPos[i] - p.x, trailPos[i + 1] - p.y, trailPos[i + 2] - p.z) < TRAIL_MIN_STEP) return;
    }
    if (trailN >= TRAIL_MAX) { trailPos.copyWithin(0, 3); trailN = TRAIL_MAX - 1; }
    trailPos.set([p.x, p.y, p.z], trailN * 3);
    trailN++;
    // Older = fainter (by sample order, so an idle trail needs no redraws to fade).
    const c = new Color(PALETTES[theme].accent);
    for (let k = 0; k < trailN; k++) {
      const a = Math.pow((k + 1) / trailN, 1.6);
      trailCol.set([c.r, c.g, c.b, a * 0.95], k * 4);
    }
    (trailGeo.attributes.position as BufferAttribute).needsUpdate = true;
    (trailGeo.attributes.color as BufferAttribute).needsUpdate = true;
    trailGeo.setDrawRange(0, trailN);
  }

  const markers = new Group();
  overlays.add(markers);

  // ── conveyors ──────────────────────────────────────────────────────────────
  // Rebuilt on every `conveyors` command (parts move at the status rate); one shared unit box,
  // scaled per mesh, so a rebuild allocates no geometry.
  const conveyorRoot = new Group();
  overlays.add(conveyorRoot);
  const unitBox = new BoxGeometry(1, 1, 1);
  unitBox.userData.shared = true;
  const BELT_WIDTH = 120, BELT_THICK = 14, BELT_MARGIN = 60, PART = 36;
  let conveyors: Cell3DConveyor[] = [];

  function drawConveyors() {
    for (const c of [...conveyorRoot.children]) {
      conveyorRoot.remove(c);
      c.traverse(o => { const m = (o as Mesh).material as Material | undefined; if (m && !m.userData?.shared) m.dispose(); });
    }
    const p = PALETTES[theme];
    const box = (g: Group, cx: number, cy: number, cz: number, sx: number, sy: number, sz: number, color: string, opacity = 1) => {
      const mat = opacity < 1
        ? new MeshBasicMaterial({ color: new Color(color), transparent: true, opacity, depthWrite: false })
        : material(new Color(color));
      const m = new Mesh(unitBox, mat);
      m.position.set(cx, cy, cz);
      m.scale.set(Math.max(0.1, sx), Math.max(0.1, sy), Math.max(0.1, sz));
      g.add(m);
      return m;
    };
    for (const c of conveyors) {
      const f = c.frame ?? { x: 0, y: 0, z: 0, rz: 0 };
      const g = new Group();
      g.position.set(num(f.x), num(f.y), num(f.z));
      g.rotation.z = (num(f.rz) * Math.PI) / 180;
      const s = Math.min(num(c.startMm), num(c.endMm)), e = Math.max(num(c.startMm), num(c.endMm));
      const lo = Math.min(s, c.sensorMm ?? s, 0) - BELT_MARGIN, hi = e + BELT_MARGIN;
      // Belt (top surface at the frame's Z), the window shaded on it, the sensor as a thin bar.
      box(g, (lo + hi) / 2, 0, -BELT_THICK / 2, hi - lo, BELT_WIDTH, BELT_THICK, theme === "dark" ? "#3A414C" : "#5B6472");
      box(g, (s + e) / 2, 0, 0.6, e - s, BELT_WIDTH * 0.96, 1, p.hi, 0.22);
      if (c.sensorMm != null) box(g, num(c.sensorMm), 0, 8, 3, BELT_WIDTH + 30, 16, "#0891B2");
      for (const part of (c.parts ?? []).slice(0, 32)) {
        box(g, num(part.x), 0, PART / 2 * 0.6, PART, PART, PART * 0.6, part.tracked ? "#16A34A" : num(part.x) > e ? "#DC2626" : p.set);
      }
      conveyorRoot.add(g);
    }
    request();
  }
  type LabelEl = { el: HTMLDivElement; at: Vector3; hi: boolean; dy: number };
  let labelEls: LabelEl[] = [];
  /** Constant-screen-size dots: `px` = on-screen radius. */
  let pointMeshes: { mesh: Mesh; px: number }[] = [];
  /** What a tap can select: one anchor per drawn point / local / grid or stack position. */
  let pickables: { target: Cell3DTarget; at: Vector3 }[] = [];
  /** The preview item's positions: preset views frame them along with the robot. */
  let previewAnchors: Vector3[] = [];
  let lastAnchorKey = "";
  /** The user has orbited / panned since the last preset view (auto re-framing stops). */
  let userMoved = false;
  /** The tool preview's parts, posed from the live flange in positionToolPreview(). */
  let toolPrev: { tri: Group; line: Line; dot: Mesh; label: LabelEl | null; m: Mat4 } | null = null;

  const isHi = (kind: Cell3DTarget["kind"], id: string | undefined) => !!highlight && !!id && highlight.kind === kind && highlight.id === id;
  /** A target that names one grid cell / stack slot (rather than the whole item). */
  const hasCell = (t: Cell3DTarget | null) => !!t && (Number.isInteger(t.row) || Number.isInteger(t.col) || Number.isInteger(t.index));
  /** `t` is (part of) the highlight: same item, and the same cell when the highlight names one. */
  const inHighlight = (t: Cell3DTarget) => !!highlight && t.kind === highlight.kind && t.id === highlight.id
    && (!hasCell(highlight) || (t.row === highlight.row && t.col === highlight.col && t.index === highlight.index));
  /** The saved item the preview stands in for (drawn only as the preview). */
  function replaced(kind: string, id: string | undefined): boolean {
    if (!preview || !id) return false;
    if (preview.kind === "set") return preview.set.kind === kind && preview.set.id === id;
    return preview.kind === kind && preview.id === id;
  }

  function addLabel(text: string | undefined, at: Vector3, cls: string, hi: boolean, dy = 0): LabelEl | null {
    if (!text || (!hi && labelEls.length >= MAX_LABELS)) return null;
    const e = el("div", `c3d-lbl ${cls}${hi ? " hi" : ""}`, labelsLayer);
    e.textContent = text;
    const l = { el: e, at, hi, dy };
    labelEls.push(l);
    return l;
  }

  function dot(at: Vector3, mat: Material, px: number, onTop = false): Mesh {
    const m = new Mesh(dotGeo, mat);
    m.position.copy(at);
    if (onTop) m.renderOrder = 11;
    markers.add(m);
    pointMeshes.push({ mesh: m, px });
    return m;
  }

  function lineFrame(pose: CellPose, len: number): Group {
    const t = new Group();
    t.matrixAutoUpdate = false;
    const g = new BufferGeometry();
    g.setAttribute("position", new Float32BufferAttribute([0, 0, 0, len, 0, 0, 0, 0, 0, 0, len, 0, 0, 0, 0, 0, 0, len], 3));
    g.setAttribute("color", new Float32BufferAttribute([
      ...hexRgb(AXIS_COLORS[0]), ...hexRgb(AXIS_COLORS[0]), ...hexRgb(AXIS_COLORS[1]), ...hexRgb(AXIS_COLORS[1]), ...hexRgb(AXIS_COLORS[2]), ...hexRgb(AXIS_COLORS[2]),
    ], 3));
    t.add(new LineSegments(g, new LineBasicMaterial({ vertexColors: true })));
    toM4(poseOf(pose), t.matrix);
    markers.add(t);
    return t;
  }

  const dotGeo = new SphereGeometry(1, 16, 12);
  dotGeo.userData.shared = true;

  function drawSet(set: Cell3DSet, hi: boolean) {
    const p = PALETTES[theme];
    const pos = (Array.isArray(set.positions) ? set.positions : []).slice(0, MAX_SET_POSITIONS);
    if (!pos.length) return;
    const color = hi ? p.hi : p.set;
    const v = pos.map(q => new Vector3(num(q.x), num(q.y), num(q.z)));
    // Lattice / path lines.
    const seg: number[] = [];
    const push = (a: Vector3, b: Vector3) => seg.push(a.x, a.y, a.z, b.x, b.y, b.z);
    const rows = Math.max(0, Math.floor(set.rows ?? 0)), cols = Math.max(0, Math.floor(set.cols ?? 0));
    if (set.kind === "grid" && rows * cols === v.length) {
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
        const i = r * cols + c;
        if (c + 1 < cols) push(v[i], v[i + 1]);
        if (r + 1 < rows) push(v[i], v[i + cols]);
      }
    } else if (set.kind === "stack") {
      for (let i = 0; i + 1 < v.length; i++) push(v[i], v[i + 1]);
    }
    if (seg.length) {
      const g = new BufferGeometry();
      g.setAttribute("position", new Float32BufferAttribute(seg, 3));
      const ls = new LineSegments(g, new LineBasicMaterial({ color, transparent: true, opacity: hi ? 0.85 : 0.4, depthTest: !hi, depthWrite: false }));
      if (hi) ls.renderOrder = 10;
      markers.add(ls);
    }
    const mat = new MeshBasicMaterial({ color, depthTest: !hi, transparent: hi });
    const pickKind = set.kind === "grid" || set.kind === "stack" ? set.kind : null;
    // Each drawn cell is its own pick target (zero-based, as programs index them).
    const cellOf = (i: number): Cell3DTarget | null => !pickKind || !set.id ? null
      : pickKind === "stack" ? { kind: "stack", id: set.id, index: i }
        : cols > 0 ? { kind: "grid", id: set.id, row: Math.floor(i / cols), col: i % cols } : { kind: "grid", id: set.id };
    let hiCell = -1;
    v.forEach((at, i) => {
      // The base position (index 0) is drawn bigger: everything steps from it.
      const px = set.kind === "marks" ? (hi ? 5 : 4) : i === 0 ? (hi ? 6 : 4) : hi ? 3.6 : 2.6;
      dot(at, mat, px, hi);
      const cell = cellOf(i);
      if (cell) {
        pickables.push({ target: cell, at });
        if (hasCell(highlight) && inHighlight(cell)) hiCell = i;
      }
      if (pos[i].name) addLabel(pos[i].name, at, "set", hi);
      if (preview?.kind === "set" && preview.set === set) previewAnchors.push(at);
    });
    // The tapped cell (its sheet is open): a big highlight dot on top, with its row / column or slot.
    if (hiCell >= 0) {
      const c = cellOf(hiCell)!;
      dot(v[hiCell], new MeshBasicMaterial({ color: p.hi, depthTest: false, transparent: true }), hi ? 8 : 7, true);
      addLabel(c.kind === "stack" ? `slot ${hiCell + 1}` : c.row != null ? `row ${c.row + 1}, col ${(c.col ?? 0) + 1}` : undefined, v[hiCell], "", true);
    }
    // The name sits clear of the base position (usually a named point): a grid's middle, a stack's end.
    const nameAt = set.kind === "grid"
      ? v.reduce((a, b) => a.add(b), new Vector3()).multiplyScalar(1 / v.length)
      : set.kind === "stack" ? v[v.length - 1] : v[0];
    addLabel(set.name, nameAt, "set", hi, set.kind === "marks" ? 0 : -22);
  }

  function rebuildMarkers() {
    clearGroup(markers);
    labelsLayer.textContent = "";
    labelEls = [];
    pointMeshes = [];
    pickables = [];
    previewAnchors = [];
    toolPrev = null;
    const p = PALETTES[theme];
    const hiMat = new MeshBasicMaterial({ color: p.hi, depthTest: false, transparent: true });

    // Grids / stacks first, so point labels sit on top of theirs.
    for (const s of sets) {
      if (!s || replaced(s.kind, s.id)) continue;
      const mine = (s.kind === "grid" || s.kind === "stack") && isHi(s.kind, s.id);
      // A highlighted cell draws its array as usual, with just that cell emphasised (drawSet).
      if (!options.sets && !mine) continue;
      drawSet(s, mine && !hasCell(highlight));
    }
    if (preview?.kind === "set") drawSet(preview.set, true);

    const filter = pointFilter();
    if (togBtns.points) togBtns.points.textContent = pointsChipLabel();
    if (points.length) {
      const mat = new MeshBasicMaterial({ color: p.accent });
      for (const pt of points) {
        if (replaced("point", pt.id)) continue;
        // A highlighted point always draws; the rest only while points are on (and relevant).
        const hi = isHi("point", pt.id);
        if (!hi && (!options.points || (filter && !(pt.id && filter.has(pt.id))))) continue;
        const at = new Vector3(pt.x, pt.y, pt.z);
        dot(at, hi ? hiMat : mat, hi ? 6.5 : 4, hi);
        if (pt.id) pickables.push({ target: { kind: "point", id: pt.id }, at });
        addLabel(pt.name, at, "", hi);
      }
    }
    if (preview?.kind === "point") {
      const at = new Vector3(num(preview.pose.x), num(preview.pose.y), num(preview.pose.z));
      previewAnchors.push(at);
      dot(at, hiMat, 6.5, true);
      addLabel(preview.name || preview.pose.name, at, "", true);
    }

    const hiFrame = (pose: CellPose, name: string | undefined) => {
      const t = triad(70, 1.8, true);
      toM4(poseOf(pose), t.matrix);
      markers.add(t);
      const at = new Vector3(num(pose.x), num(pose.y), num(pose.z));
      dot(at, hiMat, 4.5, true);
      addLabel(name, at, "loc", true);
    };
    for (const lo of locals) {
      if (replaced("local", lo.id)) continue;
      const hi = isHi("local", lo.id);
      if (!options.locals && !hi) continue;
      const at = new Vector3(lo.x, lo.y, lo.z);
      if (hi) hiFrame(lo, lo.name);
      else { lineFrame(lo, 40); addLabel(lo.name, at, "loc", false); }
      if (lo.id) pickables.push({ target: { kind: "local", id: lo.id }, at });
    }
    if (preview?.kind === "local") {
      hiFrame(preview.pose, preview.name || preview.pose.name);
      previewAnchors.push(new Vector3(num(preview.pose.x), num(preview.pose.y), num(preview.pose.z)));
    }

    if (preview?.kind === "tool") {
      const tri = triad(40, 1.3, true);
      const lg = new BufferGeometry();
      lg.setAttribute("position", new Float32BufferAttribute([0, 0, 0, 0, 0, 0], 3));
      const line = new Line(lg, new LineBasicMaterial({ color: p.hi, depthTest: false, transparent: true }));
      line.renderOrder = 10;
      line.frustumCulled = false;
      markers.add(tri, line);
      const d = dot(new Vector3(), hiMat, 5, true);
      const label = addLabel(preview.name || "Tool", new Vector3(), "", true);
      toolPrev = { tri, line, dot: d, label, m: toolOffsetMatrix(preview) };
      positionToolPreview();
    }

    if (focusPending) { focusPending = false; focusHighlight(); }
    // Re-frame to take in the edited item while the camera is still the viewer's own (not orbited).
    const key = previewAnchors.length ? "p" + anchorKey(previewAnchors)
      : options.fit === "items" && pickables.length ? "i" + anchorKey(pickables.map(k => k.at)) : "";
    if (key !== lastAnchorKey) {
      lastAnchorKey = key;
      if (!userMoved && view !== "follow" && (robot || cell?.fixtures?.length)) fitView(view);
    }
    request();
  }

  /** The preview's extent rounded to 5 mm, so typing a digit only re-frames on a real change. */
  function anchorKey(pts: Vector3[]): string {
    const b = new Box3().setFromPoints(pts);
    const r = (v: number) => Math.round(v / 5);
    return [b.min.x, b.min.y, b.min.z, b.max.x, b.max.y, b.max.z].map(r).join(",");
  }

  /** The edited tool's TCP: the live flange (from the reported TCP and the active tool) × its offset. */
  function positionToolPreview() {
    if (!toolPrev) return;
    const show = !!flangeWorld;
    toolPrev.tri.visible = toolPrev.line.visible = toolPrev.dot.visible = show;
    if (toolPrev.label) toolPrev.label.el.style.visibility = show ? "visible" : "hidden";
    if (!flangeWorld) return;
    const m = mul(flangeWorld, toolPrev.m);
    toM4(m, toolPrev.tri.matrix);
    toolPrev.tri.matrixWorldNeedsUpdate = true;
    toolPrev.dot.position.set(m[3], m[7], m[11]);
    toolPrev.label?.at.set(m[3], m[7], m[11]);
    const lp = toolPrev.line.geometry.attributes.position as BufferAttribute;
    lp.setXYZ(0, flangeWorld[3], flangeWorld[7], flangeWorld[11]);
    lp.setXYZ(1, m[3], m[7], m[11]);
    lp.needsUpdate = true;
  }

  /** Pan (keeping the orbit) so the highlighted item is on screen when it isn't. */
  function focusHighlight() {
    if (!highlight || view === "follow") return;
    const hits = pickables.filter(k => inHighlight(k.target));
    if (!hits.length) return;
    const c = new Vector3();
    for (const k of hits) c.add(k.at);
    c.multiplyScalar(1 / hits.length);
    camera.updateMatrixWorld();
    const q = c.clone().project(camera);
    // The overlay bars cover the top / bottom edges: only the band between them counts as on screen.
    const h = Math.max(1, root.clientHeight);
    const topPx = options.controls === "full" ? 52 : 48, botPx = options.controls === "none" ? 8 : 58;
    const yTop = 1 - (2 * topPx) / h, yBot = -1 + (2 * botPx) / h;
    const margin = 0.08;
    if (q.z < 1 && Math.abs(q.x) < 0.82 && q.y < yTop - margin && q.y > yBot + margin) return;
    // Pan so the item lands in the middle of that band (same orbit, same distance).
    const want = new Vector3(0, (yTop + yBot) / 2, q.z < 1 ? q.z : 0.5).unproject(camera);
    const at = c.clone();
    const shift = at.sub(want);
    camera.position.add(shift);
    controls.target.add(shift);
    controls.update();
  }

  const proj = new Vector3();
  function placeLabels(w: number, h: number, compact: boolean) {
    for (const l of labelEls) {
      // Small panes: only the highlighted item's name — the rest would pile up on each other.
      if (compact && !l.hi) { l.el.style.display = "none"; continue; }
      proj.copy(l.at).project(camera);
      if (proj.z > 1 || proj.z < -1 || Math.abs(proj.x) > 1.1 || Math.abs(proj.y) > 1.1) { l.el.style.display = "none"; continue; }
      l.el.style.display = "block";
      const x = (proj.x * 0.5 + 0.5) * w + 7, y = (-proj.y * 0.5 + 0.5) * h - (l.hi ? 8 : 7) + l.dy;
      l.el.style.transform = `translate(${x.toFixed(1)}px,${y.toFixed(1)}px)`;
    }
  }

  // ── tap to select ──────────────────────────────────────────────────────────
  let down: { x: number; y: number; t: number; touch: boolean; userMovedBefore: boolean } | null = null;
  renderer.domElement.addEventListener("pointerdown", e => {
    down = e.isPrimary ? { x: e.clientX, y: e.clientY, t: performance.now(), touch: e.pointerType !== "mouse", userMovedBefore: userMoved } : null;
  }, { capture: true });
  renderer.domElement.addEventListener("pointerup", e => {
    const d = down;
    down = null;
    if (!d || !e.isPrimary || Math.hypot(e.clientX - d.x, e.clientY - d.y) > 6 || performance.now() - d.t > 600) return;
    // A tap isn't an orbit: keep the preset view active (OrbitControls fired "start" on press).
    if (d.userMovedBefore === false) { userMoved = false; syncOverlayControls(); }
    const r = renderer.domElement.getBoundingClientRect();
    const sx = e.clientX - r.left, sy = e.clientY - r.top;
    const radius = d.touch ? 22 : 14;
    let best: Cell3DTarget | null = null;
    let bestD = radius;
    for (const k of pickables) {
      proj.copy(k.at).project(camera);
      if (proj.z > 1 || proj.z < -1) continue;
      const px = (proj.x * 0.5 + 0.5) * r.width, py = (-proj.y * 0.5 + 0.5) * r.height;
      const dd = Math.hypot(px - sx, py - sy);
      if (dd < bestD) { bestD = dd; best = k.target; }
    }
    emit({ type: "pick", target: best });
  });

  // ── posing ─────────────────────────────────────────────────────────────────
  function applyPose(q: JointValues) {
    if (!robot) return;
    const ps = poses(robot, q);
    for (const [name, lg] of Object.entries(links)) {
      toM4(ps[name] ?? [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1], lg.group.matrix);
      lg.group.matrixWorldNeedsUpdate = true;
    }
    const fl = ps[flangeName];
    tcpTriad.visible = !!(fl && tcpLocal);
    if (!tcpTriad.visible) flangeTriad.visible = tcpLink.visible = false;
    flangeWorld = null;
    if (fl && tcpLocal) {
      const tcp = mul(fl, tcpLocal);
      toM4(tcp, tcpTriad.matrix);
      tcpTriad.matrixWorldNeedsUpdate = true;
      tcpWorld.set(tcp[3], tcp[7], tcp[11]);
      const fm = mul(tcp, invertRigid(toolOffsetMatrix(appTool)));
      toM4(fm, flangeTriad.matrix);
      flangeTriad.matrixWorldNeedsUpdate = true;
      const off = Math.hypot(fm[3] - tcp[3], fm[7] - tcp[7], fm[11] - tcp[11]);
      flangeTriad.visible = tcpLink.visible = off > 1;
      const lp = tcpLink.geometry.attributes.position as BufferAttribute;
      lp.setXYZ(0, fm[3], fm[7], fm[11]);
      lp.setXYZ(1, tcp[3], tcp[7], tcp[11]);
      lp.needsUpdate = true;
      tcpTriad.visible = true;
      flangeWorld = fm;
      if (options.trail) pushTrail(tcpWorld);
    }
    positionToolPreview();
  }

  function applyGhost() {
    if (!robot) return;
    const show = !!ghostQ && Object.keys(ghostQ).some(k => Math.abs((ghostQ![k] ?? 0) - (qTo[k] ?? 0)) > 0.05);
    ghostRoot.visible = show;
    if (!show) return;
    const ps = poses(robot, ghostQ!);
    for (const [name, lg] of Object.entries(links)) {
      if (!lg.ghost) continue;
      toM4(ps[name], lg.ghost.matrix);
      lg.ghost.matrixWorldNeedsUpdate = true;
    }
  }

  function onStatus(s: Record<string, any>) {
    status = s || {};
    const now = performance.now();
    if (robot) {
      const raw = jointValues(robot, status);
      const next: JointValues = {};
      for (const j of robot.joints) next[j.name] = raw[j.name] ?? qTo[j.name] ?? 0;
      const same = robot.joints.every(j => Math.abs((next[j.name] ?? 0) - (qTo[j.name] ?? 0)) < 1e-6);
      if (!same || !Object.keys(qNow).length) {
        qFrom = Object.keys(qNow).length ? { ...qNow } : { ...next };
        qTo = next;
        animStart = now;
        animDur = Math.max(40, Math.min(250, lastStatusAt ? now - lastStatusAt : 100));
      }
      // The TCP the controller reports, pinned to the flange link at the reported pose.
      // A controller that has never set its pose reports an all-zero TCP: no TCP until it does.
      const blank = !status.x && !status.y && !status.z && !status.rz;
      const tcp = blank ? null : tcpFromStatus(status);
      const fl = poses(robot, next)[flangeName];
      tcpLocal = tcp && fl ? mul(invertRigid(fl), tcp) : null;
      // Ghost at the target, when the status carries target joints (target<Field> per joint).
      const tq = jointValues(robot, status, "target");
      const fielded = robot.joints.filter(j => j.value?.field);
      ghostQ = fielded.length && fielded.every(j => tq[j.name] != null) ? tq : null;
      applyGhost();
    }
    lastStatusAt = now;
    updateTool();
    for (const st of moving) st.target = drivenTarget(st.def);
    request();
  }

  // ── camera ─────────────────────────────────────────────────────────────────
  /**
   * What a preset view frames: the robot (with its tool), plus the fixtures clipped to a little
   * beyond the robot's reach — a big table shouldn't shrink the robot to a speck.
   */
  function contentBox(): Box3 {
    // Editing an item: a close-up of it and the robot's base axis, so it reads against the robot
    // without the whole arm shrinking it to a few pixels.
    const lim = Math.max(reach, 150) * 2;
    const near = previewAnchors.filter(p => Math.abs(p.x) <= lim && Math.abs(p.y) <= lim && Math.abs(p.z) <= lim);
    if (near.length) {
      const fb = new Box3().setFromPoints(near);
      fb.expandByPoint(new Vector3(0, 0, groundZ));
      const size = fb.getSize(new Vector3());
      fb.expandByScalar(Math.max(60, 0.18 * Math.max(size.x, size.y, size.z)));
      return fb;
    }
    world.updateMatrixWorld(true);
    const b = new Box3().setFromObject(robotRoot);
    const f = new Box3().setFromObject(fixtures);
    if (!f.isEmpty()) {
      if (b.isEmpty()) b.copy(f);
      else {
        const r = Math.max(reach, 150) * 1.2;
        f.min.x = Math.max(f.min.x, -r); f.min.y = Math.max(f.min.y, -r);
        f.max.x = Math.min(f.max.x, r);  f.max.y = Math.min(f.max.y, r);
        if (f.min.x < f.max.x && f.min.y < f.max.y) b.union(f);
      }
    }
    if (b.isEmpty()) b.set(new Vector3(-300, -400, 0), new Vector3(300, 200, 500));
    if (options.fit === "items") for (const k of pickables) {
      const p = k.at;
      if (Math.abs(p.x) <= lim && Math.abs(p.y) <= lim && Math.abs(p.z) <= lim) b.expandByPoint(p);
    }
    return b;
  }

  function fitView(v: Exclude<Cell3DViewName, "follow">) {
    const b = contentBox();
    const c = b.getCenter(new Vector3());
    const d = VIEW_DIRS[v];
    const dir = new Vector3(d[0], d[1], d[2]).normalize();
    // Camera basis for this direction (Z-up), then the distance at which every corner of the
    // content box fits the frustum — tighter than a bounding sphere. The overlay chips take ~44 px
    // top and bottom, so the usable height is a little less than the canvas.
    const right = new Vector3().crossVectors(new Vector3(0, 0, 1), dir);
    if (right.lengthSq() < 1e-6) right.set(1, 0, 0);
    right.normalize();
    const up = new Vector3().crossVectors(dir, right).normalize();
    const h = Math.max(1, root.clientHeight);
    const reserve = options.controls === "none" ? 16 : root.classList.contains("c3d-compact") ? 64 : 88;
    const usable = Math.max(0.5, (h - reserve) / h);
    const tanV = Math.tan((camera.fov * Math.PI) / 360) * usable;
    const tanH = Math.tan((camera.fov * Math.PI) / 360) * Math.max(0.3, camera.aspect) * 0.94;
    let dist = 150;
    const p = new Vector3();
    for (let i = 0; i < 8; i++) {
      p.set(i & 1 ? b.max.x : b.min.x, i & 2 ? b.max.y : b.min.y, i & 4 ? b.max.z : b.min.z).sub(c);
      const z = p.dot(dir);
      dist = Math.max(dist, z + Math.abs(p.dot(right)) / tanH, z + Math.abs(p.dot(up)) / tanV);
    }
    dist *= 1.02;
    controls.target.copy(c);
    camera.position.copy(c).addScaledVector(dir, dist);
    camera.near = Math.max(1, dist / 200);
    camera.far = dist * 40;
    camera.updateProjectionMatrix();
    controls.update();
    fitted = true;
  }

  function setView(v: Cell3DViewName, user = false) {
    view = v;
    userMoved = false;
    if (v === "follow") {
      haveFollow = false;
      if (tcpTriad.visible) {
        const off = camera.position.clone().sub(controls.target);
        const dist = Math.min(off.length(), 700);
        off.setLength(dist);
        controls.target.copy(tcpWorld);
        camera.position.copy(tcpWorld).add(off);
        lastFollow.copy(tcpWorld);
        haveFollow = true;
      }
    } else {
      fitView(v);
    }
    syncOverlayControls();
    if (user) request();
    request();
  }

  controls.addEventListener("change", () => request());
  controls.addEventListener("start", () => {
    userMoved = true;
    // Orbiting leaves a preset (Follow keeps following while you orbit around the tool).
    if (view !== "follow") { for (const k of VIEWS) viewBtns[k.key]!.classList.remove("on"); }
  });

  // ── frame loop (on demand) ─────────────────────────────────────────────────
  let raf = 0;
  function request() { if (!raf && !destroyed) raf = requestAnimationFrame(frame); }

  function frame(now: number) {
    raf = 0;
    if (destroyed) return;
    const dt = lastFrame ? Math.min(0.1, (now - lastFrame) / 1000) : 0;
    lastFrame = now;
    let again = false;

    if (robot) {
      const a = Math.min(1, (now - animStart) / animDur);
      const q: JointValues = {};
      for (const j of robot.joints) {
        const f = qFrom[j.name] ?? qTo[j.name] ?? 0, t = qTo[j.name] ?? 0;
        q[j.name] = f + (t - f) * a;
      }
      qNow = q;
      applyPose(q);
      if (a < 1) again = true;
    }

    for (const st of moving) {
      if (st.p === st.target) continue;
      const mv = st.def;
      const travel = mv.slide ? Math.abs(mv.slide.travel) : mv.rotate ? Math.abs(mv.rotate.degrees) : 1;
      const rate = mv.speed && travel > 0 ? mv.speed / travel : Infinity; // fraction per second
      const step = rate === Infinity ? 1 : rate * (dt || 0.016);
      st.p = st.p < st.target ? Math.min(st.target, st.p + step) : Math.max(st.target, st.p - step);
      setMovingMatrix(st);
      if (st.p !== st.target) again = true;
    }

    if (view === "follow" && tcpTriad.visible) {
      if (!haveFollow) { lastFollow.copy(tcpWorld); haveFollow = true; }
      const d = tcpWorld.clone().sub(lastFollow);
      if (d.lengthSq() > 1e-8) {
        camera.position.add(d);
        controls.target.add(d);
        lastFollow.copy(tcpWorld);
      }
    }

    controls.update(); // damping: fires "change" → another frame while it settles
    const w = root.clientWidth, h = root.clientHeight;
    // Point markers keep a constant on-screen size (≈ 4 px radius) at any zoom.
    if (pointMeshes.length) {
      const perPx = (2 * Math.tan((camera.fov * Math.PI) / 360)) / Math.max(1, h);
      for (const { mesh, px } of pointMeshes) mesh.scale.setScalar(Math.max(0.05, camera.position.distanceTo(mesh.position) * perPx * px));
    }
    renderer.render(scene, camera);
    if (labelEls.length) placeLabels(w, h, w < 420 || h < 260);
    if (again) request();
  }

  // ── sizing ─────────────────────────────────────────────────────────────────
  function resize() {
    const w = Math.max(1, root.clientWidth), h = Math.max(1, root.clientHeight);
    renderer.setSize(w, h, true);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    root.classList.toggle("c3d-compact", w < 420 || h < 260);
    // A fit made at another size (the pane often settles after the first data) is re-made, unless
    // the user has taken the camera.
    if (fitted && !userMoved && view !== "follow" && (robot || cell?.fixtures?.length)) fitView(view);
    request();
  }
  const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(resize) : null;
  ro?.observe(root);
  window.addEventListener("resize", resize);

  // ── theme ──────────────────────────────────────────────────────────────────
  function applyThemeVars() {
    const p = PALETTES[theme];
    const s = root.style;
    s.setProperty("--c3d-bg", p.bg);
    s.setProperty("--c3d-text", p.text);
    s.setProperty("--c3d-text2", p.text2);
    s.setProperty("--c3d-muted", p.muted);
    s.setProperty("--c3d-border", p.border);
    s.setProperty("--c3d-accent", p.accent);
    s.setProperty("--c3d-accent-soft", p.accentSoft);
    s.setProperty("--c3d-chip", p.chipBg);
    s.setProperty("--c3d-hi", p.hi);
    s.setProperty("--c3d-set", p.set);
    s.background = p.bg;
  }

  function applyTheme() {
    const p = PALETTES[theme];
    applyThemeVars();
    renderer.setClearColor(p.bg, 1);
    edgeMat.color.set(p.edge);
    edgeMat.opacity = p.edgeOpacity;
    ghostMat.color.set(p.accent);
    ghostEdgeMat.color.set(p.accent);
    hemi.groundColor.set(theme === "dark" ? 0x30343b : 0x8a8f98);
    buildGrid(gridExtent());
    if (trailN) { const n = trailN; trailN = 0; const pts = Array.from({ length: n }, (_, k) => new Vector3(trailPos[k * 3], trailPos[k * 3 + 1], trailPos[k * 3 + 2])); pts.forEach(pushTrail); }
    rebuildMarkers();
    request();
  }

  function gridExtent(): number {
    if (!robot) return 600;
    const b = new Box3().setFromObject(robotRoot);
    if (b.isEmpty()) return 600;
    const reach = Math.max(Math.abs(b.min.x), Math.abs(b.max.x), Math.abs(b.min.y), Math.abs(b.max.y));
    return Math.max(300, reach * 1.6);
  }

  function updateTitle() {
    const name = init.title || cell?.name || robot?.name || "";
    titleEl.textContent = name || "3D view";
    titleEl.style.display = robot || cell ? "block" : "none";
    const notes = [cellNote, meshErrors ? `${meshErrors} mesh${meshErrors === 1 ? "" : "es"} didn't load` : ""].filter(Boolean);
    noteEl.textContent = notes.join(" · ");
    noteEl.style.display = notes.length ? "block" : "none";
  }

  function setCell(c: CellDef | null, url: string | null, note?: string, message?: string) {
    cell = c;
    robot = c?.robot && Array.isArray(c.robot.links) && Array.isArray(c.robot.joints) ? c.robot : null;
    baseUrl = url;
    cellNote = note ?? "";
    meshCache.clear(); // a re-uploaded package keeps its URLs but not its meshes
    buildRobot();
    buildFixtures();
    qFrom = {}; qTo = {}; qNow = {};
    if (robot) {
      // Zero pose until the first status, then the live one.
      applyPose({});
      onStatus(status);
      // groundZ: the bottom of the robot at its zero pose (the mount plate's underside).
      robotRoot.updateMatrixWorld(true);
      const b = new Box3().setFromObject(robotRoot);
      groundZ = b.isEmpty() ? 0 : Math.min(0, b.min.z);
      reach = b.isEmpty() ? 400 : Math.max(Math.abs(b.min.x), Math.abs(b.max.x), Math.abs(b.min.y), Math.abs(b.max.y));
    }
    buildGrid(gridExtent());
    msgEl.style.display = robot || (c?.fixtures?.length ?? 0) ? "none" : "flex";
    msgEl.textContent = message || "No 3D model for this robot.";
    updateTitle();
    fitted = false;
    if (robot || c?.fixtures?.length) fitView(view === "follow" ? "iso" : view);
    if (view === "follow") setView("follow");
    request();
  }

  // ── commands ───────────────────────────────────────────────────────────────
  function apply(cmd: Cell3DCommand) {
    if (destroyed || !cmd) return;
    switch (cmd.type) {
      case "cell": setCell(cmd.cell, cmd.baseUrl, cmd.note, cmd.message); break;
      case "status": onStatus(cmd.status as Record<string, any>); break;
      case "tool": appTool = cmd.tool; updateTool(); if (robot) onStatus(status); break;
      case "points": points = Array.isArray(cmd.points) ? cmd.points : []; rebuildMarkers(); break;
      case "locals": locals = Array.isArray(cmd.locals) ? cmd.locals : []; rebuildMarkers(); break;
      case "theme": if (cmd.theme !== theme) { theme = cmd.theme === "dark" ? "dark" : "light"; applyTheme(); drawConveyors(); } break;
      case "options": {
        const before = options.trail;
        options = { ...options, ...stripUndef(cmd.options) };
        if (before && !options.trail) clearTrail();
        syncOverlayControls();
        rebuildMarkers();
        break;
      }
      case "view": setView(cmd.view, true); break;
      case "clearTrail": clearTrail(); break;
      case "sets": sets = Array.isArray(cmd.sets) ? cmd.sets : []; rebuildMarkers(); break;
      case "highlight": {
        const t = cmd.target && typeof cmd.target.id === "string" && cmd.target.id ? cmd.target : null;
        highlight = t;
        focusPending = !!(t && cmd.focus);
        rebuildMarkers();
        break;
      }
      case "preview": preview = cmd.preview ?? null; rebuildMarkers(); break;
      case "conveyors": conveyors = Array.isArray(cmd.conveyors) ? cmd.conveyors : []; drawConveyors(); break;
    }
  }

  applyTheme();
  syncOverlayControls();
  updateTitle();
  resize();
  fitView(view === "follow" ? "iso" : view);

  return {
    apply(cmd) { try { apply(cmd); } catch (e) { emit({ type: "error", message: String(e) }); } },
    destroy() {
      destroyed = true;
      if (raf) cancelAnimationFrame(raf);
      ro?.disconnect();
      window.removeEventListener("resize", resize);
      controls.dispose();
      disposeTree(scene);
      matCache.forEach(m => m.dispose());
      edgeMat.dispose(); ghostMat.dispose(); ghostEdgeMat.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      root.remove();
    },
  };
}

function num(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function stripUndef<T extends object>(o: T | undefined): Partial<T> {
  const out: Partial<T> = {};
  if (!o) return out;
  for (const [k, v] of Object.entries(o)) if (v !== undefined) (out as any)[k] = v;
  return out;
}

function clearGroup(g: Object3D) {
  for (const c of [...g.children]) { g.remove(c); disposeTree(c); }
}

/** Free a subtree's geometries and own materials (shared ones are disposed with the viewer). */
function disposeTree(o: Object3D) {
  o.traverse(c => {
    const anyC = c as Mesh;
    anyC.geometry?.dispose?.();
    const m = anyC.material as Material | Material[] | undefined;
    const free = (x: Material) => { if (!x.userData?.shared) x.dispose(); };
    if (Array.isArray(m)) m.forEach(free); else if (m) free(m);
  });
}
