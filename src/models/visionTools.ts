// Vision programs as generic building blocks — the wire model and the tool/filter catalogue.
//
// Mirrors SimpleRobotController/docs/vision-tools.md (the contract): a program is shared image
// layers (ordered filter stacks) plus one ordered tool list. Any pose-producing tool can be a
// fixture: a dependent tool's region is stored in the fixture's reference space and moved with it
// at run time. Tools may only reference layers and tools that come before them.
//
// Conventions (from the spec):
//  - Regions are normalized image coordinates (0..1 of width / height) as drawn.
//  - Results (points, lines, poses, items) are pixels of the processed frame.
//  - Ids are stable strings; tools link by id, never by name.

// ── Geometry ─────────────────────────────────────────────────────────────────

export type VPoint = { x: number; y: number };

export type RegionShape = "rect" | "circle" | "polygon" | "quad";

/**
 * A tool's search area, normalized. `rect` uses x/y/width/height (+ rotation, degrees clockwise
 * about its centre, applied in pixel space); `circle` cx/cy/radius (radius relative to the smaller
 * image side); `polygon` points; `quad` exactly 4 points TL, TR, BR, BL (a perspective area).
 */
export type Region = {
  shape: RegionShape;
  x?: number; y?: number; width?: number; height?: number; rotation?: number;
  cx?: number; cy?: number; radius?: number;
  points?: VPoint[];
};

/** Splits a region into rows × cols cells, each judged on its own. `inset` trims each cell (0..0.45). */
export type ToolGrid = { rows: number; cols: number; inset: number };

/** Pass band on one numeric value key; null = no bound on that side. */
export type ToolLimit = { min: number | null; max: number | null };

/** A found position, in pixels. `quad` (TL, TR, BR, BL) makes it a perspective fixture. */
export type Pose = { x: number; y: number; angle: number; scale?: number; quad?: VPoint[] | null };

// ── Image layers ─────────────────────────────────────────────────────────────

export type FilterType =
  | "channel" | "colorMask" | "blur" | "median" | "threshold" | "morph"
  | "contrast" | "edges" | "backgroundRemove" | "invert";

/** One step of a layer's filter stack. Params sit flat on the object, next to id/type/enabled. */
export type VisionFilter = {
  id: string;
  type: FilterType;
  enabled: boolean;
  [param: string]: string | number | boolean | null | undefined;
};

export type ImageLayer = {
  id: string;
  name: string;
  /** "camera" or the id of an earlier layer. */
  input: string;
  filters: VisionFilter[];
};

// ── Tools ────────────────────────────────────────────────────────────────────

export type VisionToolType =
  // Locate
  | "findLine" | "findCorner" | "findCircle" | "blob" | "contourMatch" | "patternMatch" | "aruco" | "makeFixture"
  // Measure
  | "caliper" | "distance" | "angle" | "corners" | "lines"
  // Presence & count
  | "pixelCount" | "intensity" | "edgePixels" | "polygon"
  // Read
  | "barcode";

export type ToolParamValue = string | number | boolean | null | undefined | object;
export type ToolParams = { [key: string]: ToolParamValue };

export type VisionTool = {
  id: string;
  name: string;
  type: VisionToolType;
  enabled: boolean;
  /** "camera" or a layer id. */
  input: string;
  /** An earlier pose-producing tool this one follows, or null. */
  fixtureId: string | null;
  /** Omitted for tools that need none (makeFixture, distance, angle). */
  region?: Region | null;
  /**
   * An earlier tool whose region (and fixture) this one uses instead of its own, or null — one area
   * drawn once, shared by several tools. The grid stays this tool's own.
   */
  regionFrom?: string | null;
  grid?: ToolGrid | null;
  /** Judgement on any numeric value key. */
  limits?: Record<string, ToolLimit>;
  includeInPass: boolean;
  /** Pose-producing tools: the pose found on the teach image. */
  reference?: Pose | null;
  params: ToolParams;
};

export type VisionProgram = {
  id: string;
  name: string;
  description: string;
  cameraId: string;
  lastUpdatedUnixMs: number;
  layers: ImageLayer[];
  tools: VisionTool[];
};

// ── Results ──────────────────────────────────────────────────────────────────

export type ToolStatus = "ok" | "fail" | "notRun" | "error";

export type ToolCellResult = {
  row: number; col: number; index: number; value: number; passed: boolean;
  /** The measured cell window (after inset), pixels TL, TR, BR, BL. */
  quad?: VPoint[] | null;
};

export type ToolResult = {
  id: string;
  type: VisionToolType;
  status: ToolStatus;
  /** Status ok and every limit satisfied. */
  passed: boolean;
  message?: string | null;
  timeMs?: number;
  values?: Record<string, number | string>;
  pose?: Pose | null;
  points?: VPoint[];
  lines?: { x1: number; y1: number; x2: number; y2: number }[];
  items?: Record<string, number | string>[];
  cells?: ToolCellResult[];
  /** The region outline as actually used (after the fixture moved it), for the overlay. */
  region?: VPoint[];
};

export type VisionResult = {
  programId: string;
  timestamp?: number;
  /** Size of the analysed frame, px — what result pixels are pixels of. */
  imageWidth?: number;
  imageHeight?: number;
  /** AND of the enabled includeInPass tools. */
  passed: boolean;
  tools: ToolResult[];
  layers?: string[];
  /** Milliseconds per tool id, and "layer:{id}" per computed layer. */
  timings?: Record<string, number>;
  /** "{toolId}: {message}". */
  errors?: string[];
};

// ── RunVision step outputs ───────────────────────────────────────────────────

/**
 * One RunVision output row: a tool's value written to a variable. `value` is any values key of
 * the tool, or one of "passed" | "status" | "cells" | "items" | "points" | "lines" | "pose"
 * (pose is a one-record list {x, y, z, angle}).
 */
