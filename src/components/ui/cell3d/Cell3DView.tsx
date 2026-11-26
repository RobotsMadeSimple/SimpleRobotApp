import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import { WebView, type WebViewMessageEvent } from "react-native-webview";

import type { Cell3DCommand, Cell3DEvent } from "./bridge";
import { makeCell3DHtml } from "./cell3dHtml";
import type { Cell3DViewProps } from "./cell3dViewTypes";
import { useCell3DExtras, useCell3DFeed, useCell3DPrefs, useCell3DSync } from "./useCell3DFeed";

export type { Cell3DViewProps } from "./cell3dViewTypes";

/**
 * Native: the live 3D cell viewer is three.js in a WebView, from a bundle inlined in the HTML
 * (cell3dHtml.ts) — robots are often offline. Commands are injected as `window.__c3d.applyAll(…)`;
 * events come back through onMessage. Nothing is sent before the page reports "ready"; the full
 * picture goes then (useCell3DSync). If Android reclaims the render process, a fresh WebView is
 * mounted and re-synced. See Cell3DView.web.tsx for the browser half; Metro picks by platform.
 */
export function Cell3DView({ style, theme = "light", options, defaultView = "iso", persistKey, sets, highlight, focusHighlight, preview, onPick }: Cell3DViewProps) {
  const webRef = useRef<WebView>(null);
  const [ready, setReady] = useState(false);
  const [generation, setGeneration] = useState(0);
  const { prefs, save } = useCell3DPrefs(persistKey, { options: { trail: false, points: false, locals: false, ...options }, view: defaultView });
  const feed = useCell3DFeed(true);

  // Built once per WebView: later changes go through commands, never a reload.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const html = useMemo(() => makeCell3DHtml({ theme, options: prefs.options, view: prefs.view }), [generation]);

  const send = useCallback((cmds: Cell3DCommand[]) => {
    webRef.current?.injectJavaScript(`window.__c3d&&window.__c3d.applyAll(${JSON.stringify(cmds)});true;`);
  }, []);

  // `toggles` (like the initial toggles) rides in prefs.options from the defaults; only the on/off
  // states are remembered.
  // The caller's point filter is live (never remembered): a program or selection can change it.
  const pointIdsKey = Array.isArray(options?.pointIds) ? `[${options.pointIds.join("|")}` : "";
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const mergedOptions = useMemo(() => ({ ...prefs.options, controls: options?.controls ?? prefs.options.controls, pointIds: options?.pointIds ?? null }), [prefs.options, options?.controls, pointIdsKey]);
  useCell3DSync(feed, send, ready, { theme, options: mergedOptions });
  useCell3DExtras(send, ready, { sets, highlight, focus: focusHighlight, preview });
  const onPickRef = useRef(onPick);
  useEffect(() => { onPickRef.current = onPick; }, [onPick]);

  // A remembered view arriving after the page loaded (AsyncStorage is async).
  const sentView = useRef(prefs.view);
  useEffect(() => {
    if (ready && sentView.current !== prefs.view) { sentView.current = prefs.view; send([{ type: "view", view: prefs.view }]); }
  }, [ready, prefs.view, send]);

  const onMessage = useCallback((e: WebViewMessageEvent) => {
    let ev: Cell3DEvent & { __c3d?: number };
    try { ev = JSON.parse(e.nativeEvent.data); } catch { return; }
    if (ev.__c3d !== 1) return;
    if (ev.type === "ready") setReady(true);
    else if (ev.type === "options") { sentView.current = ev.view; save({ options: { trail: ev.options.trail, points: ev.options.points, locals: ev.options.locals, sets: ev.options.sets }, view: ev.view }); }
    else if (ev.type === "pick") onPickRef.current?.(ev.target);
    else if (ev.type === "error") console.warn("[Cell3DView]", ev.message);
  }, [save]);

  const rebuild = useCallback(() => { setReady(false); setGeneration(g => g + 1); }, []);

  return (
    <View style={[styles.box, { backgroundColor: theme === "dark" ? "#121519" : "#EDEFF2" }, style]}>
      <WebView
        key={generation}
        ref={webRef}
        source={{ html }}
        style={styles.web}
        originWhitelist={["*"]}
        javaScriptEnabled
        scrollEnabled={false}
        nestedScrollEnabled
        overScrollMode="never"
        // Meshes come from http://<robot>:9000 while the page itself is inline HTML.
        mixedContentMode="always"
        androidLayerType="hardware"
        setBuiltInZoomControls={false}
        onContentProcessDidTerminate={rebuild}
        onRenderProcessGone={rebuild}
        onMessage={onMessage}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  box: { overflow: "hidden" },
  web: { flex: 1, backgroundColor: "transparent" },
});
