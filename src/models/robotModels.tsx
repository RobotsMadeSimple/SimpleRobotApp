// ── Nano IO ───────────────────────────────────────────────────────────────────

export type PinType = 'Input' | 'Output' | 'Neopixel' | 'Unconfigured';

export type NanoPinState = {
  pin: number;
  type: PinType;
  value: boolean;
  name: string;
  nanoId: string;
  nanoName: string;
  pixelCount: number;
};

export type NanoState = {
  id: string;
  name: string;
  connected: boolean;
  pins: NanoPinState[];
};

export type NeoPixelColor = { r: number; g: number; b: number };

// ── Aux Axis ──────────────────────────────────────────────────────────────────

export type AuxAxisChannelState = {
  axisIndex: number;
  name: string;
  active: boolean;
  stepsPerRev: number;
  invertDirection: boolean;
  // "Rotary" | "Linear" | "" (empty = unconfigured, raw steps)
  axisType: string;
  gearRatio: number;
  mmPerRev: number;
};

export type AuxDeviceState = {
  connected: boolean;
  motorEnabled: boolean;
  deviceId: string;
  deviceName: string;
  portName: string | null;
  axes: AuxAxisChannelState[];
};

/** Steps per physical unit (mm for Linear, deg for Rotary). 0 when not configured. */
export function auxStepsPerUnit(axis: AuxAxisChannelState): number {
  if (!axis.axisType) return 0;
  if (axis.axisType === 'Linear')
    return axis.mmPerRev > 0 ? (axis.stepsPerRev * axis.gearRatio) / axis.mmPerRev : 0;
  return (axis.stepsPerRev * axis.gearRatio) / 360;
}

export function auxUnitLabel(axis: AuxAxisChannelState): string {
  if (axis.axisType === 'Linear') return 'mm';
  if (axis.axisType === 'Rotary') return 'Â°';
  return 'steps';
}

// ── USB Cameras ───────────────────────────────────────────────────────────────

export type CameraState = {
  id: string;
  name: string;
  connected: boolean;
  deviceIndex: number;
  width: number;
  height: number;
  targetFps: number;
  enabled: boolean;
  supportedResolutions: { width: number; height: number }[];
  /** Has a saved camera-to-robot calibration (docs/camera-calibration.md). Absent on older controllers. */
  calibrated?: boolean;
};

// ── Camera-to-robot calibration (docs/camera-calibration.md) ─────────────────

export type CalibrationRobotPoint = { x: number; y: number; z: number };

/** A dot found on the calibration sheet. `u, v` are normalized image coordinates (0–1). */
export type CalibrationDot = {
  index: number;
  i: number;
  j: number;
  u: number;
  v: number;
  areaPx: number;
};

/** A dot the robot tip was taught on, as the session reports it. */
export type CalibrationTaughtDot = {
  dotIndex: number;
  i: number;
  j: number;
  robot: CalibrationRobotPoint;
};

/** A taught dot as stored in the saved calibration. */
export type CalibrationStoredDot = {
  i: number;
  j: number;
  u: number;
  v: number;
  robot: CalibrationRobotPoint;
  /** Residual after the rigid fit, when the controller reports it per dot. */
  residualMm?: number;
};

export type Matrix3 = [[number, number, number], [number, number, number], [number, number, number]];

/** Persisted `cameraCalibrations/<cameraId>.json`. */
export type CameraCalibration = {
  cameraId: string;
  imageWidth: number;
  imageHeight: number;
  dotPitchMm: number;
  /** Pixel (px) → sheet mm homography. */
  pixelToSheet: Matrix3;
  /** Sheet mm → robot XY rigid transform. */
  sheetToRobot: { cos: number; sin: number; tx: number; ty: number };
  /** Composed pixel (px) → robot mm homography. */
  pixelToRobot: Matrix3;
  planeZ: number;
  taughtDots: CalibrationStoredDot[];
  gridRows: number;
  gridCols: number;
  dotCount: number;
  gridRmsPx: number;
  taughtRmsMm: number;
  taughtMaxMm: number;
  /** > 1 means the taught distances are longer than the pitch implies. */
  pitchScaleEstimate: number;
  /** The sheet→robot fit needed a reflection (grid axes assigned mirrored). */
  mirrored?: boolean;
  /** Tool that was active while teaching. */
  activeTool: string;
  calibratedUnixMs: number;
};

/** A detection pass: CalibrationStart / CalibrationRedetect. */
export type CalibrationSession = {
  sessionId: string;
  imageWidth: number;
  imageHeight: number;
  dots: CalibrationDot[];
  gridRows: number;
  gridCols: number;
  gridRmsPx: number;
  warnings: string[];
  /** Server-relative path of the annotated JPEG (`/calibration/{sessionId}/image`). */
  imageUrl: string;
  /** Taught dots kept across a re-detect, when the controller reports them. */
  taught?: CalibrationTaughtDot[];
};

export type CalibrationDetectOptions = {
  minDotAreaPx?: number;
  maxDotAreaPx?: number;
  /** Dark dots on white (default true) or white on dark. */
  darkDots?: boolean;
};

/** CalibrationSolve result. */
export type CalibrationSolveResult = {
  calibration: CameraCalibration;
  taughtRmsMm: number;
  taughtMaxMm: number;
  pitchScaleEstimate: number;
  warnings: string[];
};

/** RunVision output coordinate frame. Absent = the controller's default (today's behaviour). */
export type VisionOutputFrame = "pixel" | "normalized" | "robot";

// ── USB Relay ─────────────────────────────────────────────────────────────────

export type UsbRelayState = {
  connected: boolean;
  serial: string | null;
  relays: boolean[] | null;  // index 0 = relay 1, length 4
  names: string[];           // display names, index 0 = relay 1
};

// ── Vision ────────────────────────────────────────────────────────────────────

export type VisionZoneShape = 'Rectangle' | 'Circle' | 'Polygon';

export type VisionZoneGeometry = {
  shape: VisionZoneShape;
  // Rectangle
  x: number; y: number; width: number; height: number;
  /**
   * Rectangle tilt in degrees, clockwise, about the rectangle's own centre.
   *
   * Optional rather than required because zones saved before rotation existed carry no such
   * field, and absent has to read as 0 — declaring it required would have TypeScript promise
   * a number that older programs do not actually have. Circles and polygons ignore it.
   * Applied in pixel space; see the note on the controller's VisionZoneGeometry.
   */
  rotation?: number;
  // Circle
  cx: number; cy: number; radius: number;
  // Polygon
  points: [number, number][];
};

