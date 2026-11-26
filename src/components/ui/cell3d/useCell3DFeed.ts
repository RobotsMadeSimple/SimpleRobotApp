import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useConnected, useConveyors, useConveyorStatuses, useLocals, usePoints, useRobotStatus, useTools } from "@/src/providers/RobotProvider";
import { robotClient } from "@/src/services/RobotConnectService";

import { ASTRO_BUILTIN_ROBOT } from "./astroRobot";
import type { Cell3DCommand, Cell3DConveyor, Cell3DOptions, Cell3DPreview, Cell3DSet, Cell3DTarget, Cell3DTheme, Cell3DTool, Cell3DViewName } from "./bridge";
import type { CellDef, CellPose } from "./cellTypes";

/**
 * Everything the 3D viewer draws, gathered from the app's live connection:
 *  - the cell: GET http://<robot>:9000/cells/active, refetched when GetStatus.lastCellUpdate
 *    changes. An older controller without /cells (404 / network error) gets the bundled built-in
 *    ASTRO robot — only when the robot type is ASTRO — with the travel settings read from
 *    GetRobotConfig when it reports them.
 *  - the status (joints, TCP, IO, activeToolId), the active tool's TCP offset (GetTools), points
 *    and locals.
 * Used by Cell3DView and by the display-page host (the "3D cell" widget).
 */
export type Cell3DFeed = {
  cell: CellDef | null;
  baseUrl: string | null;
  note: string;
  message: string;
  status: Record<string, unknown>;
  tool: Cell3DTool;
  points: CellPose[];
  locals: CellPose[];
  /** Configured conveyors with their live parts (empty on a controller without conveyor tracking). */
  conveyors: Cell3DConveyor[];
};

/** Status fields the viewer never needs (big or churny) — kept out of the 10 Hz messages. */
const DROP = new Set(["programs", "backgroundPrograms", "plugins", "ioDevices", "relay", "jointReferenced"]);

type CellState = { cell: CellDef | null; baseUrl: string | null; note: string; message: string };
const NOT_CONNECTED: CellState = { cell: null, baseUrl: null, note: "", message: "Not connected to a robot." };

