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

  homingState: string,
  driverConnected: boolean,
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

    homingState: "WaitingForStart",
    driverConnected: false,
  };
}