export type VisionToolOutput = { toolId: string; value: string; variable: string };

// ── Catalogue ────────────────────────────────────────────────────────────────

export type ToolCategory = "locate" | "measure" | "presence" | "read";

export const TOOL_CATEGORIES: { id: ToolCategory; label: string; description: string }[] = [
  { id: "locate",   label: "Locate",           description: "Find a part and give a position other tools can follow" },
  { id: "measure",  label: "Measure",          description: "Edges, distances, angles and geometry" },
  { id: "presence", label: "Presence & count", description: "Is something there, how much, how many" },
  { id: "read",     label: "Read",             description: "Decode codes" },
];

/** What kind of value a key carries — decides which variables a RunVision row may write it to. */
export type ValueKind = "number" | "bool" | "string";

export type ValueKeySpec = { key: string; label: string; kind: ValueKind };

/** A list-shaped output of a tool. */
export type ToolListOutput = "cells" | "items" | "points" | "lines" | "pose";

/** How a param is edited. Read by ParamFields (src/components/ui/vision-editor/ParamFields.tsx). */
export type ParamFieldSpec =
  | { kind: "int"; key: string; label: string; min: number; max: number; step?: number; desc?: string; showIf?: (p: ToolParams) => boolean }
  | { kind: "number"; key: string; label: string; min: number; max: number; step: number; desc?: string; showIf?: (p: ToolParams) => boolean }
  | { kind: "slider"; key: string; label: string; min: number; max: number; step?: number; desc?: string; showIf?: (p: ToolParams) => boolean }
  | { kind: "segment"; key: string; label: string; options: { value: string; label: string }[]; desc?: string; showIf?: (p: ToolParams) => boolean }
  | { kind: "bool"; key: string; label: string; desc?: string; showIf?: (p: ToolParams) => boolean }
  | { kind: "select"; key: string; label: string; options: { value: number | string; label: string }[]; desc?: string; showIf?: (p: ToolParams) => boolean };

export type RegionRule = "any" | "rect" | "circle" | "none";

export type ToolMeta = {
  label: string;
  category: ToolCategory;
  /** One line for the picker. */
  description: string;
  region: RegionRule;
  /** Outputs a pose, so it can be a fixture. */
  makesPose: boolean;
  /** Supports a cell grid (each cell judged with the limits on its main value). */
  grid: boolean;
  values: ValueKeySpec[];
  /** The value a grid cell is judged on (or a param key naming it, see mainValueKey). */
  mainValue?: string;
  lists: ToolListOutput[];
  defaults: ToolParams;
  defaultLimits?: Record<string, ToolLimit>;
  fields: ParamFieldSpec[];
};

const POLARITY_EDGE = [
  { value: "darkToLight", label: "Dark → light" },
  { value: "lightToDark", label: "Light → dark" },
  { value: "any", label: "Any" },
];

const PICK_EDGE = [
  { value: "strongest", label: "Strongest" },
  { value: "first", label: "First" },
  { value: "last", label: "Last" },
];

const LINE_FIELDS: ParamFieldSpec[] = [
  { kind: "segment", key: "polarity", label: "Edge polarity", options: POLARITY_EDGE,
    desc: "Which way the brightness changes across the edge, reading across the region" },
  { kind: "int", key: "probes", label: "Probes", min: 2, max: 64,
    desc: "How many search lines run across the region to find edge points" },
  { kind: "slider", key: "contrast", label: "Min contrast", min: 1, max: 255,
    desc: "Weakest brightness step that still counts as an edge" },
  { kind: "int", key: "smoothing", label: "Smoothing", min: 0, max: 10,
    desc: "Blur along each probe before looking for the edge — raise on noisy images" },
  { kind: "int", key: "ignore", label: "Ignore outliers", min: 0, max: 32,
    desc: "Edge points furthest from the fitted line to drop before the final fit" },
  { kind: "segment", key: "pick", label: "On each probe use", options: PICK_EDGE,
    desc: "Which edge a probe takes when it crosses more than one" },
];

const THRESHOLD_FIELDS: ParamFieldSpec[] = [
  { kind: "segment", key: "polarity", label: "Find", options: [{ value: "dark", label: "Dark" }, { value: "light", label: "Light" }] },
  { kind: "segment", key: "threshold", label: "Threshold", options: [{ value: "otsu", label: "Automatic" }, { value: "fixed", label: "Fixed" }] },
  { kind: "slider", key: "level", label: "Level", min: 0, max: 255, showIf: p => p.threshold === "fixed",
    desc: "Gray level that separates part from background" },
];

export const ARUCO_DICTIONARY_OPTIONS: { value: number; label: string }[] = [
  { value: -1, label: "Auto detect (all)" },
  { value: 0, label: "4x4 (50 IDs)" }, { value: 1, label: "4x4 (100 IDs)" }, { value: 2, label: "4x4 (250 IDs)" }, { value: 3, label: "4x4 (1000 IDs)" },
  { value: 4, label: "5x5 (50 IDs)" }, { value: 5, label: "5x5 (100 IDs)" }, { value: 6, label: "5x5 (250 IDs)" }, { value: 7, label: "5x5 (1000 IDs)" },
  { value: 8, label: "6x6 (50 IDs)" }, { value: 9, label: "6x6 (100 IDs)" }, { value: 10, label: "6x6 (250 IDs)" }, { value: 11, label: "6x6 (1000 IDs)" },
  { value: 12, label: "7x7 (50 IDs)" }, { value: 13, label: "7x7 (100 IDs)" }, { value: 14, label: "7x7 (250 IDs)" }, { value: 15, label: "7x7 (1000 IDs)" },
  { value: 16, label: "ArUco original" },
];

