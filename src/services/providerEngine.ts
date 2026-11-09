import * as Battery from "expo-battery";
import * as Location from "expo-location";
import { Accelerometer, Gyroscope, LightSensor, Magnetometer } from "expo-sensors";
import { AppState, Platform } from "react-native";
import {
  mediaDevices, MediaStream, RTCIceCandidate, RTCPeerConnection, RTCSessionDescription,
} from "react-native-webrtc";

import {
  startForegroundStreaming, stopForegroundStreaming, type ForegroundServiceType,
} from "@/modules/provider-foreground";
import {
  ensurePhoneIdentity, getAssignedDeviceId, setAssignedDeviceId,
} from "@/src/services/phoneIdentity";
import { robotClient } from "@/src/services/RobotConnectService";

// ─────────────────────────────────────────────────────────────────────────────
// Provider engine
//
// Owns the phone's streaming session OUTSIDE React, so it keeps running when you navigate away from
// the provider screen or turn the screen off. The old implementation lived in the screen's effects
// and tore down on unmount; this singleton is the "keep serving data regardless of the screen" piece.
//
// It drives a native Android foreground service (camera / location / connectedDevice types, see
// foregroundTypes) so Android 14+
// permits background camera access and doesn't kill the process. The visible preview is still the
// controller's decoded round-trip (CameraLiveFeed) — the engine renders nothing itself.
//
// Transport is WebRTC only (hardware H.264): the controller decodes it to JPEG and fills the same
// "phone" camera every consumer reads. Sensors stream as batched channel values over the device's
// ingest socket.
// ─────────────────────────────────────────────────────────────────────────────

const SENSOR_MS = 100;   // sensor sampling interval
const FLUSH_MS  = 200;   // how often batched channel values are pushed
const PERSIST_MS = 600;  // debounce for saving config back to the controller
const SYNC_MS = 2000;    // how often the saved config (and, on other phones, the live values) is re-read
const LOCAL_EDIT_HOLD_MS = 2500;   // ignore the saved config this long after a local edit (it's still being written)

// Camera stream watchdog. The peer connection can keep reporting "connected" while no video flows —
// e.g. Android hands the camera to another app (it never gives it back to us on its own), the encoder
// stalls, or the controller ends its side. So "is it working" is judged by frames actually going out.
const STALL_MS = 4000;             // no new frame encoded/sent for this long → restart the stream
const FIRST_FRAME_MS = 12000;      // a new stream gets this long to start sending frames
const RESTART_BASE_MS = 1000;      // first restart delay; doubles per failed attempt…
const RESTART_MAX_MS = 15000;      // …up to this
const CAMERA_OPEN_MS = 8000;       // give up on a camera open that hasn't finished by then
const HEALTH_MS = 5 * 60_000;      // how often a streaming phone logs one health line (leak watch)
// A settings change (resolution, fps, aspect, lens, orientation) rebuilds the whole camera pipeline:
// new capturer, new peer connection, new hardware encoder. Tapping through the options used to do that
// once per tap (13 rebuilds in 4 min on the S22+), so changes are coalesced: the rebuild waits until
// the settings stop changing, and two rebuilds are never closer together than the minimum gap.
const REBUILD_SETTLE_MS = 800;
const REBUILD_MIN_GAP_MS = 3000;

/** One plain log line. console.log, not console.warn: in a dev build every warn is kept by LogBox,
 *  so a phone left streaming for hours would pile them up in memory. */
const log = (msg: string) => console.log(`[Provider] ${msg}`);

/**
 * Release a camera stream for good. In react-native-webrtc `track.stop()` only stops the capture: the
 * native track, its video source, the capturer and its capture thread/GL context stay allocated until
 * `release()`. Without it every watchdog restart leaked one full camera pipeline (native memory
 * and a thread), which is what made a phone left streaming for hours fall over.
 */
export function releaseStream(stream: MediaStream | null | undefined): void {
  if (!stream) return;
  providerHealth.released++;
  try { stream.getTracks().forEach(t => { try { t.stop(); } catch { /* already ended */ } }); } catch { /* noop */ }
  try { (stream as unknown as { release?: () => void }).release?.(); } catch { /* web / already released */ }
}

/**
 * The foreground-service types to hold. Never `dataSync` while the camera or location is on: since
 * Android 15 a dataSync service may only run 6 hours a day, and when that runs out the app crashes
 * (ForegroundServiceDidNotStopInTimeException) — the "crashes after a while" of a streaming phone.
 * `camera` and `location` have no time limit and keep the process (and its sockets) alive just the
 * same. Sensors alone use `connectedDevice` (no limit either: the phone is feeding an external
 * controller); a build whose service predates that type falls back to dataSync by itself.
 * `camera` needs the CAMERA permission, so it is only asked for while the camera is on.
 */
export function foregroundTypes(camOn: boolean, locationOn: boolean): ForegroundServiceType[] {
  const types: ForegroundServiceType[] = [];
  if (camOn) types.push("camera");
  if (locationOn) types.push("location");
  if (!types.length) types.push("connectedDevice");
  return types;
}

/**
 * Live counts of what the camera pipeline holds, for the health line (and the leak test).
 * Every build creates one hardware encoder and every `resizes` is WebRTC re-creating it at a new
 * frame size, so builds + resizes is the encoder re-init count. `released` should keep pace with
 * builds: a stream that is never released keeps its capture thread and EGL context, and once the
 * process runs out of EGL contexts the next encoder init aborts the app inside libwebrtc.
 */
export const providerHealth = {
  pcOpen: 0, streamsOpen: 0, tracksOpen: 0, restarts: 0, builds: 0, released: 0, resizes: 0,
};

export type ResTier = "low" | "med" | "high";

// `height` is the capture size requested from the camera. Bitrate is a separate, user-adjustable
// setting (see `bitrate` below) — not tied to the resolution — so quality can be tuned live.
export const RES_TIERS: Record<ResTier, { label: string; height: number }> = {
  low:  { label: "Low",   height: 240 },
  med:  { label: "720p",  height: 720 },
  high: { label: "1080p", height: 1080 },
};
export const RES_OPTIONS = (Object.keys(RES_TIERS) as ResTier[]).map(v => ({ label: RES_TIERS[v].label, value: v }));
export const RES_TIER_VALUES = RES_OPTIONS.map(o => o.value);

// Frame shape requested from the camera. Phone sensors are 4:3: a 16:9 frame is cut from the
// middle of it (top and bottom lost), so 4:3 gives the whole field of view the lens has.
export type FrameAspect = "4:3" | "16:9";
export const ASPECT_OPTIONS: { label: string; value: FrameAspect }[] = [
  { label: "4:3 (full view)", value: "4:3" },
  { label: "16:9", value: "16:9" },
];

// Which way up the stream is, as a clockwise turn of the camera's picture (portrait = as the app shows
// it). The phone turns each frame itself before encoding, so this is independent of how the phone or
// its screen is turned. The rotate button steps through the four, a quarter turn at a time.
export type StreamOrientation = "portrait" | "landscape" | "portrait-flipped" | "landscape-flipped";
export const ORIENT_TURNS: StreamOrientation[] = ["portrait", "landscape", "portrait-flipped", "landscape-flipped"];
export const ORIENT_OPTIONS: { label: string; value: "portrait" | "landscape" }[] = [
  { label: "Portrait", value: "portrait" },
  { label: "Landscape", value: "landscape" },
];
/** The orientation a quarter turn clockwise from `o`. */
export function nextOrientation(o: StreamOrientation): StreamOrientation {
  return ORIENT_TURNS[(ORIENT_TURNS.indexOf(o) + 1) % ORIENT_TURNS.length];
}

// Target capture/encode frame rates (string values for SegmentedControl).
export const RTC_FPS_OPTIONS: { label: string; value: string }[] = [
  { label: "15", value: "15" },
  { label: "30", value: "30" },
  { label: "60", value: "60" },
];

