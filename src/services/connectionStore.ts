import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useState } from "react";
import { RobotInfo } from "@/src/models/robotModels";
import { type Endpoint, rankEndpoints } from "./addressPick";

// Persisted connection history + saved ("starred") connections, shown on the Robot tab so the
// user can reconnect to any recent robot or keep favourites around even when they're offline.
//
// One entry per ROBOT, not per address. A robot is identified by the serial number its controller
// generates once and advertises (mDNS TXT `SerialNumber`, GetRobotInfo `serialNumber`). The same
// robot is often reachable on several addresses (LAN, VPN, loopback, a second adapter), so each entry
// carries every address it has been reached on; starring it on one address stars it on all of them.
// An entry recorded before its serial was known (a typed IP, a station tag, an older build) is keyed
// by its address until the first successful connect fills the serial in, then merges with any other
// entry for the same robot.
const RECENTS_KEY   = "recentConnections";
const SAVED_KEY     = "savedConnections";
const LEGACY_IP_KEY = "lastManualIp";   // migrated into recents on first load
const MAX_RECENTS   = 8;
/** Addresses kept per robot; the least recently seen go first. */
const MAX_ADDRESSES = 8;
/** An address not seen for this long is forgotten (as long as the robot keeps another one). */
const STALE_MS      = 60 * 24 * 60 * 60 * 1000;
/** A re-sighting of a known address only rewrites storage once this much time has passed. */
const SEEN_PERSIST_MS = 10 * 60 * 1000;

/** One address a robot was reached (or announced) on. lastSeen 0 = recorded but never confirmed. */
export type KnownAddress = { ip: string; port: number; lastSeen: number };

/** A recent/saved entry: the robot's info, with ipAddress/port the address last used. */
export type ConnEntry = RobotInfo & { addresses?: KnownAddress[] };

const serialOf = (r: RobotInfo) => (r.serialNumber ?? "").trim();
const addrKey  = (ip: string, port: number) => `${ip.trim().toLowerCase()}:${port}`;

/** Every address of an entry, the primary (ipAddress/port) always included. */
export function addressesOf(r: RobotInfo): KnownAddress[] {
  const list = ((r as ConnEntry).addresses ?? []).filter(a => a && typeof a.ip === "string" && a.ip.trim());
  const out: KnownAddress[] = [];
  const seen = new Set<string>();
  const add = (a: KnownAddress) => {
    const k = addrKey(a.ip, a.port);
    if (seen.has(k)) {
      const i = out.findIndex(x => addrKey(x.ip, x.port) === k);
      if (a.lastSeen > out[i].lastSeen) out[i] = { ...out[i], lastSeen: a.lastSeen };
      return;
    }
    seen.add(k);
    out.push({ ip: a.ip.trim(), port: Number(a.port) || 9000, lastSeen: Number(a.lastSeen) || 0 });
  };
  if (r.ipAddress) add({ ip: r.ipAddress, port: r.port, lastSeen: 0 });
  list.forEach(add);
  return out;
}

/** Stable identity of an entry: its robot's serial, else (not learned yet) its address. Used as React key. */
export function robotKey(r: RobotInfo): string {
  const s = serialOf(r);
  return s ? `id:${s}` : `addr:${addrKey(r.ipAddress, r.port)}`;
}

/** @deprecated Use robotKey — kept for callers that key lists by entry. */
export const connKey = robotKey;

/** Same physical robot: matching serial when both know it; otherwise any shared address. */
export function sameRobot(a: RobotInfo, b: RobotInfo): boolean {
  const sa = serialOf(a), sb = serialOf(b);
  if (sa && sb) return sa === sb;
  const ka = new Set(addressesOf(a).map(x => addrKey(x.ip, x.port)));
  return addressesOf(b).some(x => ka.has(addrKey(x.ip, x.port)));
}

/** Keeps the newest MAX_ADDRESSES addresses and drops long-unseen ones (never the primary, never all). */
function pruneAddresses(e: ConnEntry, now = Date.now()): ConnEntry {
  const primary = addrKey(e.ipAddress, e.port);
  let list = addressesOf(e);
  const fresh = list.filter(a => addrKey(a.ip, a.port) === primary || a.lastSeen === 0 || now - a.lastSeen < STALE_MS);
  if (fresh.length > 0) list = fresh;
  if (list.length > MAX_ADDRESSES) {
    const keep = [...list]
      .sort((x, y) => (addrKey(y.ip, y.port) === primary ? 1 : 0) - (addrKey(x.ip, x.port) === primary ? 1 : 0) || y.lastSeen - x.lastSeen)
      .slice(0, MAX_ADDRESSES);
    const keys = new Set(keep.map(a => addrKey(a.ip, a.port)));
    list = list.filter(a => keys.has(addrKey(a.ip, a.port)));
  }
  return { ...e, addresses: list };
}

