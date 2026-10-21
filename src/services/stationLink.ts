import * as Linking from "expo-linking";

// A "station link" is the one payload format shared by NFC tags and QR codes. Tapping a tag or
// scanning a code resolves to a `simplerobotapp://station?…` URI that tells the app which controller
// to connect to, which page to open, and (optionally) which program to start — see app/station.tsx.
//
//   simplerobotapp://station?host=192.168.4.52&port=9000&go=program&run=Weld%20Cycle&name=Weld%20Cell&confirm=1
//
// Because the scheme is a registered app link, scanning the QR with the OS camera — or tapping an
// NFC tag that carries it as an NDEF URI record — launches the app straight to the landing screen,
// even from cold start. The in-app scanner/writer produce and consume this exact format too.

export type StationGo = "program" | "jog" | "io" | "robot";
const GO_VALUES: readonly StationGo[] = ["program", "jog", "io", "robot"];

export type StationRunKind = "program" | "routine" | "background";
const RUN_KIND_VALUES: readonly StationRunKind[] = ["program", "routine", "background"];
export const RUN_KIND_OPTIONS: readonly StationRunKind[] = RUN_KIND_VALUES;

export interface StationLink {
  /** Controller address (IP or hostname). Omitted means "use the current connection". */
  host?: string;
  /** Control port; 9000 is the default and is left out of the URI. */
  port?: number;
  /** Which page to land on after connecting. */
  go?: StationGo;
  /** Program name to auto-start once connected ("tap to start the cycle"). Display/fallback. */
  run?: string;
  /** Stable id of the program to auto-start (rename-proof); resolved first, `run` is the fallback. */
  runId?: string;
  /** What `run` names — a regular program (default), a routine, or a background program. */
  runKind?: StationRunKind;
  /** Friendly station label shown in the UI and on the connected card. */
  name?: string;
  /**
   * Phone data-device id to stream *into*. A "provider" tag turns whichever phone scans/taps it into
   * that device's camera + sensor source and auto-starts streaming — so you designate the streaming
   * phone by handing it the tag, while the other phone (which never scans it) stays a setup device.
   */
  provider?: string;
  /** Ask for confirmation before connecting / running instead of acting instantly. */
  confirm?: boolean;
}

export const STATION_SCHEME = "simplerobotapp";
export const STATION_PATH = "station";
export const DEFAULT_CONTROL_PORT = 9000;

const GO_ROUTE: Record<StationGo, string> = {
  program: "/program",
  jog: "/control/jog",
  io: "/io",
  robot: "/robot",
};

const GO_LABEL: Record<StationGo, string> = {
  program: "Programs",
  jog: "Jogging",
  io: "I/O",
  robot: "Robot",
};

/** Expo-router path to land on for a link's `go` (defaults to the Robot/connect page). */
export function goRoute(go: StationGo | undefined): string {
  return go ? GO_ROUTE[go] : "/robot";
}

export function goLabel(go: StationGo): string {
  return GO_LABEL[go];
}

export const GO_OPTIONS: readonly StationGo[] = GO_VALUES;

/** Clamp a raw link to valid values (drops an unknown `go`, a non-positive `port`). */
export function normalizeLink(link: StationLink): StationLink {
  const go = link.go && GO_VALUES.includes(link.go) ? link.go : undefined;
  const port = link.port && Number.isFinite(link.port) && link.port > 0 ? Math.trunc(link.port) : undefined;
  const host = link.host?.trim() || undefined;
  const run = link.run?.trim() || undefined;
  const runId = (run || link.runId) ? (link.runId?.trim() || undefined) : undefined;
  // runKind only matters alongside a run target; default a run to "program".
  const runKind = (run || runId)
    ? (link.runKind && RUN_KIND_VALUES.includes(link.runKind) ? link.runKind : "program")
    : undefined;
  const name = link.name?.trim() || undefined;
  const provider = link.provider?.trim() || undefined;
  return { host, port, go, run, runId, runKind, name, provider, confirm: !!link.confirm };
}

