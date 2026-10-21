import * as Battery from "expo-battery";
import * as Location from "expo-location";
import { Accelerometer, Gyroscope, LightSensor, Magnetometer } from "expo-sensors";
import * as ScreenOrientation from "expo-screen-orientation";
import { Platform } from "react-native";
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
// It drives a native Android foreground service (camera + dataSync + location types) so Android 14+
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
  rtcFps: string;
  /** Sender bitrate cap in bits/sec (the quality ceiling; applied live). */
  bitrate: number;
  /** Whether the camera stream is on. Persisted so a provider phone auto-resumes streaming after a
   *  reconnect / app restart instead of needing a manual toggle. */
  camOn: boolean;
  /** Preferred camera lens (getUserMedia deviceId). Phone-specific, applied best-effort — a phone
   *  without this exact lens falls back to the rear camera. */
  lensId: string | null;
  lockOrient: boolean;
  motionOn: boolean;
  lightOn: boolean;
  locationOn: boolean;
  batteryOn: boolean;
  /** Which phone (its stable id) is assigned to provide for this device. Only that phone streams;
   *  everyone else sees "Assign this phone". Stored in the controller blob so the setup phone sees it. */
  assignedPhoneId: string | null;
  /** The assigned phone's friendly name, for display on other phones / the I/O list. */
  assignedPhoneName: string | null;
};

export const DEFAULT_PROVIDER_CONFIG: ProviderConfig = {
  resTier: "med", rtcFps: "30", bitrate: 12_000_000, camOn: false, lensId: null, lockOrient: false,
  motionOn: false, lightOn: false, locationOn: false, batteryOn: false,
  assignedPhoneId: null, assignedPhoneName: null,
};

/** One selectable camera on the phone, from enumerateDevices(). */
export type Lens = { id: string; label: string; facing?: string };

export type RtcStats = { fps: number; w: number; h: number; kbps: number };

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

