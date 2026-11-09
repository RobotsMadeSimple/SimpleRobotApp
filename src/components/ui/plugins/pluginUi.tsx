import { Platform } from "react-native";

import { appAlert } from "@/src/components/ui/AppAlert";
import { PillTone } from "@/src/components/ui/kit";
import type { PluginState, PluginSummary } from "@/src/models/robotModels";

/** Pill look for a plugin state: running green, degraded amber, crashed/error red,
 *  stopped/disabled grey, installing/starting blue. */
export const STATE_TONE: Record<PluginState, PillTone> = {
  running:    "success",
  degraded:   "warning",
  crashed:    "danger",
  error:      "danger",
  stopped:    "neutral",
  disabled:   "neutral",
  installing: "accent",
  starting:   "accent",
};

export function stateTone(state: string): PillTone {
  return STATE_TONE[state as PluginState] ?? "neutral";
}

export function stateLabel(state: string): string {
  return state ? state[0].toUpperCase() + state.slice(1) : "Unknown";
}

/** The plugin needs attention: crashed/error process, or it reported degraded/error. */
export function pluginNeedsAttention(p: { state: string; statusState?: string | null }): boolean {
  return p.state === "crashed" || p.state === "error" || p.state === "degraded"
    || p.statusState === "degraded" || p.statusState === "error";
}

export function runtimeLabel(runtime: string | undefined): string {
  switch (runtime) {
    case "python":   return "Python";
    case "dotnet":   return ".NET";
    case "exe":      return "Executable";
    case "external": return "External";
    default:         return runtime ?? "";
  }
}

/** The plugin's process is up or on its way up (Stop / Restart make sense). */
export function isActive(p: Pick<PluginSummary, "state">): boolean {
  return p.state === "running" || p.state === "degraded" || p.state === "starting" || p.state === "installing";
}

export function errText(e: unknown): string {
  return e instanceof Error ? e.message : typeof e === "string" ? e : "The controller didn't answer.";
}

export function showError(title: string, e: unknown) {
  appAlert(title, errText(e));
}

/** Copy text to the clipboard. No clipboard package is installed, so this works on
 *  web / Electron only; elsewhere it reports false and the caller shows the value. */
export async function copyText(text: string): Promise<boolean> {
  try {
    const nav: any = typeof navigator !== "undefined" ? navigator : null;
    if (nav?.clipboard?.writeText) {
      await nav.clipboard.writeText(text);
      return true;
    }
  } catch { /* fall through */ }
  return false;
}

export const IS_WEB = Platform.OS === "web";

export function formatUptime(startedUnixMs: number, now = Date.now()): string {
  if (!startedUnixMs) return "-";
  let s = Math.max(0, Math.floor((now - startedUnixMs) / 1000));
  const d = Math.floor(s / 86400); s -= d * 86400;
  const h = Math.floor(s / 3600);  s -= h * 3600;
  const m = Math.floor(s / 60);    s -= m * 60;
  if (d) return `${d}d ${h}h`;
  if (h) return `${h}h ${m}m`;
  if (m) return `${m}m ${s}s`;
  return `${s}s`;
}