export type BlobDetectionParams = {
  minArea: number;
  maxArea: number;
  filterByCircularity: boolean;
  minCircularity: number;
  filterByConvexity: boolean;
  minConvexity: number;
  filterByInertia: boolean;
  minInertiaRatio: number;
  minThreshold: number;
  maxThreshold: number;
  filterByColor: boolean;
  blobColor: number; // 0=dark, 255=light
};

/**
 * Splits a zone into a rows×cols lattice over its bounding box, so an inspection pointing
 * at the zone is measured once per cell instead of once overall. Cells are clipped to the
 * zone shape. Absent, or 1×1, means no grid.
 *
 * Only color coverage inspections read this today; the other inspection types ignore it.
 */
export type VisionZoneGrid = {
  rows: number;
  cols: number;
};

export type VisionZone = {
  id: string;
  name: string;
  geometry: VisionZoneGeometry;
  grid?: VisionZoneGrid;
};

export type BlobInspection = {
  id: string;
  name: string;
  enabled: boolean;
  zoneId: string | null;
  blobParams: BlobDetectionParams;
};

export type PolygonInspection = {
  id: string;
  name: string;
  enabled: boolean;
  zoneId: string | null;
  sides: number;
  minArea: number;
  maxArea: number;
  /** ApproxPolyDP accuracy factor — fraction of perimeter (0.01–0.1) */
  epsilon: number;
  minThreshold: number;
  maxThreshold: number;
  invertThreshold?: boolean;
};

export type PolygonResult = {
  inspectionId: string;
  name: string;
  count: number;
  found: boolean;
  /** Orientation angle in degrees from MinAreaRect of the largest matching polygon */
  angle: number;
  /** Normalized centroid X (0–1) of the largest matching polygon */
  centerX: number;
  /** Normalized centroid Y (0–1) of the largest matching polygon */
  centerY: number;
};

export type VisionProgram = {
  id: string;
  name: string;
  description: string;
  cameraId: string;
  zones: VisionZone[];
  inspections: BlobInspection[];
  colorInspections?: ColorCoverageInspection[];
  polygonInspections?: PolygonInspection[];
  arucoInspections?: ArucoInspection[];
  lineInspections?: LineInspection[];
  barcodeInspections?: BarcodeInspection[];
  /**
   * Display order of inspections, as a flat list of inspection ids across all the typed
   * lists above. Lets the user drag inspections into any order regardless of type. Ids
   * missing from this list (e.g. a freshly added inspection) fall to the end in their
   * type-grouped order; an empty/absent list means "keep the default type grouping".
   */
  inspectionOrder?: string[];
  lastUpdatedUnixMs: number;
};

export type BlobResult       = { x: number; y: number; size: number };
export type InspectionResult = { inspectionId: string; name: string; blobs: BlobResult[] };
export type VisionResult     = { programId: string; timestampMs: number; inspections: InspectionResult[]; colorResults?: ColorCoverageResult[]; polygonResults?: PolygonResult[]; arucoResults?: ArucoResult[]; lineResults?: LineResult[]; barcodeResults?: BarcodeResult[]; timings?: Record<string, number> };

export type ArucoResult = {
  inspectionId: string;
  name: string;
  count: number;
  found: boolean;
  markers: { markerId: number; centerX: number; centerY: number }[];
};

export function defaultBlobParams(): BlobDetectionParams {
  return {
    minArea: 100, maxArea: 10000,
    filterByCircularity: false, minCircularity: 0.5,
    filterByConvexity:   false, minConvexity:   0.8,
    filterByInertia:     false, minInertiaRatio: 0.1,
    minThreshold: 10,   maxThreshold: 200,
    filterByColor: false, blobColor: 0,
  };
}

export function defaultGeometry(shape: VisionZoneShape): VisionZoneGeometry {
  return {
    shape,
    x: 0.1, y: 0.1, width: 0.8, height: 0.8, rotation: 0,
    cx: 0.5, cy: 0.5, radius: 0.3,
    points: [[0.1, 0.1], [0.9, 0.1], [0.9, 0.9], [0.1, 0.9]],
  };
}

// ── Program builder ───────────────────────────────────────────────────────────

export type StepType = 'MoveL' | 'MoveJ' | 'JumpL' | 'JumpJ' | 'SetOutput' | 'Wait' | 'Loop' | 'StatusUpdate' | 'CallRoutine' | 'SetSpeedL' | 'SetSpeedJ' | 'SetVariable' | 'PauseProgram' | 'Label' | 'GoToLabel' | 'IfCondition' | 'SetTool' | 'RunHoming' | 'AuxMove' | 'AuxContinuous' | 'AuxStop' | 'AuxEnable' | 'RunVision' | 'SetLocal' | 'ClearLocal' | 'StartBackground' | 'StopBackground' | 'WaitForBackground' | 'StopwatchControl' | 'SaveImage' | 'ThreadMove' | 'CncProgram' | 'SetBlendRadius' | 'HttpRequest' | 'CaptureImage' | 'HttpReceive' | 'Unknown';

/**
 * One outbound JSON field. A row is exactly one of three things: a list variable sent as a
 * JSON array, an image variable sent as a base64 string, or an expression evaluated to a
 * number. `listVar` wins over `imageVar`, which wins over `expr` — matching the controller.
 */
export type JsonKeyValue       = { key: string; expr: string; imageVar?: string; listVar?: string };
/** A response key mapped onto a variable. A list variable here is rewritten from a JSON array. */
export type JsonInboundMapping = { key: string; variableName: string };
export type JsonImageMapping   = { key: string; variableName: string };

