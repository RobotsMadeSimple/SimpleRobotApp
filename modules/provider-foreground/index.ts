import { requireNativeModule } from "expo";

/**
 * JS wrapper for the `ProviderForeground` native module — a typed Android foreground service that
 * keeps the phone's camera/sensor streaming alive while the app is backgrounded or the screen is off.
 *
 * Android 14+ requires a foreground service of type `camera` to keep the camera open in the
 * background; `dataSync` covers the sensor/data WebSocket uploads and `location` covers background
 * GPS. The service also keeps the process from being killed so the WebRTC peer connection survives.
 *
 * Native-only: on web/Electron (and anywhere the module isn't linked) every call is a no-op.
 */

export type ForegroundServiceType = "camera" | "dataSync" | "location" | "microphone";

type NativeProviderForeground = {
  startService(title: string, text: string, types: ForegroundServiceType[]): void;
  stopService(): void;
};

let native: NativeProviderForeground | null = null;
try {
  native = requireNativeModule<NativeProviderForeground>("ProviderForeground");
} catch {
  native = null; // not linked (web/Electron/Expo Go) — calls below no-op
}

/** Whether the native foreground service is available on this build. */
export const foregroundServiceAvailable = native != null;

/**
 * Start (or update) the streaming foreground service. Safe to call repeatedly: a later call updates
 * the notification text and the active service-type mask. `types` must match the capabilities in use
 * — pass `camera` only while the camera is actually open (it requires the CAMERA runtime permission).
 */
export function startForegroundStreaming(
  title: string,
  text: string,
  types: ForegroundServiceType[] = ["camera", "dataSync"],
): void {
  try { native?.startService(title, text, types); } catch { /* service unavailable */ }
}

/** Stop the streaming foreground service and remove its notification. */
export function stopForegroundStreaming(): void {
  try { native?.stopService(); } catch { /* service unavailable */ }
}