const realName = (n: string | undefined) => (n && n !== "Manual" ? n : "");

/** Fold `extra` into `base` (base wins for the primary address and any info it has). */
function mergeEntries(base: ConnEntry, extra: ConnEntry): ConnEntry {
  return pruneAddresses({
    ...extra,
    ...base,
    robotName:    realName(base.robotName) || realName(extra.robotName) || base.robotName || extra.robotName,
    robotType:    base.robotType    || extra.robotType,
    serialNumber: serialOf(base)    || serialOf(extra),
    addresses:    [...addressesOf(base), ...addressesOf(extra)],
  });
}

/** Collapse a list to one entry per robot, earlier entries winning (lists are newest first). */
function collapse(list: ConnEntry[]): ConnEntry[] {
  const out: ConnEntry[] = [];
  for (const raw of list) {
    if (!raw || typeof raw.ipAddress !== "string") continue;
    const e = pruneAddresses(raw);
    const i = out.findIndex(o => sameRobot(o, e));
    if (i < 0) out.push(e);
    else out[i] = mergeEntries(out[i], e);
  }
  return out;
}

type Listener = () => void;
const listeners = new Set<Listener>();
let recents: ConnEntry[] = [];
let saved:   ConnEntry[] = [];

function emit() { listeners.forEach(l => l()); }