export const BARCODE_FORMAT_OPTIONS: { id: string; label: string }[] = [
  { id: "QR_CODE", label: "QR Code" }, { id: "DATA_MATRIX", label: "Data Matrix" }, { id: "AZTEC", label: "Aztec" },
  { id: "PDF_417", label: "PDF 417" }, { id: "CODE_128", label: "Code 128" }, { id: "CODE_39", label: "Code 39" },
  { id: "EAN_13", label: "EAN-13" }, { id: "EAN_8", label: "EAN-8" }, { id: "UPC_A", label: "UPC-A" }, { id: "UPC_E", label: "UPC-E" },
];

const v = (key: string, label: string, kind: ValueKind = "number"): ValueKeySpec => ({ key, label, kind });

export const TOOL_META: Record<VisionToolType, ToolMeta> = {
  // ── Locate ────────────────────────────────────────────────────────────────
  findLine: {
    label: "Find line", category: "locate", region: "rect", makesPose: true, grid: false,
    description: "Fit a straight edge inside a box — gives its position and angle",
    values: [v("found", "Found", "bool"), v("x", "X (midpoint)"), v("y", "Y (midpoint)"), v("angle", "Angle"), v("fitError", "Fit error"), v("pointsUsed", "Points used")],
    lists: ["points", "lines", "pose"],
    defaults: { probes: 8, polarity: "any", contrast: 20, smoothing: 1, ignore: 0, pick: "strongest" },
    fields: LINE_FIELDS,
  },
  findCorner: {
    label: "Find corner", category: "locate", region: "rect", makesPose: true, grid: false,
    description: "Fit two edges and intersect them — gives a corner position and angle",
    values: [v("found", "Found", "bool"), v("x", "X"), v("y", "Y"), v("angle", "Angle (side A)"), v("cornerAngle", "Corner angle")],
    lists: ["lines", "pose"],
    defaults: { probes: 8, polarity: "any", contrast: 20, smoothing: 1, ignore: 0, pick: "strongest", regionB: null },
    fields: LINE_FIELDS,
  },
  findCircle: {
    label: "Find circle", category: "locate", region: "circle", makesPose: true, grid: false,
    description: "Fit a round edge inside a ring — gives its centre and radius",
    values: [v("found", "Found", "bool"), v("x", "Centre X"), v("y", "Centre Y"), v("radius", "Radius"), v("fitError", "Fit error"), v("pointsUsed", "Points used")],
    lists: ["points", "pose"],
    defaults: { probes: 16, direction: "inward", polarity: "any", contrast: 20, smoothing: 1, ignore: 0, pick: "strongest", innerRatio: 0.5 },
    fields: [
      { kind: "segment", key: "direction", label: "Search", options: [{ value: "inward", label: "Inward" }, { value: "outward", label: "Outward" }],
        desc: "Which way each probe runs across the ring" },
      { kind: "segment", key: "polarity", label: "Edge polarity", options: POLARITY_EDGE },
      { kind: "int", key: "probes", label: "Probes", min: 4, max: 128 },
      { kind: "slider", key: "contrast", label: "Min contrast", min: 1, max: 255 },
      { kind: "int", key: "smoothing", label: "Smoothing", min: 0, max: 10 },
      { kind: "int", key: "ignore", label: "Ignore outliers", min: 0, max: 64 },
      { kind: "segment", key: "pick", label: "On each probe use", options: PICK_EDGE },
      { kind: "number", key: "innerRatio", label: "Inner ring", min: 0, max: 0.95, step: 0.05,
        desc: "Inside edge of the search ring as a fraction of the radius — 0 searches the whole disc" },
    ],
  },
  blob: {
    label: "Blob", category: "locate", region: "any", makesPose: true, grid: false,
    description: "Find and count dark or light spots — gives each one's position, area and angle",
    values: [v("count", "Count"), v("found", "Found", "bool"), v("x", "X (first)"), v("y", "Y (first)")],
    lists: ["items", "pose"],
    defaults: { polarity: "dark", threshold: "otsu", level: 128, minArea: 100, maxArea: 1000000, minCircularity: 0, sort: "area", maxCount: 100 },
    defaultLimits: { count: { min: 1, max: null } },
    fields: [
      ...THRESHOLD_FIELDS,
      { kind: "int", key: "minArea", label: "Min area (px²)", min: 1, max: 10000000, step: 50 },
      { kind: "int", key: "maxArea", label: "Max area (px²)", min: 1, max: 10000000, step: 500 },
      { kind: "number", key: "minCircularity", label: "Min roundness", min: 0, max: 1, step: 0.05,
        desc: "1 = perfect circle, 0 = any shape" },
      { kind: "segment", key: "sort", label: "Sort by", options: [{ value: "area", label: "Area" }, { value: "x", label: "X" }, { value: "y", label: "Y" }] },
      { kind: "int", key: "maxCount", label: "Max results", min: 1, max: 500 },
    ],
  },
  contourMatch: {
    label: "Shape match", category: "locate", region: "any", makesPose: true, grid: false,
    description: "Find a taught outline at any position and angle",
    values: [v("count", "Count"), v("score", "Best score"), v("x", "X (best)"), v("y", "Y (best)"), v("angle", "Angle (best)")],
    lists: ["items", "pose"],
    defaults: { template: null, minScore: 0.7, maxCount: 10, minArea: 50, polarity: "dark", threshold: "otsu", level: 128 },
    defaultLimits: { count: { min: 1, max: null } },
    fields: [
      { kind: "number", key: "minScore", label: "Min score", min: 0, max: 1, step: 0.05, desc: "How closely an outline must match the taught one (1 = identical)" },
      { kind: "int", key: "maxCount", label: "Max results", min: 1, max: 100 },
      { kind: "int", key: "minArea", label: "Min area (px²)", min: 1, max: 10000000, step: 50, desc: "Ignore outlines smaller than this" },
      ...THRESHOLD_FIELDS,
    ],
  },
  patternMatch: {
    label: "Pattern match", category: "locate", region: "any", makesPose: true, grid: false,
    description: "Find a taught image patch — best for printed or textured parts",
    values: [v("count", "Count"), v("score", "Best score"), v("x", "X (best)"), v("y", "Y (best)"), v("angle", "Angle (best)")],
    lists: ["items", "pose"],
    defaults: { template: null, minScore: 0.7, angleRange: 0, angleStep: 5, maxCount: 1 },
    defaultLimits: { count: { min: 1, max: null } },
    fields: [
      { kind: "number", key: "minScore", label: "Min score", min: 0, max: 1, step: 0.05 },
      { kind: "int", key: "angleRange", label: "Angle range (±°)", min: 0, max: 180, step: 5, desc: "0 searches without rotation (fastest)" },
      { kind: "int", key: "angleStep", label: "Angle step (°)", min: 1, max: 45, showIf: p => Number(p.angleRange) > 0 },
      { kind: "int", key: "maxCount", label: "Max results", min: 1, max: 100 },
    ],
  },
  aruco: {
    label: "ArUco marker", category: "locate", region: "any", makesPose: true, grid: false,
    description: "Find printed fiducial markers and read their IDs",
    values: [v("count", "Count"), v("id", "ID (first)"), v("x", "X (first)"), v("y", "Y (first)"), v("angle", "Angle (first)")],
    lists: ["items", "lines", "pose"],
    defaults: { dictionaryId: -1, markerId: -1, minArea: 100, maxArea: 1000000 },
    defaultLimits: { count: { min: 1, max: null } },
    fields: [
      { kind: "select", key: "dictionaryId", label: "Dictionary", options: ARUCO_DICTIONARY_OPTIONS,
        desc: "Must match the dictionary the markers were printed from" },
      { kind: "int", key: "markerId", label: "Marker ID", min: -1, max: 999, desc: "-1 accepts any marker" },
      { kind: "int", key: "minArea", label: "Min area (px²)", min: 1, max: 10000000, step: 50 },
      { kind: "int", key: "maxArea", label: "Max area (px²)", min: 1, max: 10000000, step: 1000 },
    ],
  },
  makeFixture: {
    label: "Make fixture", category: "locate", region: "none", makesPose: true, grid: false,
    description: "Build a position from other tools — two points, a corner, or four sides",
    values: [v("found", "Found", "bool"), v("x", "X"), v("y", "Y"), v("angle", "Angle")],
    lists: ["points", "lines", "pose"],
    defaults: { mode: "twoPoints", sources: [] },
    fields: [],
  },
  // ── Measure ───────────────────────────────────────────────────────────────
  caliper: {
    label: "Caliper", category: "measure", region: "rect", makesPose: false, grid: false,
    description: "Find edges or an edge pair along a box — measures widths and gaps",
    values: [v("count", "Edges found"), v("x", "X"), v("y", "Y"), v("width", "Pair width"), v("contrast", "Edge contrast")],
    lists: ["points"],
    defaults: { polarity: "any", mode: "single", contrast: 20, smoothing: 1, pick: "strongest", pairWidth: 0, pairTolerance: 5 },
    fields: [
      { kind: "segment", key: "mode", label: "Find", options: [{ value: "single", label: "One edge" }, { value: "pair", label: "Edge pair" }, { value: "all", label: "All edges" }] },
      { kind: "segment", key: "polarity", label: "Edge polarity", options: POLARITY_EDGE },
      { kind: "segment", key: "pick", label: "Pick", options: [{ value: "first", label: "First" }, { value: "last", label: "Last" }, { value: "strongest", label: "Strongest" }, { value: "center", label: "Centre" }],
        showIf: p => p.mode !== "all" },
      { kind: "slider", key: "contrast", label: "Min contrast", min: 1, max: 255 },
      { kind: "int", key: "smoothing", label: "Smoothing", min: 0, max: 10 },
      { kind: "int", key: "pairWidth", label: "Expected width (px)", min: 0, max: 5000, showIf: p => p.mode === "pair", desc: "0 accepts any width" },
      { kind: "int", key: "pairTolerance", label: "Width tolerance (px)", min: 0, max: 5000, showIf: p => p.mode === "pair" },
    ],
  },
  distance: {
    label: "Distance", category: "measure", region: "none", makesPose: false, grid: false,
    description: "Distance between two found points, or from a point to a line",
    values: [v("distance", "Distance (px)"), v("dx", "dX"), v("dy", "dY")],
    lists: ["lines"],
    defaults: { mode: "pointPoint", sources: [] },
    fields: [],
  },
  angle: {
    label: "Angle", category: "measure", region: "none", makesPose: false, grid: false,
    description: "Angle of a found line, or the angle between two lines",
    values: [v("angle", "Angle")],
    lists: ["lines"],
    defaults: { sources: [] },
    fields: [],
  },
  corners: {
    label: "Corner points", category: "measure", region: "any", makesPose: false, grid: false,
    description: "Find sharp corner points in an area and count them",
    values: [v("count", "Count")],
    lists: ["points"],
    defaults: { method: "shiTomasi", maxCorners: 50, quality: 0.01, minDistance: 10, blockSize: 3 },
    fields: [
      { kind: "segment", key: "method", label: "Method", options: [{ value: "shiTomasi", label: "Shi-Tomasi" }, { value: "harris", label: "Harris" }] },
      { kind: "int", key: "maxCorners", label: "Max corners", min: 1, max: 1000 },
      { kind: "number", key: "quality", label: "Quality", min: 0.001, max: 1, step: 0.005, desc: "Fraction of the strongest corner a corner must reach" },
      { kind: "int", key: "minDistance", label: "Min spacing (px)", min: 1, max: 1000 },
      { kind: "int", key: "blockSize", label: "Block size", min: 2, max: 31 },
    ],
  },
  lines: {
    label: "Line segments", category: "measure", region: "any", makesPose: false, grid: false,
    description: "Find every straight segment in an area (Hough)",
    values: [v("count", "Count")],
    lists: ["items", "lines"],
    defaults: { canny1: 50, canny2: 150, houghThreshold: 50, minLineLength: 30, maxLineGap: 10, minAngle: 0, maxAngle: 180 },
    fields: [
      { kind: "slider", key: "canny1", label: "Edge low", min: 0, max: 255 },
      { kind: "slider", key: "canny2", label: "Edge high", min: 0, max: 255 },
      { kind: "slider", key: "houghThreshold", label: "Votes", min: 1, max: 255, desc: "Edge votes a line needs — higher finds fewer, surer lines" },
      { kind: "int", key: "minLineLength", label: "Min length (px)", min: 1, max: 10000 },
      { kind: "int", key: "maxLineGap", label: "Max gap (px)", min: 0, max: 10000 },
      { kind: "int", key: "minAngle", label: "Min angle (°)", min: 0, max: 180, step: 5 },
      { kind: "int", key: "maxAngle", label: "Max angle (°)", min: 0, max: 180, step: 5,
        desc: "Undirected, 0–180; a min above the max wraps round 0" },
    ],
  },
  // ── Presence & count ─────────────────────────────────────────────────────
  pixelCount: {
    label: "Pixel count", category: "presence", region: "any", makesPose: false, grid: true, mainValue: "percent",
    description: "Percentage of the area in a colour or gray range",
    values: [v("percent", "Percent"), v("cellsPassed", "Cells passed")],
    lists: ["cells"],
    defaults: { mode: "gray", colors: [], grayMin: 0, grayMax: 127 },
    defaultLimits: { percent: { min: 50, max: null } },
    fields: [
      { kind: "segment", key: "mode", label: "Count", options: [{ value: "gray", label: "Gray range" }, { value: "color", label: "Colours" }] },
      { kind: "slider", key: "grayMin", label: "Gray from", min: 0, max: 255, showIf: p => p.mode !== "color" },
      { kind: "slider", key: "grayMax", label: "Gray to", min: 0, max: 255, showIf: p => p.mode !== "color" },
    ],
  },
  intensity: {
    label: "Intensity", category: "presence", region: "any", makesPose: false, grid: true, mainValue: "@statistic",
    description: "Brightness statistics of an area — mean, spread, min, max, contrast",
    values: [v("mean", "Mean"), v("stdDev", "Std dev"), v("min", "Min"), v("max", "Max"), v("contrast", "Contrast"), v("cellsPassed", "Cells passed")],
    lists: ["cells"],
    defaults: { statistic: "mean" },
    fields: [
      { kind: "segment", key: "statistic", label: "Judge on",
        options: [{ value: "mean", label: "Mean" }, { value: "stdDev", label: "Spread" }, { value: "min", label: "Min" }, { value: "max", label: "Max" }, { value: "contrast", label: "Contrast" }],
        desc: "The value each cell (or the whole area) is judged on" },
    ],
  },
  edgePixels: {
    label: "Edge pixels", category: "presence", region: "any", makesPose: false, grid: true, mainValue: "density",
    description: "How much of the area is edges — detail, texture or print",
    values: [v("density", "Edge density %"), v("angle", "Dominant angle"), v("cellsPassed", "Cells passed")],
    lists: ["cells"],
    defaults: { cannyLow: 50, cannyHigh: 150 },
    fields: [
      { kind: "slider", key: "cannyLow", label: "Edge low", min: 0, max: 255 },
      { kind: "slider", key: "cannyHigh", label: "Edge high", min: 0, max: 255 },
    ],
  },
  polygon: {
    label: "Polygon", category: "presence", region: "any", makesPose: false, grid: true, mainValue: "count",
    description: "Count N-sided shapes in a thresholded image",
    values: [v("count", "Count"), v("x", "X (largest)"), v("y", "Y (largest)"), v("angle", "Angle (largest)"), v("cellsPassed", "Cells passed")],
    lists: ["items", "lines", "cells"],
    defaults: { sides: 4, minArea: 1000, maxArea: 100000, epsilon: 0.04 },
    defaultLimits: { count: { min: 1, max: null } },
    fields: [
      { kind: "int", key: "sides", label: "Sides", min: 3, max: 20 },
      { kind: "int", key: "minArea", label: "Min area (px²)", min: 1, max: 10000000, step: 100 },
      { kind: "int", key: "maxArea", label: "Max area (px²)", min: 1, max: 10000000, step: 1000 },
      { kind: "number", key: "epsilon", label: "Tolerance", min: 0.001, max: 0.5, step: 0.005,
        desc: "Outline simplification as a fraction of the perimeter — loosen if shapes are missed" },
    ],
  },
  // ── Read ──────────────────────────────────────────────────────────────────
  barcode: {
    label: "Barcode / QR", category: "read", region: "any", makesPose: false, grid: false,
    description: "Read QR, Data Matrix, Code 128, EAN and more",
    values: [v("count", "Count"), v("value", "Text (first)", "string"), v("format", "Format (first)", "string"), v("x", "X (first)"), v("y", "Y (first)")],
    lists: ["items"],
    defaults: { formats: [] },
    defaultLimits: { count: { min: 1, max: null } },
    fields: [],
  },
};

