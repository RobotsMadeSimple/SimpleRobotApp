import {
  Activity,
  Gauge as GaugeIcon,
  Hash,
  Image as ImageIcon,
  Play,
  Puzzle,
  ToggleRight,
  Trash2,
  Type as TypeIcon,
} from "lucide-react-native";
import React, { useCallback, useMemo, useRef, useState } from "react";
import { LayoutChangeEvent, ScrollView, StyleSheet, Text, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, { runOnJS, useAnimatedStyle, useSharedValue } from "react-native-reanimated";

import { colors, radii, spacing } from "@/src/components/ui/kit";
import type { DisplayPageLayout, DisplayWidget, DisplayWidgetType } from "@/src/models/robotModels";
import { DisplayPageView } from "./DisplayPageView";
import { DISPLAY_WIDGET_DEFS, makeWidget, WIDGET_PALETTE } from "./displayWidgets";

const GAP = 8;

const ICONS: Record<DisplayWidgetType, React.ComponentType<{ size?: number; color?: string }>> = {
  value: Hash,
  gauge: GaugeIcon,
  boolean: ToggleRight,
  graph: Activity,
  image: ImageIcon,
  button: Play,
  text: TypeIcon,
  plugin: Puzzle,
};

/** A short caption of a widget's binding, so the canvas is readable before compiling. */
export function widgetSummary(w: DisplayWidget): string {
  const c = w.config || {};
  switch (w.type) {
    case "value":
    case "gauge":
    case "boolean":
      return c.variable || "(expression)";
    case "image":
      return c.variable ? `$${c.variable}` : "(pick a variable)";
    case "graph":
      return c.source === "variable" ? (c.variable || "(expression)") : c.nanoId ? `${c.nanoId}/${c.pin}` : "(set nano + pin)";
    case "button":
      return c.action === "stop" ? "Stop" : "Run";
    case "text":
      return c.text || "(text)";
    case "plugin":
      return c.pluginName || c.pluginId || "(pick a plugin)";
    default:
      return "";
  }
}

type Props = {
  layout: DisplayPageLayout;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onChange: (widgets: DisplayWidget[]) => void;
  programName: string;
  programId?: string;
  /** Compiled live layout rendered (non-interactive) behind the handles; "" to hide it. */
  previewHtml: string;
  /** Whether to show the live preview behind the handles (connected). */
  showPreview: boolean;
};

/**
 * Visual grid editor for a display page. A palette of widget types (tap to add, or press-and-hold
 * then drag onto the grid); placed widgets press-and-hold to move and have a corner handle to
 * resize, snapping to grid cells. The live compiled page renders non-interactively behind the
 * handles so you arrange against real data. Emits the updated widget list.
 */
export function DisplayPageBuilder({ layout, selectedId, onSelect, onChange, programName, programId, previewHtml, showPreview }: Props) {
  const cols = layout.cols;
  const rowH = layout.rowHeight;
  const widgets = layout.widgets;

  const [canvasW, setCanvasW] = useState(0);
  const cellW = canvasW > 0 ? canvasW / cols : 0;
  // Scrolling is turned off for the duration of a card move/resize so the canvas ScrollView
  // can't hijack the gesture on Android (the cause of the earlier snap-back / dead resize).
  const [scrollEnabled, setScrollEnabled] = useState(true);

  const canvasRef = useRef<View>(null);
  const canvasRect = useRef<{ x: number; y: number; w: number; h: number }>({ x: 0, y: 0, w: 0, h: 0 });
  const rootRef = useRef<View>(null);
  const [rootOrigin, setRootOrigin] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  const measure = useCallback(() => {
    canvasRef.current?.measureInWindow((x, y, w, h) => (canvasRect.current = { x, y, w, h }));
    rootRef.current?.measureInWindow((x, y) => setRootOrigin({ x, y }));
  }, []);

  const onCanvasLayout = (e: LayoutChangeEvent) => {
    setCanvasW(e.nativeEvent.layout.width);
    measure();
  };

  const bottomRow = useMemo(() => widgets.reduce((m, w) => Math.max(m, w.y + w.h), 0), [widgets]);
  const canvasRows = Math.max(bottomRow + 3, 10);

  const addWidget = useCallback(
    (type: DisplayWidgetType, x: number, y: number) => {
      const def = DISPLAY_WIDGET_DEFS[type];
      const cx = Math.max(0, Math.min(x, cols - def.defaultSize.w));
      const w = makeWidget(type, cx, Math.max(0, y));
      onChange([...widgets, w]);
      onSelect(w.id);
    },
    [widgets, cols, onChange, onSelect],
  );

  const commitMove = useCallback(
    (id: string, x: number, y: number) => onChange(widgets.map((w) => (w.id === id ? { ...w, x, y } : w))),
    [widgets, onChange],
  );
  const commitResize = useCallback(
    (id: string, w: number, h: number) => onChange(widgets.map((ww) => (ww.id === id ? { ...ww, w, h } : ww))),
    [widgets, onChange],
  );
  const remove = useCallback(
    (id: string) => { onChange(widgets.filter((w) => w.id !== id)); onSelect(null); },
    [widgets, onChange, onSelect],
  );

  // ── Palette drag-and-drop ────────────────────────────────────────────────────
  const [ghost, setGhost] = useState<{ type: DisplayWidgetType; mx: number; my: number } | null>(null);

  const onDragStart = useCallback((type: DisplayWidgetType, px: number, py: number) => {
    measure();
    setGhost({ type, mx: px, my: py });
  }, [measure]);
  const onDragMove = useCallback((px: number, py: number) => {
    setGhost((prev) => (prev ? { ...prev, mx: px, my: py } : prev));
  }, []);
  const onDragEnd = useCallback(
    (type: DisplayWidgetType, px: number, py: number) => {
      const r = canvasRect.current;
      const cw = r.w / cols;
      if (cw > 0 && px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h) {
        const col = Math.max(0, Math.min(cols - 1, Math.floor((px - r.x) / cw)));
        const row = Math.max(0, Math.floor((py - r.y) / rowH));
        addWidget(type, col, row);
      }
      setGhost(null);
    },
    [cols, rowH, addWidget],
  );

  return (
    <View ref={rootRef} style={styles.root} onLayout={measure} collapsable={false}>
      {/* Palette */}
      <View style={styles.palette}>
        <Text style={styles.paletteLabel}>WIDGETS</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.paletteRow}>
          {WIDGET_PALETTE.map((type) => (
            <PaletteItem key={type} type={type} onAdd={addWidget} bottomRow={bottomRow} onDragStart={onDragStart} onDragMove={onDragMove} onDragEnd={onDragEnd} />
          ))}
        </ScrollView>
        <Text style={styles.paletteHint}>Tap to add, or press-and-hold then drag onto the grid.</Text>
      </View>

      {/* Canvas */}
      <ScrollView style={styles.canvasScroll} contentContainerStyle={styles.canvasContent} onScroll={measure} scrollEventThrottle={64} scrollEnabled={scrollEnabled}>
        <View ref={canvasRef} style={[styles.canvas, { height: canvasRows * rowH + GAP }]} onLayout={onCanvasLayout} collapsable={false}>
          {/* Live, non-interactive data preview behind the handles. */}
          {showPreview && previewHtml ? (
            <View style={styles.previewLayer} pointerEvents="none">
              <DisplayPageView html={previewHtml} programName={programName} programId={programId} style={styles.previewFill} />
            </View>
          ) : null}

          {cellW > 0 &&
            Array.from({ length: cols - 1 }).map((_, i) => (
              <View key={`v${i}`} style={[styles.guideV, { left: (i + 1) * cellW }]} pointerEvents="none" />
            ))}

          {canvasW === 0 || widgets.length === 0 ? (
            <View style={styles.emptyHint} pointerEvents="none">
              <Text style={styles.emptyHintText}>Add widgets from the palette above.</Text>
            </View>
          ) : null}

          {cellW > 0 &&
            widgets.map((w) => (
              <WidgetCard
                key={w.id}
                widget={w}
                cellW={cellW}
                rowH={rowH}
                cols={cols}
                selected={selectedId === w.id}
                live={showPreview && !!previewHtml}
                setScrollEnabled={setScrollEnabled}
                onSelect={onSelect}
                onMove={commitMove}
                onResize={commitResize}
                onDelete={remove}
              />
            ))}
        </View>
      </ScrollView>

      {/* Drag ghost */}
      {ghost && (
        <View pointerEvents="none" style={[styles.ghost, { left: ghost.mx - rootOrigin.x - 45, top: ghost.my - rootOrigin.y - 22 }]}>
          <Text style={styles.ghostText}>{DISPLAY_WIDGET_DEFS[ghost.type].label}</Text>
        </View>
      )}
    </View>
  );
}

