import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { Platform } from "react-native";

import type {
  AlarmCatalogEntry, AlarmPage, EstopConfig, EstopState, RestorePreview, RestoreResult,
} from "@/src/models/safetyModels";
import { robotClient } from "@/src/services/RobotConnectService";

// E-stop, alarms and backup/restore against the connected controller. Kept apart from
// RobotConnectService so the shared service stays untouched; commands go out on the same socket.

/** A failed command with the controller's `error` code and its human `message`. */
export class SafetyCommandError extends Error {
  constructor(public readonly code: string, message: string, public readonly ack?: Record<string, unknown>) {
    super(message);
    this.name = "SafetyCommandError";
  }
}

/**
 * Sends a command and resolves the whole ack, keeping `message` (robotClient.sendCommand reduces a
 * failure to its `error` code). The ack is matched by id on the shared socket's message stream.
 */
function command(name: string, params: Record<string, unknown> = {}, timeoutMs = 10000): Promise<Record<string, unknown>> {
  if (!robotClient.connected) return Promise.reject(new SafetyCommandError("notConnected", "Not connected to a controller."));
  const id = `safety-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { off(); reject(new SafetyCommandError("timeout", `${name} timed out.`)); }, timeoutMs);
    const off = robotClient.onMessage((data: any) => {
      if (data?.type !== "ack" || data.id !== id) return;
      clearTimeout(timer);
      off();
      if (data.ok === false) {
        reject(new SafetyCommandError(String(data.error ?? "failed"), String(data.message ?? data.error ?? `${name} failed`), data));
      } else {
        resolve(data as Record<string, unknown>);
      }
    });
    robotClient.send({ type: "Command", id, command: name, params });
  });
}

export function errorText(e: unknown): string {
  if (e instanceof Error) return e.message;
  return typeof e === "string" ? e : "Something went wrong.";
}

// ── Emergency stop ─────────────────────────────────────────────────────────

export async function getEstopConfig(): Promise<{ config: EstopConfig; state: EstopState }> {
  const ack = await command("GetEstopConfig");
  return { config: ack.config as EstopConfig, state: ack.state as EstopState };
}

export async function setEstopConfig(patch: Partial<EstopConfig>): Promise<{ config: EstopConfig; state: EstopState }> {
  const ack = await command("SetEstopConfig", patch as Record<string, unknown>);
  return { config: ack.config as EstopConfig, state: ack.state as EstopState };
}

/** Resolves the success message; rejects with the reason (e.g. the input still reads open). */
export async function resetEstop(): Promise<string> {
  const ack = await command("ResetEstop");
  return typeof ack.message === "string" ? ack.message : "E-stop reset.";
}

// ── Alarms ─────────────────────────────────────────────────────────────────

let catalogCache: AlarmCatalogEntry[] | null = null;

/** The controller's alarm help (one catalog, cached for the session). */
export async function getAlarmCatalog(force = false): Promise<AlarmCatalogEntry[]> {
  if (catalogCache && !force) return catalogCache;
  const ack = await command("GetAlarmCatalog");
  catalogCache = Array.isArray(ack.alarms) ? (ack.alarms as AlarmCatalogEntry[]) : [];
  return catalogCache;
}

export async function getAlarms(offset = 0, limit = 50, activeOnly = false): Promise<AlarmPage> {
  const ack = await command("GetAlarms", { offset, limit, activeOnly });
  return {
    total: Number(ack.total ?? 0),
    activeCount: Number(ack.activeCount ?? 0),
    offset: Number(ack.offset ?? offset),
    lastAlarmUpdate: Number(ack.lastAlarmUpdate ?? 0),
    alarms: Array.isArray(ack.alarms) ? (ack.alarms as AlarmPage["alarms"]) : [],
  };
}

/** One alarm by id, or every alarm when id is omitted. */
export async function acknowledgeAlarm(id?: string): Promise<number> {
  const ack = await command("AcknowledgeAlarm", id ? { id } : { all: true });
  return Number(ack.acknowledged ?? 0);
}

export async function clearAlarms(): Promise<number> {
  const ack = await command("ClearAlarms");
  return Number(ack.removed ?? 0);
}

// ── Backup & restore ───────────────────────────────────────────────────────

function base(): string {
  const b = robotClient.httpBaseUrl();
  if (!b) throw new SafetyCommandError("notConnected", "Not connected to a controller.");
  return b;
}

function filenameFrom(res: Response, fallback: string): string {
  const cd = res.headers.get("Content-Disposition") ?? "";
  const m = /filename="?([^";]+)"?/i.exec(cd);
  return m?.[1] ?? fallback;
}

/**
 * Downloads the whole-controller backup: a browser download on web/Electron, the share sheet
 * (expo-sharing) on Android/iOS. Resolves the file name.
 */
export async function downloadBackup(): Promise<string> {
  const url = `${base()}/backup`;
  const fallback = `controller-backup-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.zip`;

  if (Platform.OS === "web") {
    const res = await fetch(url);
    if (!res.ok) throw await httpError(res, "Backup failed");
    const name = filenameFrom(res, fallback);
    const blob = await res.blob();
    const href = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = href;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(href), 1000);
    return name;
  }

  const target = (FileSystem.cacheDirectory ?? "") + fallback;
  const dl = await FileSystem.downloadAsync(url, target);
  if (dl.status !== 200) throw new SafetyCommandError(`http${dl.status}`, `Backup failed (${dl.status}).`);
  const header = (dl.headers?.["Content-Disposition"] ?? dl.headers?.["content-disposition"] ?? "") as string;
  const name = /filename="?([^";]+)"?/i.exec(header)?.[1] ?? fallback;
  let uri = dl.uri;
  if (name !== fallback) {
    const renamed = (FileSystem.cacheDirectory ?? "") + name;
    try { await FileSystem.moveAsync({ from: dl.uri, to: renamed }); uri = renamed; } catch { /* keep the fallback name */ }
  }
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, { mimeType: "application/zip", dialogTitle: name, UTI: "public.zip-archive" });
  }
  return name;
}

async function httpError(res: Response, fallback: string): Promise<SafetyCommandError> {
  let body: any = null;
  try { body = await res.json(); } catch { /* not JSON */ }
  return new SafetyCommandError(
    typeof body?.error === "string" ? body.error : `http${res.status}`,
    typeof body?.message === "string" && body.message ? body.message : `${fallback} (${res.status}).`,
  );
}

async function postRestore(fileUri: string, apply: boolean): Promise<RestoreResult> {
  const blob = await (await fetch(fileUri)).blob();
  const res = await fetch(`${base()}/backup/restore${apply ? "?apply=true" : ""}`, {
    method: "POST",
    headers: { "Content-Type": "application/zip" },
    body: blob,
  });
  if (!res.ok) throw await httpError(res, apply ? "Restore failed" : "Could not read the backup");
  return (await res.json()) as RestoreResult;
}

/** Validates a picked backup zip and returns what a restore would replace. Changes nothing. */
export async function previewRestore(fileUri: string): Promise<RestorePreview> {
  return (await postRestore(fileUri, false)).preview;
}

/** Applies the restore; the controller then restarts to load the restored data. */
export function applyRestore(fileUri: string): Promise<RestoreResult> {
  return postRestore(fileUri, true);
}
