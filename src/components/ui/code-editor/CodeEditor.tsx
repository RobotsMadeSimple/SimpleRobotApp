import React, { forwardRef, useCallback, useMemo, useRef, useState } from "react";
import { WebView, type WebViewMessageEvent } from "react-native-webview";
import type { EditorCommand, EditorEvent } from "./bridge";
import { makeCodeEditorHtml } from "./codeEditorHtml";
import type { CodeEditorHandle, CodeEditorProps } from "./codeEditorTypes";
import { useEditorSync } from "./useEditorSync";

/**
 * Native: the SRS code editor is CodeMirror 6 running in a WebView, from a bundle inlined in the
 * HTML (codeEditorHtml.ts) — React Native has no code editor and robots are often offline.
 * Commands are injected as `window.__srs.apply(…)`; events come back through onMessage.
 * Commands sent before the page reports "ready" are queued and flushed then.
 *
 * Android may kill the WebView's render process while the app is in the background. The page
 * is then rebuilt (a fresh WebView, keyed) from the latest text this side has seen — the user's
 * typing, not the text it was first opened with — and the cursor is put back where it was.
 *
 * See CodeEditor.web.tsx for the browser half; Metro picks by platform.
 */
export const CodeEditor = forwardRef<CodeEditorHandle, CodeEditorProps>(function CodeEditor(props, ref) {
  const webRef = useRef<WebView>(null);
  const readyRef = useRef(false);
  const queue = useRef<EditorCommand[]>([]);
  const [ready, setReady] = useState(false);
  const cb = useRef(props);
  cb.current = props;
  // The latest text and cursor (typed, or set through the handle) — what a rebuilt page restores.
  const lastText = useRef(props.initialText);
  const lastCursor = useRef<{ line: number; col: number } | null>(null);
  const restoring = useRef(false);
  const [generation, setGeneration] = useState(0);

  // The HTML is built once per WebView: later text changes go through setText, never a reload.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const html = useMemo(() => makeCodeEditorHtml({ text: lastText.current, readOnly: !!cb.current.readOnly }), [generation]);

  const send = useCallback((cmd: EditorCommand) => {
    if (cmd.type === "setText") lastText.current = cmd.text;
    if (!readyRef.current) { queue.current.push(cmd); return; }
    webRef.current?.injectJavaScript(`window.__srs&&window.__srs.apply(${JSON.stringify(cmd)});true;`);
  }, []);

  useEditorSync(ref, send, props, ready);

  const onMessage = useCallback((e: WebViewMessageEvent) => {
    let ev: EditorEvent;
    try { ev = JSON.parse(e.nativeEvent.data); } catch { return; }
    const p = cb.current;
    switch (ev.type) {
      case "ready": {
        readyRef.current = true;
        const pending = queue.current; queue.current = [];
        // A rebuilt page: back to where the cursor was (no focus — the keyboard stays down).
        if (restoring.current && lastCursor.current) pending.push({ type: "jumpTo", ...lastCursor.current, focus: false });
        if (pending.length) webRef.current?.injectJavaScript(`window.__srs&&window.__srs.applyAll(${JSON.stringify(pending)});true;`);
        setReady(true);
        // The owner's onReady is for the first load (e.g. its opening jump), not a rebuild.
        if (!restoring.current) p.onReady?.();
        restoring.current = false;
        break;
      }
      case "change": lastText.current = ev.text; p.onChange?.(ev.text); break;
      case "cursor": lastCursor.current = { line: ev.line, col: ev.col }; p.onCursor?.(ev.line, ev.col); break;
      case "focus": p.onFocusChange?.(ev.focused); break;
      case "toggleBreakpoint": p.onToggleBreakpoint?.(ev.line); break;
      case "tapLine": p.onTapLine?.(ev.line); break;
      case "viewport": p.onViewport?.(ev.topLine); break;
      case "error": console.warn("[CodeEditor]", ev.message); break;
    }
  }, []);

  // The page is gone (Android reclaimed the render process, iOS's content process ended): that
  // WebView cannot be reused, so mount a fresh one built from the latest text; state re-syncs on
  // its "ready".
  const rebuild = useCallback(() => {
    readyRef.current = false;
    queue.current = [];
    restoring.current = true;
    setReady(false);
    setGeneration(g => g + 1);
  }, []);

  return (
    <WebView
      key={generation}
      ref={webRef}
      source={{ html }}
      style={[{ backgroundColor: "#ffffff" }, props.style]}
      originWhitelist={["*"]}
      javaScriptEnabled
      // The editor scrolls itself; the WebView must not.
      scrollEnabled={false}
      // Android: inside the builder's page ScrollView the parent would take every vertical swipe,
      // so the editor (even a read-only preview) could never scroll. Let it scroll first.
      nestedScrollEnabled
      overScrollMode="never"
      hideKeyboardAccessoryView
      keyboardDisplayRequiresUserAction={false}
      onContentProcessDidTerminate={rebuild}
      onRenderProcessGone={rebuild}
      onMessage={onMessage}
    />
  );
});
