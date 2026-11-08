import React, { useEffect, useMemo, useRef, useState } from "react";
import { Modal, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Circle, Hexagon, LayoutGrid, Minus, Plus, RotateCcw, Square } from "lucide-react-native";
import { makeRegionDrawHtml, type DrawContextRegion } from "@/src/vision/visionHtml";
import { drawToRegion, regionToDraw, type DrawGeometry, type DrawShape } from "@/src/vision/regionMath";
import type { Region, RegionRule, ToolGrid } from "@/src/models/visionTools";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useIsWide } from "@/src/components/ui/responsive";
import { VisionCanvas } from "@/src/vision/VisionCanvas";
import type { VisionCanvasHandle } from "@/src/vision/visionCanvasTypes";
import { colors, accents } from "@/src/components/ui/kit";
import { FitChip, zoomScaleOf } from "@/src/components/vision/LiveViewerModal";
import { ves } from "./visionEditorStyles";

type ShapeIcon = React.ComponentType<{ size?: number; color?: string }>;

const ALL_SHAPES: { shape: DrawShape; label: string; Icon: ShapeIcon }[] = [
  { shape: "Rectangle", label: "Rect",    Icon: Square },
  { shape: "Circle",    label: "Circle",  Icon: Circle },
  { shape: "Polygon",   label: "Polygon", Icon: Hexagon },
  { shape: "Quad",      label: "Skewed",  Icon: LayoutGrid },
];

const MAX_GRID = 32;

/**
 * Draw or adjust one tool region — and, for tools that support it, the cell grid over it.
 *
 * The canvas owns the working geometry and mirrors it up here on every change; this component only
 * needs it to decide which buttons are live. The grid goes the other way — it is owned here and
 * pushed down for drawing, because it is edited with steppers rather than on the canvas.
 *
 * Nothing reaches the tool until Save, so Cancel always leaves the region exactly as it was. The
 * region is drawn and returned in *image* coordinates; converting it into a fixture's reference
 * space is the caller's job (src/vision/regionMath.ts).
 */
