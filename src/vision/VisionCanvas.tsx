import React, { forwardRef, useCallback, useImperativeHandle, useRef, useState } from "react";
import { WebView } from "react-native-webview";
import type { VisionCanvasHandle, VisionCanvasProps } from "./visionCanvasTypes";

/**
 * Native: a WebView, which is what the vision HTML was written against.
 *
 * The queueing the handle promises is free here — `injectJavaScript` on a ref that
 * has not mounted is already a no-op, and the only pre-load injections in the
 * editor re-send state the HTML embeds anyway. Web has to work harder for it.
 *
 * See VisionCanvas.web.tsx for the browser half; Metro picks by platform.
 */
export const VisionCanvas = forwardRef<VisionCanvasHandle, VisionCanvasProps>(
  function VisionCanvas({ html, style, onMessage, onLoad, focusable }, ref) {
    const webRef = useRef<WebView>(null);
    // Bumped when the WebView's renderer dies (Android can kill it under memory pressure, a live
    // feed is heavy): a fresh WebView loads the document again and onLoad re-sends the host's state,
    // instead of a dead, frozen picture (or, unhandled, the whole app going down).
    const [life, setLife] = useState(0);
    const revive = useCallback((why: string) => {
      console.warn(`[VisionCanvas] ${why}; reloading the document`);
      setLife(n => n + 1);
    }, []);

    useImperativeHandle(ref, () => ({
      injectJavaScript: (code: string) => { webRef.current?.injectJavaScript(code); },
    }), []);

    return (
      <WebView
        key={life}
        onRenderProcessGone={(e) => revive(`renderer gone (crashed: ${e.nativeEvent.didCrash})`)}
        onContentProcessDidTerminate={() => revive("content process terminated")}
        ref={webRef}
        source={{ html }}
        style={style}
        scrollEnabled={false}
        originWhitelist={["*"]}
        javaScriptEnabled
        focusable={focusable}
        accessible={focusable !== false}
        onLoad={onLoad}
        onMessage={onMessage}
      />
    );
  }
);