export function useCell3DFeed(enabled = true): Cell3DFeed {
  const status = useRobotStatus();
  const connected = useConnected();
  const tools = useTools();
  const pointsRaw = usePoints();
  const localsRaw = useLocals();
  const conveyorDefs = useConveyors();
  const conveyorLive = useConveyorStatuses();
  const [cellState, setCellState] = useState<CellState>({ cell: null, baseUrl: null, note: "", message: "" });

  const s = status as unknown as Record<string, any>;
  const lastCellUpdate = s.lastCellUpdate ?? null;
  const robotType = String(s.robotType || "");
  const base = connected ? robotClient.httpBaseUrl() : null;

  useEffect(() => {
    if (!enabled) return;
    if (!base) return;
    let cancelled = false;
    const ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
    const timer = setTimeout(() => ctrl?.abort(), 6000);
    (async () => {
      try {
        const res = await fetch(`${base}/cells/active`, { signal: ctrl?.signal });
        if (!res.ok) throw new Error(String(res.status));
        const cell = (await res.json()) as CellDef;
        if (cancelled) return;
        const id = typeof cell?.id === "string" && cell.id ? cell.id : null;
        setCellState({
          cell,
          baseUrl: id ? `${base}/cells/${encodeURIComponent(id)}/` : null,
          note: "",
          message: cell?.robot ? "" : "No 3D model for this robot type yet.",
        });
      } catch {
        if (cancelled) return;
        // No /cells on this controller (or it can't be reached over HTTP): the bundled built-in
        // model, for ASTRO only — other robot types have no model yet.
        if (robotType && robotType.toUpperCase() !== "ASTRO") {
          setCellState({ cell: null, baseUrl: null, note: "", message: "No 3D model for this robot type yet." });
          return;
        }
        const settings: Record<string, number | null> = {};
        try {
          const cfg = (await robotClient.getRobotConfig()) as unknown as Record<string, unknown>;
          for (const k of ["astroVerticalTravelMm", "astroRadialTravelMm"])
            if (typeof cfg?.[k] === "number") settings[k] = cfg[k] as number;
        } catch { /* nominal lengths */ }
        if (cancelled) return;
        setCellState({
          cell: { format: "rms-cell", version: 1, id: null, name: null, robot: ASTRO_BUILTIN_ROBOT, tools: [], fixtures: [], settings },
          baseUrl: null,
          note: "Built-in model",
          message: "",
        });
      } finally {
        clearTimeout(timer);
      }
    })();
    return () => { cancelled = true; clearTimeout(timer); ctrl?.abort(); };
  }, [enabled, base, lastCellUpdate, robotType]);

  // The status without the heavy fields; a new object only when the status object changes.
  const slim = useMemo(() => {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(s)) if (!DROP.has(k)) out[k] = v;
    return out;
  }, [s]);

  // Active tool: GetStatus.activeToolId (newer controllers), else by name (activeTool).
  const activeToolId = typeof s.activeToolId === "string" ? s.activeToolId : "";
  const activeToolName = typeof s.activeTool === "string" ? s.activeTool : "";
  const tool = useMemo<Cell3DTool>(() => {
    const t = (activeToolId && tools.find(x => x.id === activeToolId)) || (activeToolName && tools.find(x => x.name === activeToolName)) || null;
    if (!t) return activeToolId ? { id: activeToolId, name: activeToolName, x: 0, y: 0, z: 0 } : null;
    return { id: t.id ?? activeToolId ?? null, name: t.name, x: t.x, y: t.y, z: t.z };
  }, [tools, activeToolId, activeToolName]);

  // Ids ride along so the Space tab can highlight / pick an item by its stable id.
  const points = useMemo<CellPose[]>(() => pointsRaw.map(p => ({ id: p.id || undefined, name: p.name, x: p.x, y: p.y, z: p.z, rx: p.rx, ry: p.ry, rz: p.rz })), [pointsRaw]);
  const locals = useMemo<CellPose[]>(() => localsRaw.map(p => ({ id: p.id || undefined, name: p.name, x: p.x, y: p.y, z: p.z, rx: p.rx, ry: p.ry, rz: p.rz })), [localsRaw]);

  const shown: CellState = base ? cellState : NOT_CONNECTED;
  const conveyors = useMemo<Cell3DConveyor[]>(() => conveyorDefs.map(c => {
    const live = conveyorLive.find(l => l.id === c.id);
    return {
      id: c.id, name: c.name, frame: c.frame,
      startMm: c.window.startMm, endMm: c.window.endMm,
      sensorMm: c.sensor.kind !== "none" ? c.sensor.offsetMm : null,
      parts: (live?.parts ?? []).map(p => ({ id: p.id, x: p.x, tracked: live?.trackedPartId === p.id })),
    };
  }), [conveyorDefs, conveyorLive]);
  return { ...shown, status: slim, tool, points, locals, conveyors };
}

/**
 * Turns a feed into viewer commands: everything once the viewer reports ready (and again after a
 * rebuild — `generation`), then only what changed.
 */