export const THREAD_PRESETS: { label: string; pitch: number; group: 'metric' | 'imperial' }[] = [
  // Metric coarse
  { label: 'M2x0.4',    pitch: 0.400, group: 'metric' },
  { label: 'M2.5x0.45', pitch: 0.450, group: 'metric' },
  { label: 'M3x0.5',    pitch: 0.500, group: 'metric' },
  { label: 'M3.5x0.6',  pitch: 0.600, group: 'metric' },
  { label: 'M4x0.7',    pitch: 0.700, group: 'metric' },
  { label: 'M5x0.8',    pitch: 0.800, group: 'metric' },
  { label: 'M6x1.0',    pitch: 1.000, group: 'metric' },
  { label: 'M8x1.25',   pitch: 1.250, group: 'metric' },
  { label: 'M10x1.5',   pitch: 1.500, group: 'metric' },
  { label: 'M12x1.75',  pitch: 1.750, group: 'metric' },
  { label: 'M14x2.0',   pitch: 2.000, group: 'metric' },
  { label: 'M16x2.0',   pitch: 2.000, group: 'metric' },
  { label: 'M20x2.5',   pitch: 2.500, group: 'metric' },
  { label: 'M24x3.0',   pitch: 3.000, group: 'metric' },
  // Imperial UNC
  { label: '#4-40',        pitch: 0.635, group: 'imperial' },
  { label: '#6-32',        pitch: 0.794, group: 'imperial' },
  { label: '#8-32',        pitch: 0.794, group: 'imperial' },
  { label: '#10-24',       pitch: 1.058, group: 'imperial' },
  { label: '1/4"-20',      pitch: 1.270, group: 'imperial' },
  { label: '5/16"-18',     pitch: 1.411, group: 'imperial' },
  { label: '3/8"-16',      pitch: 1.588, group: 'imperial' },
  { label: '7/16"-14',     pitch: 1.814, group: 'imperial' },
  { label: '1/2"-13',      pitch: 1.954, group: 'imperial' },
  { label: '5/8"-11',      pitch: 2.309, group: 'imperial' },
  { label: '3/4"-10',      pitch: 2.540, group: 'imperial' },
  { label: '1"-8',         pitch: 3.175, group: 'imperial' },
];

export type Vector6Val = { x: number; y: number; z: number; rx: number; ry: number; rz: number };

export type VisionStepOutput = {
  inspectionId: string;
  countVar?: string;
  pointsVar?: string;
  detectedVar?: string;
};

export type ColorEntry = {
  id: string;
  r: number;
  g: number;
  b: number;
  /** 0–100: per-channel ± tolerance * 2.55 in RGB space */
  tolerance: number;
};

export type ColorCoverageInspection = {
  id: string;
  name: string;
  enabled: boolean;
  zoneId: string | null;
  colors: ColorEntry[];
  /** Minimum pixel coverage % required to pass. null = no minimum. */
  minCoverage: number | null;
  /** Maximum pixel coverage % allowed to pass. null = no maximum. */
  maxCoverage: number | null;
};

/** One cell of a gridded color coverage inspection, measured on its own. */
export type ColorCellResult = {
  row: number;
  col: number;
  /** Row-major position in the grid: row * cols + col. */
  index: number;
  coverage: number;
  passed: boolean;
};

export type ColorCoverageResult = {
  inspectionId: string;
  name: string;
  /** Coverage over the whole zone, gridded or not. */
  coverage: number;
  /** Whole-zone min/max test — except on a gridded zone, where it means every cell passed. */
  passed: boolean;
  /** One entry per cell, row-major. Absent when the zone has no grid. */
  cells?: ColorCellResult[];
  /** How many cells passed. Absent when the zone has no grid. */
  cellsPassed?: number;
};

export type ColorVisionStepOutput = {
  inspectionId: string;
  coverageVar?: string;
  passedVar?: string;
  /**
   * Object-list variable filled with one record per grid cell — fields row, col, index,
   * coverage, passed. Only meaningful when the inspection's zone has a grid.
   */
  cellsVar?: string;
  /** Scalar variable filled with the number of cells that passed. */
  cellsPassedVar?: string;
};

export type PolygonVisionStepOutput = {
  inspectionId: string;
  countVar?: string;
  foundVar?: string;
  angleVar?: string;
  centerXVar?: string;
  centerYVar?: string;
};

export type ArucoInspection = {
  id: string;
  name: string;
  enabled: boolean;
  zoneId: string | null;
  /** OpenCV predefined dictionary ID (1 = 4x4_100 default) */
  dictionaryId: number;
  minMarkerArea: number;
  maxMarkerArea: number;
};

export type LineInspection = {
  id: string;
  name: string;
  enabled: boolean;
  zoneId: string | null;
  cannyThreshold1: number;
  cannyThreshold2: number;
  houghThreshold: number;
  minLineLength: number;
  maxLineGap: number;
  filterByAngle: boolean;
  minAngle: number;
  maxAngle: number;
};

export type LineSegment = {
  /** Normalized (0–1) start X */
  x1: number;
  /** Normalized (0–1) start Y */
  y1: number;
  /** Normalized (0–1) end X */
  x2: number;
  /** Normalized (0–1) end Y */
  y2: number;
  /** Undirected angle in degrees (0–180): 0=horizontal, 90=vertical */
  angle: number;
  /** Pixel length of the detected segment */
  length: number;
};

export type LineResult = {
  inspectionId: string;
  name: string;
  count: number;
  found: boolean;
  lines: LineSegment[];
};

export type LineVisionStepOutput = {
  inspectionId: string;
  countVar?: string;
  foundVar?: string;
  firstAngleVar?: string;
  firstX1Var?: string;
  firstY1Var?: string;
  firstX2Var?: string;
  firstY2Var?: string;
};

export type ArucoVisionStepOutput = {
  inspectionId: string;
  countVar?: string;
  foundVar?: string;
  firstIdVar?: string;
  firstCenterXVar?: string;
  firstCenterYVar?: string;
};

export const BARCODE_FORMATS: { id: string; label: string }[] = [
  { id: 'QR_CODE',     label: 'QR Code'    },
  { id: 'DATA_MATRIX', label: 'Data Matrix' },
  { id: 'AZTEC',       label: 'Aztec'       },
  { id: 'PDF_417',     label: 'PDF 417'     },
  { id: 'CODE_128',    label: 'Code 128'    },
  { id: 'CODE_39',     label: 'Code 39'     },
  { id: 'EAN_13',      label: 'EAN-13'      },
  { id: 'EAN_8',       label: 'EAN-8'       },
  { id: 'UPC_A',       label: 'UPC-A'       },
  { id: 'UPC_E',       label: 'UPC-E'       },
];

export type BarcodeInspection = {
  id: string;
  name: string;
  enabled: boolean;
  zoneId: string | null;
  /** ZXing BarcodeFormat names to scan for; empty = all formats */
  formats: string[];
};

export type BarcodeCodeResult = {
  value: string;
  format: string;
  centerX: number;
  centerY: number;
};

export type BarcodeResult = {
  inspectionId: string;
  name: string;
  count: number;
  found: boolean;
  codes: BarcodeCodeResult[];
};

export type BarcodeVisionStepOutput = {
  inspectionId: string;
  countVar?: string;
  foundVar?: string;
  firstValueVar?: string;
  firstFormatVar?: string;
};

