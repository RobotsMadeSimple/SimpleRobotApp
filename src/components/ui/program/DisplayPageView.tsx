import React, { useCallback, useMemo, useRef } from "react";
import { StyleProp, ViewStyle } from "react-native";
import { WebView } from "react-native-webview";

import { useDisplayHost, wrapDisplayHtml } from "./displayBridge";

export type DisplayPageViewProps = {
  /** Body-level user HTML for the page (wrapped with the host bridge before rendering). */
  html: string;
  /** The program this page controls — its variables feed the page and run() starts it. */
  programName: string;
  programId?: string;
  style?: StyleProp<ViewStyle>;
};

/**
 * Native host for a program's custom display page. The user HTML runs in a WebView and talks
 * only to the injected `window.robot` bridge; {@link useDisplayHost} brokers every request
 * over the app's connection. See DisplayPageView.web.tsx for the browser/Electron half.
 */
export function DisplayPageView({ html, programName, programId, style }: DisplayPageViewProps) {
  const ref = useRef<WebView>(null);
  const post = useCallback((json: string) => {
    ref.current?.postMessage(json);
  }, []);
  const { handleIncoming } = useDisplayHost({ programName, programId, post });
  const source = useMemo(() => ({ html: wrapDisplayHtml(html) }), [html]);

  return (
    <WebView
      ref={ref}
      source={source}
      style={style}
      originWhitelist={["*"]}
      javaScriptEnabled
      domStorageEnabled
      setSupportMultipleWindows={false}
      onMessage={(e) => handleIncoming(e.nativeEvent.data)}
    />
  );
}
