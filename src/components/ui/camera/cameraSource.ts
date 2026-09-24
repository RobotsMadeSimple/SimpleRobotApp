// Display and validation helpers for USB vs network (RTSP / HTTP) cameras
// (docs/network-cameras.md in SimpleRobotController).

import {
  CameraCodec, CameraDecoder, CameraSourceTestResult, CameraSourceType, CameraState, CameraStream, CameraTransport,
} from "@/src/models/robotModels";

export type NetworkSource = {
  url: string;
  username: string;
  password: string;
  transport: CameraTransport;
};

export const EMPTY_NETWORK_SOURCE: NetworkSource = { url: "", username: "", password: "", transport: "tcp" };

export function isNetworkCamera(cam: Pick<CameraState, "sourceType"> | undefined | null): boolean {
  return cam?.sourceType === "network";
}

/** Form state for an existing camera's network fields (blank for USB cameras). */
export function networkSourceOf(cam: CameraState | undefined): NetworkSource {
  if (!cam) return EMPTY_NETWORK_SOURCE;
  return {
    url:       cam.url ?? "",
    username:  cam.username ?? "",
    password:  cam.password ?? "",
    transport: cam.transport === "udp" ? "udp" : "tcp",
  };
}

// ── Sofia / DVRIP (XMeye) cameras ────────────────────────────────────────────

export type SofiaSource = {
  host: string;
  /** Kept as text (like the USB width/height fields) so the input can be edited freely. */
  port: string;
  username: string;
  password: string;
  stream: CameraStream;
  codec: CameraCodec;
  decoder: CameraDecoder;
  ffmpegPath: string;
  hwaccel: string;
};

export const EMPTY_SOFIA_SOURCE: SofiaSource = {
  host: "", port: "34567", username: "admin", password: "",
  stream: "Main", codec: "h264", decoder: "opencv", ffmpegPath: "ffmpeg", hwaccel: "",
};

export function isSofiaCamera(cam: Pick<CameraState, "sourceType"> | undefined | null): boolean {
  return cam?.sourceType === "sofia";
}

/** Form state for an existing camera's Sofia fields (defaults for USB/network cameras). */
export function sofiaSourceOf(cam: CameraState | undefined): SofiaSource {
  if (!cam) return EMPTY_SOFIA_SOURCE;
  return {
    host:       cam.host ?? "",
    port:       String(cam.port ?? 34567),
    username:   cam.username ?? "admin",
    password:   cam.password ?? "",
    stream:     cam.stream === "Extra1" ? "Extra1" : "Main",
    codec:      cam.codec === "hevc" ? "hevc" : "h264",
    decoder:    cam.decoder === "ffmpeg" ? "ffmpeg" : "opencv",
    ffmpegPath: cam.ffmpegPath ?? "ffmpeg",
    hwaccel:    cam.hwaccel ?? "",
  };
}

/** Why a Sofia source can't be saved, or null when it is acceptable. */
export function sofiaSourceProblem(s: SofiaSource): string | null {
  if (!s.host.trim()) return "Enter the camera's IP address or hostname.";
  const port = parseInt(s.port, 10);
  if (!Number.isFinite(port) || port < 1 || port > 65535) return "Port must be between 1 and 65535.";
  return null;
}

/** "192.168.0.50:34567" for a Sofia camera. */
export function sofiaHostPortOf(cam: Pick<CameraState, "host" | "port">): string {
  if (!cam.host) return "";
  return `${cam.host}:${cam.port ?? 34567}`;
}

const SCHEME = /^(rtsps?|https?):\/\//i;

export const isRtspUrl = (url: string) => /^rtsps?:\/\//i.test(url.trim());

/** Why a stream URL can't be saved, or null when it is acceptable. */
export function cameraUrlProblem(url: string): string | null {
  const u = url.trim();
  if (!u) return "Enter the camera's stream URL.";
  if (!SCHEME.test(u)) return "The URL must start with rtsp://, rtsps://, http:// or https://.";
  if (!hostPortOf(u)) return "The URL is missing a host (e.g. rtsp://192.168.0.50:554/stream1).";
  if (/\s/.test(u)) return "The URL can't contain spaces.";
  return null;
}