export function defaultBarcodeInspection(index: number): BarcodeInspection {
  return {
    id: `barcode_${Date.now()}`,
    name: `Barcode ${index + 1}`,
    enabled: true,
    zoneId: null,
    formats: [],
  };
}

export function defaultColorEntry(): ColorEntry {
  return { id: `ce_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`, r: 128, g: 128, b: 128, tolerance: 20 };
}

export function defaultColorCoverageInspection(index: number): ColorCoverageInspection {
  return {
    id: `cinsp_${Date.now()}`,
    name: `Color ${index + 1}`,
    enabled: true,
    zoneId: null,
    colors: [],
    minCoverage: 50,
    maxCoverage: null,
  };
}

export const ARUCO_DICTIONARIES: { id: number; label: string }[] = [
  { id: -1, label: 'Auto Detect (All)' },
  { id: 0,  label: '4x4  (50 IDs)'   },
  { id: 1,  label: '4x4  (100 IDs)'  },
  { id: 2,  label: '4x4  (250 IDs)'  },
  { id: 3,  label: '4x4  (1000 IDs)' },
  { id: 4,  label: '5x5  (50 IDs)'   },
  { id: 5,  label: '5x5  (100 IDs)'  },
  { id: 6,  label: '5x5  (250 IDs)'  },
  { id: 7,  label: '5x5  (1000 IDs)' },
  { id: 8,  label: '6x6  (50 IDs)'   },
  { id: 9,  label: '6x6  (100 IDs)'  },
  { id: 10, label: '6x6  (250 IDs)'  },
  { id: 11, label: '6x6  (1000 IDs)' },
  { id: 12, label: '7x7  (50 IDs)'   },
  { id: 13, label: '7x7  (100 IDs)'  },
  { id: 14, label: '7x7  (250 IDs)'  },
  { id: 15, label: '7x7  (1000 IDs)' },
  { id: 16, label: 'ArUco Original'  },
];

export function defaultArucoInspection(index: number): ArucoInspection {
  return {
    id: `arucoinsp_${Date.now()}`,
    name: `ArUco ${index + 1}`,
    enabled: true,
    zoneId: null,
    dictionaryId: -1,
    minMarkerArea: 100,
    maxMarkerArea: 100000,
  };
}

export function defaultLineInspection(index: number): LineInspection {
  return {
    id: `lineinsp_${Date.now()}`,
    name: `Line ${index + 1}`,
    enabled: true,
    zoneId: null,
    cannyThreshold1: 50,
    cannyThreshold2: 150,
    houghThreshold: 50,
    minLineLength: 30,
    maxLineGap: 10,
    filterByAngle: false,
    minAngle: 0,
    maxAngle: 180,
  };
}

export function defaultPolygonInspection(index: number): PolygonInspection {
  return {
    id: `polyinsp_${Date.now()}`,
    name: `Polygon ${index + 1}`,
    enabled: true,
    zoneId: null,
    sides: 4,
    minArea: 1000,
    maxArea: 100000,
    epsilon: 0.04,
    minThreshold: 50,
    maxThreshold: 200,
    invertThreshold: false,
  };
}

export type ConditionOp = '==' | '!=' | '>' | '>=' | '<' | '<=' | 'contains' | 'startsWith' | 'endsWith';

export type ConditionItem = {
  id: string;
  left: string;
  operator: ConditionOp;
  right: string;
};

export type ConditionGroup = {
  combinator: 'ALL' | 'ANY';
  items: ConditionItem[];
};

export type ElseIfBranch = {
  id: string;
  condition: ConditionGroup;
  steps: ProgramStep[];
};

/**
 * One record in an object-list variable: named numeric fields. Numbers only — booleans are
 * 0/1 — because expressions evaluate to numbers, so a string field would have nothing to
 * evaluate to.
 */
export type ObjectRecord = Record<string, number>;

/**
 * What one element of a list variable is shaped like.
 *
 * All of them are stored as ObjectRecord — a Number or Boolean under the reserved `value`
 * key, a Point under x/y/z/rx/ry/rz — because a record is already a bag of named numbers
 * and the rest are special cases of it. The element type is still needed because the
 * *syntax* and the rendering differ: only Number and Boolean lists answer a bare `$v[0]`,
 * only a Point list has a defined axis order for positional `$v[0][2]`, and only a Boolean
 * list reads back as True/False rather than 1/0.
 *
 * Mirrors ListElementType in the controller's Models.cs, and goes over the wire as this
 * string. Neither side is covered by the golden-JSON drift guard, which is program steps
 * only, so the two definitions have to be kept in step by hand.
 */
export type ListElementType = 'Number' | 'Boolean' | 'Point' | 'Record';

/** The key a Number- or Boolean-element list stores its scalar under. Mirrors ObjectRecord.ScalarKey. */
export const LIST_SCALAR_KEY = 'value';

/** Axis order for positional access on a Point list — `$pts[0][2]` is z. */
export const POINT_AXES = ['x', 'y', 'z', 'rx', 'ry', 'rz'] as const;

/**
 * Element types whose element *is* the value, so `$v[0]` resolves without an accessor
 * and the variable editor can offer a row per element. Mirrors ListVar.HasScalarElements.
 */
export const hasScalarElements = (t: ListElementType): boolean =>
  t === 'Number' || t === 'Boolean';

export const numberItem = (v: number): ObjectRecord => ({ [LIST_SCALAR_KEY]: v });

/** A boolean element is stored as the 0/1 a record can hold, same as the controller. */
export const booleanItem = (v: boolean): ObjectRecord => ({ [LIST_SCALAR_KEY]: v ? 1 : 0 });

export const pointItem = (p: Vector6Val): ObjectRecord => ({
  x: p.x, y: p.y, z: p.z, rx: p.rx, ry: p.ry, rz: p.rz,
});

export const itemScalar = (r: ObjectRecord): number => r[LIST_SCALAR_KEY] ?? 0;

export const itemBool = (r: ObjectRecord): boolean => itemScalar(r) !== 0;

export const itemPoint = (r: ObjectRecord): Vector6Val => ({
  x: r.x ?? 0, y: r.y ?? 0, z: r.z ?? 0, rx: r.rx ?? 0, ry: r.ry ?? 0, rz: r.rz ?? 0,
});

