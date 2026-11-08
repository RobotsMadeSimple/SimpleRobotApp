import React, { forwardRef, useCallback, useImperativeHandle, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import type { VisionCanvasHandle } from "@/src/vision/visionCanvasTypes";
import type { FeedOverlayItem } from "@/src/vision/feedOverlay";
import { colors, radii, shadows } from "@/src/components/ui/kit";
import { FeedCanvas, type FeedCanvasHandle } from "./FeedCanvas";
import { ExpandBadge, LiveViewerModal } from "./LiveViewerModal";

export type VisionFeedHandle = VisionCanvasHandle;

/**
 * The camera/feed preview shared by the vision editor and the tool config page, so both read
 * the same and stay in sync. Pushes the feed URL and the tool overlay (src/vision/feedOverlay.ts)
 * into the feed document, on load and whenever they change. Sizes itself by layout: a fixed height on
 * phones, an aspect-ratio box that grows with the pane on wide screens.
 *
 * Tapping the frame (or its corner badge) opens it in the full-screen LiveViewerModal with zoom and
 * pan, still live with the same overlay; the inline feed pauses meanwhile so only one stream runs.
 * A caller with its own use for a tap (onTapImagePoint) gets it first and returns true to keep it.
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
   * Fires when the feed is tapped on the picture, with the tap in normalized (0-1) image
   * coordinates (FEED_HTML resolves it through the canvas's letterboxing). Return true when the
   * tap was used (e.g. it hit a tool region); otherwise the frame opens full screen.
   * Hit-testing is left to the caller, so this component stays presentation-only.
   */
  onTapImagePoint?: (x: number, y: number) => boolean | void;
  /** Title shown in the full-screen viewer. */
  title?: string;
}>(function VisionFeedViewer(
  { feedUrl, overlay, isWide, aspect = 4 / 3, placeholder = "No camera feed", pointerEvents, onMessage, onTapImagePoint, title },
  ref,
) {
  const canvasRef = useRef<FeedCanvasHandle>(null);
  const [full, setFull] = useState(false);
  useImperativeHandle(ref, () => ({
    injectJavaScript: (code: string) => canvasRef.current?.injectJavaScript(code),
  }), []);

  const openFull = useCallback(() => { if (feedUrl) setFull(true); }, [feedUrl]);

  // Every message is still forwarded to onMessage; a "feedTap" (see FEED_HTML in visionHtml.ts)
  // is offered to onTapImagePoint, and opens the full-screen viewer when that does not use it.
  const handleMessage = useCallback((e: { nativeEvent: { data: string } }) => {
    try {
      const msg = JSON.parse(e.nativeEvent.data);
      if (msg?.type === "feedTap") {
        const onImage = typeof msg.x === "number" && typeof msg.y === "number";
        if (!(onImage && onTapImagePoint?.(msg.x, msg.y) === true)) openFull();
      }
    } catch {}
    onMessage?.(e);
  }, [onTapImagePoint, onMessage, openFull]);

  return (
    <View
      style={[styles.feedCard, isWide ? { width: "100%", aspectRatio: aspect, maxHeight: 560 } : { height: 220 }]}
      pointerEvents={pointerEvents}
    >
      <FeedCanvas
        ref={canvasRef}
        feedUrl={feedUrl}
        overlay={overlay}
        paused={full}
        style={{ flex: 1, backgroundColor: "#111" }}
        onMessage={handleMessage}
      />
      {!feedUrl && (
        <View style={styles.placeholder}>
          <Text style={styles.placeholderText}>{placeholder}</Text>
        </View>
      )}
      {!!feedUrl && <ExpandBadge onPress={openFull} />}
      <LiveViewerModal visible={full} onClose={() => setFull(false)} feedUrl={feedUrl} overlay={overlay} title={title} />
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