// Adjustable sender bitrate CAP (bits/sec). WebRTC adapts dynamically *below* this under congestion;
// this is the ceiling. It's the quality knob: too low at high res/fps and H.264 quantizes hard (the
// "oil-painting" smear). Applied live via setParameters (no stream restart). On a LAN, higher is fine.
// Capped around the controller's single-threaded H.264 decode limit for 1080p30 (~12 Mbps): beyond
// that the decoder falls behind and error-conceals during motion ("oil-paint" smear), which looks
// WORSE than a lower bitrate. 12 is the sweet spot.
export const RTC_BITRATE_OPTIONS: { label: string; value: string }[] = [
  { label: "6",  value: "6000000"  },
  { label: "9",  value: "9000000"  },
  { label: "12", value: "12000000" },
  { label: "16", value: "16000000" },
];
const MIN_BITRATE = 1_000_000;
const MAX_BITRATE = 60_000_000;

// Provider settings persisted on the CONTROLLER (per device, as an opaque JSON blob) and pulled by
// whichever phone provides for the device. Camera on/off is deliberately NOT part of this.
export type ProviderConfig = {
  resTier: ResTier;
  /** Frame shape: 4:3 = the sensor's full view, 16:9 = cropped top and bottom. */
  aspect: FrameAspect;
  rtcFps: string;
  /** Sender bitrate cap in bits/sec (the quality ceiling; applied live). */
  bitrate: number;
  /** Whether the camera stream is on. Persisted so a provider phone auto-resumes streaming after a
   *  reconnect / app restart instead of needing a manual toggle. */
  camOn: boolean;
  /** Preferred camera lens (getUserMedia deviceId). Phone-specific, applied best-effort — a phone
   *  without this exact lens falls back to the rear camera. */
  lensId: string | null;
  /** Which way up the stream is (a turn of the picture, independent of how the phone is held). */
  orientation: StreamOrientation;
  motionOn: boolean;
  lightOn: boolean;
  locationOn: boolean;
  batteryOn: boolean;
  /** The assigned phone's cameras, published by it so other phones can offer the lens picker. */
  lenses: Lens[];
  /** Which phone (its stable id) is assigned to provide for this device. Only that phone streams;
   *  any phone can view and change these settings, and the assigned phone picks the changes up. */
  assignedPhoneId: string | null;
  /** The assigned phone's friendly name, for display on other phones / the I/O list. */
  assignedPhoneName: string | null;
};

export const DEFAULT_PROVIDER_CONFIG: ProviderConfig = {
  resTier: "med", aspect: "4:3", rtcFps: "30", bitrate: 12_000_000, camOn: false, lensId: null, orientation: "portrait",
  motionOn: false, lightOn: false, locationOn: false, batteryOn: false, lenses: [],
  assignedPhoneId: null, assignedPhoneName: null,
};

const CAM_KEYS: (keyof ProviderConfig)[] = ["resTier", "aspect", "rtcFps", "lensId", "orientation"];
const SENSOR_KEYS: (keyof ProviderConfig)[] = ["motionOn", "lightOn", "locationOn", "batteryOn"];
const changed = (a: ProviderConfig, b: ProviderConfig, keys: (keyof ProviderConfig)[]) => keys.some(k => a[k] !== b[k]);

/** One selectable camera on the phone, from enumerateDevices(). */
export type Lens = { id: string; label: string; facing?: string };

export type RtcStats = {
  fps: number; w: number; h: number; kbps: number;
  /** Why WebRTC is holding the encoder back ("cpu", "bandwidth", "other"), when it is. */
  limit?: string;
};

/**
 * The controller's side of the stream, sent once a second over the signaling socket. The sender's
 * own stats only say frames are going out; these say whether a clean picture is coming out the other
 * end (lost packets are NACKed; an unrecoverable loss freezes the picture until a key frame).
 */
export type RxStats = {
  /** Frames arriving per second (complete or not). */
  rxFps: number;
  /** Clean pictures decoded per second — what the preview, snapshots and vision actually get. */
  decodedFps: number;
  /** Frames dropped (incomplete, or not decodable while waiting for a key frame), since the stream began. */
  dropped: number;
  /** Packets that never arrived in time / that were lost and then retransmitted. */
  lost: number;
  recovered: number;
  /** Key frames requested (PLI) / received. */
  keyRequests: number;
  keyFrames: number;
  /** Packets were lost: the picture is frozen on the last clean frame until a key frame arrives. */
  waitingForKeyFrame: boolean;
  /** Ms since the last clean picture (-1 = none yet). */
  msSincePicture: number;
  reason?: string;
  /** Rate arriving at the controller (kbps, resends included). */
  rxKbps: number;
  /** The bitrate the controller asks this phone to stay under (kbps) because the link overran, or
   *  null for no limit. Applied to the encoder under the user's own bitrate setting. */
  capKbps: number | null;
  /** How often the controller has lowered that cap. */
  capLowered: number;
  /** Typical time for a resend to come back after the controller asked for it (ms; 0 = not measured). */
  resendRttMs: number;
};

/** Parses a controller `{type:"stats"}` signal; null if it isn't one. */
export function parseRxStats(m: unknown): RxStats | null {
  const o = m as Record<string, unknown> | null;
  if (!o || o.type !== "stats") return null;
  const n = (k: string) => (typeof o[k] === "number" && Number.isFinite(o[k]) ? (o[k] as number) : 0);
  return {
    rxFps: n("rxFps"), decodedFps: n("decodedFps"), dropped: n("dropped"), lost: n("lost"), recovered: n("recovered"),
    keyRequests: n("keyRequests"), keyFrames: n("keyFrames"), waitingForKeyFrame: o.waitingForKeyFrame === true,
    msSincePicture: typeof o.msSincePicture === "number" ? o.msSincePicture : -1,
    reason: typeof o.reason === "string" ? o.reason : undefined,
    rxKbps: n("rxKbps"),
    capKbps: typeof o.capKbps === "number" && Number.isFinite(o.capKbps) && o.capKbps > 0 ? o.capKbps : null,
    capLowered: n("capLowered"),
    resendRttMs: n("resendRttMs"),
  };
}

/** The bitrate the encoder should run at: the user's setting, under the controller's cap if it set one. */
export function effectiveBitrate(userBps: number, capKbps: number | null | undefined): number {
  if (!capKbps || capKbps <= 0) return userBps;
  return Math.max(MIN_BITRATE, Math.min(userBps, Math.round(capKbps * 1000)));
}

const mbps = (kbps: number) => {
  const m = kbps / 1000;
  return m >= 10 ? String(Math.round(m)) : String(Math.round(m * 10) / 10);
};

/**
 * Force the H.264 encoder's start/min/max bitrate via SDP. `maxBitrate` from setParameters is only a
 * ceiling; the live rate is chosen by WebRTC's bandwidth estimator (BWE), which — when the receiver
 * sends no usable REMB/transport-cc feedback (SIPSorcery) — never ramps past its ~300–600 kbps start
 * rate. Injecting `x-google-start-bitrate`/`x-google-min-bitrate` into the video codec's fmtp line
 * (plus a `b=AS`/`b=TIAS` cap) makes the encoder jump to and hold a high rate regardless of BWE.
 * Values are in kbps for x-google and b=AS, bps for b=TIAS.
 */
function forceBitrateSdp(sdp: string, bps: number): string {
  const kbps = Math.max(1, Math.round(bps / 1000));
  // Pin start = min = max = target. With no usable BWE feedback from the receiver, a range lets the
  // encoder either collapse (~500 kbps) or run open-loop and overshoot the cap (overloading the
  // controller's single-threaded decode); a single value holds a predictable CBR-style target.
  const extra = `;x-google-start-bitrate=${kbps};x-google-min-bitrate=${kbps};x-google-max-bitrate=${kbps}`;
  const out: string[] = [];
  let inVideo = false;
  for (const line of sdp.split(/\r?\n/)) {
    if (line.startsWith("m=")) inVideo = line.startsWith("m=video");
    // Add a bandwidth cap right after the media connection line of the video section.
    if (inVideo && line.startsWith("c=")) {
      out.push(line);
      out.push(`b=AS:${kbps}`);
      out.push(`b=TIAS:${bps}`);
      continue;
    }
    // Append the x-google hints to each video fmtp line (harmless on non-primary payloads).
    if (inVideo && /^a=fmtp:\d+ /.test(line) && !line.includes("x-google")) {
      out.push(line + extra);
      continue;
    }
    out.push(line);
  }
  return out.join("\r\n");
}

