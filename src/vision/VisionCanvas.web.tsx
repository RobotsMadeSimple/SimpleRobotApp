import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useRef } from "react";
import { View } from "react-native";
import type { VisionCanvasHandle, VisionCanvasProps } from "./visionCanvasTypes";

/**
 * Web: an iframe standing in for the native WebView.
 *
 * `react-native-webview` has no browser implementation — it renders "React Native
 * WebView does not support this platform" — so the vision editor was blank on web
 * and in Electron. An iframe with `srcdoc` runs exactly the same documents; only
 * the two bridges have to be rebuilt.
 *
 * **Child to parent.** The HTML calls `window.ReactNativeWebView.postMessage`,
 * which does not exist here, so BRIDGE defines it in terms of `parent.postMessage`.
 * It goes in ahead of the document's own scripts because some of them post during
 * load, and a bridge defined afterwards would miss those first messages.
 *
 * **Parent to child.** `injectJavaScript` appends a `<script>` to the child
 * document rather than calling `eval`, which a Content-Security-Policy is far more
 * likely to block — and the documents already rely on inline script running.
 *
 * The iframe is deliberately left unsandboxed so it inherits this origin. Both
 * bridges need that: without it the child document is unreachable and injection
 * cannot work at all. The documents are ours, built in visionHtml.ts.
 */

const MARKER = "__visionCanvas";

// String(m) because the native bridge only ever carries strings, and a caller that
// passed an object would otherwise arrive here as a structured clone and break the
// JSON.parse every onMessage handler does.
const BRIDGE = `<script>
window.ReactNativeWebView={postMessage:function(m){
  try{parent.postMessage({${MARKER}:true,data:String(m)},'*')}catch(e){}
}};
<\/script>`;

/** The document with the bridge in front of its own scripts. */
function withBridge(html: string): string {
  const head = html.indexOf("<head>");
  return head === -1
    ? BRIDGE + html
    : html.slice(0, head + 6) + BRIDGE + html.slice(head + 6);
}

export const VisionCanvas = forwardRef<VisionCanvasHandle, VisionCanvasProps>(
  function VisionCanvas({ html, style, onMessage, onLoad, focusable }, ref) {
    const frameRef   = useRef<HTMLIFrameElement | null>(null);
    const readyRef   = useRef(false);
    const pendingRef = useRef<string[]>([]);

    // Held in refs so the message listener can be registered once. Re-subscribing
    // on every render would drop messages in the gap between the two listeners.
    const onMessageRef = useRef(onMessage);
    const onLoadRef    = useRef(onLoad);
    onMessageRef.current = onMessage;
    onLoadRef.current    = onLoad;

    const run = useCallback((code: string) => {
      const doc = frameRef.current?.contentWindow?.document;
      if (!readyRef.current || !doc?.body) { pendingRef.current.push(code); return; }
      const el = doc.createElement("script");
      el.text = code;
      doc.body.appendChild(el);
      // The script has already run by the time appendChild returns; leaving the
      // node behind would pile up one per injection for the life of the canvas.
      doc.body.removeChild(el);
    }, []);

    useImperativeHandle(ref, () => ({ injectJavaScript: run }), [run]);

    // A new document means the old one is gone, so anything injected into it is
    // void and the next load starts from an empty queue.
    useEffect(() => {
      readyRef.current = false;
      pendingRef.current = [];
    }, [html]);

    useEffect(() => {
      function handle(event: MessageEvent) {
        // Anything on the page can post to this window — other iframes, extensions,
        // the dev server. Only messages from our own frame, carrying our marker,
        // are ours to deliver.
        if (event.source !== frameRef.current?.contentWindow) return;
        const payload = event.data as { [MARKER]?: boolean; data?: string };
        if (!payload || payload[MARKER] !== true) return;
        onMessageRef.current?.({ nativeEvent: { data: String(payload.data ?? "") } });
      }
      window.addEventListener("message", handle);
      return () => window.removeEventListener("message", handle);
    }, []);

    const handleLoad = useCallback(() => {
      if (!frameRef.current?.contentWindow?.document?.body) return;
      readyRef.current = true;
      const queued = pendingRef.current;
      pendingRef.current = [];
      // Before onLoad, so a handler that injects sees the canvas in the state the
      // queued calls left it — the same order native gives.
      queued.forEach(run);
      onLoadRef.current?.();
    }, [run]);

    return (
      <View style={style}>
        <iframe
          ref={frameRef}
          srcDoc={withBridge(html)}
          onLoad={handleLoad}
          scrolling="no"
          tabIndex={focusable === false ? -1 : undefined}
          title="Vision canvas"
          style={{ width: "100%", height: "100%", border: 0, display: "block",
                   background: "transparent" }}
        />
      </View>
    );
  }
);