export type ProgramVariable = {
  id: string;
  name: string;
  value: number;
  /**
   * An expression evaluated at program start to produce the initial value, used instead
   * of `value` when set. Number and Boolean scalars only — a boolean takes the usual
   * non-zero-is-true reading, so `$count > 5` works.
   *
   * `value` is still written alongside it, holding the last result the editor could
   * compute, so a controller that does not understand this field — or an expression that
   * fails at runtime — falls back to a sensible number rather than 0.
   */
  valueExpression?: string;
  /**
   * When set, this is a list variable. Every element is a record of named numbers: a
   * Number or Boolean element keeps its scalar under `value` (a boolean as 0/1), a Point
   * element under x/y/z/rx/ry/rz. `elementType` says which. Read it through
   * `variableList()` rather than directly, so the legacy fields below are folded in too.
   */
  items?: ObjectRecord[];
  /** Shape of each element in `items`. Absent reads as 'Record'. */
  elementType?: ListElementType;

  // ── Legacy list fields ──────────────────────────────────────────────────────
  // Read-only. Kept so programs saved before the list types were unified still load;
  // nothing writes them any more, and a program re-saved by a current build carries
  // `items` instead.

  /** @deprecated Superseded by `items` with elementType 'Number'. */
  values?: number[];
  /** @deprecated Superseded by `items` with elementType 'Point'. */
  points?: Vector6Val[];
  /** @deprecated Superseded by `items` with elementType 'Record'. */
  objects?: ObjectRecord[];

  description?: string;
  /** When true, this variable is displayed as True/False (stored as 1/0). */
  isBoolean?: boolean;
  /** When true, this scalar variable is shared across all concurrently running programs (global variable store). */
  isGlobal?: boolean;
  /** When true, the current runtime value is shown on the monitor page while the program runs. */
  displayOnMonitor?: boolean;
  /** When true, this variable is a stopwatch — its value holds elapsed milliseconds, updated every tick at runtime. */
  isStopwatch?: boolean;
  /** When true, the runtime value is saved to disk when the program finishes and restored on the next run. */
  isPersistent?: boolean;
  /** When true, this variable holds a string value (stored in stringValue). */
  isString?: boolean;
  /** String variable initial/default value — only meaningful when isString is true. */
  stringValue?: string;
  /**
   * When true, this variable stores encoded image bytes as a base64 string. CaptureImage
   * writes a camera JPEG; an HttpRequest inbound mapping writes whatever the server sent,
   * which is often a PNG. Use `imageDataUri` rather than assuming a format.
   */
  isImage?: boolean;
  /**
   * When true, this is a computed variable (a user-defined property): `valueExpression`
   * is a formula re-evaluated every time the variable is read, against the live
   * variables, IO and properties. It has no stored value and cannot be assigned.
   * Only `isBoolean`, `isGlobal` and `displayOnMonitor` combine with it; `value`,
   * `items`, `isPersistent`, `isString`, `isImage` and `isStopwatch` do not.
   * See docs/expressions-and-variables.md section 7 in the controller.
   */
  isComputed?: boolean;
};

/** True for a computed variable — readable in expressions, never a write target. */
export const isComputedVariable = (v: ProgramVariable): boolean => v.isComputed === true;

/** Can be a write target (Set Variable, loop index/value, vision/HTTP outputs). */
export const isAssignableVariable = (v: ProgramVariable): boolean => !isComputedVariable(v);

/**
 * A variable's list elements, folding in the legacy `values` / `points` / `objects` fields
 * so programs saved before the list types were unified still read. Returns null when the
 * variable is not a list at all.
 *
 * `items` is consulted first, so a program carrying both — written by a current build,
 * then edited by an older one — resolves to the current field rather than silently
 * reverting. Mirrors ProgramVariable.ToListVar() in the controller.
 */
export function variableList(
  v: ProgramVariable,
): { elementType: ListElementType; items: ObjectRecord[] } | null {
  if (v.items)  return { elementType: v.elementType ?? 'Record', items: v.items };
  if (v.points) return { elementType: 'Point',  items: v.points.map(pointItem) };
  if (v.objects) return { elementType: 'Record', items: v.objects };
  // An empty legacy number list was indistinguishable from a scalar and was treated as
  // one. Preserved deliberately: changing it would turn some saved scalars into lists.
  if (v.values && v.values.length > 0)
    return { elementType: 'Number', items: v.values.map(numberItem) };
  return null;
}

/** True when the variable is a list of any element type. */
export const isListVariable = (v: ProgramVariable): boolean => variableList(v) !== null;

/** A list of poses — the only kind usable as a move target or a RunVision points output. */
export const isPointListVariable = (v: ProgramVariable): boolean =>
  variableList(v)?.elementType === 'Point';

/** A list of open-ended records — what a gridded vision zone fills. */
export const isRecordListVariable = (v: ProgramVariable): boolean =>
  variableList(v)?.elementType === 'Record';

/**
 * A list whose elements are values rather than structures — Number or Boolean. These are
 * the ones authored by hand and the only ones a forEach can hand to a value variable.
 */
export const isScalarListVariable = (v: ProgramVariable): boolean => {
  const list = variableList(v);
  return list != null && hasScalarElements(list.elementType);
};

export type ProgramVariableSnapshot = {
  name: string;
  value: number;
  isBoolean: boolean;
};

/**
 * One display image variable, as reported alongside the variable snapshot.
 *
 * The bytes are not here — the controller sends name and revision only, and the image is
 * fetched with getProgramVariableImage when the revision changes. The variable poll runs
 * several times a second and a base64 camera frame is a few hundred kilobytes, so
 * inlining one would mean re-sending a picture that had not changed, over and over.
 *
 * Revision 0 means the variable is declared but nothing has been written to it yet.
 * Compare revisions for inequality rather than for increase: a program restarted in a
 * fresh executor begins counting again, so the number can legitimately go down.
 */
export type ProgramImageSnapshot = {
  name: string;
  revision: number;
};

/**
 * A base64 image as a data URI, with the mime read off the first bytes.
 *
 * Image variables do not record their format — CaptureImage puts a camera JPEG in one and
 * an HttpRequest inbound mapping puts whatever the server sent, so the same variable can
 * hold either. Base64 encodes three bytes to four characters from the start, which makes
 * the leading characters a stable signature: a PNG always begins `iVBORw0K` and a JPEG
 * always begins `/9j/`.
 *
 * Returns null for empty input, so a caller can tell "nothing written yet" from an image.
 */
export function imageDataUri(base64: string | undefined | null): string | null {
  if (!base64) return null;
  const mime = base64.startsWith('iVBORw0K') ? 'image/png'
             : base64.startsWith('R0lGOD')   ? 'image/gif'
             : base64.startsWith('UklGR')    ? 'image/webp'
             // JPEG last as the default: it is what CaptureImage writes, and it is what
             // every call site assumed before there was anything else to hold.
             : 'image/jpeg';
  return `data:${mime};base64,${base64}`;
}

