import React, { useEffect, useState } from "react";
import { Platform } from "react-native";
import { __setMockKeyboard } from "@/src/platform/keyboard";

/**
 * A fake soft keyboard for the web build, so keyboard/viewport bugs can be caught in Playwright
 * instead of on a phone. Off unless enabled (see `isEnabled`), so it costs nothing normally.
 *
 * It reproduces what a phone does when a field is focused:
 *  1. A keyboard-sized panel covers the bottom of the viewport, on top of everything — including
 *     modals, exactly like Android draws the IME over a translucent RN Modal.
 *  2. The page's layout area shrinks above the keyboard (document body height), which is what
 *     Android `adjustResize` does to a normal screen. Modals are `position: fixed` so they keep
 *     the full viewport and are not helped by this — they must react to the keyboard themselves.
 *  3. `src/platform/keyboard.ts` emits the same show/hide signal the native Keyboard would, so
 *     bottom sheets lift and the step modal scrolls its field clear, by the same code as on device.
 *
 * Enable with `localStorage.setItem("rms.mockKeyboard", "<height px | NN%>")` (or `?mockKeyboard=`).
 * The audit (`scripts/keyboard-audit.mjs`) reads `window.__mockKeyboard` to know the keyboard's top.
 */
export function MockKeyboard() {
  const [height, setHeight] = useState(0);
  const [spec] = useState(() => (Platform.OS === "web" ? readSpec() : null));

  useEffect(() => {
    if (Platform.OS !== "web" || !spec) return;
    const doc = document;
    const resolve = () => (spec.endsWith("%")
      ? Math.round(window.innerHeight * (parseFloat(spec) / 100))
      : Math.round(parseFloat(spec))) || Math.round(window.innerHeight * 0.42);
    // Text-entry only — an RN Switch is an <input type=checkbox> on web and raises no keyboard.
    const NON_TEXT = new Set(["hidden", "checkbox", "radio", "range", "button", "submit", "reset", "file", "color", "image"]);
    const isField = (el: Element | null): el is HTMLElement =>
      !!el && ((el.tagName === "INPUT" && !NON_TEXT.has((el as HTMLInputElement).type))
        || el.tagName === "TEXTAREA" || (el as HTMLElement).isContentEditable);
    let hideTimer: ReturnType<typeof setTimeout> | null = null;

    const show = () => {
      if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
      const h = resolve();
      setHeight(h);
      // Android adjustResize: the page gets the area above the keyboard. Modals stay fixed/full.
      doc.body.style.height = `calc(100% - ${h}px)`;
      window.dispatchEvent(new Event("resize"));
      __setMockKeyboard({ visible: true, height: h, screenY: window.innerHeight - h });
      (window as any).__mockKeyboard = { visible: true, height: h, top: window.innerHeight - h };
      // Android also scrolls the focused view back into the shrunken area.
      const el = doc.activeElement as HTMLElement | null;
      if (isField(el)) requestAnimationFrame(() => el.scrollIntoView?.({ block: "nearest" }));
    };
    const hide = () => {
      setHeight(0);
      doc.body.style.height = "";
      window.dispatchEvent(new Event("resize"));
      __setMockKeyboard(null);
      (window as any).__mockKeyboard = { visible: false, height: 0, top: window.innerHeight };
    };
    const onFocusIn = (e: FocusEvent) => { if (isField(e.target as Element)) show(); };
    const onFocusOut = () => {
      // Focus moving between two fields keeps the keyboard up, as on a phone.
      hideTimer = setTimeout(() => { if (!isField(doc.activeElement)) hide(); }, 60);
    };
    doc.addEventListener("focusin", onFocusIn);
    doc.addEventListener("focusout", onFocusOut);
    (window as any).__mockKeyboard = { visible: false, height: 0, top: window.innerHeight, enabled: true };
    if (isField(doc.activeElement)) show();
    return () => {
      doc.removeEventListener("focusin", onFocusIn);
      doc.removeEventListener("focusout", onFocusOut);
      hide();
    };
  }, [spec]);

  if (Platform.OS !== "web" || !spec || height === 0) return null;
  // A DOM portal onto <body>: outside the RN root so it sits above every RN Modal (z-index 9999).
  // react-dom ships with the Expo web target but has no types installed here, hence the cast.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { createPortal } = require("react-dom") as { createPortal: (node: React.ReactNode, container: Element) => React.ReactPortal };
  return createPortal(
    <div
      data-testid="mock-keyboard"
      data-top={window.innerHeight - height}
      onMouseDown={e => e.preventDefault()} // a tap on the keyboard never steals focus
      style={{
        position: "fixed", left: 0, right: 0, bottom: 0, height,
        zIndex: 2147483647, background: "#d1d5db", borderTop: "1px solid #9ca3af",
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
        fontFamily: "system-ui, sans-serif", color: "#374151", userSelect: "none",
      }}
    >
      <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: 1, opacity: 0.7 }}>MOCK KEYBOARD</div>
      <div style={{ fontSize: 11, opacity: 0.6, marginTop: 4 }}>{height}px — focused field must stay visible above this line</div>
      <button
        type="button"
        onClick={() => (document.activeElement as HTMLElement | null)?.blur?.()}
        style={{ marginTop: 12, padding: "6px 18px", borderRadius: 8, border: "1px solid #9ca3af", background: "#f3f4f6", fontWeight: 600 }}
      >
        Done
      </button>
    </div>,
    document.body,
  );
}

function readSpec(): string | null {
  try {
    const q = new URLSearchParams(window.location.search).get("mockKeyboard");
    if (q) { try { localStorage.setItem("rms.mockKeyboard", q); } catch {} return q; }
    return localStorage.getItem("rms.mockKeyboard");
  } catch {
    return null;
  }
}