export const TOOL_TYPES = Object.keys(TOOL_META) as VisionToolType[];

/** The key a grid cell / the main pass test is judged on, resolving "@param" indirections. */
export function mainValueKey(tool: VisionTool): string | undefined {
  const m = TOOL_META[tool.type]?.mainValue;
  if (!m) return undefined;
  if (m.startsWith("@")) return String(tool.params[m.slice(1)] ?? "mean");
  return m;
}

/** makeFixture modes: label, the source slots and what each slot needs. */
export type SourceNeed = "point" | "line" | "pose";
export const FIXTURE_MODES: { value: string; label: string; desc: string; slots: { label: string; need: SourceNeed }[] }[] = [
  { value: "twoPoints", label: "Two points", desc: "Origin at the first point, angle towards the second",
    slots: [{ label: "Origin", need: "point" }, { label: "Towards", need: "point" }] },
  { value: "pointAngle", label: "Point + angle", desc: "Origin from one tool, angle from another",
    slots: [{ label: "Origin", need: "point" }, { label: "Angle from", need: "pose" }] },
  { value: "lineIntersection", label: "Two lines", desc: "Origin where two lines cross, angle of the first",
    slots: [{ label: "Line A", need: "line" }, { label: "Line B", need: "line" }] },
  { value: "fourLines", label: "Four sides", desc: "Top, right, bottom and left edges — a perspective fixture",
    slots: [{ label: "Top", need: "line" }, { label: "Right", need: "line" }, { label: "Bottom", need: "line" }, { label: "Left", need: "line" }] },
  { value: "fourPoints", label: "Four corners", desc: "Corners TL, TR, BR, BL — a perspective fixture",
    slots: [{ label: "Top left", need: "point" }, { label: "Top right", need: "point" }, { label: "Bottom right", need: "point" }, { label: "Bottom left", need: "point" }] },
];

