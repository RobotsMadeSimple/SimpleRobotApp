import { useEffect, useState } from "react";
import { Keyboard, Platform } from "react-native";

/**
 * One keyboard signal for the whole app. Components that must stay clear of the keyboard
 * (bottom sheets, modal footers, scroll-to-focused-field) subscribe here rather than to
 * `Keyboard` directly, so that:
 *  - native gets the real keyboard (keyboardWillShow on iOS for a smooth lift, keyboardDidShow
 *    on Android where Will* never fires), and
 *  - web gets the mock keyboard (src/components/dev/MockKeyboard.tsx), which lets the Playwright
 *    keyboard audit (scripts/keyboard-audit.mjs) drive exactly the same code paths a phone would.
 *
 * `screenY` is the keyboard's top edge in window coordinates — compare a focused field's
 * measureInWindow() bottom against it to know whether the field is covered.
 */
export type KeyboardInfo = { visible: boolean; height: number; screenY: number };

type Listener = (k: KeyboardInfo) => void;

const HIDDEN: KeyboardInfo = { visible: false, height: 0, screenY: Number.POSITIVE_INFINITY };

// ── Web: a tiny emitter the mock keyboard drives ──────────────────────────────
const webListeners = new Set<Listener>();
let webState: KeyboardInfo = HIDDEN;

/** Web only — called by the mock keyboard when it shows/hides. */
export function __setMockKeyboard(k: KeyboardInfo | null) {
  webState = k ?? HIDDEN;
  webListeners.forEach(l => l(webState));
}

/** The current keyboard state (web: the mock's; native: best effort from Keyboard.metrics). */
export function getKeyboard(): KeyboardInfo {
  if (Platform.OS === "web") return webState;
  const m = (Keyboard as any).metrics?.();
  return m && (Keyboard as any).isVisible?.()
    ? { visible: true, height: m.height, screenY: m.screenY }
    : HIDDEN;
}

/** Subscribe to keyboard show/hide. Returns an unsubscribe. */
export function addKeyboardListener(cb: Listener): () => void {
  if (Platform.OS === "web") {
    webListeners.add(cb);
    return () => { webListeners.delete(cb); };
  }
  const showEvt = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
  const hideEvt = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
  const s1 = Keyboard.addListener(showEvt, (e: any) => {
    const height = e?.endCoordinates?.height ?? 0;
    const screenY = e?.endCoordinates?.screenY ?? Number.POSITIVE_INFINITY;
    cb({ visible: height > 0, height, screenY });
  });
  const s2 = Keyboard.addListener(hideEvt, () => cb(HIDDEN));
  return () => { s1.remove(); s2.remove(); };
}

/** The keyboard's current height (0 when hidden), re-rendering on change. */
export function useKeyboardHeight(): number {
  const [h, setH] = useState(() => getKeyboard().height);
  useEffect(() => {
    // An autoFocus field focuses at mount, before this effect subscribes — so the keyboard may
    // already be up by now. Re-read it rather than wait for the next event (deferred, not sync).
    const k = getKeyboard();
    if (k.visible) setTimeout(() => setH(getKeyboard().height), 0);
    return addKeyboardListener(k => setH(k.visible ? k.height : 0));
  }, []);
  return h;
}
