import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { View } from "react-native";

import type { Cell3DCommand, Cell3DEvent } from "./bridge";
import { makeCell3DHtml } from "./cell3dHtml";
import type { Cell3DViewProps } from "./cell3dViewTypes";
import { useCell3DExtras, useCell3DFeed, useCell3DPrefs, useCell3DSync } from "./useCell3DFeed";

export type { Cell3DViewProps } from "./cell3dViewTypes";

/**
 * Web and Electron: the same viewer page as native (cell3dHtml.ts) in an iframe, so three.js lives
 * only in the inlined bundle. Commands go in as postMessage({ __c3d: 1, cmds }); events come back
 * the same way (checked against this iframe's window).
 */
export function Cell3DView({ style, theme = "light", options, defaultView = "iso", persistKey, sets, highlight, focusHighlight, preview, onPick }: Cell3DViewProps) {
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  const [ready, setReady] = useState(false);
  const { prefs, save } = useCell3DPrefs(persistKey, { options: { trail: false, points: false, locals: false, ...options }, view: defaultView });
  const feed = useCell3DFeed(true);

  // The page is built once; later changes go through commands.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const srcDoc = useMemo(() => makeCell3DHtml({ theme, options: prefs.options, view: prefs.view }), []);

  const send = useCallback((cmds: Cell3DCommand[]) => {
    frameRef.current?.contentWindow?.postMessage(JSON.stringify({ __c3d: 1, cmds }), "*");
  }, []);

  // `toggles` rides in prefs.options from the defaults; only the on/off states are remembered.
  // The caller's point filter is live (never remembered): a program or selection can change it.
  const pointIdsKey = Array.isArray(options?.pointIds) ? `[${options.pointIds.join("|")}` : "";
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const mergedOptions = useMemo(() => ({ ...prefs.options, controls: options?.controls ?? prefs.options.controls, pointIds: options?.pointIds ?? null }), [prefs.options, options?.controls, pointIdsKey]);
  useCell3DSync(feed, send, ready, { theme, options: mergedOptions });
  useCell3DExtras(send, ready, { sets, highlight, focus: focusHighlight, preview });
  const onPickRef = useRef(onPick);
  useEffect(() => { onPickRef.current = onPick; }, [onPick]);

  const sentView = useRef(prefs.view);
  useEffect(() => {
    if (ready && sentView.current !== prefs.view) { sentView.current = prefs.view; send([{ type: "view", view: prefs.view }]); }
  }, [ready, prefs.view, send]);

  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      if (!frameRef.current || e.source !== frameRef.current.contentWindow) return;
      let ev: Cell3DEvent & { __c3d?: number };
      try { ev = typeof e.data === "string" ? JSON.parse(e.data) : e.data; } catch { return; }
      if (!ev || ev.__c3d !== 1) return;
      if (ev.type === "ready") setReady(true);
      else if (ev.type === "options") { sentView.current = ev.view; save({ options: { trail: ev.options.trail, points: ev.options.points, locals: ev.options.locals, sets: ev.options.sets }, view: ev.view }); }
      else if (ev.type === "pick") onPickRef.current?.(ev.target);
      else if (ev.type === "error") console.warn("[Cell3DView]", ev.message);
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, [save]);

  return (
    <View style={[{ overflow: "hidden", backgroundColor: theme === "dark" ? "#121519" : "#EDEFF2" }, style]}>
      <iframe
        ref={frameRef}
        srcDoc={srcDoc}
        title="3D view"
        sandbox="allow-scripts allow-same-origin"
        style={{ width: "100%", height: "100%", border: 0, display: "block", background: "transparent" }}
      />
    </View>
  );
}