export const DISTANCE_MODES: { value: string; label: string; slots: { label: string; need: SourceNeed }[] }[] = [
  { value: "pointPoint", label: "Point to point", slots: [{ label: "Point A", need: "point" }, { label: "Point B", need: "point" }] },
  { value: "pointLine", label: "Point to line", slots: [{ label: "Point", need: "point" }, { label: "Line", need: "line" }] },
];

/** The source slots a geometry tool (makeFixture / distance / angle) has with its current params. */
export function sourceSlots(tool: VisionTool): { label: string; need: SourceNeed }[] {
  if (tool.type === "makeFixture") return FIXTURE_MODES.find(m => m.value === tool.params.mode)?.slots ?? FIXTURE_MODES[0].slots;
  if (tool.type === "distance") return DISTANCE_MODES.find(m => m.value === tool.params.mode)?.slots ?? DISTANCE_MODES[0].slots;
  if (tool.type === "angle") return [{ label: "Line A", need: "line" }, { label: "Line B (optional)", need: "line" }];
  return [];
}

/**
 * Whether a tool type can feed a geometry source slot. Mirrors the controller's Geometry.PointOf
 * (pose, else points[0], else values x/y) and LineOf (lines[0]).
 */
export function canFeed(type: VisionToolType, need: SourceNeed): boolean {
  const meta = TOOL_META[type];
  if (need === "line") return ["findLine", "findCorner", "lines", "aruco", "makeFixture"].includes(type);
  if (need === "pose") return meta.makesPose;
  return meta.makesPose || meta.lists.includes("points") || meta.values.some(k => k.key === "x");
}

