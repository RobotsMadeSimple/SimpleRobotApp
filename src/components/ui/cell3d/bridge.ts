// The message contract between the app and the 3D cell viewer page (webviewEntry.ts). On native the
// viewer runs in a WebView (commands via injectJavaScript, events via ReactNativeWebView.postMessage),
// on web in an iframe (postMessage both ways), and in a display page inside the page itself (fed by
// the display bridge's `robot.onCell3d`). Types only — safe to import from the WebView bundle.

import type { CellDef, CellPose } from "./cellTypes";

export type Cell3DViewName = "front" | "side" | "top" | "iso" | "follow";

export type Cell3DTheme = "light" | "dark";

export type Cell3DToggle = "points" | "locals" | "sets" | "trail";

export type Cell3DOptions = {
  trail?: boolean;
  /** Draw saved points (default off: most views only need the ones that matter, see pointIds). */
  points?: boolean;
  /** Which saved points `points` draws, by stable id; null / absent = all of them. The Points
   *  chip then reads "Points · N". A highlighted point always draws, whatever these say. */
  pointIds?: string[] | null;
  locals?: boolean;
  /** Grids and stacks (the `sets` command). Default on. */
  sets?: boolean;
  /** "full": views + toggles; "views": view buttons only; "none": no overlay controls. */
  controls?: "full" | "views" | "none";
  /** Which toggle chips "full" shows, in order. Default: points, locals, trail. */
  toggles?: Cell3DToggle[];
  /** What preset views frame: "robot" (default, plus fixtures) or "items" (also the drawn
   *  points / locals / grids / stacks near the robot). */
  fit?: "robot" | "items";
};

/** The active tool as the app knows it (GetTools): its id, name and TCP offset. */
export type Cell3DTool = { id: string | null; name: string; x: number; y: number; z: number } | null;

/** A Space item, by its stable id (never its name). */
export type Cell3DItemKind = "point" | "local" | "grid" | "stack" | "tool";
/**
 * An item by stable id. A grid / stack target may also name one cell (zero-based, as programs
 * index them): a pick on a grid's marker carries `row` + `col`, on a stack's `index`. As a
 * highlight, a target with a cell emphasises just that cell; without one, the whole item.
 */
export type Cell3DTarget = { kind: Cell3DItemKind; id: string; row?: number; col?: number; index?: number };

/**
 * A set of positions drawn as one item: a grid (`positions` row-major, rows × cols, drawn as a
 * lattice), a stack (index order, drawn as a line) or plain marks (e.g. taught touches).
 */
export type Cell3DSet = {
  kind: "grid" | "stack" | "marks";
  id: string;
  name?: string;
  positions: CellPose[];
  rows?: number;
  cols?: number;
};

/**
 * The item being edited, drawn highlighted from unsaved values and in place of the saved item with
 * the same id: a local's frame, a grid's / stack's positions, or a tool's TCP at the live flange.
 */
export type Cell3DPreview =
  | { kind: "local"; id?: string; name?: string; pose: CellPose }
  | { kind: "point"; id?: string; name?: string; pose: CellPose }
  | { kind: "set"; set: Cell3DSet }
  | { kind: "tool"; id?: string; name?: string; x: number; y: number; z: number };

/**
 * A conveyor drawn in the cell: the belt along its frame's +X between the window ends (plus a
 * margin), the window shaded on it, and its queued parts as small boxes at their live X.
 */
export type Cell3DConveyor = {
  id: string;
  name?: string;
  /** Conveyor frame in robot base coordinates (mm, rz in degrees); +X = belt travel. */
  frame: { x: number; y: number; z: number; rz: number };
  startMm: number;
  endMm: number;
  /** Sensor position along X (mm), when the conveyor has one. */
  sensorMm?: number | null;
  parts: { id: string; x: number; tracked?: boolean }[];
};

/** app → viewer */
export type Cell3DCommand =
  /** The cell to draw. `baseUrl` resolves mesh paths (http://<robot>:9000/cells/<id>/), null = none. */
  | { type: "cell"; cell: CellDef | null; baseUrl: string | null; note?: string; message?: string }
  /** A status snapshot (GetStatus fields: joints, x/y/z/rz, IO, activeToolId, target…). */
  | { type: "status"; status: Record<string, unknown> }
  | { type: "tool"; tool: Cell3DTool }
  | { type: "points"; points: CellPose[] }
  | { type: "locals"; locals: CellPose[] }
  | { type: "theme"; theme: Cell3DTheme }
  | { type: "options"; options: Cell3DOptions }
  | { type: "view"; view: Cell3DViewName }
  | { type: "clearTrail" }
  /** Grids / stacks / marks to draw (replaces the previous sets). */
  | { type: "sets"; sets: Cell3DSet[] }
  /** Emphasise one item (null = none). `focus`: pan to it when it is off screen. */
  | { type: "highlight"; target: Cell3DTarget | null; focus?: boolean }
  /** The item being edited (null = none). */
  | { type: "preview"; preview: Cell3DPreview | null }
  /** Conveyors and their queued parts (replaces the previous ones; sent as the parts move). */
  | { type: "conveyors"; conveyors: Cell3DConveyor[] };

/** viewer → app */
export type Cell3DEvent =
  | { type: "ready" }
  /** The user changed a toggle or the view in the overlay. */
  | { type: "options"; options: Cell3DOptions; view: Cell3DViewName }
  /** A tap (not a drag) on a point / local / grid cell / stack slot marker; null = on empty space. */
  | { type: "pick"; target: Cell3DTarget | null }
  | { type: "error"; message: string };

export type Cell3DController = {
  apply(cmd: Cell3DCommand): void;
  destroy(): void;
};

export type Cell3DMountOptions = {
  theme?: Cell3DTheme;
  /** Replaces the cell / robot name in the top-left chip. */
  title?: string;
  options?: Cell3DOptions;
  view?: Cell3DViewName;
  onEvent?: (e: Cell3DEvent) => void;
};
