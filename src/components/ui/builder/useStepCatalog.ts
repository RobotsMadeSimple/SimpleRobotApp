import { useEffect, useMemo, useSyncExternalStore } from "react";
import type { FieldSpec, StepCatalog, StepSpec, StepType } from "@/src/models/robotModels";
import { isUnsupportedCommand, robotClient } from "@/src/services/RobotConnectService";

// The controller's step catalog (GetStepCatalog — controller docs/program-language.md §5):
// every step type's category, label, typed fields and text syntax. It is static per controller
// build, so it is fetched once per connection and kept module-level (like the plugin
// contributions) so plain helpers can read it without a hook.
//
// Fallback: an older controller has no GetStepCatalog (status "unsupported"); callers then use
// the app's built-in tables in stepUtils.tsx, which stay until every controller ships the catalog.

export type StepCatalogState = {
  /** idle = never asked; unsupported = older controller without the catalog. */
  status: "idle" | "loading" | "ready" | "unsupported" | "error";
  catalog: StepCatalog | null;
};

let state: StepCatalogState = { status: "idle", catalog: null };
let inFlight: Promise<void> | null = null;
const listeners = new Set<() => void>();

function setState(next: StepCatalogState) {
  state = next;
  bySpec = null;
  listeners.forEach(l => l());
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}

export function getStepCatalogState(): StepCatalogState {
  return state;
}

/**
 * Fetch GetStepCatalog. Concurrent calls share one request. An older controller reads as
 * "unsupported"; a transport error keeps whatever was cached.
 */
export function loadStepCatalog(): Promise<void> {
  if (inFlight) return inFlight;
  if (state.status === "idle") setState({ ...state, status: "loading" });
  inFlight = robotClient.getStepCatalog()
    .then(catalog => setState({ status: "ready", catalog }))
    .catch(e => {
      if (isUnsupportedCommand(e)) setState({ status: "unsupported", catalog: null });
      else setState({ status: state.catalog ? state.status : "error", catalog: state.catalog });
    })
    .finally(() => { inFlight = null; });
  return inFlight;
}

/** Forget the cached catalog (a different controller was connected). */
export function resetStepCatalog() {
  setState({ status: "idle", catalog: null });
}

// ── Lookups (plain functions, usable outside React) ──────────────────────────

let bySpec: Map<string, StepSpec> | null = null;

/** The catalog entry for a step type, or undefined (no catalog yet, or an unknown type). */
export function stepSpecFor(type: StepType | string, catalog: StepCatalog | null = state.catalog): StepSpec | undefined {
  if (!catalog) return undefined;
  if (catalog === state.catalog) {
    bySpec ??= new Map(catalog.steps.map(s => [s.type, s]));
    return bySpec.get(type);
  }
  return catalog.steps.find(s => s.type === type);
}

/** One field of a step type, by key. */
export function fieldSpecFor(type: StepType | string, key: string, catalog: StepCatalog | null = state.catalog): FieldSpec | undefined {
  return stepSpecFor(type, catalog)?.fields.find(f => f.key === key);
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export type StepCatalogView = StepCatalogState & {
  /** True once the controller answered with a catalog. */
  loaded: boolean;
  spec: (type: StepType | string) => StepSpec | undefined;
  field: (type: StepType | string, key: string) => FieldSpec | undefined;
  refresh: () => Promise<void>;
};

/**
 * Reads the shared catalog and, when `connected` is given, fetches it on mount and every
 * time the connection comes back. Components that only read omit it.
 */
export function useStepCatalog(connected?: boolean): StepCatalogView {
  const snap = useSyncExternalStore(subscribe, getStepCatalogState, getStepCatalogState);

  useEffect(() => {
    if (connected) loadStepCatalog();
  }, [connected]);

  return useMemo(() => ({
    ...snap,
    loaded: snap.status === "ready" && snap.catalog != null,
    spec: type => stepSpecFor(type, snap.catalog),
    field: (type, key) => fieldSpecFor(type, key, snap.catalog),
    refresh: loadStepCatalog,
  }), [snap]);
}