export type ProgramStep = {
  id: string;
  type: StepType;
  name?: string;
  /**
   * `false` = the executor skips this step (still counted for progress, logged as
   * "[Skipped — disabled] …"). Absent or `true` runs it, so the editor only ever
   * writes `false` and clears the field otherwise.
   */
  enabled?: boolean;
  /** Free text shown under the step in the editor. Never executed. */
  comment?: string;
  pointName?: string;
  speed?: number;
  accel?: number;
  decel?: number;
  // Move blending — when blend is on the move rounds its corner into the next move
  // instead of stopping. blendRadius optionally overrides the program's current default
  // blend radius (set by a SetBlendRadius step). Also holds the value for SetBlendRadius.
  blend?: boolean;
  blendRadius?: number;
  // Position offset added directly to the target point (mm / deg)
  offsetX?: number;
  offsetY?: number;
  offsetZ?: number;
  offsetRX?: number;
  offsetRY?: number;
  offsetRZ?: number;
  // Local tool offset applied at execution time (mm / deg)
  toolOffsetX?: number;
  toolOffsetY?: number;
  toolOffsetZ?: number;
  toolOffsetRX?: number;
  toolOffsetRY?: number;
  toolOffsetRZ?: number;
  // Per-axis absolute overrides — replace the calculated axis value (base + offset) (mm / deg)
  overrideX?: number;
  overrideY?: number;
  overrideZ?: number;
  overrideRX?: number;
  overrideRY?: number;
  overrideRZ?: number;
  outputNumber?: number;
  outputValue?: boolean;
  outputCard?: string;     // "stb" | "relay" | "nano"
  outputNanoId?: string;   // only for nano
  pulseMs?: number;        // >0 = pulse; set to outputValue for pulseMs then flip
  pulseBlocking?: boolean; // when true, block program execution until pulse completes
  waitMs?: number;
  loopCount?: number;
  loopSteps?: ProgramStep[];
  statusMessage?: string;
  statusWarning?: string;
  statusError?: string;
  statusSeverity?: 'Info' | 'Warning' | 'Error';
  routineName?: string;
  routineId?: string;
  // SetVariable
  variableName?: string;
  variableExpr?: string;
  // Variable expressions — keyed by camelCase field name, override literal numeric values at execution time
  expressions?: Record<string, string>;
  gridPoint?: GridPoint;
  stackPoint?: StackPoint;
  // Label / GoToLabel
  labelId?: string;
  labelName?: string;
  // IfCondition
  condition?: ConditionGroup;
  ifSteps?: ProgramStep[];
  elseIfBranches?: ElseIfBranch[];
  elseSteps?: ProgramStep[];
  // SetTool
  toolName?: string;
  // SetLocal / ClearLocal — also used as per-step local override on move steps
  localName?: string;
  // JumpL / JumpJ
  jumpZ?: number;
  jumpZStart?: number;
  jumpZEnd?: number;
  // RunVision
  visionProgramId?: string;
  visionProgramName?: string;
  visionZoneId?: string;
  visionZoneVar?: string;
  visionOutputs?: VisionStepOutput[];
  /** Coordinate frame point outputs are written in ("robot" needs a calibrated camera). */
  outputFrame?: VisionOutputFrame;
  colorOutputs?: ColorVisionStepOutput[];
  polygonOutputs?: PolygonVisionStepOutput[];
  arucoOutputs?: ArucoVisionStepOutput[];
  /**
   * Superseded by pointNameExpr, which expresses the same thing as "$name[index]".
   * Still read so programs saved before the merge keep running; the builder rewrites
   * them to pointNameExpr on save and no longer writes these.
   */
  varPointName?: string;
  varPointIndex?: string;
  /**
   * Variable point target for move steps (overrides pointName when set). Resolved two
   * ways: an expression that is only an indexed points variable ("$pts[$i]") yields
   * those coordinates directly, anything else is interpolated to text naming a saved
   * point ("$target", "{$binPrefix}{$index}"). Either way it is re-resolved on every
   * execution, so assigning the variables it references retargets the move.
   */
  pointNameExpr?: string;
  // StartBackground / StopBackground / WaitForBackground
  backgroundProgramName?: string;
  backgroundProgramId?: string;
  // StopwatchControl
  stopwatchAction?: 'Start' | 'Stop' | 'Reset';
  stopwatchVariableName?: string;
  // SaveImage
  saveImagePath?: string;
  saveImageCameraId?: string;
  // Wait condition mode
  waitMode?: 'duration' | 'condition';
  waitCondition?: ConditionGroup;
  waitTimeoutMs?: number;
  waitTimeoutVariableName?: string;
  // Loop forEach / while mode
  loopMode?: 'count' | 'forEach' | 'while';
  forEachVariableName?: string;
  forEachValueVariableName?: string;
  forEachIndexVariableName?: string;
  loopWhileCondition?: ConditionGroup;
  // AuxMove / AuxContinuous / AuxStop
  auxDeviceId?: string;
  auxAxisIndex?: number;
  auxSteps?: number;        // signed — negative = reverse direction (raw steps)
  auxDistance?: number;     // physical distance: mm (Linear) or degrees (Rotary)
  auxUnit?: string;         // "mm" | "deg" — when set, auxDistance + physical velocity used
  auxVelocity?: number;     // steps/sec OR physical unit/sec when auxUnit set
  auxAccel?: number;        // steps/secÂ² OR physical unit/secÂ² when auxUnit set
  auxDecel?: number;        // steps/secÂ² (AuxMove + AuxStop ramp-down)
  auxWaitForDone?: boolean; // AuxMove: block until complete (default true)
  auxImmediate?: boolean;   // AuxStop: hard stop when true
  auxAbsolute?: boolean;    // AuxMove: true = move to absolute position, false/undefined = relative offset
  auxEnable?: boolean;      // AuxEnable: true = enable motors, false = disable
  // ThreadMove
  threadDistance?: number;
  threadPitch?: number;
  threadPeck?: boolean;
  threadPeckDepth?: number;
  threadReverseOut?: boolean;
  // CncProgram — cncSpec is the current format (steps generated at runtime by
  // the controller); cncProgramSteps holds baked steps from older versions.
  cncDxfFile?: string;
  cncSafeZ?: number;
  cncProgramSteps?: ProgramStep[];
  cncSpec?: CncSpec;
  // HttpRequest
  jsonUrl?: string;
  jsonWaitForResponse?: boolean;
  jsonTimeoutMs?: number;
  jsonOutbound?: JsonKeyValue[];
  jsonInbound?: JsonInboundMapping[];
  jsonImageOutbound?: JsonImageMapping[];
  // CaptureImage
  captureImageVariableName?: string;
  captureImageCameraId?: string;
  // HttpReceive
  httpReceiveName?: string;
  httpReceiveTimeoutMs?: number;
  httpReceiveInbound?: JsonInboundMapping[];
  // Unknown — preserved original type name for display and recovery
  unknownStepType?: string;
};

