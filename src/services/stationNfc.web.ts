// NFC is not available on web / Electron — these are no-op stubs so the shared screens type-check
// and degrade gracefully. The web UI hides NFC controls based on nfcIsSupported() → false.

export async function nfcIsSupported(): Promise<boolean> {
  return false;
}

export async function readStationUri(): Promise<string | null> {
  return null;
}

export async function writeStationUri(_uri: string): Promise<void> {
  throw new Error("NFC is only available on a phone.");
}

export function cancelNfc(): void {
  /* nothing to cancel on web */
}
