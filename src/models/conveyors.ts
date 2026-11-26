// Conveyor tracking — wire normalisers and small pure helpers (controller docs/conveyor-tracking.md).
// Kept free of React so scripts can import it.
import type {
  AuxAxisChannelState, AuxDeviceState, Conveyor, ConveyorCalibration, ConveyorFrame, ConveyorOutputRef,
  ConveyorSample, ConveyorSensorKind, ConveyorSourceKind, ConveyorStatus,
} from "./robotModels";

type Rec = Record<string, unknown>;
const rec = (v: unknown): Rec => (v && typeof v === "object" ? (v as Rec) : {});
const num = (v: unknown, d = 0): number => (typeof v === "number" && isFinite(v) ? v : typeof v === "string" && v.trim() !== "" && isFinite(+v) ? +v : d);
const numOrNull = (v: unknown): number | null => (v == null || v === "" ? null : (isFinite(num(v, NaN)) ? num(v) : null));
const str = (v: unknown, d = ""): string => (typeof v === "string" ? v : d);
const strOrNull = (v: unknown): string | null => (typeof v === "string" && v ? v : null);
/** An id that may arrive as a number (part ids are integers on the wire). */
const idOrNull = (v: unknown): string | null => (typeof v === "number" && isFinite(v) ? String(v) : strOrNull(v));

const SOURCE_KINDS: ConveyorSourceKind[] = ["aux", "timed", "manual"];
const SENSOR_KINDS: ConveyorSensorKind[] = ["none", "auxPin", "io", "stb"];

/** A list that may arrive as a JSON string (the way the other repositories send theirs). */
export function wireList(v: unknown): Rec[] {
  let parsed = v;
  if (typeof v === "string") { try { parsed = JSON.parse(v); } catch { return []; } }
  return Array.isArray(parsed) ? parsed.filter((x): x is Rec => !!x && typeof x === "object") : [];
}

export function newConveyor(name = "Conveyor 1"): Conveyor {
  return {
    id: "",
    name,
    source: { kind: "manual", deviceId: null, axis: null, mmPerStep: null, runOutput: null, speedMmS: 0 },
    scale: 1,
    frame: { x: 0, y: 0, z: 0, rz: 0 },
    sensor: { kind: "none", deviceId: null, pin: null, input: null, activeHigh: false, offsetMm: 0, minSpacingMm: 10 },
    window: { startMm: 0, endMm: 300 },
    maxQueue: 32,
  };
}

function wireOutputRef(v: unknown): ConveyorOutputRef | null {
  if (!v || typeof v !== "object") return null;
  const r = rec(v);
  return {
    outputCard: str(r.outputCard ?? r.card, "stb"),
    outputDeviceId: strOrNull(r.outputDeviceId ?? r.deviceId),
    outputNumber: num(r.outputNumber ?? r.number ?? r.pin, 1),
  };
}

/** A conveyor off the wire, with every field defaulted (older/partial payloads stay usable). */
export function normalizeConveyor(v: unknown): Conveyor {
  const r = rec(v), d = newConveyor();
  const s = rec(r.source), f = rec(r.frame), sn = rec(r.sensor), w = rec(r.window);
  const kind = str(s.kind) as ConveyorSourceKind;
  const skind = str(sn.kind) as ConveyorSensorKind;
  return {
    id: str(r.id ?? r.Id),
    name: str(r.name ?? r.Name, d.name),
    source: {
      kind: SOURCE_KINDS.includes(kind) ? kind : "manual",
      deviceId: strOrNull(s.deviceId),
      axis: numOrNull(s.axis),
      mmPerStep: numOrNull(s.mmPerStep),
      runOutput: wireOutputRef(s.runOutput),
      speedMmS: num(s.speedMmS),
    },
    scale: num(r.scale, 1) || 1,
    frame: { x: num(f.x), y: num(f.y), z: num(f.z), rz: num(f.rz) },
    sensor: {
      kind: SENSOR_KINDS.includes(skind) ? skind : "none",
      deviceId: strOrNull(sn.deviceId),
      pin: numOrNull(sn.pin),
      input: numOrNull(sn.input),
      activeHigh: sn.activeHigh === true,
      offsetMm: num(sn.offsetMm),
      minSpacingMm: num(sn.minSpacingMm, d.sensor.minSpacingMm),
    },
    window: { startMm: num(w.startMm, d.window.startMm), endMm: num(w.endMm, d.window.endMm) },
    maxQueue: Math.max(1, Math.round(num(r.maxQueue, d.maxQueue))),
  };
}

