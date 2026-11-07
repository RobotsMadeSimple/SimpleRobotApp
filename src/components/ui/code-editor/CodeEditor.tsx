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
 * See CodeEditor.web.tsx for the browser half; Metro picks by platform.
 */
export const CodeEditor = forwardRef<CodeEditorHandle, CodeEditorProps>(function CodeEditor(props, ref) {
  const webRef = useRef<WebView>(null);
  const readyRef = useRef(false);
  const queue = useRef<EditorCommand[]>([]);
  const [ready, setReady] = useState(false);
  const cb = useRef(props);
  cb.current = props;

  // The HTML is built once: later text changes go through setText, never a reload.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const html = useMemo(() => makeCodeEditorHtml({ text: props.initialText, readOnly: !!props.readOnly }), []);

  const send = useCallback((cmd: EditorCommand) => {
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
        if (pending.length) webRef.current?.injectJavaScript(`window.__srs&&window.__srs.applyAll(${JSON.stringify(pending)});true;`);
        setReady(true);
        p.onReady?.();
        break;
      }
      case "change": p.onChange?.(ev.text); break;
      case "cursor": p.onCursor?.(ev.line, ev.col); break;
      case "focus": p.onFocusChange?.(ev.focused); break;
      case "toggleBreakpoint": p.onToggleBreakpoint?.(ev.line); break;
      case "tapLine": p.onTapLine?.(ev.line); break;
      case "error": console.warn("[CodeEditor]", ev.message); break;
    }
  }, []);

  return (
    <WebView
      ref={webRef}
      source={{ html }}
      style={[{ backgroundColor: "#ffffff" }, props.style]}
      originWhitelist={["*"]}
      javaScriptEnabled
      // The editor scrolls itself; the WebView must not.
      scrollEnabled={false}
      overScrollMode="never"
      hideKeyboardAccessoryView
      keyboardDisplayRequiresUserAction={false}
      // A reload (the OS reclaimed the WebView) starts over: re-queue state on the next "ready".
      onContentProcessDidTerminate={() => { readyRef.current = false; setReady(false); webRef.current?.reload(); }}
      onRenderProcessGone={() => { readyRef.current = false; setReady(false); webRef.current?.reload(); }}
      onMessage={onMessage}
    />
  );
});
