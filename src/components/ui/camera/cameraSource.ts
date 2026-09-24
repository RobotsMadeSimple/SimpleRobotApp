// Display and validation helpers for USB vs network (RTSP / HTTP) cameras
// (docs/network-cameras.md in SimpleRobotController).

import { CameraSourceTestResult, CameraSourceType, CameraState, CameraTransport } from "@/src/models/robotModels";

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

/** "RTSP" / "HTTP" tag for a network camera, null for USB. */
export function cameraSourceTag(cam: CameraState): "RTSP" | "HTTP" | null {
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
 * 1280×720" for network cameras (stream size once connected). Never includes
 * credentials.
 */
export function cameraSourceSummary(cam: CameraState): string {
  if (!isNetworkCamera(cam)) return `Device ${cam.deviceIndex} · ${cam.width}×${cam.height}`;
  const host = hostPortOf(cam.url) || "No URL";
  const size = streamSizeOf(cam);
  return size ? `${host} · ${size}` : host;
}

/** "1280×720 · opened in 640 ms · first frame 910 ms" */
export function formatTestResult(r: CameraSourceTestResult): string {
  return `${r.width}×${r.height} · opened in ${Math.round(r.openMs)} ms · first frame ${Math.round(r.firstFrameMs)} ms`;
}

/** Title and what-to-try for a failed TestCameraSource. */
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

export const SOURCE_OPTIONS: { label: string; value: CameraSourceType }[] = [
  { label: "USB camera",     value: "usb" },
  { label: "Network camera", value: "network" },
];

/** The source fields for AddCamera / SetCameraConfig. */
export function cameraSourceParams(source: CameraSourceType, n: NetworkSource) {
  return source === "network"
    ? {
        sourceType: "network" as const,
        url:        n.url.trim(),
        username:   n.username.trim(),
        password:   n.password,
        transport:  n.transport,
      }
    : { sourceType: "usb" as const };
}
