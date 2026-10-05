import { useEffect, useMemo, useSyncExternalStore } from "react";
import {
  PluginContributions,
  PluginStepContribution,
} from "@/src/models/robotModels";
import { isUnsupportedCommand, robotClient } from "@/src/services/RobotConnectService";

// What the installed plugins contribute to the builder (docs/plugins.md §7
// GetPluginContributions): their steps for the picker and the config form, and
// their functions/properties for the expression assist.
//
// Module-level, like the step clipboard: entering a routine pushes a new builder
// screen, and the step label helpers (stepLabel/stepDetail) are plain functions
// that need plugin names without a hook. Fetched when a builder opens and again
// on reconnect; the last answer is kept for the session in between.

export type PluginContributionsState = {
  /** idle = never asked; unsupported = older controller without plugins. */
  status: "idle" | "loading" | "ready" | "unsupported" | "error";
  data: PluginContributions;
};

const EMPTY: PluginContributions = { steps: [], functions: [], properties: [] };

let state: PluginContributionsState = { status: "idle", data: EMPTY };
let inFlight: Promise<void> | null = null;
const listeners = new Set<() => void>();

function setState(next: PluginContributionsState) {
  state = next;
  listeners.forEach(l => l());
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}

export function getPluginContributionsState(): PluginContributionsState {
  return state;
}

/**
 * Fetch GetPluginContributions. Concurrent calls share one request. An older
 * controller (UnsupportedCommandError) reads as "no plugins"; a transport error
 * keeps whatever was cached.
 */
export function loadPluginContributions(): Promise<void> {
  if (inFlight) return inFlight;
  if (state.status === "idle") setState({ ...state, status: "loading" });
  inFlight = robotClient.getPluginContributions()
    .then(data => setState({ status: "ready", data }))
    .catch(e => {
      if (isUnsupportedCommand(e)) setState({ status: "unsupported", data: EMPTY });
      else setState({ status: state.data === EMPTY ? "error" : state.status, data: state.data });
    })
    .finally(() => { inFlight = null; });
  return inFlight;
}

// ── Lookups (plain functions, usable outside React) ──────────────────────────

export function findPluginStep(
  pluginId: string | undefined, stepId: string | undefined,
  data: PluginContributions = state.data,
): PluginStepContribution | undefined {
  if (!pluginId || !stepId) return undefined;
  return data.steps.find(s => s.pluginId === pluginId && s.step.id === stepId);
}

export type InstalledPlugin = { id: string; name: string; running: boolean };

/** Every plugin that contributes anything, by id. */
export function installedPlugins(data: PluginContributions = state.data): Map<string, InstalledPlugin> {
  const map = new Map<string, InstalledPlugin>();
  const add = (c: { pluginId: string; pluginName: string; running: boolean }) => {
    if (!map.has(c.pluginId)) map.set(c.pluginId, { id: c.pluginId, name: c.pluginName || c.pluginId, running: c.running });
  };
  data.steps.forEach(add);
  data.functions.forEach(add);
  data.properties.forEach(add);
  return map;
}

/** The plugin's display name, or its id when it is not (or no longer) installed. */
export function pluginDisplayName(pluginId: string | undefined, data: PluginContributions = state.data): string {
  if (!pluginId) return "Plugin";
  return installedPlugins(data).get(pluginId)?.name ?? pluginId;
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export type PluginContributionsView = PluginContributionsState & {
  /** True when the controller answered (ready) — distinguishes "no plugins" from "not asked yet". */
  loaded: boolean;
  findStep: (pluginId: string | undefined, stepId: string | undefined) => PluginStepContribution | undefined;
  plugins: Map<string, InstalledPlugin>;
  refresh: () => Promise<void>;
};

/**
 * Reads the shared contributions and, when `connected` is given, fetches them on
 * mount and every time the connection comes back. Components that only read
 * (the picker, the config form) omit it.
 */
export function usePluginContributions(connected?: boolean): PluginContributionsView {
  const snap = useSyncExternalStore(subscribe, getPluginContributionsState, getPluginContributionsState);

  useEffect(() => {
    if (connected) loadPluginContributions();
  }, [connected]);

  return useMemo(() => ({
    ...snap,
    loaded: snap.status === "ready",
    findStep: (pluginId, stepId) => findPluginStep(pluginId, stepId, snap.data),
    plugins: installedPlugins(snap.data),
    refresh: loadPluginContributions,
  }), [snap]);
}
