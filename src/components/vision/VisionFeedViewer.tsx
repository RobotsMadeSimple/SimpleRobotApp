import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef } from "react";
import { StyleSheet, Text, View } from "react-native";
import { VisionCanvas } from "@/src/vision/VisionCanvas";
import type { VisionCanvasHandle } from "@/src/vision/visionCanvasTypes";
import { FEED_HTML } from "@/src/vision/visionHtml";
import type { FeedOverlayItem } from "@/src/vision/feedOverlay";
import { colors, radii, shadows } from "@/src/components/ui/kit";

export type VisionFeedHandle = VisionCanvasHandle;

/**
 * The camera/feed preview shared by the vision editor and the tool config page, so both read
 * the same and stay in sync. Pushes the feed URL and the tool overlay (src/vision/feedOverlay.ts)
 * into the WebView, on load and whenever they change. Sizes itself by layout: a fixed height on
 * phones, an aspect-ratio box that grows with the pane on wide screens.
 *
 * The card has no outer margin on purpose — the surrounding pane owns the padding, so the
 * frame lines up identically in both editors.
 */
export const VisionFeedViewer = forwardRef<VisionFeedHandle, {
  feedUrl: string | null;
  /** Tool regions / found geometry drawn over every frame. */
  overlay?: FeedOverlayItem[];
  isWide: boolean;
  /** width/height for the wide-layout aspect box (defaults to 4:3). */
  aspect?: number;
  placeholder?: string;
  pointerEvents?: "none" | "auto" | "box-none" | "box-only";
  onMessage?: (event: { nativeEvent: { data: string } }) => void;
  /**
   * Fires when the feed is tapped, with the tap in normalized (0-1) image coordinates —
   * additive on top of the FEED_HTML document's own "feedTap" message (see visionHtml.ts),
   * which already resolves the tap through the canvas's object-fit:contain letterboxing.
   * Hit-testing that point against tool regions is left to the caller (e.g.
   * the tool list), so this component stays presentation-only.
   */
  onTapImagePoint?: (x: number, y: number) => void;
}>(function VisionFeedViewer(
  { feedUrl, overlay, isWide, aspect = 4 / 3, placeholder = "No camera feed", pointerEvents, onMessage, onTapImagePoint },
  ref,
) {
  const webRef = useRef<VisionCanvasHandle>(null);
  useImperativeHandle(ref, () => ({
    injectJavaScript: (code: string) => webRef.current?.injectJavaScript(code),
  }), []);

  // Stringify once so the inject effect fires on real geometry changes, not every render.
  const overlayJson = useMemo(() => JSON.stringify(overlay ?? []), [overlay]);

  const injectFeed = useCallback(() => {
    webRef.current?.injectJavaScript(`window.setFeed(${JSON.stringify(feedUrl)});true;`);
  }, [feedUrl]);
  const injectOverlay = useCallback(() => {
    webRef.current?.injectJavaScript(`window.setOverlay(${overlayJson});true;`);
  }, [overlayJson]);

  useEffect(() => { injectFeed(); }, [injectFeed]);
  useEffect(() => { injectOverlay(); }, [injectOverlay]);

  // Fresh WebView: re-send both once the document is ready.
  const onLoad = useCallback(() => { injectFeed(); injectOverlay(); }, [injectFeed, injectOverlay]);

  // Additive on top of the caller's own onMessage: a "feedTap" message (see FEED_HTML in
  // visionHtml.ts) is consumed here and reported through onTapImagePoint; every message,
  // including that one, is still forwarded to onMessage exactly as before.
  const handleMessage = useCallback((e: { nativeEvent: { data: string } }) => {
    if (onTapImagePoint) {
      try {
        const msg = JSON.parse(e.nativeEvent.data);
        if (msg?.type === "feedTap" && typeof msg.x === "number" && typeof msg.y === "number") {
          onTapImagePoint(msg.x, msg.y);
        }
      } catch {}
    }
    onMessage?.(e);
  }, [onTapImagePoint, onMessage]);

  return (
    <View
      style={[styles.feedCard, isWide ? { width: "100%", aspectRatio: aspect, maxHeight: 560 } : { height: 220 }]}
      pointerEvents={pointerEvents}
    >
      <VisionCanvas
        ref={webRef}
        html={FEED_HTML}
        style={{ flex: 1, backgroundColor: "#111" }}
        focusable={false}
        onLoad={onLoad}
        onMessage={handleMessage}
      />
      {!feedUrl && (
        <View style={styles.placeholder}>
          <Text style={styles.placeholderText}>{placeholder}</Text>
        </View>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  feedCard: {
    backgroundColor: "#111", borderRadius: radii.md, overflow: "hidden", // camera feed frame, intentionally near-black
    ...shadows.soft,
  },
  placeholder: { ...StyleSheet.absoluteFill, justifyContent: "center", alignItems: "center" },
  placeholderText: { color: colors.textMuted, fontSize: 13 },
});