/**
 * One honest line about what the controller is getting: clean pictures decoded per second, packets
 * resent / lost for good, frames dropped, and whether it lowered the bitrate (only said when the cap
 * is under the user's own setting, `userBps`, so it actually binds). `bad` = the picture is frozen
 * (waiting for a key frame) or decoding well below what arrives.
 */
export function describeRxStats(rx: RxStats, userBps?: number): { text: string; bad: boolean } {
  const fps = (v: number) => (v >= 10 ? Math.round(v) : Math.round(v * 10) / 10);
  const extra: string[] = [];
  if (rx.recovered > 0) extra.push(`resent ${rx.recovered} lost packets`);
  if (rx.lost > 0) extra.push(`${rx.lost} lost for good`);
  if (rx.dropped > 0) extra.push(`${rx.dropped} frames dropped`);
  if (rx.capKbps && (userBps === undefined || rx.capKbps * 1000 < userBps)) {
    extra.push(`lowered bitrate to ${mbps(rx.capKbps)} Mbps (the link couldn't carry more)`);
  }
  if (rx.waitingForKeyFrame) {
    const since = rx.msSincePicture >= 0 ? ` for ${(rx.msSincePicture / 1000).toFixed(1)} s` : "";
    return {
      text: `Controller: picture frozen${since} — packets were lost, waiting for a key frame (asked ${rx.keyRequests}×)`
        + (extra.length ? ` · ${extra.join(" · ")}` : "") + ".",
      bad: true,
    };
  }
  const parts = [`Controller: ${fps(rx.decodedFps)} fps decoded`, ...extra];
  return { text: parts.join(" · ") + ".", bad: rx.rxFps >= 2 && rx.decodedFps < rx.rxFps * 0.5 };
}

const isFront = (l: Lens) => { const f = (l.facing || "").toLowerCase(); return f === "front" || f === "user"; };

/** Short label for a lens in the picker: the front camera, else a numbered lens (labels vary by OEM).
 *  Pass the whole list so phones with several front cameras get "Front 1", "Front 2"… */
export function lensLabel(l: Lens, i: number, all?: Lens[]): string {
  if (isFront(l)) {
    const fronts = (all ?? []).filter(isFront);
    if (fronts.length > 1) return `Front ${fronts.findIndex(x => x.id === l.id) + 1}`;
    return "Front";
  }
  const k = all ? all.filter(x => !isFront(x)).findIndex(x => x.id === l.id) : -1;
  return `Lens ${(k >= 0 ? k : i) + 1}`;
}

/** The engine's observable state — what the provider screen renders. */
export type ProviderEngineState = {
  /** Streaming intent is on (camera and/or any sensor), so the foreground service is running. */
  active: boolean;
  deviceId: string | null;
  deviceName: string;
  camOn: boolean;
  camId: string | null;
  rtcState: string;
  rtcStats: RtcStats | null;
  /** The controller's receive-side stats (null until it reports; older controllers never do). */
  rxStats: RxStats | null;
  devLive: boolean;
  values: Record<string, number>;
  lenses: Lens[];
  config: ProviderConfig;
  configLoaded: boolean;
  /** This phone's stable id has loaded (assignment can be resolved). */
  identityReady: boolean;
  /** This device is assigned to THIS phone — the full provider UI + streaming are allowed. */
  assignedHere: boolean;
  /** The phone currently assigned to this device (id/name), if any — for the "assigned elsewhere" notice. */
  assignedPhoneId: string | null;
  assignedPhoneName: string | null;
};

// The subset of WebRTC getStats() report fields we read for the live fps/resolution/bitrate readout.
type RtcReport = {
  type?: string; kind?: string; mediaType?: string;
  bytesSent?: number; timestamp?: number; framesPerSecond?: number; framesEncoded?: number; framesSent?: number;
  frameWidth?: number; frameHeight?: number; width?: number; height?: number;
  qualityLimitationReason?: string;
};

type Sub = { remove: () => void };

class ProviderEngine {
  // ── Observable state ──
  private listeners = new Set<(s: ProviderEngineState) => void>();
  private deviceId: string | null = null;
  private deviceName = "Phone";
  private camOn = false;
  private camId: string | null = null;
  private rtcState = "";
  private rtcStats: RtcStats | null = null;
  private rxStats: RxStats | null = null;
  /** The controller's bitrate cap (kbps) currently applied to the encoder, null = none. */
  private rtcCapKbps: number | null = null;
  private devLive = false;
  private values: Record<string, number> = {};
  private lenses: Lens[] = [];
  private config: ProviderConfig = { ...DEFAULT_PROVIDER_CONFIG };
  private configLoaded = false;

  // ── Identity / assignment ──
  private thisPhoneId: string | null = null;
  private thisPhoneName = "Phone";
  private identityReady = false;
  private identityPromise: Promise<void> | null = null;

  // ── Internal machinery ──
  private connected = false;
  private connSub: (() => void) | null = null;
  private pendingAutostart = false;

  // Camera (WebRTC) pipeline
  private pc: RTCPeerConnection | null = null;
  private camWs: WebSocket | null = null;
  private stream: MediaStream | null = null;
  private statsTimer: ReturnType<typeof setInterval> | null = null;
  private camGen = 0;   // bumped to invalidate in-flight camera builds
  private encodingBusy = false;   // a setParameters call is in flight
  private encodingAgain = false;  // another change came in meanwhile — apply once more after it
  private healthTimer: ReturnType<typeof setInterval> | null = null;
  private fgsKey = "";            // types + text last sent to the foreground service ("" = stopped)
  // Watchdog / recovery
  private camStartedAt = 0;      // when the current stream build began
  private lastFlowAt = 0;        // last time the sender's frame count went up (0 = no frame yet)
  private restartTimer: ReturnType<typeof setTimeout> | null = null;
  private settingsRebuildTimer: ReturnType<typeof setTimeout> | null = null;   // coalesced settings rebuild
  private restartAttempts = 0;  // consecutive restarts without frames flowing (drives the backoff)
  private appStateSub: { remove: () => void } | null = null;

  // Sensor pipeline
  private devWs: WebSocket | null = null;
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private sensorSubs: Sub[] = [];
  private locSub: Location.LocationSubscription | null = null;
  private pending: Record<string, number> = {};
  private sensorGen = 0;

  private persistTimer: ReturnType<typeof setTimeout> | null = null;
  private syncTimer: ReturnType<typeof setInterval> | null = null;
  private syncBusy = false;
  private lastLocalEdit = 0;

  private get active(): boolean {
    if (!this.assignedHere) return false; // only the assigned phone streams / holds the service
    const c = this.config;
    return this.camOn || c.motionOn || c.lightOn || c.locationOn || c.batteryOn;
  }

  /** This device is assigned to this phone (so it's allowed to stream + show the full UI). */
  private get assignedHere(): boolean {
    return !!this.thisPhoneId && this.config.assignedPhoneId === this.thisPhoneId;
  }

  // ── Subscription ───────────────────────────────────────────────────────────
  subscribe(cb: (s: ProviderEngineState) => void): () => void {
    this.listeners.add(cb);
    cb(this.getState());
    return () => { this.listeners.delete(cb); };
  }

  getState(): ProviderEngineState {
    return {
      active: this.active,
      deviceId: this.deviceId,
      deviceName: this.deviceName,
      camOn: this.assignedHere ? this.camOn : this.config.camOn,
      camId: this.camId,
      rtcState: this.rtcState,
      rtcStats: this.rtcStats,
      rxStats: this.rxStats,
      devLive: this.devLive,
      values: this.values,
      lenses: this.assignedHere ? this.lenses : this.config.lenses,
      config: this.config,
      configLoaded: this.configLoaded,
      identityReady: this.identityReady,
      assignedHere: this.assignedHere,
      assignedPhoneId: this.config.assignedPhoneId,
      assignedPhoneName: this.config.assignedPhoneName,
    };
  }