/** Hole position for CNC threading (robot coordinates, mm). */
export type CncHole = { x: number; y: number };

/**
 * CNC toolpath specification saved on a CncProgram step. Holes are threaded
 * and contours followed from the same block; the controller expands this into
 * steps at runtime so large toolpaths don't bloat the stored program. The
 * selection indexes and placement settings restore the CNC builder UI.
 */
export type CncSpec = {
  file?: string;
  safeZ: number;
  // Holes — drilled or threaded, per holeOp
  holes?: CncHole[];
  holeIndexes?: number[];
  /** "thread" (default) taps each hole with the pitch below; "drill" plunges straight down. */
  holeOp?: "drill" | "thread";
  holeDepth?: number;
  threadPitch?: number;
  holePeck?: boolean;
  holePeckDepth?: number;
  threadReverseOut?: boolean;
  // Contours — baked robot-space polylines ([x0,y0,x1,y1,…] per contour)
  paths?: number[][];
  contourIndexes?: number[];
  scale?: number;
  offsetX?: number;
  offsetY?: number;
  flipY?: boolean;
  activeZ?: number;
  activeSpeed?: number;
  activeAccel?: number;
  activeDecel?: number;
  /** Dynamics for safe-Z travel between contours and the retract; plunge uses active dynamics. */
  travelSpeed?: number;
  travelAccel?: number;
  travelDecel?: number;
  blendRadius?: number;
  detail?: number;
  /** Max endpoint gap (mm) for chaining touching segments into one pass. */
  joinTolerance?: number;
  /** Tool-radius compensation applied when the paths were baked (app-side). */
  offsetMode?: "none" | "outside" | "inside";
  offsetDistance?: number;
  /**
   * "absolute" (default): baked coordinates used as-is. "current": the robot's
   * position when the block starts becomes the origin — all X/Y/Z relative.
   */
  originMode?: "absolute" | "current";
  /** Base-contour indexes run in reverse direction (baked into paths). */
  contourReversed?: number[];
  /** Preferred start point per base-contour index (closed loops; baked into paths). */
  contourStarts?: Record<string, CncHole>;
  /**
   * $variable expressions for motion fields, keyed by spec field name (safeZ,
   * activeZ, activeSpeed, activeAccel, activeDecel, travelSpeed, travelAccel,
   * travelDecel, blendRadius, threadDepth, threadPitch). Evaluated on the
   * robot at run time.
   */
  expressions?: Record<string, string>;
};

export type BuiltProgram = {
  id?: string;
  name: string;
  description: string;
  steps: ProgramStep[];
  variables?: ProgramVariable[];
  lastUpdatedUnixMs: number;
  isRoutine?: boolean;
  isBackground?: boolean;
  /** When true, all running background programs are stopped when this program finishes. */
  killBackgroundOnStop?: boolean;
};

// ── Program-editor services (docs/expressions-and-variables.md) ──────────────

export type ValidationSeverity = "error" | "warning";

/** Codes the controller documents today. Others may appear later, so `code` stays a string. */
export type KnownValidationCode =
  | "unknownPoint" | "unknownTool" | "unknownLocal" | "unknownRoutine" | "unknownVisionProgram"
  | "unknownGrid" | "unknownStack" | "unknownLabel" | "duplicateLabel" | "unknownVariable"
  | "unknownProperty" | "expressionSyntax" | "emptyLoop" | "emptyBranch" | "missingField"
  | "routineRecursion" | "disabledStep" | "unreachableStep" | "unusedVariable"
  | "computedCycle" | "computedVariable" | "computedGlobalScope" | "computedKindConflict";

/** One problem reported by `ValidateBuiltProgram`. */
export type ValidationProblem = {
  /** The step the problem is on. Empty for program-level problems (e.g. unusedVariable). */
  stepId: string;
  /** Human-readable location of the step in the tree, as the controller renders it. */
  stepPath: string;
  /** The step field at fault, when the problem is about one field. */
  field?: string;
  severity: ValidationSeverity;
  code: KnownValidationCode | (string & {});
  message: string;
};

export type ExpressionVariableKind = "number" | "boolean" | "string" | "image" | "list" | "computed";

export type ExpressionSymbolVariable = {
  name: string;
  kind: ExpressionVariableKind;
  elementType?: ListElementType;
  /** The formula of a `kind: "computed"` variable. */
  expression?: string;
  isGlobal: boolean;
  isPersistent: boolean;
  value?: number | string | boolean | null;
};

/** A read-only system variable such as `robot.x` (stored without the `$`). */
export type ExpressionProperty = { name: string; description: string; type: string };
export type ExpressionFunction = { name: string; signature: string; description: string };
/** An IO name such as `stb.in1` (stored without the `$`). */
export type ExpressionIoSymbol = { name: string; description: string };

/** What `GetExpressionSymbols` answers: everything an expression may reference. */
export type ExpressionSymbols = {
  variables: ExpressionSymbolVariable[];
  properties: ExpressionProperty[];
  functions: ExpressionFunction[];
  io: ExpressionIoSymbol[];
};

/** Result of `EvaluateExpression`. `ok: false` carries the evaluator's error text. */
export type ExpressionEvaluation = {
  ok: boolean;
  value?: number;
  error?: string;
  isBoolean?: boolean;
};

/** One stored revision of a built program, newest first from `GetBuiltProgramRevisions`. */
export type ProgramRevision = {
  /** The unix-ms file stem, kept as a string so it round-trips exactly. */
  id: string;
  savedUnixMs: number;
  stepCount: number;
  variableCount: number;
  note?: string;
};

export type BackgroundProgramStatus = {
  id?: string;
  name: string;
  currentStep: string;
};

// ── Program cycle ─────────────────────────────────────────────────────────────

export type ProgramStatus =
  | 'Ready' | 'Starting' | 'Running' | 'Finishing'
  | 'Stopping' | 'Stopped' | 'Complete' | 'Error';