export function useCell3DSync(
  feed: Cell3DFeed,
  send: (cmds: Cell3DCommand[]) => void,
  ready: boolean,
  /** theme / options: left out = the viewer keeps its own (a display widget's config). `generation`:
   *  bump to resend everything (a new page subscribed). */
  extra: { theme?: Cell3DTheme; options?: Cell3DOptions; generation?: number } = {},
) {
  const sendRef = useRef(send);
  useEffect(() => { sendRef.current = send; }, [send]);
  const out = (c: Cell3DCommand) => { if (ready) sendRef.current([c]); };

  const cellCmd = useMemo<Cell3DCommand>(
    () => ({ type: "cell", cell: feed.cell, baseUrl: feed.baseUrl, note: feed.note, message: feed.message }),
    [feed.cell, feed.baseUrl, feed.note, feed.message],
  );
  const optionsKey = extra.options ? JSON.stringify(extra.options) : "";
  const theme = extra.theme;

  // On ready: the full picture in one go (tool before status so the TCP offset is known).
  useEffect(() => {
    if (!ready) return;
    const cmds: Cell3DCommand[] = [];
    if (theme) cmds.push({ type: "theme", theme });
    if (optionsKey) cmds.push({ type: "options", options: JSON.parse(optionsKey) });
    cmds.push(
      { type: "tool", tool: feed.tool },
      cellCmd,
      { type: "points", points: feed.points },
      { type: "locals", locals: feed.locals },
      { type: "status", status: feed.status },
      { type: "conveyors", conveyors: feed.conveyors },
    );
    sendRef.current(cmds);
    // Only on (re)ready; later changes go through the per-field effects below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, extra.generation]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { out(cellCmd); }, [cellCmd]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { out({ type: "tool", tool: feed.tool }); }, [feed.tool]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { out({ type: "points", points: feed.points }); }, [feed.points]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { out({ type: "locals", locals: feed.locals }); }, [feed.locals]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { out({ type: "status", status: feed.status }); }, [feed.status]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { out({ type: "conveyors", conveyors: feed.conveyors }); }, [feed.conveyors]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (theme) out({ type: "theme", theme }); }, [theme]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (optionsKey) out({ type: "options", options: JSON.parse(optionsKey) }); }, [optionsKey]);
}

/**
 * The Space extras (sets, highlight, preview): sent on ready (after useCell3DSync's full picture —
 * call this hook after it) and whenever their content changes. Callers that pass none send nothing.
 */
export function useCell3DExtras(
  send: (cmds: Cell3DCommand[]) => void,
  ready: boolean,
  extras: { sets?: Cell3DSet[]; highlight?: Cell3DTarget | null; focus?: boolean; preview?: Cell3DPreview | null },
) {
  const setsKey = extras.sets ? JSON.stringify(extras.sets) : "";
  const hiKey = extras.highlight === undefined ? "" : JSON.stringify(extras.highlight);
  const previewKey = extras.preview === undefined ? "" : JSON.stringify(extras.preview);
  const focus = !!extras.focus;
  useEffect(() => {
    if (ready && setsKey) send([{ type: "sets", sets: JSON.parse(setsKey) }]);
  }, [ready, setsKey, send]);
  useEffect(() => {
    if (ready && previewKey) send([{ type: "preview", preview: JSON.parse(previewKey) }]);
  }, [ready, previewKey, send]);
  useEffect(() => {
    if (ready && hiKey) send([{ type: "highlight", target: JSON.parse(hiKey), focus }]);
  }, [ready, hiKey, focus, send]);
}

export type Cell3DPrefs = { options: Cell3DOptions; view: Cell3DViewName };

/** Bumped when a remembered toggle's meaning or default changes (2: points hidden by default). */
const PREFS_VERSION = 2;

/** The viewer's toggles + view, remembered per place (`key`) across visits. */
export function useCell3DPrefs(key: string | undefined, defaults: Cell3DPrefs) {
  const [prefs, setPrefs] = useState<Cell3DPrefs>(defaults);
  const [loaded, setLoaded] = useState(!key);
  useEffect(() => {
    if (!key) return;
    let cancelled = false;
    AsyncStorage.getItem(`cell3d.${key}`)
      .then(raw => {
        if (cancelled || !raw) return;
        const p = JSON.parse(raw) as Partial<Cell3DPrefs> & { v?: number };
        // Before v2 every viewer drew all points and remembered that: the stored "points" is
        // dropped so the place's new default (usually off, or only the relevant ones) applies.
        const stored = { ...(p.options ?? {}) };
        if (p.v !== PREFS_VERSION) delete stored.points;
        delete stored.pointIds;
        setPrefs(d => ({ options: { ...d.options, ...stored }, view: p.view ?? d.view }));
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoaded(true); });
    return () => { cancelled = true; };
  }, [key]);
  const save = useCallback((p: Cell3DPrefs) => {
    // Merged, so caller-set fields that aren't remembered (controls, toggles) survive a save.
    setPrefs(prev => ({ options: { ...prev.options, ...p.options }, view: p.view }));
    if (key) AsyncStorage.setItem(`cell3d.${key}`, JSON.stringify({ v: PREFS_VERSION, ...p })).catch(() => {});
  }, [key]);
  return { prefs, loaded, save };
}