// ── Filters ──────────────────────────────────────────────────────────────────

export type FilterMeta = { label: string; description: string; defaults: Record<string, string | number | boolean>; fields: ParamFieldSpec[] };

export const FILTER_META: Record<FilterType, FilterMeta> = {
  channel: {
    label: "Channel", description: "Keep one channel — gray, a colour, or hue / saturation / value",
    defaults: { channel: "gray" },
    fields: [{ kind: "segment", key: "channel", label: "Channel", options: ["gray", "r", "g", "b", "h", "s", "v"].map(c => ({ value: c, label: c === "gray" ? "Gray" : c.toUpperCase() })) }],
  },
  colorMask: {
    label: "Colour mask", description: "White where the colour is in an HSV range, black elsewhere",
    defaults: { hMin: 0, hMax: 179, sMin: 0, sMax: 255, vMin: 0, vMax: 255 },
    fields: [
      { kind: "slider", key: "hMin", label: "Hue from", min: 0, max: 179 }, { kind: "slider", key: "hMax", label: "Hue to", min: 0, max: 179 },
      { kind: "slider", key: "sMin", label: "Saturation from", min: 0, max: 255 }, { kind: "slider", key: "sMax", label: "Saturation to", min: 0, max: 255 },
      { kind: "slider", key: "vMin", label: "Value from", min: 0, max: 255 }, { kind: "slider", key: "vMax", label: "Value to", min: 0, max: 255 },
    ],
  },
  blur: {
    label: "Blur", description: "Gaussian smoothing — calms noise before edges or thresholds",
    defaults: { size: 5 },
    fields: [{ kind: "int", key: "size", label: "Size (px)", min: 1, max: 99, step: 2, desc: "Odd sizes only" }],
  },
  median: {
    label: "Median", description: "Removes speckle while keeping edges sharp",
    defaults: { size: 5 },
    fields: [{ kind: "int", key: "size", label: "Size (px)", min: 1, max: 99, step: 2, desc: "Odd sizes only" }],
  },
  threshold: {
    label: "Threshold", description: "Black and white — fixed level, automatic, or adaptive to lighting",
    defaults: { mode: "otsu", low: 128, high: 255, blockSize: 31, c: 5, invert: false },
    fields: [
      { kind: "segment", key: "mode", label: "Mode", options: [{ value: "fixed", label: "Fixed" }, { value: "otsu", label: "Automatic" }, { value: "adaptive", label: "Adaptive" }] },
      { kind: "slider", key: "low", label: "From", min: 0, max: 255, showIf: p => p.mode === "fixed" },
      { kind: "slider", key: "high", label: "To", min: 0, max: 255, showIf: p => p.mode === "fixed" },
      { kind: "int", key: "blockSize", label: "Block size (px)", min: 3, max: 255, step: 2, showIf: p => p.mode === "adaptive" },
      { kind: "int", key: "c", label: "Offset", min: -50, max: 50, showIf: p => p.mode === "adaptive" },
      { kind: "bool", key: "invert", label: "Invert" },
    ],
  },
  morph: {
    label: "Morphology", description: "Grow, shrink, open or close shapes in a black-and-white image",
    defaults: { op: "open", size: 3, iterations: 1 },
    fields: [
      { kind: "segment", key: "op", label: "Operation", options: [{ value: "erode", label: "Erode" }, { value: "dilate", label: "Dilate" }, { value: "open", label: "Open" }, { value: "close", label: "Close" }] },
      { kind: "int", key: "size", label: "Size (px)", min: 1, max: 51, step: 2 },
      { kind: "int", key: "iterations", label: "Repeat", min: 1, max: 20 },
    ],
  },
  contrast: {
    label: "Contrast", description: "Brightness / contrast, histogram equalize, or local (CLAHE)",
    defaults: { mode: "equalize", brightness: 0, contrast: 1, clipLimit: 2, tileSize: 8 },
    fields: [
      { kind: "segment", key: "mode", label: "Mode", options: [{ value: "linear", label: "Linear" }, { value: "equalize", label: "Equalize" }, { value: "clahe", label: "Local" }] },
      { kind: "int", key: "brightness", label: "Brightness", min: -255, max: 255, step: 5, showIf: p => p.mode === "linear" },
      { kind: "number", key: "contrast", label: "Contrast", min: 0, max: 10, step: 0.1, showIf: p => p.mode === "linear" },
      { kind: "number", key: "clipLimit", label: "Clip limit", min: 0.5, max: 40, step: 0.5, showIf: p => p.mode === "clahe" },
      { kind: "int", key: "tileSize", label: "Tile size", min: 2, max: 64, showIf: p => p.mode === "clahe" },
    ],
  },
  edges: {
    label: "Edges", description: "Edge image — Sobel strength or Canny lines",
    defaults: { mode: "canny", low: 50, high: 150 },
    fields: [
      { kind: "segment", key: "mode", label: "Mode", options: [{ value: "sobel", label: "Sobel" }, { value: "canny", label: "Canny" }] },
      { kind: "slider", key: "low", label: "Low", min: 0, max: 255, showIf: p => p.mode === "canny" },
      { kind: "slider", key: "high", label: "High", min: 0, max: 255, showIf: p => p.mode === "canny" },
    ],
  },
  backgroundRemove: {
    label: "Flatten lighting", description: "Subtracts a large blur — evens out shadows and glare, keeps detail",
    defaults: { size: 51 },
    fields: [{ kind: "int", key: "size", label: "Blur size (px)", min: 3, max: 501, step: 10 }],
  },
  invert: { label: "Invert", description: "Swap dark and light", defaults: {}, fields: [] },
};