  private publish() {
    const s = this.getState();
    this.listeners.forEach(cb => cb(s));
  }

  // ── Lifecycle (called by the provider screen) ───────────────────────────────
  /**
   * Point the engine at a device and (optionally) begin streaming. If the engine is already
   * streaming for this same device (e.g. the user navigated back to the screen), the ongoing session
   * is preserved rather than restarted.
   */
  open(opts: { deviceId?: string; deviceName?: string; autostart?: boolean }) {
    this.ensureConnSub();
    this.ensureSync();
    const deviceId = opts.deviceId ?? null;
    const sameDevice = this.deviceId === deviceId;

    // Same device: never restart an in-flight or running session (both ProviderAutoStart and the
    // provider screen call open() on launch — a restart here churns the stream). Just refresh.
    if (sameDevice && this.deviceId) {
      if (opts.deviceName) this.deviceName = opts.deviceName;
      if (opts.autostart && !this.camOn) this.setCamOn(true);
      this.refreshLenses();
      this.publish();
      return;
    }

    // Switching to a different device: cleanly stop the previous session first.
    if (this.deviceId && !sameDevice) this.stopInternal();

    this.deviceId = deviceId;
    if (opts.deviceName) this.deviceName = opts.deviceName;
    this.connected = robotClient.connected;
    this.pendingAutostart = !!opts.autostart;
    this.configLoaded = false;
    this.publish();
    this.loadConfig();
  }

  /** Turn the camera stream on/off. */
  setCamOn(on: boolean) {
    // Another phone only saves the intent; the assigned phone picks it up and streams.
    if (!this.assignedHere) { if (this.config.camOn !== on) this.updateConfig({ camOn: on }); return; }
    if (this.camOn === on) return;
    this.camOn = on;
    this.restartAttempts = 0;
    this.config = { ...this.config, camOn: on };   // persist so it auto-resumes after reconnect
    this.persistConfig();
    if (on) this.rebuildCamera();
    else this.teardownCamera();
    this.syncForeground();
    this.publish();
  }

  /** Merge a settings change, persist it, and rebuild whatever it affects. */
  updateConfig(patch: Partial<ProviderConfig>) {
    const prev = this.config;
    this.config = { ...prev, ...patch };
    this.lastLocalEdit = Date.now();
    this.persistConfig();
    this.applyChanges(prev);
    this.publish();
  }

  /** Restart whatever a settings change affects on the assigned phone (other phones stream nothing). */
  private applyChanges(prev: ProviderConfig) {
    if (!this.assignedHere) return;
    const c = this.config;
    if (changed(prev, c, CAM_KEYS) && this.camOn) this.requestCamRebuild();
    // Bitrate changes apply live on the running sender — no capture restart needed.
    else if (prev.bitrate !== c.bitrate && this.camOn) this.applyEncodingLive();
    if (changed(prev, c, SENSOR_KEYS)) this.rebuildSensors();
    this.syncForeground();
  }

  // ── Sync with the saved config (edits made on other phones) ─────────────────
  private ensureSync() {
    if (this.syncTimer) return;
    this.syncTimer = setInterval(() => { this.syncOnce(); }, SYNC_MS);
  }

  private async syncOnce() {
    const deviceId = this.deviceId;
    if (!deviceId || !this.configLoaded || !robotClient.connected || this.syncBusy) return;
    this.syncBusy = true;
    try {
      const dev = (await robotClient.getDevices()).find(d => d.id === deviceId);
      if (!dev || this.deviceId !== deviceId) return;

      // Another phone shows the assigned phone's live values and stream as the controller has them.
      if (!this.assignedHere) {
        this.values = Object.fromEntries((dev.channels ?? []).map(ch => [ch.key, ch.value]));
        this.devLive = dev.connected;
        if (!this.camId) this.camId = (await robotClient.findPhoneCamera(this.deviceName)) || null;
      }

      const raw = dev.providerConfig;
      if (raw && Date.now() - this.lastLocalEdit > LOCAL_EDIT_HOLD_MS && !this.persistTimer) {
        const next = this.sanitizeConfig(JSON.parse(raw));
        if (JSON.stringify(next) !== JSON.stringify(this.config)) this.applyRemote(next);
      }
      this.publish();
    } catch { /* try again next tick */ } finally { this.syncBusy = false; }
  }

  /** Take on settings saved by another phone. */
  private applyRemote(next: ProviderConfig) {
    const wasHere = this.assignedHere;
    const prev = this.config;
    this.config = next;
    if (wasHere && !this.assignedHere) {
      // Another phone took over (or unlinked) this device — stop streaming from this one, and forget
      // the assignment so the app stops opening on the provider screen at launch.
      this.stopInternal();
      this.camOn = false;
      if (this.deviceId) this.forgetLocalAssignment(this.deviceId);
      return;
    }
    if (!this.assignedHere) return;
    if (next.camOn !== this.camOn) {
      this.camOn = next.camOn;
      if (this.camOn) this.rebuildCamera(); else this.teardownCamera();
      // The camera is already rebuilt with the new settings; apply only the rest.
      this.applyChanges({ ...prev, resTier: next.resTier, aspect: next.aspect, rtcFps: next.rtcFps, lensId: next.lensId, orientation: next.orientation, bitrate: next.bitrate });
    } else {
      this.applyChanges(prev);
    }
  }

  /** Stop everything and turn all switches off (persisted). The explicit "stop streaming" action. */
  stop() {
    this.camOn = false;
    this.config = { ...this.config, camOn: false, motionOn: false, lightOn: false, locationOn: false, batteryOn: false };
    this.persistConfig();
    this.stopInternal();
    this.publish();
  }

  /** Re-read the phone's cameras for the lens picker (labels fill in once permission is granted). */
  async refreshLenses() {
    try {
      const devices = await (mediaDevices as unknown as {
        enumerateDevices: () => Promise<{ deviceId: string; kind: string; label?: string; facing?: string }[]>;
      }).enumerateDevices();
      this.lenses = devices.filter(d => d.kind === "videoinput").map((d, i) => ({
        id: d.deviceId, label: d.label || `Camera ${i + 1}`, ...(d.facing ? { facing: d.facing } : {}),
      }));
      // Share this phone's cameras so other phones can offer the same lens picker.
      if (this.assignedHere && this.configLoaded && JSON.stringify(this.lenses) !== JSON.stringify(this.config.lenses)) {
        this.config = { ...this.config, lenses: this.lenses };
        this.persistConfig();
      }
      this.publish();
    } catch { /* enumerate unsupported — the picker just won't show */ }
  }

  // ── Connection tracking ─────────────────────────────────────────────────────
  private ensureConnSub() {
    if (this.connSub) return;
    this.connSub = robotClient.onStatus(s => this.onConnChange(!!s.connected));
    // Coming back to the app (e.g. after another app borrowed the camera): if the stream isn't
    // flowing, restart it now rather than waiting out the restart backoff.
    if (!this.appStateSub) {
      this.appStateSub = AppState.addEventListener("change", s => { if (s === "active") this.onAppActive(); });
    }
  }

  private onAppActive() {
    // The foreground is the one moment Android always lets an app (re)start its foreground service,
    // so re-assert it here: the OS may have stopped it, or dropped a type, while we were in the back.
    if (this.active) { this.fgsKey = ""; this.syncForeground(); }
    if (!this.camOn || !this.assignedHere || !robotClient.connected) return;
    const stalled = this.restartTimer !== null || (this.lastFlowAt > 0 && Date.now() - this.lastFlowAt > STALL_MS / 2);
    if (!stalled) return;
    log("camera stream restarting: app returned to the foreground with no video flowing");
    this.restartAttempts = 0;
    this.rebuildCamera();
  }