export type ProgramSummary = {
  name: string;
  description: string;
  status: ProgramStatus;
  currentStepDescription: string;
  currentStepNumber: number;
  maxStepCount: number;
  errorDescription: string;
  warningDescription: string;
  /** Times the program has been started since the controller booted. */
  runCount?: number;
  /**
   * Unix ms of the most recent start. Changes on every start, so a poller can
   * notice a run that began and finished between two polls (status reads
   * "Complete" both times — e.g. a single move whose target is already reached).
   */
  lastStartedUnixMs?: number;
  currentPointName: string;
  currentOffsetX?: number;  currentOffsetY?: number;  currentOffsetZ?: number;
  currentOffsetRX?: number; currentOffsetRY?: number; currentOffsetRZ?: number;
  currentToolOffsetX?: number;  currentToolOffsetY?: number;  currentToolOffsetZ?: number;
  currentToolOffsetRX?: number; currentToolOffsetRY?: number; currentToolOffsetRZ?: number;
  /** Flag set by mobile app — external program reads and consumes this */
  start: boolean;
  stop: boolean;
  reset: boolean;
  abort: boolean;
};

// ── Robot info / status ───────────────────────────────────────────────────────

export type RobotInfo = {
  robotName: string;
  robotType: string;
  ipAddress: string;
  port: number;
  serialNumber: string;
  controlEndpoint: string;
};

export type Point = {
  name: string
  lastUpdatedUnixMs: number
  x: number
  y: number
  z: number
  rx: number
  ry: number
  rz: number
}

export type Tool = {
  name: string
  description: string
  lastUpdatedUnixMs: number
  x: number
  y: number
  z: number
  rx: number
  ry: number
  rz: number
}

export type Local = {
  name: string
  description: string
  lastUpdatedUnixMs: number
  x: number
  y: number
  z: number
  rx: number
  ry: number
  rz: number
}

export type Grid = {
  id: string;
  name: string;
  basePointName: string;
  rowOffsetX: number; rowOffsetY: number; rowOffsetZ: number;
  colOffsetX: number; colOffsetY: number; colOffsetZ: number;
  rowCount?: number;
  colCount?: number;
  rotation: number;
  lastUpdatedUnixMs: number;
};

export type GridPoint = {
  gridId: string;
  rowIndex?: number;
  colIndex?: number;
  gridIndex?: number;
  useGridIndex: boolean;
};

export type RobotStack = {
  id: string;
  name: string;
  basePointName: string;
  offsetX: number;
  offsetY: number;
  offsetZ: number;
  maxCount?: number;
  lastUpdatedUnixMs: number;
};

export type StackPoint = {
  stackId: string;
  index?: number;
};

export type RobotStatus = {
  connected: boolean,
  moving: boolean,
  wasHomed: boolean,
  lastPointUpdate: number,

  x: number,
  y: number,
  z: number,
  rx: number,
  ry: number,
  rz: number,

  // TCP position expressed in the active local's frame (equals world when none)
  localX: number,
  localY: number,
  localZ: number,
  localRZ: number,

  targetX: number,
  targetY: number,
  targetZ: number,
  targetRx: number,
  targetRy: number,
  targetRz: number,

  // Joint-space values (ASTRO: J1=base rotation Â°, J2=radial arm reach mm, J3=vertical mm, J4=EOAT rotation Â°)
  joint1Angle: number,
  joint2X:     number,   // radial reach (CoreXY stage cartesian.x)
  joint2Z:     number,   // vertical height (CoreXY stage cartesian.z)
  joint4Angle: number,

  poseX: number,
  poseY: number,
  poseZ: number,
  poseRx: number,
  poseRy: number,
  poseRz: number,

  speedS: number,
  accelS: number,
  decelS: number,

  speedJ: number,
  accelJ: number,
  decelJ: number,

  input1: boolean,
  input2: boolean,
  input3: boolean,
  input4: boolean,

  output1: boolean,
  output2: boolean,
  output3: boolean,
  output4: boolean,

  homingState: string,
  driverConnected: boolean,
  driverOk: boolean,

  programs: ProgramSummary[],

  lastToolUpdate: number,
  activeTool: string,

  lastLocalUpdate: number,
  activeLocal: string,

  lastBuiltProgramUpdate: number,
  lastGridUpdate: number,
  lastStackUpdate: number,
  version: string,
  isLinux: boolean,
  backgroundPrograms: BackgroundProgramStatus[],
  speedOverridePercent: number,

  // Joint soft-limit fault state
  faulted: boolean,
  faultJoint: number,       // 0..3 joint index (0=J1, 1=J2, 2=J3, 3=J4), -1 = none
  faultDirection: number,   // +1 = the "increase" button worsens it, -1 = the "decrease" button worsens it
  faultMessage: string,
  limitBypass: boolean,
  jointLimitsEnabled: boolean,
  robotType: string,        // "ASTRO" | "CNC4Axis" — drives joint labelling
}

export function createDefaultStatus(): RobotStatus {
  return {
    connected: false,
    moving: false,
    wasHomed: false,
    lastPointUpdate: 0,
    x: 0,
    y: 0,
    z: 0,
    rx: 0,
    ry: 0,
    rz: 0,
    localX: 0,
    localY: 0,
    localZ: 0,
    localRZ: 0,
    targetX: 0,
    targetY: 0,
    targetZ: 0,
    targetRx: 0,
    targetRy: 0,
    targetRz: 0,
    joint1Angle: 0,
    joint2X:     0,
    joint2Z:     0,
    joint4Angle: 0,
    poseX: 0,
    poseY: 0,
    poseZ: 0,
    poseRx: 0,
    poseRy: 0,
    poseRz: 0,
    speedS: 0,
    accelS: 0,
    decelS: 0,
    speedJ: 0,
    accelJ: 0,
    decelJ: 0,
    input1: false,
    input2: false,
    input3: false,
    input4: false,

    output1: false,
    output2: false,
    output3: false,
    output4: false,

    homingState: "WaitingForStart",
    driverConnected: false,
    driverOk: false,

    programs: [],

    lastToolUpdate: 0,
    activeTool: "",

    lastLocalUpdate: 0,
    activeLocal: "",

    lastBuiltProgramUpdate: 0,
    lastGridUpdate: 0,
    lastStackUpdate: 0,
    version: "0.0.0",
    isLinux: false,
    backgroundPrograms: [],
    speedOverridePercent: 100,
    faulted: false,
    faultJoint: -1,
    faultDirection: 0,
    faultMessage: "",
    limitBypass: false,
    jointLimitsEnabled: false,
    robotType: "ASTRO",
  };
}