export const FILTER_TYPES = Object.keys(FILTER_META) as FilterType[];

// ── Factories ────────────────────────────────────────────────────────────────

export function newVisionId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export function defaultRegion(rule: RegionRule): Region | null {
  if (rule === "none") return null;
  if (rule === "circle") return { shape: "circle", cx: 0.5, cy: 0.5, radius: 0.25 };
  return { shape: "rect", x: 0.3, y: 0.3, width: 0.4, height: 0.4, rotation: 0 };
}

export function newTool(type: VisionToolType, existing: VisionTool[]): VisionTool {
  const meta = TOOL_META[type];
  const n = existing.filter(t => t.type === type).length + 1;
  const params: ToolParams = JSON.parse(JSON.stringify(meta.defaults));
  if (type === "findCorner") params.regionB = { shape: "rect", x: 0.3, y: 0.3, width: 0.08, height: 0.4, rotation: 0 } satisfies Region;
  const region = type === "findCorner"
    ? { shape: "rect" as const, x: 0.3, y: 0.3, width: 0.4, height: 0.08, rotation: 0 }
    : defaultRegion(meta.region);
  return {
    id: newVisionId("t"),
    name: `${meta.label} ${n}`,
    type,
    enabled: true,
    input: "camera",
    fixtureId: null,
    ...(region ? { region } : {}),
    grid: null,
    limits: meta.defaultLimits ? JSON.parse(JSON.stringify(meta.defaultLimits)) : {},
    includeInPass: true,
    reference: null,
    params,
  };
}

export function newFilter(type: FilterType): VisionFilter {
  return { id: newVisionId("f"), type, enabled: true, ...FILTER_META[type].defaults };
}

export function newLayer(existing: ImageLayer[]): ImageLayer {
  return { id: newVisionId("l"), name: `Layer ${existing.length + 1}`, input: "camera", filters: [] };
}

export function emptyVisionProgram(cameraId: string): VisionProgram {
  return { id: "", name: "New Vision Program", description: "", cameraId, lastUpdatedUnixMs: 0, layers: [], tools: [] };
}

/** Reads an older/partial program defensively — the old zone format is dropped, not converted. */
export function normalizeVisionProgram(p: Partial<VisionProgram> & { id?: string }): VisionProgram {
  return {
    id: p.id ?? "",
    name: p.name ?? "",
    description: p.description ?? "",
    cameraId: p.cameraId ?? "",
    lastUpdatedUnixMs: p.lastUpdatedUnixMs ?? 0,
    layers: Array.isArray(p.layers) ? p.layers.map(l => ({ ...l, filters: Array.isArray(l.filters) ? l.filters : [] })) : [],
    tools: Array.isArray(p.tools)
      ? p.tools.filter(t => !!t && !!TOOL_META[t.type]).map(t => ({ ...t, params: t.params ?? {}, limits: t.limits ?? {} }))
      : [],
  };
}