/** "192.168.0.50:554" from a stream URL — credentials, path and query stripped. */
export function hostPortOf(url: string | undefined): string {
  const m = /^[a-z][a-z0-9+.-]*:\/\/([^/?#]*)/i.exec((url ?? "").trim());
  if (!m) return "";
  const authority = m[1];
  return authority.slice(authority.lastIndexOf("@") + 1);
}

/** "RTSP" / "HTTP" / "Sofia" tag for a network or Sofia camera, null for USB. */
export function cameraSourceTag(cam: CameraState): "RTSP" | "HTTP" | "Sofia" | null {
  if (isSofiaCamera(cam)) return "Sofia";
  if (!isNetworkCamera(cam)) return null;
  return isRtspUrl(cam.url ?? "") ? "RTSP" : "HTTP";
}

/** The size the stream is delivering, when known ("1280×720"). */
export function streamSizeOf(cam: CameraState): string | null {
  return cam.connected && (cam.streamWidth ?? 0) > 0 && (cam.streamHeight ?? 0) > 0
    ? `${cam.streamWidth}×${cam.streamHeight}`
    : null;
}

/**
 * One-line description: "Device 0 · 640×480" for USB, "192.168.0.50:554 ·
 * 1280×720" for network cameras, "192.168.0.50:34567 · 1280×720" for Sofia
 * cameras (stream size once connected). Never includes credentials.
 */
export function cameraSourceSummary(cam: CameraState): string {
  if (isSofiaCamera(cam)) {
    const host = sofiaHostPortOf(cam) || "No host";
    const size = streamSizeOf(cam);
    return size ? `${host} · ${size}` : host;
  }
  if (!isNetworkCamera(cam)) return `Device ${cam.deviceIndex} · ${cam.width}×${cam.height}`;
  const host = hostPortOf(cam.url) || "No URL";
  const size = streamSizeOf(cam);
  return size ? `${host} · ${size}` : host;
}

/** "1280×720 · opened in 640 ms · first frame 910 ms" */
export function formatTestResult(r: CameraSourceTestResult): string {
  return `${r.width}×${r.height} · opened in ${Math.round(r.openMs)} ms · first frame ${Math.round(r.firstFrameMs)} ms`;
}

/** "login 120 ms · first frame 480 ms · H.265 · 1280×720" (size omitted when 0). */
export function formatSofiaTestResult(r: CameraSourceTestResult): string {
  const parts = [
    `login ${Math.round(r.loginMs ?? 0)} ms`,
    `first frame ${Math.round(r.firstFrameMs)} ms`,
  ];
  if (r.detectedCodec && r.detectedCodec !== "unknown") {
    parts.push(r.detectedCodec === "hevc" ? "H.265" : "H.264");
  }
  if (r.width > 0 && r.height > 0) parts.push(`${r.width}×${r.height}`);
  return parts.join(" · ");
}

/** Title and what-to-try for a failed TestCameraSource (network / RTSP / HTTP camera). */
export function testErrorHint(error: string | undefined): { title: string; hint: string } {
  switch (error) {
    case "invalidUrl":
      return { title: "Invalid URL", hint: "The controller couldn't parse this address. Use rtsp://host:port/path or http://host/path." };
    case "openFailed":
      return { title: "Couldn't open the stream", hint: "Check the address, port and credentials, and that the camera is reachable from the controller's network." };
    case "noFrame":
      return { title: "No picture received", hint: "The camera answered but sent no frame. Try the other transport (TCP/UDP) or a different stream path." };
    case "timeout":
      return { title: "Timed out", hint: "The camera didn't deliver a frame in time. Try the other transport (TCP/UDP) or a different stream path." };
    default:
      return { title: "Test failed", hint: error || "The controller couldn't open this stream." };
  }
}

/** Title and what-to-try for a failed TestCameraSource (Sofia / DVRIP / XMeye camera). */
export function sofiaTestErrorHint(error: string | undefined): { title: string; hint: string } {
  switch (error) {
    case "connectFailed":
      return { title: "Couldn't connect", hint: "Check the IP address and that the DVRIP port (34567 by default) is open and reachable from the controller." };
    case "loginFailed":
      return { title: "Login failed", hint: "Check the username and password — the Sofia login can differ from the camera's RTSP credentials." };
    case "claimFailed":
      return { title: "Couldn't start the stream", hint: "The camera logged in but refused to start the monitor stream. Try the other stream (Main/Sub), or reconnect the camera." };
    case "noFrame":
      return { title: "No picture received", hint: "The camera answered but sent no frame. Try the other stream (Main/Sub)." };
    case "timeout":
      return { title: "Timed out", hint: "The camera didn't deliver a frame in time. Try the other stream (Main/Sub), or check the network." };
    case "decoderUnavailable":
      return { title: "Decoder unavailable", hint: "The ffmpeg decoder couldn't be started. Check the ffmpeg path, or switch to the in-process decoder." };
    default:
      return { title: "Test failed", hint: error || "The controller couldn't reach this camera." };
  }
}

export const SOURCE_OPTIONS: { label: string; value: CameraSourceType }[] = [
  { label: "USB camera",     value: "usb" },
  { label: "Network camera", value: "network" },
  { label: "Sofia / XMeye",  value: "sofia" },
];

/** The source fields for AddCamera / SetCameraConfig. */
export function cameraSourceParams(source: CameraSourceType, n: NetworkSource, s: SofiaSource) {
  if (source === "network") {
    return {
      sourceType: "network" as const,
      url:        n.url.trim(),
      username:   n.username.trim(),
      password:   n.password,
      transport:  n.transport,
    };
  }
  if (source === "sofia") {
    return {
      sourceType: "sofia" as const,
      host:       s.host.trim(),
      port:       parseInt(s.port, 10) || 34567,
      username:   s.username.trim(),
      password:   s.password,
      stream:     s.stream,
      codec:      s.codec,
      decoder:    s.decoder,
      ffmpegPath: s.ffmpegPath.trim() || "ffmpeg",
      hwaccel:    s.hwaccel.trim(),
    };
  }
  return { sourceType: "usb" as const };
}
