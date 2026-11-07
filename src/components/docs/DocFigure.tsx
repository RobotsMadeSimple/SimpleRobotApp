// A manual figure: an inlined SVG (react-native-svg) or a bundled screenshot, scaled to the
// column width with its aspect ratio kept, plus a caption. Tap to view it full screen.

import { X, ZoomIn } from "lucide-react-native";
import { memo, useState } from "react";
import { Image, ImageSourcePropType, Modal, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { SvgCss, SvgXml } from "react-native-svg";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { colors, radii, spacing, type } from "@/src/components/ui/kit";
import { figureFor, screenFor } from "@/src/docs/manual";
import type { ManualFigure } from "@/src/docs/types";

function SvgFigure({ fig, width }: { fig: ManualFigure; width: number }) {
  const height = Math.round(width * (fig.height / Math.max(1, fig.width)));
  const Comp = fig.css ? SvgCss : SvgXml;
  return <Comp xml={fig.svg} width={width} height={height} />;
}

function ScreenImage({ source, width }: { source: ImageSourcePropType; width: number }) {
  const resolved = Image.resolveAssetSource?.(source as never) as { width?: number; height?: number } | undefined;
  const [aspect, setAspect] = useState(resolved?.width && resolved?.height ? resolved.width / resolved.height : 16 / 10);
  return (
    <Image
      source={source}
      resizeMode="contain"
      style={{ width, height: Math.round(width / aspect) }}
      onLoad={e => {
        const s = (e.nativeEvent as { source?: { width?: number; height?: number } }).source;
        if (s?.width && s?.height) setAspect(s.width / s.height);
      }}
    />
  );
}

export const DocFigure = memo(function DocFigure({ src, alt, title, maxWidth }: {
  src: string;
  alt: string;
  title?: string;
  /** Upper bound for the figure's width (it never upscales past ~1.5× its natural size). */
  maxWidth?: number;
}) {
  const [w, setW] = useState(0);
  const [zoom, setZoom] = useState(false);
  const win = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const fig = /\.svg$/i.test(src.split(/[?#]/)[0]) ? figureFor(src) : undefined;
  const shot = fig ? undefined : screenFor(src);
  const caption = title || alt || fig?.title || "";

  if (!fig && !shot) {
    return (
      <View style={[styles.frame, styles.missing]}>
        <Text style={type.caption}>Figure not bundled: {src}</Text>
      </View>
    );
  }

  const natural = fig ? fig.width * 1.5 : 900;
  const width = Math.max(0, Math.min(w, maxWidth ?? Infinity, natural));
  const render = (width: number) => (fig ? <SvgFigure fig={fig} width={width} /> : <ScreenImage source={shot!} width={width} />);
  const zoomW = fig ? Math.max(win.width - 32, Math.min(fig.width * 1.5, 1400)) : Math.min(win.width - 32, 1400);

  return (
    <View style={styles.wrap} onLayout={e => setW(Math.floor(e.nativeEvent.layout.width))}>
      <Pressable
        onPress={() => setZoom(true)}
        accessibilityRole="imagebutton"
        accessibilityLabel={caption ? `${caption} — view full screen` : "View figure full screen"}
        style={({ pressed }) => [styles.frame, pressed && { opacity: 0.85 }]}
      >
        <View style={styles.center}>{width > 0 ? render(width - 2) : null}</View>
        <View style={styles.zoomBadge} pointerEvents="none"><ZoomIn size={13} color={colors.textMuted} /></View>
      </Pressable>
      {!!caption && <Text style={styles.caption}>{caption}</Text>}

      <Modal visible={zoom} transparent animationType="fade" onRequestClose={() => setZoom(false)} statusBarTranslucent>
        <View style={[styles.zoomBackdrop, { paddingTop: insets.top + spacing.sm }]}>
          <View style={styles.zoomBar}>
            <Text style={styles.zoomTitle} numberOfLines={1}>{caption}</Text>
            <Pressable onPress={() => setZoom(false)} hitSlop={12} accessibilityRole="button" accessibilityLabel="Close figure" style={styles.zoomClose}>
              <X size={20} color={colors.onSurfaceDark} />
            </Pressable>
          </View>
          <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.zoomContent} maximumZoomScale={4} minimumZoomScale={1} centerContent>
            <ScrollView horizontal contentContainerStyle={{ alignItems: "center", flexGrow: 1, justifyContent: "center" }}>
              <View style={styles.zoomFrame}>{render(zoomW)}</View>
            </ScrollView>
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: { gap: spacing.xs + 2 },
  frame: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    overflow: "hidden",
  },
  center: { alignItems: "center" },
  missing: { padding: spacing.lg, alignItems: "center" },
  zoomBadge: {
    position: "absolute", right: 6, bottom: 6, width: 24, height: 24, borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.9)", alignItems: "center", justifyContent: "center",
    borderWidth: 1, borderColor: colors.border,
  },
  caption: { ...type.caption, color: colors.textMuted, textAlign: "center", fontStyle: "italic" },
  zoomBackdrop: { flex: 1, backgroundColor: colors.overlayDark },
  zoomBar: { flexDirection: "row", alignItems: "center", paddingHorizontal: spacing.lg, paddingBottom: spacing.sm, gap: spacing.md },
  zoomTitle: { flex: 1, color: colors.onSurfaceDark, fontSize: 14, fontWeight: "600" },
  zoomClose: { padding: 4 },
  zoomContent: { flexGrow: 1, justifyContent: "center", paddingBottom: spacing.xxl },
  zoomFrame: { backgroundColor: colors.surface, borderRadius: radii.md, overflow: "hidden", margin: spacing.lg },
});
