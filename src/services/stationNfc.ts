import NfcManager, { Ndef, NfcTech, type TagEvent } from "react-native-nfc-manager";

// Thin wrapper around react-native-nfc-manager for reading/writing station links as NDEF.
// Station tags carry the link as a single NDEF **URI record** (simplerobotapp://station?…), which is
// also what the OS acts on to auto-launch the app when a tag is tapped from outside the app.

let started = false;

async function ensureStarted(): Promise<boolean> {
  if (started) return true;
  try {
    await NfcManager.start();
    started = true;
    return true;
  } catch {
    return false;
  }
}

export async function nfcIsSupported(): Promise<boolean> {
  try {
    if (!(await NfcManager.isSupported())) return false;
    return await ensureStarted();
  } catch {
    return false;
  }
}

/** Decode the first URI/Text NDEF record on a tag to a plain string (or null). */
function decodeFirstUri(tag: TagEvent | null): string | null {
  const records = tag?.ndefMessage ?? [];
  for (const rec of records) {
    const payload = rec?.payload;
    if (!payload || payload.length === 0) continue;
    const bytes = Uint8Array.from(payload as number[]);
    try {
      // Well-known URI record ('U'): decodePayload expands the URI prefix byte.
      const uri = Ndef.uri.decodePayload(bytes);
      if (uri) return uri;
    } catch {
      /* not a URI record — try text next */
    }
    try {
      const text = Ndef.text.decodePayload(bytes);
      if (text) return text;
    } catch {
      /* not a text record either */
    }
  }
  return null;
}

/**
 * Read one tag held to the phone and return the decoded URI string, or null.
 * Always releases the NFC technology so a later read/write can acquire it.
 */
export async function readStationUri(): Promise<string | null> {
  if (!(await ensureStarted())) return null;
  try {
    await NfcManager.requestTechnology(NfcTech.Ndef);
    const tag = await NfcManager.getTag();
    return decodeFirstUri(tag);
  } finally {
    NfcManager.cancelTechnologyRequest().catch(() => {});
  }
}

/** Write a station URI to a blank/rewritable tag as a single NDEF URI record. */
export async function writeStationUri(uri: string): Promise<void> {
  if (!(await ensureStarted())) throw new Error("NFC is not available on this device.");
  try {
    await NfcManager.requestTechnology(NfcTech.Ndef);
    const bytes = Ndef.encodeMessage([Ndef.uriRecord(uri)]);
    if (!bytes) throw new Error("Could not encode the tag payload.");
    await NfcManager.ndefHandler.writeNdefMessage(bytes);
  } finally {
    NfcManager.cancelTechnologyRequest().catch(() => {});
  }
}

/** Abort an in-progress request (e.g. the user cancelled the "hold a tag" prompt). */
export function cancelNfc(): void {
  NfcManager.cancelTechnologyRequest().catch(() => {});
}