  /**
   * The current camera stream stopped (reason says why): log it, tear it down and rebuild it after a
   * backoff (1 s, 2 s, 4 s … 15 s; reset once frames flow again). `gen` ties the call to the stream
   * build that noticed it, so a late callback from an old stream can't restart a newer one.
   */
  private scheduleRestart(gen: number, reason: string) {
    if (gen !== this.camGen || !this.camOn || !this.assignedHere) return;
    const delay = Math.min(RESTART_MAX_MS, RESTART_BASE_MS * 2 ** this.restartAttempts);
    this.restartAttempts++;
    providerHealth.restarts++;
    log(`camera stream stopped: ${reason} — restarting in ${Math.round(delay / 1000)} s (attempt ${this.restartAttempts})`);
    this.teardownCamera();   // bumps camGen: every callback of the stopped stream goes quiet
    this.rtcState = `restarting (${reason})`;
    this.publish();
    this.restartTimer = setTimeout(() => {
      this.restartTimer = null;
      if (this.camOn && this.assignedHere && robotClient.connected) this.rebuildCamera();
    }, delay);
  }

  private onConnChange(connected: boolean) {
    if (connected === this.connected) return;
    this.connected = connected;
    if (connected) {
      if (!this.configLoaded && this.deviceId) { this.loadConfig(); return; }
      this.camId = null; // re-acquire (addPhoneCamera is idempotent by name)
      if (this.active) { this.rebuildCamera(); this.rebuildSensors(); this.syncForeground(); }
    } else {
      // Nothing to stream to — release the pipelines but keep the intent + foreground service so we
      // auto-resume on reconnect.
      this.teardownCamera();
      this.teardownSensors();
      this.camId = null;
    }
    this.publish();
  }

  // ── Config load / persist (controller-side, keyed by device) ────────────────
  private sanitizeConfig(p: Partial<ProviderConfig>): ProviderConfig {
    const c = { ...DEFAULT_PROVIDER_CONFIG };
    if (p.resTier && (RES_TIER_VALUES as string[]).includes(p.resTier)) c.resTier = p.resTier;
    if (p.aspect === "4:3" || p.aspect === "16:9") c.aspect = p.aspect;
    if (p.rtcFps && RTC_FPS_OPTIONS.some(o => o.value === String(p.rtcFps))) c.rtcFps = String(p.rtcFps);
    if (typeof p.bitrate === "number" && isFinite(p.bitrate)) c.bitrate = Math.min(MAX_BITRATE, Math.max(MIN_BITRATE, p.bitrate));
    if (typeof p.camOn === "boolean") c.camOn = p.camOn;
    if (typeof p.lensId === "string" || p.lensId === null) c.lensId = p.lensId ?? null;
    if (p.orientation && ORIENT_TURNS.includes(p.orientation)) c.orientation = p.orientation;
    if (typeof p.motionOn === "boolean") c.motionOn = p.motionOn;
    if (typeof p.lightOn === "boolean") c.lightOn = p.lightOn;
    if (typeof p.locationOn === "boolean") c.locationOn = p.locationOn;
    if (typeof p.batteryOn === "boolean") c.batteryOn = p.batteryOn;
    if (Array.isArray(p.lenses)) {
      c.lenses = p.lenses.filter(l => l && typeof l.id === "string")
        .map(l => ({ id: l.id, label: String(l.label ?? ""), ...(l.facing ? { facing: String(l.facing) } : {}) }));
    }
    if (typeof p.assignedPhoneId === "string" || p.assignedPhoneId === null) c.assignedPhoneId = p.assignedPhoneId ?? null;
    if (typeof p.assignedPhoneName === "string" || p.assignedPhoneName === null) c.assignedPhoneName = p.assignedPhoneName ?? null;
    return c;
  }

  private async ensureIdentity(): Promise<void> {
    if (this.identityReady) return;
    if (!this.identityPromise) {
      this.identityPromise = (async () => {
        const id = await ensurePhoneIdentity();
        this.thisPhoneId = id.id;
        this.thisPhoneName = id.name;
        this.identityReady = true;
      })();
    }
    await this.identityPromise;
  }

  private async loadConfig() {
    await this.ensureIdentity();
    const deviceId = this.deviceId;
    if (!deviceId) { this.configLoaded = true; this.publish(); return; }

    if (!robotClient.connected) {
      // Can't read the saved config yet — leave configLoaded false so onConnChange reloads on connect.
      this.publish();
      return;
    }

    let found = false;
    try {
      const dev = (await robotClient.getDevices()).find(d => d.id === deviceId);
      found = !!dev;
      const raw = dev?.providerConfig;
      if (raw && this.deviceId === deviceId) this.config = this.sanitizeConfig(JSON.parse(raw));
    } catch { /* no saved config / parse error — keep defaults */ }
    if (this.deviceId !== deviceId) return; // device switched mid-load
    this.configLoaded = true;

    // A provider tag (autostart) is an explicit "make THIS phone the provider" action — claim it.
    if (this.pendingAutostart) {
      this.pendingAutostart = false;
      await this.assignHere();
      this.camOn = true;
    } else if (this.assignedHere) {
      this.camOn = this.config.camOn;   // resume the saved streaming intent after a reconnect / restart
    }

    if (this.assignedHere) {
      // Start whatever the saved config activates. Only the assigned phone streams.
      if (this.camOn) this.rebuildCamera();
      this.rebuildSensors();
        this.syncForeground();
    } else {
      // Not our device to provide — make sure nothing is streaming here, and drop a stale local
      // assignment (it was unlinked or taken over while this phone wasn't looking).
      this.stopInternal();
      if (found) this.forgetLocalAssignment(deviceId);
    }
    this.publish();
  }

  // ── Assignment ───────────────────────────────────────────────────────────────
  /** Claim this device for THIS phone: record the assignment on the controller, remember it locally,
   *  release any device this phone previously provided, and enable the provider UI. */
  async assignHere() {
    await this.ensureIdentity();
    const deviceId = this.deviceId;
    if (!deviceId || !this.thisPhoneId) return;

    // Release a different device this phone used to provide, so a phone only ever serves one device.
    await this.releasePreviousAssignment(deviceId);

    this.config = { ...this.config, assignedPhoneId: this.thisPhoneId, assignedPhoneName: this.thisPhoneName };
    this.configLoaded = true;
    this.persistConfigNow();
    setAssignedDeviceId(deviceId, this.deviceName);
    this.syncForeground();
    this.publish();
  }

  /** Release this device (this phone stops being its provider). */
  async unassignHere() {
    const deviceId = this.deviceId;
    this.stopInternal();
    this.config = { ...this.config, assignedPhoneId: null, assignedPhoneName: null };
    this.persistConfigNow();
    if (deviceId) await this.forgetLocalAssignment(deviceId);
    this.publish();
  }

  /** Forget this phone's local note that it provides `deviceId` (the launch auto-navigate reads it). */
  private async forgetLocalAssignment(deviceId: string) {
    if ((await getAssignedDeviceId()) === deviceId) await setAssignedDeviceId(null);
  }

  /** Clear this phone from a device it used to provide (best-effort) when reassigning to a new one. */
  private async releasePreviousAssignment(exceptDeviceId: string) {
    try {
      const prev = await getAssignedDeviceId();
      if (!prev || prev === exceptDeviceId) return;
      const dev = (await robotClient.getDevices()).find(d => d.id === prev);
      if (!dev?.providerConfig) return;
      const cfg = this.sanitizeConfig(JSON.parse(dev.providerConfig));
      if (cfg.assignedPhoneId !== this.thisPhoneId) return; // someone else owns it now — leave it
      cfg.assignedPhoneId = null; cfg.assignedPhoneName = null;
      await robotClient.setDeviceConfig(prev, { providerConfig: JSON.stringify(cfg) }).catch(() => {});
    } catch { /* best-effort */ }
  }