/** Build the canonical `simplerobotapp://station?…` URI for a link (encoded for QR / NFC). */
export function buildStationUri(link: StationLink): string {
  const l = normalizeLink(link);
  const q: string[] = [];
  const add = (k: string, v: string | undefined) => {
    if (v != null && v !== "") q.push(`${k}=${encodeURIComponent(v)}`);
  };
  add("host", l.host);
  if (l.port && l.port !== DEFAULT_CONTROL_PORT) add("port", String(l.port));
  add("go", l.go);
  add("run", l.run);
  add("runId", l.runId);
  if (l.runKind && l.runKind !== "program") add("runKind", l.runKind); // "program" is the default
  add("name", l.name);
  add("provider", l.provider);
  if (l.confirm) q.push("confirm=1");
  return `${STATION_SCHEME}://${STATION_PATH}${q.length ? "?" + q.join("&") : ""}`;
}

function firstString(v: unknown): string | undefined {
  if (typeof v === "string") return v;
  if (Array.isArray(v) && typeof v[0] === "string") return v[0];
  return undefined;
}

function truthy(v: string | undefined): boolean {
  return v === "1" || v === "true" || v === "yes";
}

/** Parse any string (a scanned QR, an NFC URI record) into a StationLink, or null if it isn't one. */
export function parseStationUri(uri: string | null | undefined): StationLink | null {
  if (!uri) return null;
  let parsed: Linking.ParsedURL;
  try {
    parsed = Linking.parse(uri.trim());
  } catch {
    return null;
  }
  // Accept the station payload whether the library reports "station" as the hostname
  // (simplerobotapp://station) or as the path (platform/encoding differences).
  const hostPart = (parsed.hostname ?? "").toLowerCase();
  const pathPart = (parsed.path ?? "").replace(/^\/+/, "").toLowerCase();
  if (hostPart !== STATION_PATH && pathPart !== STATION_PATH) return null;
  const qp = parsed.queryParams ?? {};
  const portStr = firstString(qp.port);
  return normalizeLink({
    host: firstString(qp.host),
    port: portStr ? Number(portStr) : undefined,
    go: firstString(qp.go) as StationGo | undefined,
    run: firstString(qp.run),
    runId: firstString(qp.runId),
    runKind: firstString(qp.runKind) as StationRunKind | undefined,
    name: firstString(qp.name),
    provider: firstString(qp.provider),
    confirm: truthy(firstString(qp.confirm)),
  });
}

/** Expo-router query params (all strings) → StationLink, for the landing route. */
export function paramsToLink(params: Record<string, string | string[] | undefined>): StationLink {
  const portStr = firstString(params.port);
  return normalizeLink({
    host: firstString(params.host),
    port: portStr ? Number(portStr) : undefined,
    go: firstString(params.go) as StationGo | undefined,
    run: firstString(params.run),
    runId: firstString(params.runId),
    runKind: firstString(params.runKind) as StationRunKind | undefined,
    name: firstString(params.name),
    provider: firstString(params.provider),
    confirm: truthy(firstString(params.confirm)),
  });
}

/** StationLink → query params for navigating to the landing route. */
export function linkToParams(link: StationLink): Record<string, string> {
  const l = normalizeLink(link);
  const p: Record<string, string> = {};
  if (l.host) p.host = l.host;
  if (l.port && l.port !== DEFAULT_CONTROL_PORT) p.port = String(l.port);
  if (l.go) p.go = l.go;
  if (l.run) p.run = l.run;
  if (l.runId) p.runId = l.runId;
  if (l.runKind && l.runKind !== "program") p.runKind = l.runKind;
  if (l.name) p.name = l.name;
  if (l.provider) p.provider = l.provider;
  if (l.confirm) p.confirm = "1";
  return p;
}

/** True if the link does anything at all (connects, navigates, runs, or starts providing). */
export function hasAction(link: StationLink): boolean {
  return !!(link.host || link.go || link.run || link.runId || link.provider);
}

export function stationLabel(link: StationLink): string {
  return link.name || link.host || "this station";
}

/** One-line human description for the confirm prompt ("Connect to Weld Cell and start “Cycle”?"). */
export function stationSummary(link: StationLink): string {
  const where = link.host
    ? `${stationLabel(link)} (${link.host}${link.port && link.port !== DEFAULT_CONTROL_PORT ? ":" + link.port : ""})`
    : stationLabel(link);
  const parts: string[] = [link.host ? `Connect to ${where}` : `Use ${where}`];
  if (link.provider) parts.push(`stream this phone${link.name ? ` as “${link.name}”` : ""}`);
  else if (link.run) parts.push(`start “${link.run}”`);
  else if (link.go) parts.push(`open ${goLabel(link.go)}`);
  return parts.join(" and ") + "?";
}