/** Short label for a lens in the picker: the front camera, else a numbered lens (labels vary by OEM). */
export function lensLabel(l: Lens, i: number): string {
  const f = (l.facing || "").toLowerCase();
  if (f === "front" || f === "user") return "Front";
  return `Lens ${i + 1}`;
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
  bytesSent?: number; timestamp?: number; framesPerSecond?: number;
  frameWidth?: number; frameHeight?: number; width?: number; height?: number;
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

  // Sensor pipeline
  private devWs: WebSocket | null = null;
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private sensorSubs: Sub[] = [];
  private locSub: Location.LocationSubscription | null = null;
  private pending: Record<string, number> = {};
  private sensorGen = 0;

  private persistTimer: ReturnType<typeof setTimeout> | null = null;
  private orientLocked = false;

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
      camOn: this.camOn,
      camId: this.camId,
      rtcState: this.rtcState,
      rtcStats: this.rtcStats,
      devLive: this.devLive,
      values: this.values,
      lenses: this.lenses,
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
    if (on && !this.assignedHere) return; // only the assigned phone may stream
    if (this.camOn === on) return;
    this.camOn = on;
    this.config = { ...this.config, camOn: on };   // persist so it auto-resumes after reconnect
    this.persistConfig();
    if (on) this.rebuildCamera();
    else this.teardownCamera();
    this.syncForeground();
    this.applyOrientation();
    this.publish();
  }

  /** Merge a settings change, persist it, and rebuild whatever it affects. */
  updateConfig(patch: Partial<ProviderConfig>) {
    const prev = this.config;
    this.config = { ...prev, ...patch };
    this.persistConfig();

    const camChanged =
      (patch.resTier !== undefined && patch.resTier !== prev.resTier) ||
      (patch.rtcFps  !== undefined && patch.rtcFps  !== prev.rtcFps)  ||
      (patch.lensId  !== undefined && patch.lensId  !== prev.lensId);
    if (camChanged && this.camOn) this.rebuildCamera();
    // Bitrate changes apply live on the running sender — no capture restart needed.
    else if (patch.bitrate !== undefined && patch.bitrate !== prev.bitrate && this.camOn) this.applyEncodingLive();

    if (patch.lockOrient !== undefined && patch.lockOrient !== prev.lockOrient) this.applyOrientation();

    const sensorKeys: (keyof ProviderConfig)[] = ["motionOn", "lightOn", "locationOn", "batteryOn"];
    if (sensorKeys.some(k => patch[k] !== undefined && patch[k] !== prev[k])) this.rebuildSensors();

    this.syncForeground();
    this.publish();
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
        id: d.deviceId, label: d.label || `Camera ${i + 1}`, facing: d.facing,
      }));
      this.publish();
    } catch { /* enumerate unsupported — the picker just won't show */ }
  }

  // ── Connection tracking ─────────────────────────────────────────────────────
  private ensureConnSub() {
    if (this.connSub) return;
    this.connSub = robotClient.onStatus(s => this.onConnChange(!!s.connected));
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
    if (p.rtcFps && RTC_FPS_OPTIONS.some(o => o.value === String(p.rtcFps))) c.rtcFps = String(p.rtcFps);
    if (typeof p.bitrate === "number" && isFinite(p.bitrate)) c.bitrate = Math.min(MAX_BITRATE, Math.max(MIN_BITRATE, p.bitrate));
    if (typeof p.camOn === "boolean") c.camOn = p.camOn;
    if (typeof p.lensId === "string" || p.lensId === null) c.lensId = p.lensId ?? null;
    if (typeof p.lockOrient === "boolean") c.lockOrient = p.lockOrient;
    if (typeof p.motionOn === "boolean") c.motionOn = p.motionOn;
    if (typeof p.lightOn === "boolean") c.lightOn = p.lightOn;
    if (typeof p.locationOn === "boolean") c.locationOn = p.locationOn;
    if (typeof p.batteryOn === "boolean") c.batteryOn = p.batteryOn;
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

    try {
      const dev = (await robotClient.getDevices()).find(d => d.id === deviceId);
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
      this.applyOrientation();
      this.syncForeground();
    } else {
      // Not our device to provide — make sure nothing is streaming here.
      this.stopInternal();
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
    this.applyOrientation();
    this.syncForeground();
    this.publish();
  }

  /** Release this device (this phone stops being its provider). */
  async unassignHere() {
    const deviceId = this.deviceId;
    this.stopInternal();
    this.config = { ...this.config, assignedPhoneId: null, assignedPhoneName: null };
    this.persistConfigNow();
    if (deviceId) {
      const current = await getAssignedDeviceId();
      if (current === deviceId) setAssignedDeviceId(null);
    }
    this.publish();
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
    if (!this.active) { stopForegroundStreaming(); return; }
    // camera type requires the CAMERA runtime permission, so only request it while the camera is on.
    const types: ForegroundServiceType[] = ["dataSync"];
    if (this.camOn) types.unshift("camera");
    if (this.config.locationOn) types.push("location");
    const text = this.camOn
      ? "Streaming camera & sensors to the controller"
      : "Streaming sensors to the controller";
    startForegroundStreaming(this.deviceName || "Phone", text, types);
  }

  // ── Orientation lock ────────────────────────────────────────────────────────
  private applyOrientation() {
    if (this.config.lockOrient && this.active) this.lockOrientation();
    else this.unlockOrientation();
  }

  private async lockOrientation() {
    if (this.orientLocked) return;
    this.orientLocked = true;
    try {
      const cur = await ScreenOrientation.getOrientationAsync();
      const lock =
        cur === ScreenOrientation.Orientation.LANDSCAPE_LEFT  ? ScreenOrientation.OrientationLock.LANDSCAPE_LEFT  :
        cur === ScreenOrientation.Orientation.LANDSCAPE_RIGHT ? ScreenOrientation.OrientationLock.LANDSCAPE_RIGHT :
        cur === ScreenOrientation.Orientation.PORTRAIT_DOWN   ? ScreenOrientation.OrientationLock.PORTRAIT_DOWN   :
                                                                ScreenOrientation.OrientationLock.PORTRAIT_UP;
      if (this.orientLocked) await ScreenOrientation.lockAsync(lock);
    } catch { /* orientation lock unsupported */ }
  }

  private unlockOrientation() {
    if (!this.orientLocked) return;
    this.orientLocked = false;
    ScreenOrientation.unlockAsync().catch(() => {});
  }

  // ── Camera (WebRTC) pipeline ────────────────────────────────────────────────
  private teardownCamera() {
    this.camGen++;
    if (this.statsTimer) { clearInterval(this.statsTimer); this.statsTimer = null; }
    try { this.camWs?.close(); } catch { /* noop */ }
    try { this.stream?.getTracks().forEach(t => t.stop()); } catch { /* noop */ }
    try { this.pc?.close(); } catch { /* noop */ }
    this.camWs = null;
    this.stream = null;
    this.pc = null;
    this.rtcState = "";
    this.rtcStats = null;
  }

  /**
   * Apply the sender encoding params (bitrate cap, framerate, keep-resolution) to the LIVE peer
   * connection — no renegotiation, so a bitrate change takes effect immediately on the running stream.
   */
  private async applyEncodingLive() {
    const pc = this.pc;
    if (!pc) return;
    try {
      const sender = pc.getSenders().find(s => s.track?.kind === "video");
      if (!sender) return;
      const params = sender.getParameters();
      if (!params.encodings || params.encodings.length === 0) params.encodings = [{ active: true }];
      params.encodings[0].active = true;
      params.encodings[0].maxBitrate = this.config.bitrate;
      params.encodings[0].maxFramerate = Number(this.config.rtcFps);
      params.encodings[0].scaleResolutionDownBy = 1;
      params.degradationPreference = "maintain-resolution";
      await sender.setParameters(params);
    } catch { /* older impl without full param support — capture constraints still apply */ }
  }

  private async rebuildCamera() {
    this.teardownCamera();
    if (!this.camOn || !robotClient.connected || !this.assignedHere) { this.publish(); return; }
    const gen = ++this.camGen;

    // Ensure the controller has a "phone" camera for this device; the WebRTC feed fills it.
    if (!this.camId) {
      let id = "";
      try { id = await robotClient.addPhoneCamera(this.deviceName); } catch { id = ""; }
      if (gen !== this.camGen) return;
      if (!id) { this.rtcState = "camera error"; this.publish(); return; }
      this.camId = id;
    }
    const url = robotClient.cameraWebrtcUrl(this.camId);
    if (!url) { this.rtcState = "camera error"; this.publish(); return; }

    const tier = RES_TIERS[this.config.resTier];
    const h = tier.height;
    const w = Math.round((h * 16) / 9);        // request a 16:9 frame at the chosen height
    const targetFps = Number(this.config.rtcFps);
    const lensId = this.config.lensId;

    // react-native-webrtc's normalizer reads {ideal} width/height/frameRate, so these apply.
    const baseVideo = { width: { ideal: w }, height: { ideal: h }, frameRate: { ideal: targetFps } };
    const videoFor = (lens: string | null) =>
      lens ? { ...baseVideo, deviceId: lens } : { ...baseVideo, facingMode: "environment" as const };

    this.rtcState = "connecting";
    this.publish();

    let stream: MediaStream;
    try {
      stream = await mediaDevices.getUserMedia({ video: videoFor(lensId), audio: false });
    } catch {
      // The saved lens may belong to a different phone — retry with the rear camera and clear it.
      if (!lensId) { if (gen === this.camGen) { this.rtcState = "camera error"; this.publish(); } return; }
      try {
        stream = await mediaDevices.getUserMedia({ video: videoFor(null), audio: false });
        if (gen === this.camGen) this.config.lensId = null;
      } catch { if (gen === this.camGen) { this.rtcState = "camera error"; this.publish(); } return; }
    }
    if (gen !== this.camGen) { stream.getTracks().forEach(t => t.stop()); return; }
    this.stream = stream;
    this.refreshLenses(); // labels are available now that the camera is open

    const pc = new RTCPeerConnection({ iceServers: [] }); // tailnet: direct host candidates, no STUN/TURN
    this.pc = pc;
    stream.getTracks().forEach(t => pc.addTrack(t, stream));

    // Pin the sender encoding (bitrate cap + full resolution + prefer dropping frames over downscaling)
    // using the live config — reused by applyEncodingLive() so bitrate changes apply without a restart.
    const pinEncoding = () => this.applyEncodingLive();

    // Live fps / resolution / bitrate from the sender's own WebRTC stats.
    let prevBytes = 0, prevTs = 0;
    this.statsTimer = setInterval(async () => {
      try {
        const rep = await (pc as unknown as { getStats: () => Promise<Map<string, RtcReport>> }).getStats();
        let fw = 0, fh = 0, fps = 0, bytes = 0, ts = 0;
        rep.forEach(r => {
          if (r.type === "outbound-rtp" && (r.kind === "video" || r.mediaType === "video")) {
            bytes = r.bytesSent ?? bytes; ts = r.timestamp ?? ts;
            if (r.framesPerSecond) fps = r.framesPerSecond;
            if (r.frameWidth) { fw = r.frameWidth; fh = r.frameHeight ?? 0; }
          } else if (r.type === "media-source") {
            if (!fw && r.width) { fw = r.width; fh = r.height ?? 0; }
            if (!fps && r.framesPerSecond) fps = r.framesPerSecond;
          }
        });
        const kbps = prevTs && ts > prevTs ? Math.round(((bytes - prevBytes) * 8) / (ts - prevTs)) : 0;
        prevBytes = bytes; prevTs = ts;
        if (gen === this.camGen) { this.rtcStats = { fps: Math.round(fps), w: fw, h: fh, kbps }; this.publish(); }
      } catch { /* stats unavailable this tick */ }
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
    ev.addEventListener("connectionstatechange", () => { if (gen === this.camGen) { this.rtcState = ev.connectionState ?? ""; this.publish(); } });
    ev.addEventListener("iceconnectionstatechange", () => {
      if (gen === this.camGen && ev.connectionState !== "connected") { this.rtcState = "ice " + (ev.iceConnectionState ?? ""); this.publish(); }
    });

    const ws = new WebSocket(url);
    this.camWs = ws;
    ws.onopen = async () => {
      try {
        const offer = await pc.createOffer({});
        // Force start/min bitrate in the SDP. maxBitrate (setParameters) is only a ceiling; the actual
        // rate is driven by WebRTC's bandwidth estimator, which starves to ~500 kbps when the receiver
        // (SIPSorcery) sends no proper bandwidth feedback. x-google-start/min-bitrate overrides that.
        const sdp = forceBitrateSdp(offer.sdp ?? "", this.config.bitrate);
        await pc.setLocalDescription(new RTCSessionDescription({ type: "offer", sdp }));
        await pinEncoding(); // keep the requested resolution (no bandwidth downscale)
        ws.send(JSON.stringify({ type: "offer", sdp }));
      } catch { if (gen === this.camGen) { this.rtcState = "offer error"; this.publish(); } }
    };
    ws.onmessage = async e => {
      try {
        const m = JSON.parse(typeof e.data === "string" ? e.data : "");
        if (m.type === "answer" && m.sdp) {
          await pc.setRemoteDescription(new RTCSessionDescription({ type: "answer", sdp: m.sdp }));
        } else if (m.type === "ice" && m.candidate) {
          await pc.addIceCandidate(new RTCIceCandidate(m.candidate));
        }
      } catch { /* ignore a malformed signal */ }
    };
    ws.onerror = () => { if (gen === this.camGen) { this.rtcState = "signal error"; this.publish(); } };
    ws.onclose = () => { if (gen === this.camGen) { this.rtcState = "closed"; this.publish(); } };
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
    try { this.devWs?.close(); } catch { /* noop */ }
    this.devWs = null;
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
    this.unlockOrientation();
    this.camId = null;
    this.values = {};
    stopForegroundStreaming();
  }
}

/** App-wide singleton: the phone's streaming session lives here, independent of any screen. */
export const providerEngine = new ProviderEngine();
