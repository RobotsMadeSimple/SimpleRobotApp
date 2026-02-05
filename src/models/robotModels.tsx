export type RobotInfo = {
  robotName: string;
  robotType: string;
  ipAddress: string;
  port: number;
  serialNumber: string;
  controlEndpoint: string;
};

export type RobotStatus = {
  connected: boolean,
  moving: boolean,
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
  decelJ: number
}