  private persistConfig() {
    if (this.persistTimer) clearTimeout(this.persistTimer);
    const deviceId = this.deviceId;
    if (!deviceId || !this.configLoaded) return;
    const cfg = JSON.stringify(this.config);
    this.persistTimer = setTimeout(() => {
      this.persistTimer = null;
      if (!robotClient.connected || this.deviceId !== deviceId) return;
      robotClient.setDeviceConfig(deviceId, { providerConfig: cfg }).catch(() => {});
    }, PERSIST_MS);
  }

  /** Write the config immediately (used for assignment, which must stick right away). */
  private persistConfigNow() {
    if (this.persistTimer) { clearTimeout(this.persistTimer); this.persistTimer = null; }
    const deviceId = this.deviceId;
    if (!deviceId) return;
    robotClient.setDeviceConfig(deviceId, { providerConfig: JSON.stringify(this.config) }).catch(() => {});
  }

  // ── Foreground service ──────────────────────────────────────────────────────
  private syncForeground() {
    this.syncHealth();
    if (!this.active) {
      if (this.fgsKey !== "") { this.fgsKey = ""; stopForegroundStreaming(); }
      return;
    }
    const types = foregroundTypes(this.camOn, this.config.locationOn);
    const text = this.camOn
      ? "Streaming camera & sensors to the controller"
      : "Streaming sensors to the controller";
    // Only tell the service when something changed: every call is a startForegroundService(), which
    // Android may refuse from the background.
    const key = `${types.join(",")}|${text}|${this.deviceName}`;
    if (key === this.fgsKey) return;
    this.fgsKey = key;
    startForegroundStreaming(this.deviceName || "Phone", text, types);
  }

  // ── Health line (leak watch for a phone left streaming for hours) ──────────
  private syncHealth() {
    if (this.active && !this.healthTimer) {
      this.healthTimer = setInterval(() => log(this.healthLine()), HEALTH_MS);
    } else if (!this.active && this.healthTimer) {
      clearInterval(this.healthTimer);
      this.healthTimer = null;
    }
  }

  /** One cheap line: JS heap (Hermes), what the camera pipeline holds, restarts, timers. */
  healthLine(): string {
    const h = providerHealth;
    let heap = "";
    try {
      const hermes = (globalThis as { HermesInternal?: { getInstrumentedStats?: () => Record<string, number> } }).HermesInternal;
      const s = hermes?.getInstrumentedStats?.();
      if (s && typeof s.js_heapSize === "number") {
        heap = `heap ${Math.round((s.js_allocatedBytes ?? 0) / 1048576)}/${Math.round(s.js_heapSize / 1048576)} MB · `;
      }
    } catch { /* not Hermes */ }
    return `health: ${heap}pc ${h.pcOpen} · streams ${h.streamsOpen} · tracks ${h.tracksOpen}`
      + ` · encoder inits ${h.builds + h.resizes} (builds ${h.builds}, resizes ${h.resizes}) · released ${h.released}`
      + ` · restarts ${h.restarts} · sensors ${this.sensorSubs.length}${this.locSub ? "+gps" : ""}`
      + ` · ${this.rtcState || "idle"}`;
  }

  /** Turn the stream a quarter turn clockwise. */
  rotate() {
    this.updateConfig({ orientation: nextOrientation(this.config.orientation) });
  }

  // ── Camera (WebRTC) pipeline ────────────────────────────────────────────────
  /**
   * Rebuild the camera for a settings change, coalesced: wait until the settings have stopped
   * changing for REBUILD_SETTLE_MS, and keep REBUILD_MIN_GAP_MS since the last build began. The
   * running stream keeps going meanwhile, so a burst of taps costs one encoder re-init, not one each.
   */
  private requestCamRebuild() {
    if (this.settingsRebuildTimer) clearTimeout(this.settingsRebuildTimer);
    const wait = Math.max(REBUILD_SETTLE_MS, this.camStartedAt + REBUILD_MIN_GAP_MS - Date.now());
    this.settingsRebuildTimer = setTimeout(() => {
      this.settingsRebuildTimer = null;
      if (this.camOn && this.assignedHere) this.rebuildCamera();
    }, wait);
  }

  private teardownCamera() {
    this.camGen++;
    if (this.restartTimer) { clearTimeout(this.restartTimer); this.restartTimer = null; }
    if (this.settingsRebuildTimer) { clearTimeout(this.settingsRebuildTimer); this.settingsRebuildTimer = null; }
    if (this.statsTimer) { clearInterval(this.statsTimer); this.statsTimer = null; }
    const ws = this.camWs, stream = this.stream, pc = this.pc;
    this.camWs = null;
    this.stream = null;
    this.pc = null;
    if (ws) {
      // Drop the handlers first: they close over the peer connection, and a late message must not
      // reach a closed one (setRemoteDescription / addIceCandidate on a closed pc).
      ws.onopen = null; ws.onmessage = null; ws.onerror = null; ws.onclose = null;
      try { ws.close(); } catch { /* noop */ }
    }
    if (pc) {
      // Close before releasing the track, so nothing is still encoding from it. close() also has the
      // library dispose the native connection (on its "closed" signaling event).
      try { pc.close(); } catch { /* noop */ }
      providerHealth.pcOpen = Math.max(0, providerHealth.pcOpen - 1);
    }
    if (stream) {
      providerHealth.tracksOpen = Math.max(0, providerHealth.tracksOpen - stream.getTracks().length);
      providerHealth.streamsOpen = Math.max(0, providerHealth.streamsOpen - 1);
      releaseStream(stream);
    }
    this.encodingBusy = false;
    this.encodingAgain = false;
    this.rtcState = "";
    this.rtcStats = null;
    this.rxStats = null;
    this.rtcCapKbps = null;
  }

  /**
   * Apply the sender encoding params (bitrate cap, framerate, keep-resolution) to the LIVE peer
   * connection — no renegotiation, so a bitrate change takes effect immediately on the running stream.
   * The bitrate is the user's setting, lowered to the controller's cap while it reports one (it
   * measures what actually arrives; the pinned SDP rate gives WebRTC no way to back off by itself).
   */
  private async applyEncodingLive() {
    const pc = this.pc;
    if (!pc || this.encodingBusy) { if (pc) this.encodingAgain = true; return; }
    const gen = this.camGen;
    // Never touch the sender of a connection that is closing / closed, or whose track has ended:
    // setParameters on a torn-down native sender is the kind of call that crashes inside libwebrtc.
    const live = () => gen === this.camGen && this.pc === pc
      && (pc as unknown as { connectionState?: string }).connectionState !== "closed"
      && (pc as unknown as { signalingState?: string }).signalingState !== "closed";
    if (!live()) return;
    this.encodingBusy = true;
    try {
      const sender = pc.getSenders().find(s => s.track?.kind === "video");
      if (!sender || !sender.track || sender.track.readyState === "ended") return;
      const params = sender.getParameters();
      if (!params.encodings || params.encodings.length === 0) params.encodings = [{ active: true }];
      params.encodings[0].active = true;
      params.encodings[0].maxBitrate = effectiveBitrate(this.config.bitrate, this.rtcCapKbps);
      params.encodings[0].maxFramerate = Number(this.config.rtcFps);
      params.encodings[0].scaleResolutionDownBy = 1;
      params.degradationPreference = "maintain-resolution";
      if (!live()) return;
      await sender.setParameters(params);
    } catch { /* older impl without full param support — capture constraints still apply */ } finally {
      this.encodingBusy = false;
      // A change arrived while this one was in flight: apply the latest once (never stacked calls).
      if (this.encodingAgain) { this.encodingAgain = false; if (live()) void this.applyEncodingLive(); }
    }
  }

