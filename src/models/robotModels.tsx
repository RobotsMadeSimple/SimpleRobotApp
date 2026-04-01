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

// ── Program builder ───────────────────────────────────────────────────────────

export type StepType = 'MoveL' | 'MoveJ' | 'SetOutput' | 'Wait' | 'Loop' | 'StatusUpdate';

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
  outputNumber?: number;
  outputValue?: boolean;
  waitMs?: number;
  loopCount?: number;
  loopSteps?: ProgramStep[];
  statusMessage?: string;
  statusWarning?: string;
  statusError?: string;
};

export type BuiltProgram = {
  name: string;
  description: string;
  steps: ProgramStep[];
  lastUpdatedUnixMs: number;
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

  programs: ProgramSummary[],

  lastToolUpdate: number,
  activeTool: string,

  lastBuiltProgramUpdate: number,
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

    programs: [],

    lastToolUpdate: 0,
    activeTool: "",

    lastBuiltProgramUpdate: 0,
  };
}