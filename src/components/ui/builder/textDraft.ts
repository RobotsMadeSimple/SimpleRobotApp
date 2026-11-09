import AsyncStorage from "@react-native-async-storage/async-storage";

// The Text view's working text, per program (keyed by the program's stable id, never its name),
// kept on the device while the view is open. It is what a cold start gets back after the OS
// killed the app in the background with text not yet saved — including text with errors that was
// never applied. Removed when the view closes normally (Blocks, Save, Discard, leaving the
// builder), so only a killed session leaves one behind.

const STORAGE_PREFIX = "rms.textDraft.";
/** Older drafts are dropped rather than restored. */
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

type StoredDraft = { text: string; savedAt: number };

export function saveTextDraft(programId: string, text: string) {
  if (!programId) return;
  const d: StoredDraft = { text, savedAt: Date.now() };
  AsyncStorage.setItem(STORAGE_PREFIX + programId, JSON.stringify(d)).catch(() => { /* storage unavailable */ });
}

export function clearTextDraft(programId: string) {
  if (!programId) return;
  AsyncStorage.removeItem(STORAGE_PREFIX + programId).catch(() => { /* storage unavailable */ });
}

/** The program's left-behind draft text, or null. */
export async function loadTextDraft(programId: string): Promise<string | null> {
  if (!programId) return null;
  try {
    const raw = await AsyncStorage.getItem(STORAGE_PREFIX + programId);
    if (!raw) return null;
    const d = JSON.parse(raw) as Partial<StoredDraft>;
    if (typeof d.text !== "string" || typeof d.savedAt !== "number" || Date.now() - d.savedAt > MAX_AGE_MS) {
      clearTextDraft(programId);
      return null;
    }
    return d.text;
  } catch {
    return null;
  }
}