// ── Palette item: tap to add, press-and-hold to drag onto the grid ──────────────

type PaletteItemProps = {
  type: DisplayWidgetType;
  bottomRow: number;
  onAdd: (type: DisplayWidgetType, x: number, y: number) => void;
  onDragStart: (type: DisplayWidgetType, px: number, py: number) => void;
  onDragMove: (px: number, py: number) => void;
  onDragEnd: (type: DisplayWidgetType, px: number, py: number) => void;
};

function PaletteItem({ type, bottomRow, onAdd, onDragStart, onDragMove, onDragEnd }: PaletteItemProps) {
  const tap = Gesture.Tap().onEnd(() => runOnJS(onAdd)(type, 0, bottomRow));
  const pan = Gesture.Pan()
    .activateAfterLongPress(150)
    .onStart((e) => runOnJS(onDragStart)(type, e.absoluteX, e.absoluteY))
    .onUpdate((e) => runOnJS(onDragMove)(e.absoluteX, e.absoluteY))
    .onEnd((e) => runOnJS(onDragEnd)(type, e.absoluteX, e.absoluteY));
  const gesture = Gesture.Race(tap, pan);

  const def = DISPLAY_WIDGET_DEFS[type];
  const Icon = ICONS[type];
  return (
    <GestureDetector gesture={gesture}>
      <View style={styles.paletteItem}>
        <Icon size={18} color={colors.accent} />
        <Text style={styles.paletteItemLabel}>{def.label}</Text>
      </View>
    </GestureDetector>
  );
}

