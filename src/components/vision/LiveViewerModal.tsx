import React, { useCallback, useEffect, useRef, useState } from "react";
import { Modal, Platform, StyleSheet, Text, TouchableOpacity, View, type StyleProp, type ViewStyle } from "react-native";
import { Maximize2, Minus, Plus, X } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as ScreenOrientation from "expo-screen-orientation";
import { colors } from "@/src/components/ui/kit";
import type { FeedOverlayItem } from "@/src/vision/feedOverlay";
import { FeedCanvas, type FeedCanvasHandle } from "./FeedCanvas";

/**
 * The full-screen live viewer: any frame source (a camera or vision stream, a polled preview image
 * or a still) on black, with pinch / wheel zoom, drag to pan and double-tap to zoom in or back to
 * fit. It stays live — frames keep arriving and the tool overlay stays on the picture while zoomed,
 * because the zoom happens inside the feed document (FeedCanvas). Closes with the X, Escape, or the
 * back button. On a phone the screen may turn while it is open.
 *
 * Opened by tapping a frame (VisionFeedViewer, CameraLiveFeed, RefreshingImage) or its expand badge.
 */
export function LiveViewerModal({ visible, onClose, feedUrl, overlay, pollMs, title }: {
  visible: boolean;
  onClose: () => void;
  feedUrl: string | null;
  overlay?: FeedOverlayItem[];
  pollMs?: number;
  title?: string;
}) {
  return (
    <Modal
      visible={visible}
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
      supportedOrientations={["portrait", "landscape"]}
    >
      {visible && <Viewer onClose={onClose} feedUrl={feedUrl} overlay={overlay} pollMs={pollMs} title={title} />}
    </Modal>
  );
}