function parse(raw: string | null): ConnEntry[] {
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
      // Older builds stored one entry per address; collapsing merges those by serial (the
      // per-address entries become one robot with all of their addresses). Nothing is dropped.
      recents = collapse(parse(r)).slice(0, MAX_RECENTS);
      saved   = collapse(parse(s));
      // One-time migration: fold the old single "last manual ip" into recents.
      if (legacy && !recents.some(x => addressesOf(x).some(a => a.ip === legacy))) {
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

/** Addresses this robot (by serial) was reached at before — candidates when mDNS offers a bad one. */
export async function knownAddresses(serialNumber: string): Promise<string[]> {
  const serial = serialNumber.trim();
  if (!serial) return [];
  await ensureLoaded();
  return [...new Set([...recents, ...saved]
    .filter(r => serialOf(r) === serial)
    .flatMap(r => addressesOf(r).map(a => a.ip)))];
}

/**
 * Every address worth trying for this robot, best first: the robot's own address, then each
 * address a recent/saved entry for the same robot was reached on (most recently seen first),
 * ranked LAN before hostnames before overlay/VPN.
 */
export async function knownEndpoints(robot: RobotInfo): Promise<Endpoint[]> {
  await ensureLoaded();
  const matches = [...recents, ...saved].filter(e => sameRobot(e, robot));
  const all = [...addressesOf(robot), ...matches.flatMap(addressesOf)]
    .sort((a, b) => b.lastSeen - a.lastSeen);
  return rankEndpoints([
    { host: robot.ipAddress, port: robot.port },
    ...all.map(a => ({ host: a.ip, port: a.port })),
  ]);
}

export function getRecents(): ConnEntry[] { return recents; }
export function getSaved():   ConnEntry[] { return saved; }

/** True when this robot is starred — on whichever of its addresses it was found. */
export function isSaved(robot: RobotInfo): boolean {
  return saved.some(s => sameRobot(s, robot));
}

/** The saved or recent entry for this robot, if any (saved first). */
export function entryFor(robot: RobotInfo): ConnEntry | undefined {
  return saved.find(s => sameRobot(s, robot)) ?? recents.find(r => sameRobot(r, robot));
}

/** All addresses the store knows for this robot (its own plus every matching entry's). */
export function allAddressesFor(robot: RobotInfo): KnownAddress[] {
  return addressesOf({
    ...robot,
    addresses: [...recents, ...saved].filter(e => sameRobot(e, robot)).flatMap(addressesOf),
  } as ConnEntry);
}

/** `robot` (address = the one being used now) merged with every entry in `list` for the same robot. */
function upsert(list: ConnEntry[], robot: RobotInfo): { list: ConnEntry[]; entry: ConnEntry } {
  let entry: ConnEntry = pruneAddresses({ ...robot });
  const rest: ConnEntry[] = [];
  for (const e of list) {
    if (sameRobot(e, entry)) entry = mergeEntries(entry, e);
    else rest.push(e);
  }
  return { list: rest, entry };
}

/** Record a connection attempt — moves the robot to the front of recents (with this address as the
 *  one in use) and refreshes a matching saved entry the same way. */
export async function recordConnection(robot: RobotInfo): Promise<void> {
  await ensureLoaded();
  const r = upsert(recents, robot);
  recents = [r.entry, ...r.list].slice(0, MAX_RECENTS);
  if (saved.some(s => sameRobot(s, robot))) {
    const s = upsert(saved, robot);
    const at = saved.findIndex(x => sameRobot(x, robot));
    s.list.splice(Math.min(at, s.list.length), 0, s.entry);
    saved = s.list;
  }
  emit(); await persist();
}

/** Star or unstar a robot. Starring keeps every address the robot is known on. */
export async function toggleSaved(robot: RobotInfo): Promise<void> {
  await ensureLoaded();
  if (saved.some(s => sameRobot(s, robot))) {
    saved = saved.filter(s => !sameRobot(s, robot));
  } else {
    // Pull in what recents know about this robot (its other addresses, a learned name).
    const { entry } = upsert(recents, robot);
    saved = [entry, ...saved];
  }
  emit(); await persist();
}

/**
 * A connection to ipAddress:port succeeded and the controller reported who it is. Fill in the
 * entry's identity (name/type/serial — a typed-IP entry starts as a bare "Manual" placeholder),
 * mark the address as working and the one in use, and merge entries that turn out to be the same
 * robot. An address that now answers as a DIFFERENT robot is dropped from the other robot's entry.
 */
export async function enrichByAddress(
  ipAddress: string,
  port: number,
  patch: { robotName?: string; robotType?: string; serialNumber?: string },
): Promise<void> {
  await ensureLoaded();
  const now = Date.now();
  const k = addrKey(ipAddress, port);
  const serial = (patch.serialNumber ?? "").trim();
  const before = JSON.stringify([recents, saved]);

  const apply = (arr: ConnEntry[]) => collapse(arr.flatMap((e): ConnEntry[] => {
    const addrs = addressesOf(e);
    const es = serialOf(e);
    if (!addrs.some(a => addrKey(a.ip, a.port) === k)) {
      // The same robot reached on an address this entry didn't know yet: learn it and use it.
      if (!serial || es !== serial) return [e];
      return [pruneAddresses({ ...e, ipAddress, port, addresses: [...addrs, { ip: ipAddress, port, lastSeen: now }] })];
    }
    if (serial && es && es !== serial) {
      // This address belongs to another robot now — forget it here (keep the entry's others).
      const left = addrs.filter(a => addrKey(a.ip, a.port) !== k);
      if (left.length === 0) return [e];
      const primaryGone = addrKey(e.ipAddress, e.port) === k;
      return [{ ...e, ...(primaryGone ? { ipAddress: left[0].ip, port: left[0].port } : {}), addresses: left }];
    }
    return [{
      ...e,
      ipAddress, port,
      robotName:    realName(patch.robotName) || e.robotName,
      robotType:    patch.robotType || e.robotType,
      serialNumber: serial || es,
      addresses:    addrs.map(a => (addrKey(a.ip, a.port) === k ? { ...a, lastSeen: now } : a)),
    }];
  }));
  recents = apply(recents).slice(0, MAX_RECENTS);
  saved   = apply(saved);
  if (JSON.stringify([recents, saved]) !== before) { emit(); await persist(); }
}

/**
 * The robot with this serial was found answering at ip:port (discovery picked that address). Add it
 * to the robot's recent/saved entries so a later connect can try it — without changing the address
 * in use. Re-sightings of a known address only touch storage every few minutes.
 */
export async function learnAddress(serialNumber: string, ip: string, port: number): Promise<void> {
  const serial = serialNumber.trim();
  if (!serial || !ip) return;
  await ensureLoaded();
  const now = Date.now();
  const k = addrKey(ip, port);
  let changed = false;
  const apply = (arr: ConnEntry[]) => arr.map(e => {
    if (serialOf(e) !== serial) return e;
    const addrs = addressesOf(e);
    const cur = addrs.find(a => addrKey(a.ip, a.port) === k);
    if (cur && now - cur.lastSeen < SEEN_PERSIST_MS) return e;
    changed = true;
    return pruneAddresses({
      ...e,
      addresses: cur
        ? addrs.map(a => (a === cur ? { ...a, lastSeen: now } : a))
        : [...addrs, { ip, port, lastSeen: now }],
    });
  });
  recents = apply(recents);
  saved   = apply(saved);
  if (changed) { emit(); await persist(); }
}

/** Remove a robot (all of its addresses) from the recent list. */
export async function removeRecent(robot: RobotInfo): Promise<void> {
  await ensureLoaded();
  recents = recents.filter(r => !sameRobot(r, robot));
  emit(); await persist();
}

/** Subscribe a component to store changes; returns {recents, saved} and re-renders on update. */
export function useConnectionStore(): { recents: ConnEntry[]; saved: ConnEntry[] } {
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