// ── One placed widget: hold to move, corner handle to resize ────────────────────

type CardProps = {
  widget: DisplayWidget;
  cellW: number;
  rowH: number;
  cols: number;
  selected: boolean;
  live: boolean;
  setScrollEnabled: (on: boolean) => void;
  onSelect: (id: string) => void;
  onMove: (id: string, x: number, y: number) => void;
  onResize: (id: string, w: number, h: number) => void;
  onDelete: (id: string) => void;
};

function WidgetCard({ widget, cellW, rowH, cols, selected, live, setScrollEnabled, onSelect, onMove, onResize, onDelete }: CardProps) {
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const dw = useSharedValue(0);
  const dh = useSharedValue(0);

  const baseLeft = widget.x * cellW + GAP / 2;
  const baseTop = widget.y * rowH + GAP / 2;
  const baseW = Math.max(cellW, widget.w * cellW) - GAP;
  const baseH = Math.max(rowH, widget.h * rowH) - GAP;

  const select = useCallback(() => onSelect(widget.id), [onSelect, widget.id]);

  const tap = Gesture.Tap().onEnd(() => runOnJS(select)());

  const move = Gesture.Pan()
    .activateAfterLongPress(160)
    .maxPointers(1)
    .onStart(() => {
      // Deliberately does NOT select: a drag must not pop the edit panel (it overlays the
      // canvas and gets in the way of the move). Editing is a tap — see the `tap` gesture.
      // The card still follows the finger via tx/ty, so the move has its own feedback.
      runOnJS(setScrollEnabled)(false);
    })
    .onUpdate((e) => {
      tx.value = e.translationX;
      ty.value = e.translationY;
    })
    .onEnd((e) => {
      const nx = Math.max(0, Math.min(cols - widget.w, Math.round((widget.x * cellW + e.translationX) / cellW)));
      const ny = Math.max(0, Math.round((widget.y * rowH + e.translationY) / rowH));
      if (nx !== widget.x || ny !== widget.y) runOnJS(onMove)(widget.id, nx, ny);
      tx.value = 0;
      ty.value = 0;
    })
    .onFinalize(() => {
      tx.value = 0;
      ty.value = 0;
      runOnJS(setScrollEnabled)(true);
    });

  const cardGesture = Gesture.Race(tap, move);

  const resize = Gesture.Pan()
    .onStart(() => {
      // Like the move gesture, resizing does not select — editing is a tap, so dragging the
      // corner handle won't pop the edit panel over the canvas.
      runOnJS(setScrollEnabled)(false);
    })
    .onUpdate((e) => {
      dw.value = e.translationX;
      dh.value = e.translationY;
    })
    .onEnd((e) => {
      const nw = Math.max(1, Math.min(cols - widget.x, Math.round((widget.w * cellW + e.translationX) / cellW)));
      const nh = Math.max(1, Math.round((widget.h * rowH + e.translationY) / rowH));
      if (nw !== widget.w || nh !== widget.h) runOnJS(onResize)(widget.id, nw, nh);
      dw.value = 0;
      dh.value = 0;
    })
    .onFinalize(() => {
      dw.value = 0;
      dh.value = 0;
      runOnJS(setScrollEnabled)(true);
    });

  const aStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: tx.value }, { translateY: ty.value }],
    width: baseW + dw.value,
    height: baseH + dh.value,
  }));

  const Icon = ICONS[widget.type];

  return (
    <GestureDetector gesture={cardGesture}>
      <Animated.View style={[styles.card, { left: baseLeft, top: baseTop }, aStyle, selected && styles.cardSelected, live && styles.cardLive]}>
        <View style={[styles.cardHead, live && styles.cardHeadLive]}>
          <Icon size={13} color={selected ? colors.accent : colors.textMuted} />
          {(!live || selected) && <Text style={styles.cardType} numberOfLines={1}>{DISPLAY_WIDGET_DEFS[widget.type].label}</Text>}
          {selected && (
            <GestureDetector gesture={Gesture.Tap().onEnd(() => runOnJS(onDelete)(widget.id))}>
              <View hitSlop={8}><Trash2 size={13} color={colors.danger} /></View>
            </GestureDetector>
          )}
        </View>
        {!live && <Text style={styles.cardBind} numberOfLines={1}>{widgetSummary(widget)}</Text>}

        <GestureDetector gesture={resize}>
          <View style={[styles.resizeHandle, selected && styles.resizeHandleActive]}>
            <View style={[styles.resizeGrip, selected && styles.resizeGripActive]} />
          </View>
        </GestureDetector>
      </Animated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },

  palette: { backgroundColor: colors.surface, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border, paddingTop: spacing.sm },
  paletteLabel: { fontSize: 10, fontWeight: "700", color: colors.textFaint, letterSpacing: 1, paddingHorizontal: spacing.md },
  paletteRow: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, gap: spacing.sm },
  paletteItem: { alignItems: "center", justifyContent: "center", gap: 4, width: 74, paddingVertical: spacing.sm, borderRadius: radii.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceMuted },
  paletteItemLabel: { fontSize: 11, fontWeight: "600", color: colors.textSecondary },
  paletteHint: { fontSize: 10, color: colors.textFaint, paddingHorizontal: spacing.md, paddingBottom: spacing.sm },

  canvasScroll: { flex: 1 },
  canvasContent: { padding: GAP / 2 },
  canvas: { position: "relative", backgroundColor: colors.background, borderRadius: radii.md },
  previewLayer: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 },
  previewFill: { flex: 1, backgroundColor: "transparent" },
  guideV: { position: "absolute", top: 0, bottom: 0, width: StyleSheet.hairlineWidth, backgroundColor: colors.border },

  emptyHint: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, alignItems: "center", justifyContent: "center" },
  emptyHintText: { fontSize: 13, color: colors.textFaint },

  card: { position: "absolute", backgroundColor: colors.surface, borderRadius: radii.md, borderWidth: 1, borderColor: colors.borderStrong, padding: spacing.sm, overflow: "hidden" },
  // When the live preview shows through, the card is a translucent handle layer, not opaque.
  cardLive: { backgroundColor: "transparent", borderStyle: "dashed", borderColor: colors.accentFaded, padding: 4 },
  cardSelected: { borderColor: colors.accent, borderWidth: 2, borderStyle: "solid" },
  cardHead: { flexDirection: "row", alignItems: "center", gap: 5 },
  cardHeadLive: { alignSelf: "flex-start", backgroundColor: colors.surface, borderRadius: 6, paddingHorizontal: 4, paddingVertical: 2 },
  cardType: { flex: 1, fontSize: 12, fontWeight: "700", color: colors.text },
  cardBind: { fontSize: 11, color: colors.textMuted, marginTop: 2 },

  resizeHandle: { position: "absolute", right: 0, bottom: 0, width: 28, height: 28, alignItems: "center", justifyContent: "center" },
  resizeHandleActive: { backgroundColor: colors.accentSoft, borderTopLeftRadius: radii.md },
  resizeGrip: { width: 10, height: 10, borderRightWidth: 2, borderBottomWidth: 2, borderColor: colors.borderStrong, margin: 4 },
  resizeGripActive: { borderColor: colors.accent },

  ghost: { position: "absolute", paddingHorizontal: 12, paddingVertical: 7, borderRadius: radii.md, backgroundColor: colors.accent, opacity: 0.9 },
  ghostText: { color: colors.onAccent, fontSize: 12, fontWeight: "700" },
});