// ── References and order ─────────────────────────────────────────────────────

/** Ids of the tools a tool reads: its fixture, its shared region and its geometry sources. */
export function toolRefs(tool: VisionTool): string[] {
  const refs: string[] = [];
  if (tool.fixtureId) refs.push(tool.fixtureId);
  if (tool.regionFrom) refs.push(tool.regionFrom);
  const src = tool.params.sources;
  if (Array.isArray(src)) for (const s of src) if (typeof s === "string" && s) refs.push(s);
  return refs;
}

/**
 * The tool whose region (and fixture) a tool uses: itself, or the end of its regionFrom chain.
 * A missing link or a loop stops at the last tool reached (orderProblems reports it).
 */
export function regionOwner(tool: VisionTool, tools: VisionTool[]): VisionTool {
  let cur = tool;
  const seen = new Set<string>([tool.id]);
  while (cur.regionFrom) {
    const next = tools.find(t => t.id === cur.regionFrom);
    if (!next || seen.has(next.id)) break;
    seen.add(next.id);
    cur = next;
  }
  return cur;
}

/** Can a tool whose region rule is `rule` use this region? */
export function regionFits(rule: RegionRule, r: Region | null | undefined): boolean {
  if (!r || rule === "none") return false;
  return rule === "any" || r.shape === rule;
}

/**
 * Tools a tool can share an area with: earlier tools that draw a region of a shape it accepts
 * (resolved through their own sharing).
 */
export function regionSources(tool: VisionTool, tools: VisionTool[]): VisionTool[] {
  const rule = TOOL_META[tool.type]?.region ?? "none";
  const i = tools.findIndex(t => t.id === tool.id);
  return tools.slice(0, Math.max(0, i)).filter(t =>
    TOOL_META[t.type]?.region !== "none" && regionFits(rule, regionOwner(t, tools).region));
}

/** How deep a tool sits in its fixture chain (0 = no fixture). */
export function fixtureDepth(tool: VisionTool, tools: VisionTool[]): number {
  let d = 0;
  let cur: VisionTool | undefined = tool;
  const seen = new Set<string>();
  while (cur?.fixtureId && !seen.has(cur.id)) {
    seen.add(cur.id);
    const next = tools.find(t => t.id === cur!.fixtureId);
    if (!next) break;
    d++;
    cur = next;
  }
  return d;
}

/** Every tool that depends on `id`, directly or through a chain of fixtures/sources. */
export function dependentsOf(id: string, tools: VisionTool[]): Set<string> {
  const out = new Set<string>();
  let grew = true;
  while (grew) {
    grew = false;
    for (const t of tools) {
      if (out.has(t.id) || t.id === id) continue;
      if (toolRefs(t).some(r => r === id || out.has(r))) { out.add(t.id); grew = true; }
    }
  }
  return out;
}

/**
 * Order problems: a reference to a tool that is not earlier in the list (or missing), and an input
 * layer that does not exist. Keyed by tool id.
 */
export function orderProblems(program: VisionProgram): Record<string, string> {
  const problems: Record<string, string> = {};
  const index = new Map(program.tools.map((t, i) => [t.id, i]));
  const layerIds = new Set(program.layers.map(l => l.id));
  program.tools.forEach((t, i) => {
    if (t.input !== "camera" && !layerIds.has(t.input)) { problems[t.id] = "Its image layer no longer exists"; return; }
    for (const r of toolRefs(t)) {
      const j = index.get(r);
      if (j === undefined) {
        problems[t.id] = r === t.fixtureId ? "Its fixture no longer exists"
          : r === t.regionFrom ? "The tool it shares an area with no longer exists" : "A source tool no longer exists";
        return;
      }
      if (j >= i) { problems[t.id] = `Must come after "${program.tools[j].name}"`; return; }
    }
  });
  return problems;
}

/** Layers a layer may read: the camera and layers before it. */
export function layerOrderProblems(layers: ImageLayer[]): Record<string, string> {
  const problems: Record<string, string> = {};
  layers.forEach((l, i) => {
    if (l.input === "camera") return;
    const j = layers.findIndex(x => x.id === l.input);
    if (j < 0) problems[l.id] = "Its input layer no longer exists";
    else if (j >= i) problems[l.id] = `Must come after "${layers[j].name}"`;
  });
  return problems;
}

// ── RunVision value choices ──────────────────────────────────────────────────

export type OutputChoice = { value: string; label: string; kind: ValueKind | ToolListOutput };

/** Every value a RunVision row can read from a tool. */
export function outputChoices(tool: VisionTool): OutputChoice[] {
  const meta = TOOL_META[tool.type];
  if (!meta) return [];
  const out: OutputChoice[] = [
    { value: "passed", label: "Passed", kind: "bool" },
    { value: "status", label: "Status (ok / fail / notRun / error)", kind: "string" },
  ];
  for (const k of meta.values) {
    if (k.key === "cellsPassed" && !(tool.grid && tool.grid.rows * tool.grid.cols > 1)) continue;
    out.push({ value: k.key, label: k.label, kind: k.kind });
  }
  for (const l of meta.lists) {
    if (l === "cells" && !(tool.grid && tool.grid.rows * tool.grid.cols > 1)) continue;
    out.push({
      value: l, kind: l,
      label: l === "cells" ? "Cells (row, col, index, value, passed)"
        : l === "items" ? "Items (list of found records)"
        : l === "points" ? "Points (list)"
        : l === "lines" ? "Lines (x1, y1, x2, y2)" : "Pose (x, y, angle — read $var[0].x)",
    });
  }
  return out;
}

/** Short label for a status. */
export const STATUS_LABEL: Record<ToolStatus, string> = { ok: "OK", fail: "Fail", notRun: "Not run", error: "Error" };
