// The cell package data contract (SimpleRobotController docs/cell-package.md). Types only — safe
// to import from the WebView bundle.
//
// All geometry is in the robot's base frame at its zero pose, in mm: Z up, the J1 axis through the
// origin. For ASTRO that frame is the controller's *operator* frame (operator Y = −math Y), so
// points, locals and the reported TCP (x, y, z, rz) drop straight into it.

export type Vec3 = [number, number, number];
export type RGB = [number, number, number];

/** A shape / mesh tag for an adjustable axis (§3.1): "stretch" moves the far face, "end" translates. */
export type CellAdjust = { id: string; role: "stretch" | "end" };

export type CellBox = {
  type: "box";
  min: Vec3;
  max: Vec3;
  color?: RGB;
  name?: string;
  adjust?: CellAdjust;
};

export type CellCylinder = {
  type: "cylinder";
  center: [number, number];
  radius: number;
  z: [number, number];
  color?: RGB;
  name?: string;
  adjust?: CellAdjust;
};

export type CellShape = CellBox | CellCylinder;

/** A GLB file inside the package (raw mm, Z up, no node transforms). */
export type CellMeshRef = { mesh: string; color?: RGB; adjust?: CellAdjust };

export type RobotJointValue = { field?: string; scale?: number; zero?: number };

export type RobotJoint = {
  name: string;
  type: "revolute" | "prismatic";
  parent: string;
  child: string;
  origin?: Vec3;
  axis: Vec3;
  value?: RobotJointValue;
};

export type RobotLink = {
  name: string;
  color?: RGB;
  shapes?: CellShape[];
  meshes?: CellMeshRef[];
};

export type RobotAdjustable = { id: string; setting: string; nominal: number; direction: Vec3 };

export type RobotDef = {
  name?: string;
  flange?: string;
  joints: RobotJoint[];
  links: RobotLink[];
  adjustable?: RobotAdjustable[];
};

export type CellMoving = {
  meshes?: CellMeshRef[];
  shapes?: CellShape[];
  /** status[field] == on → actuated (home); anything else → open (moved by travel / degrees). */
  drive?: { field: string; on?: number | boolean };
  slide?: { direction: Vec3; travel: number };
  rotate?: { axis: Vec3; origin?: Vec3; degrees: number };
  /** mm/s (slide) or deg/s (rotate) between states. */
  speed?: number;
};

export type CellTool = {
  id: string;
  name?: string;
  /** The controller tool id this model shows for (matched against GetStatus activeToolId). */
  controllerTool?: string;
  meshes?: CellMeshRef[];
  shapes?: CellShape[];
  moving?: CellMoving[];
};

export type CellFixture = {
  id: string;
  name?: string;
  meshes?: CellMeshRef[];
  shapes?: CellShape[];
  collision?: boolean;
};

export type CellDef = {
  format?: string;
  version?: number;
  id?: string | null;
  name?: string | null;
  robot?: RobotDef | null;
  tools?: CellTool[];
  fixtures?: CellFixture[];
  /** GET /cells/active: the current value of every adjustable setting. */
  settings?: Record<string, number | null>;
};

/** A controller pose (point, local) in the base frame: mm + R = Rz·Ry·Rx degrees. */
export type CellPose = { id?: string; name?: string; x: number; y: number; z: number; rx?: number; ry?: number; rz?: number };
