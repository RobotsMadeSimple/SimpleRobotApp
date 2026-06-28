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
  if (axis.axisType === 'Rotary') return '°';
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
};

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

export type VisionZone = {
  id: string;
  name: string;
  geometry: VisionZoneGeometry;
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
  lastUpdatedUnixMs: number;
};

export type BlobResult       = { x: number; y: number; size: number };
export type InspectionResult = { inspectionId: string; name: string; blobs: BlobResult[] };
export type VisionResult     = { programId: string; timestampMs: number; inspections: InspectionResult[]; colorResults?: ColorCoverageResult[]; polygonResults?: PolygonResult[]; arucoResults?: ArucoResult[]; lineResults?: LineResult[]; barcodeResults?: BarcodeResult[] };

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
    x: 0.1, y: 0.1, width: 0.8, height: 0.8,
    cx: 0.5, cy: 0.5, radius: 0.3,
    points: [[0.1, 0.1], [0.9, 0.1], [0.9, 0.9], [0.1, 0.9]],
  };
}

// ── Program builder ───────────────────────────────────────────────────────────

export type StepType = 'MoveL' | 'MoveJ' | 'JumpL' | 'JumpJ' | 'SetOutput' | 'Wait' | 'Loop' | 'StatusUpdate' | 'CallRoutine' | 'SetSpeedL' | 'SetSpeedJ' | 'SetVariable' | 'PauseProgram' | 'Label' | 'GoToLabel' | 'IfCondition' | 'SetTool' | 'RunHoming' | 'AuxMove' | 'AuxContinuous' | 'AuxStop' | 'AuxEnable' | 'RunVision' | 'SetLocal' | 'ClearLocal' | 'StartBackground' | 'StopBackground' | 'WaitForBackground' | 'StopwatchControl' | 'SaveImage' | 'ThreadMove' | 'CncProgram';

export const THREAD_PRESETS: { label: string; pitch: number; group: 'metric' | 'imperial' }[] = [
  // Metric coarse
  { label: 'M2 × 0.4',    pitch: 0.400, group: 'metric' },
  { label: 'M2.5 × 0.45', pitch: 0.450, group: 'metric' },
  { label: 'M3 × 0.5',    pitch: 0.500, group: 'metric' },
  { label: 'M3.5 × 0.6',  pitch: 0.600, group: 'metric' },
  { label: 'M4 × 0.7',    pitch: 0.700, group: 'metric' },
  { label: 'M5 × 0.8',    pitch: 0.800, group: 'metric' },
  { label: 'M6 × 1.0',    pitch: 1.000, group: 'metric' },
  { label: 'M8 × 1.25',   pitch: 1.250, group: 'metric' },
  { label: 'M10 × 1.5',   pitch: 1.500, group: 'metric' },
  { label: 'M12 × 1.75',  pitch: 1.750, group: 'metric' },
  { label: 'M14 × 2.0',   pitch: 2.000, group: 'metric' },
  { label: 'M16 × 2.0',   pitch: 2.000, group: 'metric' },
  { label: 'M20 × 2.5',   pitch: 2.500, group: 'metric' },
  { label: 'M24 × 3.0',   pitch: 3.000, group: 'metric' },
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

export type ColorCoverageResult = {
  inspectionId: string;
  name: string;
  coverage: number;
  passed: boolean;
};

export type ColorVisionStepOutput = {
  inspectionId: string;
  coverageVar?: string;
  passedVar?: string;
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
  { id: 0,  label: '4×4  (50 IDs)'   },
  { id: 1,  label: '4×4  (100 IDs)'  },
  { id: 2,  label: '4×4  (250 IDs)'  },
  { id: 3,  label: '4×4  (1000 IDs)' },
  { id: 4,  label: '5×5  (50 IDs)'   },
  { id: 5,  label: '5×5  (100 IDs)'  },
  { id: 6,  label: '5×5  (250 IDs)'  },
  { id: 7,  label: '5×5  (1000 IDs)' },
  { id: 8,  label: '6×6  (50 IDs)'   },
  { id: 9,  label: '6×6  (100 IDs)'  },
  { id: 10, label: '6×6  (250 IDs)'  },
  { id: 11, label: '6×6  (1000 IDs)' },
  { id: 12, label: '7×7  (50 IDs)'   },
  { id: 13, label: '7×7  (100 IDs)'  },
  { id: 14, label: '7×7  (250 IDs)'  },
  { id: 15, label: '7×7  (1000 IDs)' },
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

export type ProgramVariable = {
  id: string;
  name: string;
  value: number;
  values?: number[];
  /** When set, this is a Vector6 array variable populated at runtime by RunVision steps. */
  points?: Vector6Val[];
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
};

export type ProgramVariableSnapshot = {
  name: string;
  value: number;
  isBoolean: boolean;
};

export type ProgramStep = {
  id: string;
  type: StepType;
  name?: string;
  pointName?: string;
  speed?: number;
  accel?: number;
  decel?: number;
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
  colorOutputs?: ColorVisionStepOutput[];
  polygonOutputs?: PolygonVisionStepOutput[];
  arucoOutputs?: ArucoVisionStepOutput[];
  // Variable point target for move steps (overrides pointName when set)
  varPointName?: string;
  varPointIndex?: string;
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
  auxAccel?: number;        // steps/sec² OR physical unit/sec² when auxUnit set
  auxDecel?: number;        // steps/sec² (AuxMove + AuxStop ramp-down)
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
  // CncProgram
  cncDxfFile?: string;
  cncSafeZ?: number;
  cncProgramSteps?: ProgramStep[];
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

  targetX: number,
  targetY: number,
  targetZ: number,
  targetRx: number,
  targetRy: number,
  targetRz: number,

  // Joint-space values (ASTRO: J1=base rotation °, J2=radial arm reach mm, J3=vertical mm, J4=EOAT rotation °)
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
  };
}