  private async rebuildCamera() {
    this.teardownCamera();
    if (!this.camOn || !robotClient.connected || !this.assignedHere) { this.publish(); return; }
    const gen = ++this.camGen;
    this.camStartedAt = Date.now();
    this.lastFlowAt = 0;

    // Ensure the controller has a "phone" camera for this device; the WebRTC feed fills it.
    if (!this.camId) {
      let id = "";
      try { id = await robotClient.addPhoneCamera(this.deviceName); } catch { id = ""; }
      if (gen !== this.camGen) return;
      if (!id) { this.scheduleRestart(gen, "the controller didn't create the phone camera"); return; }
      this.camId = id;
    }
    const url = robotClient.cameraWebrtcUrl(this.camId);
    if (!url) { this.scheduleRestart(gen, "no controller address"); return; }

    const tier = RES_TIERS[this.config.resTier];
    const h = tier.height;
    const w = Math.round(this.config.aspect === "16:9" ? (h * 16) / 9 : (h * 4) / 3);   // frame shape at the chosen height
    const targetFps = Number(this.config.rtcFps);
    const lensId = this.config.lensId;

    // react-native-webrtc's normalizer reads {ideal} width/height/frameRate, so these apply.
    // `rotation` (our react-native-webrtc patch) turns every frame on the phone before encoding.
    const rotation = ORIENT_TURNS.indexOf(this.config.orientation) * 90;
    const baseVideo = { width: { ideal: w }, height: { ideal: h }, frameRate: { ideal: targetFps }, rotation };
    const videoFor = (lens: string | null) =>
      lens ? { ...baseVideo, deviceId: lens } : { ...baseVideo, facingMode: "environment" as const };

    this.rtcState = "connecting";
    this.publish();

    // Opening the camera can hang while another app holds it; give up after a while and retry.
    const openCamera = (lens: string | null) => new Promise<MediaStream>((resolve, reject) => {
      let settled = false;
      const t = setTimeout(() => { settled = true; reject(new Error("camera open timed out")); }, CAMERA_OPEN_MS);
      mediaDevices.getUserMedia({ video: videoFor(lens), audio: false }).then(s => {
        clearTimeout(t);
        // Opened after we gave up on it: release it fully, or the camera pipeline leaks.
        if (settled) releaseStream(s); else { settled = true; resolve(s); }
      }, err => { clearTimeout(t); if (!settled) { settled = true; reject(err); } });
    });

    let stream: MediaStream;
    try {
      stream = await openCamera(lensId);
    } catch {
      // The saved lens may belong to a different phone — retry with the rear camera and clear it.
      // But if this phone does have that lens, the camera is just busy (another app holds it, or
      // the open timed out): keep the lens and retry later instead of switching cameras.
      const lensKnownHere = !!lensId && this.lenses.some(l => l.id === lensId);
      if (!lensId || lensKnownHere) { this.scheduleRestart(gen, "the camera couldn't be opened (in use or unavailable)"); return; }
      try {
        stream = await openCamera(null);
        if (gen === this.camGen) this.config.lensId = null;
      } catch { this.scheduleRestart(gen, "the camera couldn't be opened"); return; }
    }
    if (gen !== this.camGen) { releaseStream(stream); return; }
    this.stream = stream;
    providerHealth.streamsOpen++;
    providerHealth.tracksOpen += stream.getTracks().length;
    this.refreshLenses(); // labels are available now that the camera is open
    // Android ends the track when it takes the camera away (another app opened it, the camera failed).
    stream.getVideoTracks().forEach(t => {
      try {
        (t as unknown as { addEventListener: (type: string, cb: () => void) => void })
          .addEventListener("ended", () => this.scheduleRestart(gen, "the camera was closed"));
      } catch { /* no track events in this build — the frame watchdog still catches it */ }
    });

    const pc = new RTCPeerConnection({ iceServers: [] }); // tailnet: direct host candidates, no STUN/TURN
    this.pc = pc;
    providerHealth.pcOpen++;
    providerHealth.builds++;
    log(this.healthLine());   // one line per rebuild: encoder inits vs streams released, at a glance
    stream.getTracks().forEach(t => pc.addTrack(t, stream));

    // Pin the sender encoding (bitrate cap + full resolution + prefer dropping frames over downscaling)
    // using the live config — reused by applyEncodingLive() so bitrate changes apply without a restart.
    const pinEncoding = () => this.applyEncodingLive();

    // Live fps / resolution / bitrate from the sender's own WebRTC stats — and the stall watchdog,
    // which goes by the sender's frame count (the connection state stays "connected" with no video).
    let prevBytes = 0, prevTs = 0, prevFrames = -1, statsBusy = false, prevSize = "";
    this.statsTimer = setInterval(async () => {
      if (gen !== this.camGen) return;
      // Watchdog first, so a getStats call that never settles can't hide a stall.
      const now = Date.now();
      if (this.lastFlowAt === 0 && now - this.camStartedAt > FIRST_FRAME_MS) {
        this.scheduleRestart(gen, `no video sent within ${FIRST_FRAME_MS / 1000} s (${this.rtcState || "connecting"})`);
        return;
      }
      if (this.lastFlowAt > 0 && now - this.lastFlowAt > STALL_MS) {
        this.scheduleRestart(gen, `no frames sent for ${STALL_MS / 1000} s`);
        return;
      }
      if (statsBusy) return;
      statsBusy = true;
      try {
        const rep = await (pc as unknown as { getStats: () => Promise<Map<string, RtcReport>> }).getStats();
        let fw = 0, fh = 0, sentSize = "", fps = 0, bytes = 0, ts = 0, frames = -1, limit: string | undefined;
        rep.forEach(r => {
          if (r.type === "outbound-rtp" && (r.kind === "video" || r.mediaType === "video")) {
            bytes = r.bytesSent ?? bytes; ts = r.timestamp ?? ts;
            frames = r.framesEncoded ?? r.framesSent ?? frames;
            if (r.framesPerSecond) fps = r.framesPerSecond;
            if (r.frameWidth) { fw = r.frameWidth; fh = r.frameHeight ?? 0; sentSize = `${fw}x${fh}`; }
            if (r.qualityLimitationReason && r.qualityLimitationReason !== "none") limit = r.qualityLimitationReason;
          } else if (r.type === "media-source") {
            if (!fw && r.width) { fw = r.width; fh = r.height ?? 0; }
            if (!fps && r.framesPerSecond) fps = r.framesPerSecond;
          }
        });
        const kbps = prevTs && ts > prevTs ? Math.round(((bytes - prevBytes) * 8) / (ts - prevTs)) : 0;
        // Progress = new frames encoded (bytes only if this build reports no frame count: padding
        // can keep bytes moving with no video).
        const progressed = frames >= 0 ? frames > prevFrames && prevFrames >= 0 : bytes > prevBytes && prevBytes > 0;
        prevBytes = bytes; prevTs = ts;
        if (frames >= 0) prevFrames = frames;
        if (gen !== this.camGen) return;
        if (progressed) { this.lastFlowAt = Date.now(); this.restartAttempts = 0; }
        // The sent frame size changing mid-stream means WebRTC re-created the encoder (it should not:
        // the sender is pinned to maintain-resolution). Counted for the health line.
        if (sentSize) {
          if (prevSize && sentSize !== prevSize) { providerHealth.resizes++; log(`encoder resized ${prevSize} → ${sentSize}`); }
          prevSize = sentSize;
        }
        this.rtcStats = { fps: Math.round(fps), w: fw, h: fh, kbps, limit };
        this.publish();
      } catch { /* stats unavailable this tick */ } finally { statsBusy = false; }
    }, 1000);

    // addEventListener (not on* setters) — more reliable across react-native-webrtc versions.
    const ev = pc as unknown as {
      addEventListener: (t: string, cb: (e: { candidate?: RTCIceCandidate | null }) => void) => void;
      connectionState?: string; iceConnectionState?: string;
    };
    ev.addEventListener("icecandidate", e => {
      const c = e?.candidate;
      if (c && this.camWs && this.camWs.readyState === WebSocket.OPEN) {
        this.camWs.send(JSON.stringify({ type: "ice", candidate: { candidate: c.candidate, sdpMid: c.sdpMid, sdpMLineIndex: c.sdpMLineIndex } }));
      }
    });
    ev.addEventListener("connectionstatechange", () => {
      if (gen !== this.camGen) return;
      this.rtcState = ev.connectionState ?? "";
      this.publish();
      // "disconnected" can heal by itself; the frame watchdog restarts it if it doesn't.
      if (ev.connectionState === "failed" || ev.connectionState === "closed") this.scheduleRestart(gen, `connection ${ev.connectionState}`);
    });
    ev.addEventListener("iceconnectionstatechange", () => {
      if (gen === this.camGen && ev.connectionState !== "connected") { this.rtcState = "ice " + (ev.iceConnectionState ?? ""); this.publish(); }
    });

    const ws = new WebSocket(url);
    this.camWs = ws;
    ws.onopen = async () => {
      // A stream restarted meanwhile (e.g. Rotate) has closed this connection — offering on it crashes.
      if (gen !== this.camGen) return;
      try {
        const offer = await pc.createOffer({});
        if (gen !== this.camGen) return;
        // Force start/min bitrate in the SDP. maxBitrate (setParameters) is only a ceiling; the actual
        // rate is driven by WebRTC's bandwidth estimator, which starves to ~500 kbps when the receiver
        // (SIPSorcery) sends no proper bandwidth feedback. x-google-start/min-bitrate overrides that.
        const sdp = forceBitrateSdp(offer.sdp ?? "", this.config.bitrate);
        await pc.setLocalDescription(new RTCSessionDescription({ type: "offer", sdp }));
        await pinEncoding(); // keep the requested resolution (no bandwidth downscale)
        ws.send(JSON.stringify({ type: "offer", sdp }));
      } catch { this.scheduleRestart(gen, "couldn't start the connection (offer failed)"); }
    };
    ws.onmessage = async e => {
      if (gen !== this.camGen) return;   // this stream was torn down — its pc is closed
      try {
        const m = JSON.parse(typeof e.data === "string" ? e.data : "");
        if (m.type === "answer" && m.sdp) {
          await pc.setRemoteDescription(new RTCSessionDescription({ type: "answer", sdp: m.sdp }));
        } else if (m.type === "ice" && m.candidate) {
          await pc.addIceCandidate(new RTCIceCandidate(m.candidate));
        } else if (m.type === "stats") {
          // The controller's honest view: is a clean picture actually coming out of the decoder?
          const rx = parseRxStats(m);
          if (rx && gen === this.camGen) {
            this.rxStats = rx;
            // Follow the controller's bitrate cap (it lowers it when the link overruns, lifts it when clean).
            if (rx.capKbps !== this.rtcCapKbps) {
              const before = effectiveBitrate(this.config.bitrate, this.rtcCapKbps);
              this.rtcCapKbps = rx.capKbps;
              if (effectiveBitrate(this.config.bitrate, rx.capKbps) !== before) void this.applyEncodingLive();
            }
            this.publish();
          }
        }
      } catch { /* ignore a malformed signal */ }
    };
    ws.onerror = () => { if (gen === this.camGen) { this.rtcState = "signal error"; this.publish(); } };
    // The controller closes this socket when its side of the stream stops (with the reason), and it
    // owns the receiving end — so a closed socket always means "start over".
    ws.onclose = e => {
      const why = (e as { reason?: string } | undefined)?.reason;
      this.scheduleRestart(gen, why ? `the controller ended the stream: ${why}` : "the controller connection closed");
    };
  }