function Viewer({ onClose, feedUrl, overlay, pollMs, title }: {
  onClose: () => void; feedUrl: string | null; overlay?: FeedOverlayItem[]; pollMs?: number; title?: string;
}) {
  const insets = useSafeAreaInsets();
  const ref = useRef<FeedCanvasHandle>(null);
  const [scale, setScale] = useState(1);
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);

  // Let a phone turn sideways for a bigger picture; back to the app's portrait on close.
  useEffect(() => {
    if (Platform.OS === "web") return;
    ScreenOrientation.unlockAsync().catch(() => {});
    return () => { ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => {}); };
  }, []);

  // Escape while focus is on the page (inside the feed it arrives as an "escape" message).
  useEffect(() => {
    if (Platform.OS !== "web" || typeof window === "undefined") return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onCloseRef.current(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const onMessage = useCallback((e: { nativeEvent: { data: string } }) => {
    try {
      const msg = JSON.parse(e.nativeEvent.data);
      if (msg?.type === "zoom" && typeof msg.scale === "number") setScale(msg.scale);
      else if (msg?.type === "escape") onCloseRef.current();
    } catch {}
  }, []);

  const zoomBy = (f: number) => ref.current?.injectJavaScript(`window.zoomBy(${f});true;`);

  return (
    <View style={st.root}>
      <FeedCanvas
        ref={ref}
        feedUrl={feedUrl}
        overlay={overlay}
        pollMs={pollMs}
        zoomable
        style={st.canvas}
        onMessage={onMessage}
      />
      {!feedUrl && (
        <View style={st.empty} pointerEvents="none"><Text style={st.emptyText}>No frame</Text></View>
      )}

      <View
        style={[st.topBar, { paddingTop: insets.top + 8, paddingLeft: insets.left + 12, paddingRight: insets.right + 12 }]}
        pointerEvents="box-none"
      >
        <Text style={st.title} numberOfLines={1}>{title ?? ""}</Text>
        <FitChip scale={scale} onPress={() => ref.current?.resetZoom()} />
        <TouchableOpacity style={st.round} onPress={onClose} accessibilityLabel="Close" activeOpacity={0.8} hitSlop={8}>
          <X size={18} color={colors.onAccent} />
        </TouchableOpacity>
      </View>

      <View
        style={[st.bottomBar, { paddingBottom: insets.bottom + 12, paddingLeft: insets.left + 12, paddingRight: insets.right + 12 }]}
        pointerEvents="box-none"
      >
        <Text style={st.hint} pointerEvents="none">
          {Platform.OS === "web" ? "Scroll to zoom · drag to pan · double-click to zoom in or fit" : "Pinch to zoom · drag to pan · double-tap to zoom in or fit"}
        </Text>
        {Platform.OS === "web" && (
          <View style={st.zoomBtns}>
            <TouchableOpacity style={st.round} onPress={() => zoomBy(1 / 1.5)} accessibilityLabel="Zoom out" activeOpacity={0.8}>
              <Minus size={18} color={colors.onAccent} />
            </TouchableOpacity>
            <TouchableOpacity style={st.round} onPress={() => zoomBy(1.5)} accessibilityLabel="Zoom in" activeOpacity={0.8}>
              <Plus size={18} color={colors.onAccent} />
            </TouchableOpacity>
          </View>
        )}
      </View>
    </View>
  );
}

/** The zoom level, shown once zoomed in; tapping it zooms back to fit. Hidden at fit. */
export function FitChip({ scale, onPress, style }: { scale: number; onPress: () => void; style?: StyleProp<ViewStyle> }) {
  if (scale <= 1.02) return null;
  return (
    <TouchableOpacity style={[st.pill, style]} onPress={onPress} accessibilityLabel="Zoom to fit" activeOpacity={0.8}>
      <Maximize2 size={14} color={colors.onAccent} />
      <Text style={st.pillText}>{Math.round(scale * 100)}%</Text>
    </TouchableOpacity>
  );
}

/** Reads the {type:'zoom'} messages a zoomable canvas posts (src/vision/zoomPan.ts). */
export function zoomScaleOf(data: string): number | null {
  try {
    const msg = JSON.parse(data);
    return msg?.type === "zoom" && typeof msg.scale === "number" ? msg.scale : null;
  } catch { return null; }
}

/** The small corner badge on an inline frame that opens it full screen. */
export function ExpandBadge({ onPress }: { onPress: () => void }) {
  return (
    <TouchableOpacity style={st.badge} onPress={onPress} accessibilityLabel="View full screen" activeOpacity={0.8} hitSlop={8}>
      <Maximize2 size={14} color={colors.onAccent} />
    </TouchableOpacity>
  );
}

const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#000" }, // full-screen camera viewer, intentionally black
  canvas: { flex: 1, backgroundColor: "#000" },
  empty: { ...StyleSheet.absoluteFill, alignItems: "center", justifyContent: "center" },
  emptyText: { color: colors.textMuted, fontSize: 14 },
  topBar: {
    position: "absolute", top: 0, left: 0, right: 0,
    flexDirection: "row", alignItems: "center", gap: 8,
  },
  title: {
    flex: 1, color: colors.onAccent, fontSize: 15, fontWeight: "700",
    textShadowColor: "rgba(0,0,0,0.8)", textShadowRadius: 4,
  },
  bottomBar: {
    position: "absolute", bottom: 0, left: 0, right: 0,
    flexDirection: "row", alignItems: "center", gap: 8,
  },
  hint: {
    flex: 1, color: "rgba(255,255,255,0.75)", fontSize: 12,
    textShadowColor: "rgba(0,0,0,0.8)", textShadowRadius: 4,
  },
  zoomBtns: { flexDirection: "row", gap: 8 },
  round: {
    width: 38, height: 38, borderRadius: 19, backgroundColor: "rgba(0,0,0,0.6)",
    alignItems: "center", justifyContent: "center",
  },
  pill: {
    height: 38, borderRadius: 19, paddingHorizontal: 12, backgroundColor: "rgba(0,0,0,0.6)",
    flexDirection: "row", alignItems: "center", gap: 6,
  },
  pillText: { color: colors.onAccent, fontSize: 13, fontWeight: "700", fontVariant: ["tabular-nums"] },
  badge: {
    position: "absolute", right: 8, bottom: 8, width: 30, height: 30, borderRadius: 15,
    backgroundColor: "rgba(0,0,0,0.55)", alignItems: "center", justifyContent: "center",
  },
});
