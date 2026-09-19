import React, { forwardRef, useImperativeHandle, useRef } from "react";
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

    useImperativeHandle(ref, () => ({
      injectJavaScript: (code: string) => { webRef.current?.injectJavaScript(code); },
    }), []);

    return (
      <WebView
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
