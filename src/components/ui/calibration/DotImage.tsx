import { useMemo, useState } from "react";
import { GestureResponderEvent, Image, LayoutChangeEvent, Pressable, StyleSheet, Text, View } from "react-native";
import { ImageOff } from "lucide-react-native";

import { CalibrationDot } from "@/src/models/robotModels";
import { colors, radii, shadows, spacing } from "@/src/components/ui/kit";

type Props = {
  /** Absolute URL of the annotated frame (null while not connected). */
  uri: string | null;
  /** Frame size in px — sets the aspect ratio the markers are laid out in. */
  imageWidth: number;
  imageHeight: number;
  dots: CalibrationDot[];
  selectedIndex: number | null;
  /** Dots already taught (drawn green). */
  taughtIndices?: ReadonlySet<number>;
  onSelect: (dot: CalibrationDot) => void;
  /** Cap on the rendered height; the image is scaled down to fit. Default 420. */
  maxHeight?: number;
};

/** Background taps farther than this (display px) from every dot select nothing. */
const TAP_RADIUS = 36;

/**
 * The annotated calibration frame with a tappable marker over every detected dot.
 *
 * Mapping: the container measures its width; the frame is fitted inside
 * (width × maxHeight) at its own aspect ratio ("contain") and drawn at exactly that
 * rect, so a dot at normalized (u, v) sits at (left + u·drawW, v·drawH). Markers are
 * positioned with those numbers, and a tap on the image between markers is turned
 * back into (u, v) the same way to pick the nearest dot. No WebView is involved, so
 * it behaves the same on web and native.
 */
export function DotImage({
  uri, imageWidth, imageHeight, dots, selectedIndex, taughtIndices, onSelect, maxHeight = 420,
}: Props) {
  const [boxWidth, setBoxWidth] = useState(0);
  const [failed, setFailed]     = useState(false);
  const [lastUri, setLastUri]   = useState(uri);
  if (uri !== lastUri) { setLastUri(uri); setFailed(false); }

  const aspect = imageWidth > 0 && imageHeight > 0 ? imageWidth / imageHeight : 4 / 3;
  const fit = useMemo(() => {
    if (!boxWidth) return null;
    const byWidthH = boxWidth / aspect;
    const drawH = Math.min(byWidthH, maxHeight);
    const drawW = drawH * aspect;
    return { drawW, drawH, left: (boxWidth - drawW) / 2 };
  }, [boxWidth, aspect, maxHeight]);

  // Marker size follows the typical dot spacing so a dense grid stays tappable
  // without markers covering each other.
  const markerSize = useMemo(() => {
    if (!fit || dots.length < 2) return 22;
    const spacingPx = medianNeighbourDistance(dots, fit.drawW, fit.drawH);
    return Math.max(12, Math.min(26, spacingPx * 0.7));
  }, [dots, fit]);

  const onLayout = (e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    setBoxWidth(prev => (Math.abs(prev - w) > 1 ? w : prev));
  };

  const onBackgroundPress = (e: GestureResponderEvent) => {
    if (!fit || !dots.length) return;
    const { locationX, locationY } = e.nativeEvent;
    let best: CalibrationDot | null = null;
    let bestD = TAP_RADIUS;
    for (const d of dots) {
      const dist = Math.hypot(d.u * fit.drawW - locationX, d.v * fit.drawH - locationY);
      if (dist < bestD) { best = d; bestD = dist; }
    }
    if (best) onSelect(best);
  };

  return (
    <View style={styles.box} onLayout={onLayout}>
      {fit && (
        <View style={[styles.frame, { height: fit.drawH }]}>
          <View style={{ position: "absolute", left: fit.left, top: 0, width: fit.drawW, height: fit.drawH }}>
            {uri && !failed ? (
              <Image
                source={{ uri }}
                style={{ width: fit.drawW, height: fit.drawH }}
                resizeMode="stretch"
                onError={() => setFailed(true)}
              />
            ) : (
              <View style={styles.placeholder}>
                <ImageOff size={24} color={colors.textMuted} />
                <Text style={styles.placeholderText}>{uri ? "Image unavailable" : "Not connected"}</Text>
              </View>
            )}
            <Pressable style={StyleSheet.absoluteFill} onPress={onBackgroundPress} accessibilityLabel="Calibration image" />
            {dots.map(d => {
              const selected = d.index === selectedIndex;
              const taught   = taughtIndices?.has(d.index) ?? false;
              const size     = selected ? markerSize + 6 : markerSize;
              return (
                <Pressable
                  key={d.index}
                  onPress={() => onSelect(d)}
                  hitSlop={4}
                  accessibilityLabel={`Dot ${d.index} (${d.i}, ${d.j})`}
                  style={[
                    styles.marker,
                    taught && styles.markerTaught,
                    selected && styles.markerSelected,
                    {
                      width: size, height: size, borderRadius: size / 2,
                      left: d.u * fit.drawW - size / 2,
                      top:  d.v * fit.drawH - size / 2,
                    },
                  ]}
                >
                  {(selected || taught) && size >= 16 && (
                    <Text style={[styles.markerLabel, { color: selected ? colors.onAccent : colors.success }]} numberOfLines={1}>
                      {d.index}
                    </Text>
                  )}
                </Pressable>
              );
            })}
          </View>
        </View>
      )}
    </View>
  );
}

/** Median distance from each dot to its nearest neighbour, in display px. */
function medianNeighbourDistance(dots: CalibrationDot[], w: number, h: number): number {
  const sample = dots.length > 60 ? dots.filter((_, k) => k % Math.ceil(dots.length / 60) === 0) : dots;
  const nearest = sample.map(a => {
    let best = Infinity;
    for (const b of dots) {
      if (b === a) continue;
      const d = Math.hypot((a.u - b.u) * w, (a.v - b.v) * h);
      if (d < best) best = d;
    }
    return best;
  }).filter(Number.isFinite).sort((x, y) => x - y);
  return nearest.length ? nearest[Math.floor(nearest.length / 2)] : 30;
}

const styles = StyleSheet.create({
  box: { width: "100%" },
  frame: {
    width: "100%",
    backgroundColor: colors.surfaceDark,
    borderRadius: radii.md,
    overflow: "hidden",
    ...shadows.soft,
  },
  placeholder: { flex: 1, alignItems: "center", justifyContent: "center", gap: spacing.sm },
  placeholderText: { fontSize: 13, color: colors.textMuted },
  marker: {
    position: "absolute",
    borderWidth: 2,
    // Blue ring reads on both white sheets (dark dots) and dark sheets (light dots).
    borderColor: colors.accentBright,
    backgroundColor: "transparent",
    alignItems: "center",
    justifyContent: "center",
  },
  markerTaught: { borderColor: colors.success, backgroundColor: colors.successSoft },
  markerSelected: { borderColor: colors.onAccent, backgroundColor: colors.accent, borderWidth: 3 },
  markerLabel: { fontSize: 10, fontWeight: "700" },
});