export function RegionDrawModal({
  visible, title, snapshotUri, context, initialRegion, initialGrid, shapes = "any", allowGrid = false, onDone, onCancel,
}: {
  visible: boolean;
  /** Shown in the hint strip, e.g. which region of a two-region tool this is. */
  title?: string;
  snapshotUri: string | null;
  /** Other tools' regions, drawn faintly for context. */
  context: DrawContextRegion[];
  initialRegion: Region | null;
  initialGrid?: ToolGrid | null;
  /** Which shapes the tool accepts. */
  shapes?: RegionRule;
  /** Offer cell steppers (the lattice is drawn over the shape). */
  allowGrid?: boolean;
  onDone: (region: Region, grid: ToolGrid | null) => void;
  onCancel: () => void;
}) {
  const insets     = useSafeAreaInsets();
  const isWide     = useIsWide();
  const webviewRef = useRef<VisionCanvasHandle>(null);

  const shapeList = useMemo(
    () => ALL_SHAPES.filter(s => shapes === "any" || (shapes === "rect" ? s.shape === "Rectangle" : shapes === "circle" ? s.shape === "Circle" : false)),
    [shapes],
  );

  const initialGeometry = useMemo(() => (initialRegion ? regionToDraw(initialRegion) : null), [initialRegion]);
  // The shape the canvas is *built* with. Kept out of the html deps below so that switching shape
  // injects instead of reloading the WebView — a reload would resurrect initialGeometry.
  const initialShape: DrawShape = initialGeometry?.shape ?? shapeList[0]?.shape ?? "Rectangle";
  const initialDrawGrid = useMemo(
    () => (allowGrid && initialGrid && initialGrid.rows * initialGrid.cols > 1 ? { rows: initialGrid.rows, cols: initialGrid.cols } : null),
    [allowGrid, initialGrid],
  );

  const [shape, setShape]       = useState<DrawShape>(initialShape);
  const [geometry, setGeometry] = useState<DrawGeometry | null>(initialGeometry);
  const [editing, setEditing]   = useState(!!initialGeometry);
  const [pts, setPts]           = useState(0);
  const [zoom, setZoom]         = useState(1); // the canvas's pinch / wheel zoom, for the Fit chip
  const [grid, setGrid]         = useState<{ rows: number; cols: number } | null>(initialDrawGrid);
  // Shape change confirmation, shown in-modal (an app-root alert sits behind the canvas iframe on web).
  const [pendingShape, setPendingShape] = useState<DrawShape | null>(null);

  useEffect(() => {
    if (!visible) return;
    setShape(initialShape);
    setGeometry(initialGeometry);
    setEditing(!!initialGeometry);
    setPts(0);
    setZoom(1);
    setPendingShape(null);
    setGrid(initialDrawGrid);
  }, [visible, initialShape, initialGeometry, initialDrawGrid]);

  useEffect(() => {
    webviewRef.current?.injectJavaScript(`window.setGrid(${JSON.stringify(grid)});true;`);
  }, [grid]);

  function applyShape(s: DrawShape) {
    setShape(s);
    setGeometry(null);
    setEditing(false);
    setPts(0);
    webviewRef.current?.injectJavaScript(`window.setShape(${JSON.stringify(s)});true;`);
  }

  function changeShape(s: DrawShape) {
    if (s === shape) return;
    // A rectangle turns into a skewed quad in place (the canvas seeds the corners from it).
    if (s === "Quad" && shape === "Rectangle") {
      setShape(s);
      webviewRef.current?.injectJavaScript(`window.setShape('Quad');true;`);
      return;
    }
    if (geometry || pts > 0) { setPendingShape(s); return; }
    applyShape(s);
  }

  function clearShape() {
    setGeometry(null);
    setEditing(false);
    setPts(0);
    webviewRef.current?.injectJavaScript(`window.clearShape();true;`);
  }

  function stepGrid(axis: "rows" | "cols", delta: number) {
    const cur = grid ?? { rows: 1, cols: 1 };
    const next = { ...cur, [axis]: Math.max(1, Math.min(MAX_GRID, cur[axis] + delta)) };
    setGrid(next.rows * next.cols > 1 ? next : null);
  }

  function onMessage(e: any) {
    const z = zoomScaleOf(e.nativeEvent.data);
    if (z !== null) { setZoom(z); return; }
    try {
      const msg = JSON.parse(e.nativeEvent.data);
      if (msg.type === "state") {
        setGeometry(msg.geometry ?? null);
        setEditing(!!msg.editing);
        setPts(msg.pts ?? 0);
      }
    } catch {}
  }

  function save() {
    if (!geometry) return;
    const g = grid && grid.rows * grid.cols > 1
      ? { rows: grid.rows, cols: grid.cols, inset: initialGrid?.inset ?? 0 }
      : null;
    onDone(drawToRegion(geometry), allowGrid ? g : (initialGrid ?? null));
  }

  const inject = (fn: string) => webviewRef.current?.injectJavaScript(`window.${fn}();true;`);

  const html = useMemo(
    () => snapshotUri ? makeRegionDrawHtml(snapshotUri, context, null, initialShape, initialGeometry, initialDrawGrid) : null,
    [snapshotUri, context, initialShape, initialGeometry, initialDrawGrid],
  );

  const rotation = geometry?.shape === "Rectangle" ? (geometry.rotation ?? 0) : 0;
  const drafting = !editing && shape === "Polygon" && pts > 0;

  const zoomHint = zoom > 1.02 ? "" : " · pinch or scroll to zoom";
  const hint =
    editing && shape === "Quad"      ? "Drag each corner into place · 1,1 marks row 1, column 1 · drag inside to move"
    : editing && shape === "Rectangle" ? "Drag a corner to resize · the top grip to rotate · inside to move"
    : editing                         ? "Drag a handle to reshape · drag inside to move"
    : shape === "Rectangle"           ? "Drag to draw a rectangle"
    : shape === "Circle"              ? "Drag from the centre outward"
    : pts >= 3                        ? "Tap Close Shape, or keep adding points"
    :                                   `Tap to add points (${pts}/3 minimum)`;

  const toolbar = (
    <View
      style={[
        isWide ? ves.drawRail : ves.drawToolbarInner,
        isWide
          ? { paddingTop: (insets.top || 0) + 12, paddingLeft: (insets.left || 0) + 12 }
          : { paddingBottom: insets.bottom || 10 },
      ]}
    >
      {shapeList.length > 1 && (
        <View style={isWide ? ves.drawShapeCol : ves.drawShapeRow}>
          {shapeList.map(({ shape: s, label, Icon }) => {
            const active = shape === s;
            return (
              <TouchableOpacity
                key={s}
                style={[ves.drawShapeChip, isWide && ves.drawChipWide, active && ves.drawShapeChipActive]}
                onPress={() => changeShape(s)}
              >
                <Icon size={15} color={active ? accents.cyan : colors.onAccent} />
                <Text style={[ves.drawShapeText, active && ves.drawShapeTextActive]}>{label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      {(rotation !== 0 || geometry || pts > 0) && (
        <View style={isWide ? ves.drawColGroup : ves.drawToolRow}>
          {rotation !== 0 && (
            <TouchableOpacity
              onPress={() => webviewRef.current?.injectJavaScript("window.setRotation(0);true;")}
              style={[ves.drawRotChip, isWide && ves.drawChipWide]}
              hitSlop={6}
            >
              <RotateCcw size={12} color="#fdba74" />
              <Text style={ves.drawRotChipText}>{rotation}°</Text>
            </TouchableOpacity>
          )}
          {(geometry || pts > 0) && (
            <TouchableOpacity onPress={clearShape} style={[ves.drawClearBtn, isWide && ves.drawChipWide]}>
              <Text style={ves.drawClearText}>Clear</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {allowGrid && geometry && (
        <View style={isWide ? ves.drawColGroup : ves.drawToolRow}>
          {isWide && <Text style={ves.drawRailLabel}>GRID CELLS</Text>}
          {(["rows", "cols"] as const).map(axis => (
            <View key={axis} style={ves.drawStepper}>
              <Text style={ves.drawStepperLabel}>{axis === "rows" ? "Rows" : "Cols"}</Text>
              <TouchableOpacity style={ves.drawStepBtn} onPress={() => stepGrid(axis, -1)} hitSlop={6}>
                <Minus size={12} color="rgba(255,255,255,0.75)" />
              </TouchableOpacity>
              <Text style={ves.drawStepValue}>{grid?.[axis] ?? 1}</Text>
              <TouchableOpacity style={ves.drawStepBtn} onPress={() => stepGrid(axis, 1)} hitSlop={6}>
                <Plus size={12} color="rgba(255,255,255,0.75)" />
              </TouchableOpacity>
            </View>
          ))}
        </View>
      )}

      {isWide && <View style={ves.drawRailSpacer} />}

      <View style={isWide ? ves.drawColGroup : ves.drawToolRow}>
        <TouchableOpacity onPress={onCancel} style={[ves.drawCancelBtn, isWide && ves.drawChipWide]}>
          <Text style={ves.drawCancelText}>Cancel</Text>
        </TouchableOpacity>

        {!isWide && <View style={ves.drawToolSpacer} />}

        {drafting && (
          <TouchableOpacity onPress={() => inject("undoPoint")} style={[ves.drawCancelBtn, isWide && ves.drawChipWide]}>
            <Text style={ves.drawCancelText}>Undo</Text>
          </TouchableOpacity>
        )}
        {drafting && pts >= 3 && (
          <TouchableOpacity onPress={() => inject("closePolygon")} style={[ves.drawFinishBtn, isWide && ves.drawChipWide]}>
            <Text style={ves.drawFinishText}>Close Shape</Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity
          onPress={save}
          disabled={!geometry}
          style={[ves.drawSaveBtn, isWide && ves.drawChipWide, !geometry && ves.drawSaveBtnDisabled]}
        >
          <Text style={ves.drawSaveText}>Save</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const canvasArea = (
    <View style={ves.drawCanvasArea}>
      {html ? (
        <VisionCanvas ref={webviewRef} html={html} style={StyleSheet.absoluteFill} onMessage={onMessage} />
      ) : (
        <View style={[StyleSheet.absoluteFill, { justifyContent: "center", alignItems: "center", padding: 24 }]}>
          <Text style={{ color: colors.textFaint, fontSize: 14, textAlign: "center" }}>
            Select a camera to load a snapshot to draw on.
          </Text>
        </View>
      )}

      <View style={ves.drawHint} pointerEvents="none">
        <Text style={ves.drawHintText}>{title ? `${title} · ${hint}${zoomHint}` : hint + zoomHint}</Text>
      </View>
      {html && (
        <FitChip
          scale={zoom}
          style={{ position: "absolute", right: 12, bottom: 12 }}
          onPress={() => webviewRef.current?.injectJavaScript("window.resetZoom();true;")}
        />
      )}
    </View>
  );

  return (
    <Modal visible={visible} animationType="slide" statusBarTranslucent onRequestClose={onCancel}>
      <View style={[ves.drawModalRoot, isWide && ves.drawModalRootWide]}>
        {isWide ? (<>{toolbar}{canvasArea}</>) : (<>{canvasArea}{toolbar}</>)}

        {pendingShape && (
          <View style={ves.confirmOverlay}>
            <View style={ves.confirmCard}>
              <Text style={ves.confirmTitle}>Change shape?</Text>
              <Text style={ves.confirmMsg}>This clears the shape you&apos;re working on.</Text>
              <View style={ves.confirmActions}>
                <TouchableOpacity style={ves.confirmCancelBtn} onPress={() => setPendingShape(null)}>
                  <Text style={ves.confirmCancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={ves.confirmChangeBtn}
                  onPress={() => { const s = pendingShape; setPendingShape(null); applyShape(s); }}
                >
                  <Text style={ves.confirmChangeText}>Change</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}
      </View>
    </Modal>
  );
}