  // ── Sensor pipeline (batched channel values over the device ingest socket) ──
  private put(vals: Record<string, number>) {
    Object.assign(this.pending, vals);
  }

  private teardownSensors() {
    this.sensorGen++;
    this.sensorSubs.forEach(s => s.remove());
    this.sensorSubs = [];
    this.locSub?.remove();
    this.locSub = null;
    if (this.flushTimer) { clearInterval(this.flushTimer); this.flushTimer = null; }
    const ws = this.devWs;
    this.devWs = null;
    if (ws) {
      ws.onopen = null; ws.onclose = null; ws.onerror = null;
      try { ws.close(); } catch { /* noop */ }
    }
    this.pending = {};
    this.devLive = false;
  }

  private async rebuildSensors() {
    this.teardownSensors();
    const c = this.config;
    const anySensor = c.motionOn || c.lightOn || c.locationOn || c.batteryOn;
    if (!anySensor || !robotClient.connected || !this.deviceId || !this.assignedHere) { this.publish(); return; }
    const gen = ++this.sensorGen;

    const url = robotClient.deviceIngestUrl(this.deviceId);
    if (!url) { this.publish(); return; }

    const ws = new WebSocket(url);
    this.devWs = ws;
    ws.onopen = () => {
      if (gen !== this.sensorGen) { try { ws.close(); } catch { /* noop */ } return; }
      this.devLive = true;
      this.publish();
      this.flushTimer = setInterval(() => {
        const p = this.pending;
        this.pending = {};
        const keys = Object.keys(p);
        if (!keys.length) return;
        this.values = { ...this.values, ...p }; // running snapshot for the on-screen "Live values" list
        if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ values: p, unixMs: Date.now() }));
        this.publish();
      }, FLUSH_MS);
    };
    ws.onclose = () => { if (gen === this.sensorGen) { this.devLive = false; if (this.flushTimer) { clearInterval(this.flushTimer); this.flushTimer = null; } this.publish(); } };
    ws.onerror = () => { if (gen === this.sensorGen) { this.devLive = false; this.publish(); } };

    if (c.motionOn) {
      Accelerometer.setUpdateInterval(SENSOR_MS);
      Gyroscope.setUpdateInterval(SENSOR_MS);
      Magnetometer.setUpdateInterval(SENSOR_MS);
      this.sensorSubs.push(Accelerometer.addListener(m => this.put({ "accel.x": m.x, "accel.y": m.y, "accel.z": m.z })));
      this.sensorSubs.push(Gyroscope.addListener(m => this.put({ "gyro.x": m.x, "gyro.y": m.y, "gyro.z": m.z })));
      this.sensorSubs.push(Magnetometer.addListener(m => this.put({ "mag.x": m.x, "mag.y": m.y, "mag.z": m.z })));
    }
    if (c.lightOn && Platform.OS === "android") {
      LightSensor.setUpdateInterval(SENSOR_MS);
      this.sensorSubs.push(LightSensor.addListener(m => this.put({ light: m.illuminance })));
    }
    if (c.batteryOn) {
      Battery.getBatteryLevelAsync().then(level => { if (gen === this.sensorGen) this.put({ "battery.level": level }); }).catch(() => {});
      this.sensorSubs.push(Battery.addBatteryLevelListener(e => this.put({ "battery.level": e.batteryLevel })));
      this.sensorSubs.push(Battery.addBatteryStateListener(e => this.put({
        "battery.charging": e.batteryState === Battery.BatteryState.CHARGING || e.batteryState === Battery.BatteryState.FULL ? 1 : 0,
      })));
    }
    if (c.locationOn) {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (gen !== this.sensorGen) return;
      if (perm.granted) {
        this.locSub = await Location.watchPositionAsync(
          { accuracy: Location.Accuracy.Balanced, timeInterval: 1000, distanceInterval: 0 },
          pos => this.put({
            "location.lat": pos.coords.latitude,
            "location.lon": pos.coords.longitude,
            "location.alt": pos.coords.altitude ?? 0,
            "location.speed": pos.coords.speed ?? 0,
            "location.heading": pos.coords.heading ?? 0,
            "location.accuracy": pos.coords.accuracy ?? 0,
          }),
        );
        if (gen !== this.sensorGen) { this.locSub?.remove(); this.locSub = null; }
      } else {
        // Permission denied — reflect it back so the switch flips off.
        this.config = { ...this.config, locationOn: false };
        this.persistConfig();
        this.syncForeground();
        this.publish();
      }
    }
  }

  // ── Full stop ───────────────────────────────────────────────────────────────
  private stopInternal() {
    this.teardownCamera();
    this.teardownSensors();
    this.camId = null;
    this.values = {};
    this.fgsKey = "";
    stopForegroundStreaming();
    this.syncHealth();
  }
}

/** App-wide singleton: the phone's streaming session lives here, independent of any screen. */
export const providerEngine = new ProviderEngine();