export function normalizeConveyorStatus(v: unknown): ConveyorStatus | null {
  const r = rec(v);
  const id = str(r.id);
  if (!id) return null;
  return {
    id,
    travelMm: num(r.travelMm),
    speedMmS: num(r.speedMmS),
    running: r.running === true,
    tracking: r.tracking === true,
    trackedPartId: idOrNull(r.trackedPartId),
    parts: wireList(r.parts).map(p => ({
      id: idOrNull(p.id) ?? "",
      x: num(p.x),
      ...(p.travelAtLatch != null ? { travelAtLatch: num(p.travelAtLatch) } : {}),
    })),
    picked: num(r.picked),
    missed: num(r.missed),
    ...(r.latched != null ? { latched: num(r.latched) } : {}),
    ...(r.lastLatchTravelMm !== undefined ? { lastLatchTravelMm: numOrNull(r.lastLatchTravelMm) } : {}),
    ...(typeof r.sourceOk === "boolean" ? { sourceOk: r.sourceOk } : {}),
  };
}

export function normalizeConveyorSample(v: unknown): ConveyorSample {
  const r = rec(v);
  return { x: num(r.x), y: num(r.y), z: num(r.z), rz: num(r.rz), travelMm: num(r.travelMm) };
}

export function normalizeConveyorCalibration(v: unknown): ConveyorCalibration {
  const r = rec(v), f = rec(r.frame);
  const frame: ConveyorFrame = { x: num(f.x), y: num(f.y), z: num(f.z), rz: num(f.rz) };
  return { frame, scale: num(r.scale, 1) || 1, sensorOffsetMm: numOrNull(r.sensorOffsetMm), residualMm: num(r.residualMm) };
}

// ── Aux sources ──────────────────────────────────────────────────────────────

/** The aux axis a conveyor's source names, if that device/axis is known. */
export function conveyorAuxAxis(c: Conveyor, devices: AuxDeviceState[]): { device: AuxDeviceState; axis: AuxAxisChannelState } | null {
  if (c.source.kind !== "aux" || !c.source.deviceId || c.source.axis == null) return null;
  const device = devices.find(d => d.deviceId === c.source.deviceId);
  const axis = device?.axes.find(a => a.axisIndex === c.source.axis);
  return device && axis ? { device, axis } : null;
}

/**
 * Steps per mm of belt for an aux source: the conveyor's own mmPerStep override, else the axis's
 * Linear settings (stepsPerRev × gearRatio ÷ mmPerRev). 0 when neither is set.
 */
export function conveyorStepsPerMm(c: Conveyor, axis: AuxAxisChannelState | null | undefined): number {
  if (c.source.mmPerStep && c.source.mmPerStep > 0) return 1 / c.source.mmPerStep;
  if (!axis || axis.axisType !== "Linear" || !(axis.mmPerRev > 0)) return 0;
  return (axis.stepsPerRev * (axis.gearRatio || 1)) / axis.mmPerRev;
}

/** Continuous-run velocity in steps/s for a belt speed in mm/s (0 when the axis has no scale). */
export function mmPerSecToStepsPerSec(mmS: number, stepsPerMm: number): number {
  return Math.round(mmS * stepsPerMm);
}

/** The `$conveyor.<id>.…` expression names (doc § Expressions). */
export const CONVEYOR_EXPRESSION_FIELDS: { key: string; description: string }[] = [
  { key: "travel",   description: "Belt travel since the controller started (mm)" },
  { key: "speed",    description: "Belt speed (mm/s)" },
  { key: "count",    description: "Queued parts" },
  { key: "inWindow", description: "Queued parts inside the pick window" },
  { key: "tracking", description: "1 while a part is being tracked" },
  { key: "part.x",   description: "Tracked part's X in the conveyor frame (mm)" },
  { key: "part.id",  description: "Tracked part's id" },
  { key: "picked",   description: "Parts picked" },
  { key: "missed",   description: "Parts that left the window unpicked" },
];

/** A conveyor's wire payload for SaveConveyor (only the doc's fields). */
export function conveyorToWire(c: Conveyor): Conveyor {
  return {
    id: c.id,
    name: c.name.trim(),
    // The controller's axis is a plain int: an unused one goes as 0, never null.
    source: { ...c.source, axis: c.source.axis ?? 0 },
    scale: c.scale,
    frame: { ...c.frame },
    sensor: { ...c.sensor },
    window: { ...c.window },
    maxQueue: c.maxQueue,
  };
}

// ── Names by id (for step summaries, which render outside React state) ──────────

let conveyorNames = new Map<string, string>();

/** Called by the connection whenever the conveyor list changes. */
export function setConveyorNames(list: Pick<Conveyor, "id" | "name">[]) {
  conveyorNames = new Map(list.map(c => [c.id, c.name]));
}

/** The conveyor's current name, or a short form of its id when it isn't known (deleted / not loaded). */
export function conveyorLabel(id: string | null | undefined): string {
  if (!id) return "";
  return conveyorNames.get(id) ?? (conveyorNames.size ? "⚠ missing conveyor" : id.slice(0, 8));
}
