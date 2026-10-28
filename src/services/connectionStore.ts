import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useState } from "react";
import { RobotInfo } from "@/src/models/robotModels";

// Persisted connection history + saved ("starred") connections, shown on the Robot tab so the
// user can reconnect to any recent robot or keep favourites around even when they're offline.
const RECENTS_KEY  = "recentConnections";
const SAVED_KEY     = "savedConnections";
const LEGACY_IP_KEY = "lastManualIp";   // migrated into recents on first load
const MAX_RECENTS   = 8;

/** Identity of a recent/saved entry: its address. The same robot reached over several addresses
 *  (LAN, Tailscale, …) is one entry per address, so each can be starred or removed on its own.
 *  Keying by serial made those entries collide (duplicate React keys, one star toggling both). */
export function connKey(r: RobotInfo): string {
  return `${r.ipAddress}:${r.port}`;
}

/** Same physical robot: matching serial when both know it, else the same address. */
export function sameRobot(a: RobotInfo, b: RobotInfo): boolean {
  const sa = a.serialNumber?.trim(), sb = b.serialNumber?.trim();
  return (!!sa && sa === sb) || connKey(a) === connKey(b);
}

/** Drops later entries whose address repeats an earlier one (lists saved by older builds). */
function dedupe(list: RobotInfo[]): RobotInfo[] {
  const seen = new Set<string>();
  return list.filter(r => { const k = connKey(r); if (seen.has(k)) return false; seen.add(k); return true; });
}

type Listener = () => void;
const listeners = new Set<Listener>();
let recents: RobotInfo[] = [];
let saved:   RobotInfo[] = [];

function emit() { listeners.forEach(l => l()); }

function parse(raw: string | null): RobotInfo[] {
  try { const v = raw ? JSON.parse(raw) : []; return Array.isArray(v) ? v : []; }
  catch { return []; }
}

// A single shared load promise so EVERY caller (including writers) awaits the same real read
// before touching the arrays. (The old `loaded = true`-before-await let a write during the read
// window operate on still-empty arrays and persist a truncated list — wiping saved history.)
let loadPromise: Promise<void> | null = null;

function ensureLoaded(): Promise<void> {
  if (loadPromise) return loadPromise;
  loadPromise = (async () => {
    try {
      const [r, s, legacy] = await Promise.all([
        AsyncStorage.getItem(RECENTS_KEY),
        AsyncStorage.getItem(SAVED_KEY),
        AsyncStorage.getItem(LEGACY_IP_KEY),
      ]);
      recents = dedupe(parse(r));
      saved   = dedupe(parse(s));
      // One-time migration: fold the old single "last manual ip" into recents.
      if (legacy && !recents.some(x => x.ipAddress === legacy)) {
        recents = [manualRobot(legacy), ...recents].slice(0, MAX_RECENTS);
        AsyncStorage.removeItem(LEGACY_IP_KEY).catch(() => {});
        persist();
      }
    } catch { recents = []; saved = []; }
    emit();
  })();
  return loadPromise;
}

function persist(): Promise<void> {
  // Await-able so writers can ensure the save is committed before resolving (a fire-and-forget
  // write could otherwise be lost if the app is closed right after a tap). Errors are logged
  // rather than silently swallowed so a real storage failure is visible in dev.
  return Promise.all([
    AsyncStorage.setItem(RECENTS_KEY, JSON.stringify(recents)),
    AsyncStorage.setItem(SAVED_KEY,   JSON.stringify(saved)),
  ])
    .then(() => {})
    .catch(e => { console.warn("[connectionStore] persist failed:", e); });
}

/** A bare manual-IP connection record (used when we only know the address). */
export function manualRobot(ip: string): RobotInfo {
  return { robotName: "Manual", robotType: "", ipAddress: ip, port: 9000, serialNumber: "", controlEndpoint: "control" };
}

export function getRecents(): RobotInfo[] { return recents; }
export function getSaved():   RobotInfo[] { return saved; }

export function isSaved(robot: RobotInfo): boolean {
  const k = connKey(robot);
  return saved.some(s => connKey(s) === k);
}

/** Record a connection attempt — upserts to the front of recents, and refreshes a matching
 *  saved entry's info (its name/type may have only just been learned on connect). */
export async function recordConnection(robot: RobotInfo): Promise<void> {
  await ensureLoaded();
  const k = connKey(robot);
  recents = [robot, ...recents.filter(r => connKey(r) !== k)].slice(0, MAX_RECENTS);
  saved   = saved.map(s => (connKey(s) === k ? { ...s, ...robot } : s));
  emit(); await persist();
}

export async function toggleSaved(robot: RobotInfo): Promise<void> {
  await ensureLoaded();
  const k = connKey(robot);
  saved = saved.some(s => connKey(s) === k)
    ? saved.filter(s => connKey(s) !== k)
    : [robot, ...saved];
  emit(); await persist();
}

/** Fill in a connection's real identity (name/type/serial) once it's learned on connect.
 *  Matched by address (the entry was likely recorded as a bare "Manual" placeholder) and
 *  applied to both recents and saved so a starred manual connection shows the real robot. */
export async function enrichByAddress(
  ipAddress: string,
  port: number,
  patch: { robotName?: string; robotType?: string; serialNumber?: string },
): Promise<void> {
  await ensureLoaded();
  let changed = false;
  const apply = (arr: RobotInfo[]) => arr.map(r => {
    if (r.ipAddress !== ipAddress || r.port !== port) return r;
    const next: RobotInfo = {
      ...r,
      robotName:    patch.robotName && patch.robotName !== "Manual" ? patch.robotName : r.robotName,
      robotType:    patch.robotType    || r.robotType,
      serialNumber: patch.serialNumber || r.serialNumber,
    };
    if (JSON.stringify(next) !== JSON.stringify(r)) changed = true;
    return next;
  });
  recents = apply(recents);
  saved   = apply(saved);
  if (changed) { emit(); await persist(); }
}

export async function removeRecent(robot: RobotInfo): Promise<void> {
  await ensureLoaded();
  const k = connKey(robot);
  recents = recents.filter(r => connKey(r) !== k);
  emit(); await persist();
}

/** Subscribe a component to store changes; returns {recents, saved} and re-renders on update. */
export function useConnectionStore(): { recents: RobotInfo[]; saved: RobotInfo[] } {
  const [snap, setSnap] = useState(() => ({ recents, saved }));
  useEffect(() => {
    const sync = () => setSnap({ recents, saved });
    listeners.add(sync);
    // The store emits only ONCE, when the shared load finishes. A component whose listener
    // wasn't attached at that exact instant (StrictMode / fast-refresh double-mount, or just
    // mounting a tick after the load resolved) would otherwise never see the loaded data until
    // the next write — which is why the lists showed empty until the first connect. `.then`
    // always runs after the load resolves, for every caller, so every mount re-syncs.
    ensureLoaded().then(sync);
    sync(); // also catch data that loaded between this render and the effect firing
    return () => { listeners.delete(sync); };
  }, []);
  return snap;
}
