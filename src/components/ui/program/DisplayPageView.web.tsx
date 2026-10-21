import React, { useCallback, useEffect, useMemo, useRef } from "react";
import { StyleProp, View, ViewStyle } from "react-native";

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
 * Web/Electron host for a program's custom display page: the user HTML renders in an iframe
 * (react-native-webview has no browser implementation) and talks to the injected `window.robot`
 * bridge via postMessage; {@link useDisplayHost} brokers every request over the app's connection.
 */
export function DisplayPageView({ html, programName, programId, style }: DisplayPageViewProps) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const post = useCallback((json: string) => {
    iframeRef.current?.contentWindow?.postMessage(json, "*");
  }, []);
  const { handleIncoming } = useDisplayHost({ programName, programId, post });

  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      if (iframeRef.current && e.source === iframeRef.current.contentWindow)
        handleIncoming(typeof e.data === "string" ? e.data : "");
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, [handleIncoming]);

  const srcDoc = useMemo(() => wrapDisplayHtml(html), [html]);

  return (
    <View style={style}>
      <iframe
        ref={iframeRef}
        srcDoc={srcDoc}
        title="Display page"
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
        style={{ width: "100%", height: "100%", border: 0, display: "block", background: "transparent" }}
      />
    </View>
  );
}
