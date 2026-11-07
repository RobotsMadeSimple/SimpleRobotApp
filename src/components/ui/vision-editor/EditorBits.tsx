import React, { ReactNode, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Animated, Image, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { ChevronDown, Eye, EyeOff } from "lucide-react-native";
import { accents, colors, radii, shadows, spacing } from "@/src/components/ui/kit";
import { ves } from "./visionEditorStyles";

/** Start / Stop Vision, pulsing while a start or stop is in flight. */
export function RunVisionButton({ isRunning, transitioning, onPress }: {
  isRunning: boolean;
  transitioning: "starting" | "stopping" | null;
  onPress: () => void;
}) {
  const [pulse] = useState(() => new Animated.Value(1));
  useEffect(() => {
    if (!transitioning) { pulse.setValue(1); return; }
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 0.55, duration: 550, useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 1, duration: 550, useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [transitioning, pulse]);
  return (
    <Animated.View style={{ opacity: transitioning ? pulse : 1 }}>
      <TouchableOpacity
        style={[st.runBtn, { backgroundColor: isRunning ? colors.danger : accents.cyan }]}
        onPress={onPress}
        activeOpacity={0.8}
        disabled={!!transitioning}
      >
        {transitioning
          ? <ActivityIndicator size="small" color={colors.onAccent} />
          : isRunning ? <EyeOff size={16} color={colors.onAccent} /> : <Eye size={16} color={colors.onAccent} />}
        <Text style={st.runText}>
          {transitioning === "starting" ? "Starting…" : transitioning === "stopping" ? "Stopping…" : isRunning ? "Stop Vision" : "Start Vision"}
        </Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

/** A captioned card grouping related fields. */
export function GroupCard({ title, right, children, style }: { title: string; right?: ReactNode; children: ReactNode; style?: object }) {
  return (
    <View style={[ves.groupCard, style]}>
      <View style={st.groupHead}>
        <Text style={[ves.groupTitle, { flex: 1 }]}>{title}</Text>
        {right}
      </View>
      {children}
    </View>
  );
}

/** Label + current value + chevron, opening a picker. */
export function PickerRow({ label, value, onPress, warn, border = true, accessibilityLabel }: {
  label: string; value: string; onPress: () => void; warn?: string | null; border?: boolean; accessibilityLabel?: string;
}) {
  return (
    <TouchableOpacity style={[ves.groupRow, border && ves.groupRowBorder]} onPress={onPress} activeOpacity={0.75} accessibilityLabel={accessibilityLabel ?? label}>
      <Text style={st.pickLabel}>{label}</Text>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={st.pickValue} numberOfLines={1}>{value}</Text>
        {!!warn && <Text style={st.warn} numberOfLines={2}>{warn}</Text>}
      </View>
      <ChevronDown size={15} color={colors.textFaint} />
    </TouchableOpacity>
  );
}

/**
 * An image that re-fetches its URL on an interval without flashing: the next frame loads off-screen
 * and replaces the shown one only once it has arrived.
 */
export function RefreshingImage({ url, intervalMs = 900, aspect, placeholder }: {
  url: string | null; intervalMs?: number; aspect: number; placeholder: string;
}) {
  // Remounted (keyed by url) when the url changes, so there is no stale frame to reset here.
  const [shown, setShown] = useState<string | null>(null);
  const [next, setNext]   = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const busy = useRef(false);
  useEffect(() => {
    if (!url) return;
    const tick = () => {
      if (busy.current) return;
      busy.current = true;
      setNext(url + (url.includes("?") ? "&" : "?") + "_=" + Date.now());
    };
    const first = setTimeout(tick, 0);
    const t = setInterval(tick, intervalMs);
    return () => { clearTimeout(first); clearInterval(t); };
  }, [url, intervalMs]);
  return (
    <View style={[st.preview, { aspectRatio: aspect }]}>
      {shown && <Image source={{ uri: shown }} style={StyleSheet.absoluteFill} resizeMode="contain" />}
      {next && (
        <Image
          source={{ uri: next }}
          style={st.offscreen}
          onLoad={() => { setShown(next); setFailed(false); busy.current = false; }}
          onError={() => { setFailed(true); busy.current = false; }}
        />
      )}
      {!shown && (
        <View style={st.previewEmpty}>
          <Text style={st.previewEmptyText}>{failed ? "Preview unavailable — is the controller up to date?" : placeholder}</Text>
        </View>
      )}
    </View>
  );
}

const st = StyleSheet.create({
  runBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm,
    borderRadius: radii.md, paddingVertical: 13, ...shadows.soft,
  },
  runText: { color: colors.onAccent, fontSize: 14, fontWeight: "700" },
  groupHead: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  pickLabel: { fontSize: 12, fontWeight: "600", color: colors.textMuted, width: 76 },
  pickValue: { fontSize: 14, color: colors.text },
  warn: { fontSize: 11, color: colors.warning, marginTop: 1 },
  preview: { width: "100%", maxHeight: 560, backgroundColor: "#111", borderRadius: radii.md, overflow: "hidden" }, // camera frame, intentionally near-black
  offscreen: { position: "absolute", width: 1, height: 1, opacity: 0, left: -10, top: -10 },
  previewEmpty: { ...StyleSheet.absoluteFill, alignItems: "center", justifyContent: "center", padding: spacing.lg },
  previewEmptyText: { color: colors.textFaint, fontSize: 13, textAlign: "center" },
});
