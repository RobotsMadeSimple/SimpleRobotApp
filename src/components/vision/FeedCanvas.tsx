import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef } from "react";
import type { StyleProp, ViewStyle } from "react-native";
import { VisionCanvas } from "@/src/vision/VisionCanvas";
import type { VisionCanvasHandle } from "@/src/vision/visionCanvasTypes";
import { FEED_HTML } from "@/src/vision/visionHtml";
import type { FeedOverlayItem } from "@/src/vision/feedOverlay";

export type FeedCanvasHandle = VisionCanvasHandle & {
  /** Stop drawing new frames (closes the socket / stops polling) until `resume`. */
  pause: () => void;
  resume: () => void;
  resetZoom: () => void;
};

/**
 * One FEED_HTML document (src/vision/visionHtml.ts) showing a frame source, with the tool overlay
 * drawn into every frame. The source can be a `ws://` stream of frames (a camera or a vision run),
 * an `http(s)://` image polled every `pollMs`, or a `data:` URL (one still frame, redrawn when it
 * changes). With `zoomable` it pinch / wheel zooms and pans inside the document, so the overlay
 * stays on the picture and frames keep arriving while zoomed (src/vision/zoomPan.ts).
 *
 * Shared by the inline previews (VisionFeedViewer) and the full-screen LiveViewerModal.
 */
export const FeedCanvas = forwardRef<FeedCanvasHandle, {
  feedUrl: string | null;
  overlay?: FeedOverlayItem[];
  /** Poll interval for an http(s) source. */
  pollMs?: number;
  zoomable?: boolean;
  /** Hold the source closed (e.g. while the same feed is open full screen). */
  paused?: boolean;
  style?: StyleProp<ViewStyle>;
  onMessage?: (event: { nativeEvent: { data: string } }) => void;
}>(function FeedCanvas({ feedUrl, overlay, pollMs, zoomable = false, paused = false, style, onMessage }, ref) {
  const webRef = useRef<VisionCanvasHandle>(null);
  const inject = (code: string) => webRef.current?.injectJavaScript(code);

  // Stringify once so the inject effect fires on real geometry changes, not every render.
  const overlayJson = useMemo(() => JSON.stringify(overlay ?? []), [overlay]);

  const injectFeed = useCallback(() => {
    webRef.current?.injectJavaScript(
      paused ? "window.pauseFeed();true;" : `window.setFeed(${JSON.stringify(feedUrl)},${pollMs ?? 0});true;`,
    );
  }, [feedUrl, pollMs, paused]);
  const injectOverlay = useCallback(() => {
    webRef.current?.injectJavaScript(`window.setOverlay(${overlayJson});true;`);
  }, [overlayJson]);
  const injectZoom = useCallback(() => {
    webRef.current?.injectJavaScript(`window.setZoomable(${zoomable ? "true" : "false"});true;`);
  }, [zoomable]);

  useEffect(() => { injectFeed(); }, [injectFeed]);
  useEffect(() => { injectOverlay(); }, [injectOverlay]);
  useEffect(() => { injectZoom(); }, [injectZoom]);

  // Fresh document: re-send everything once it is ready.
  const onLoad = useCallback(() => { injectZoom(); injectOverlay(); injectFeed(); }, [injectFeed, injectOverlay, injectZoom]);

  useImperativeHandle(ref, () => ({
    injectJavaScript: (code: string) => inject(code),
    pause: () => inject("window.pauseFeed();true;"),
    resume: () => inject("window.resumeFeed();true;"),
    resetZoom: () => inject("window.resetZoom();true;"),
  }), []);

  return (
    <VisionCanvas
      ref={webRef}
      html={FEED_HTML}
      style={style}
      focusable={zoomable}
      onLoad={onLoad}
      onMessage={onMessage}
    />
  );
});
