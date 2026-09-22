import React, { useEffect, useMemo, useRef, useState } from "react";
import { Modal, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Circle, Grid3x3, Hexagon, Minus, Plus, RotateCcw, Square } from "lucide-react-native";
import { makeZoneDrawHtml } from "@/src/vision/visionHtml";
import { VisionZone, VisionZoneGeometry, VisionZoneGrid, VisionZoneShape } from "@/src/models/robotModels";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useIsWide } from "@/src/components/ui/responsive";
import { VisionCanvas } from "@/src/vision/VisionCanvas";
import type { VisionCanvasHandle } from "@/src/vision/visionCanvasTypes";
import { ves } from "./visionEditorStyles";

/**
 * What the shape picker offers. "Grid" is not a geometry the controller knows — it is a
 * rectangle carrying a cell lattice. Making it a shape rather than a toggle is deliberate:
 * the grid only ever made sense on a rectangle, and a circle or polygon with a lattice
 * bolted on measured a bounding box that spilled outside the zone. So the lattice now
 * belongs to one shape and cannot be turned on for the others.
 */
type UiShape = VisionZoneShape | 'Grid';

type ShapeIcon = React.ComponentType<{ size?: number; color?: string }>;

const UI_SHAPES: { shape: UiShape; label: string; Icon: ShapeIcon }[] = [
  { shape: 'Rectangle', label: 'Rect',    Icon: Square },
  { shape: 'Circle',    label: 'Circle',  Icon: Circle },
  { shape: 'Polygon',   label: 'Polygon', Icon: Hexagon },
  { shape: 'Grid',      label: 'Grid',    Icon: Grid3x3 },
];

/** The real geometry a UI shape draws with — "Grid" is a rectangle underneath. */
const canvasShape = (s: UiShape): VisionZoneShape => (s === 'Grid' ? 'Rectangle' : s);

const MAX_GRID = 16;

/**
 * Draw or adjust one zone's geometry and grid.
 *
 * The canvas owns the working geometry and mirrors it up here on every change; this
 * component only needs it to decide which buttons are live. The grid goes the other way —
 * it is owned here and pushed down for drawing, because it is edited with steppers rather
 * than on the canvas, and one owner per value keeps them from fighting.
 *
 * Nothing reaches the program until Save, so Cancel always leaves the zone exactly as it
 * was — which is what makes it safe to open an existing zone just to look at it.
 */
export function ZoneDrawModal({
  visible, snapshotUri, zones, editingZoneId, initialGeometry, initialGrid, onDone, onCancel,
}: {
  visible: boolean;
  snapshotUri: string | null;
  zones: VisionZone[];
  editingZoneId: string | null;
  /** Geometry of the zone being edited — seeds the canvas so it can be adjusted rather than redrawn. */
  initialGeometry?: VisionZoneGeometry | null;
  /** Grid of the zone being edited, drawn over the working shape so the lattice tracks it. */
  initialGrid?: VisionZoneGrid | null;
  onDone: (geometry: VisionZoneGeometry, grid: VisionZoneGrid | undefined) => void;
  onCancel: () => void;
}) {
  const insets     = useSafeAreaInsets();
  const isWide     = useIsWide();
  const webviewRef = useRef<VisionCanvasHandle>(null);

  // The shape the canvas is *built* with. Kept out of the html deps below so that
  // switching shape injects instead of reloading the WebView — a reload would
  // resurrect initialGeometry on top of the new shape.
  const initialShape: VisionZoneShape = initialGeometry?.shape ?? 'Rectangle';

  // A saved rectangle carrying a lattice reopens as the Grid shape. A lattice on any
  // other saved shape is dropped here — the new rule is that only Grid has one, and the
  // change is not committed until Save, so Cancel still leaves such a zone untouched.
  const initialGridOn  = !!initialGrid && initialGrid.rows * initialGrid.cols > 1;
  const initialUiShape: UiShape =
    initialGridOn && initialShape === 'Rectangle' ? 'Grid' : initialShape;
  const initialUiGrid  = initialUiShape === 'Grid' ? (initialGrid ?? { rows: 2, cols: 2 }) : undefined;

  const [uiShape, setUiShape]   = useState<UiShape>(initialUiShape);
  const [geometry, setGeometry] = useState<VisionZoneGeometry | null>(initialGeometry ?? null);
  const [editing, setEditing]   = useState(!!initialGeometry);
  const [pts, setPts]           = useState(0);
  const [grid, setGrid]         = useState<VisionZoneGrid | undefined>(initialUiGrid);
  // The shape a pending "change shape?" confirmation would switch to. Held here and
  // shown as an in-modal overlay rather than through appAlert: appAlert renders from a
  // host near the app root, which on web sits behind this modal's canvas iframe.
  const [pendingShape, setPendingShape] = useState<UiShape | null>(null);

  useEffect(() => {
    if (!visible) return;
    setUiShape(initialUiShape);
    setGeometry(initialGeometry ?? null);
    setEditing(!!initialGeometry);
    setPts(0);
    setPendingShape(null);
    // Recomputed from the props rather than the derived object above, so this does not
    // re-run every render on a fresh literal — only when the zone being edited changes.
    setGrid(initialUiShape === 'Grid' ? (initialGrid ?? { rows: 2, cols: 2 }) : undefined);
  }, [visible, initialUiShape, initialGeometry, initialGrid]);

  // One place to push the grid down, so no stepper can forget to redraw. The html already
  // embeds the initial grid, so an early run before the WebView is ready costs nothing.
  useEffect(() => {
    webviewRef.current?.injectJavaScript(`window.setGrid(${JSON.stringify(grid ?? null)});true;`);
  }, [grid]);

  function applyShape(s: UiShape) {
    setUiShape(s);
    setGeometry(null);
    setEditing(false);
    setPts(0);
    // The lattice belongs to Grid and to nothing else, so it turns on with Grid and
    // off with every other shape.
    setGrid(s === 'Grid' ? { rows: 2, cols: 2 } : undefined);
    webviewRef.current?.injectJavaScript(`window.setShape(${JSON.stringify(canvasShape(s))});true;`);
  }

  function changeShape(s: UiShape) {
    if (s === uiShape) return;
    // Rect and Grid draw the same rectangle, so switching between them keeps the shape
    // and merely adds or removes the lattice — no reason to discard it or ask.
    if (canvasShape(s) === canvasShape(uiShape)) {
      setUiShape(s);
      setGrid(s === 'Grid' ? (grid ?? { rows: 2, cols: 2 }) : undefined);
      return;
    }
    // A real shape change discards the working geometry — a circle has no meaningful
    // polygon form — so confirm rather than silently dropping someone's edits.
    if (geometry || pts > 0) {
      setPendingShape(s);
      return;
    }
    applyShape(s);
  }

  function clearShape() {
    setGeometry(null);
    setEditing(false);
    setPts(0);
    webviewRef.current?.injectJavaScript(`window.clearShape();true;`);
  }

  function stepGrid(axis: keyof VisionZoneGrid, delta: number) {
    const current = grid ?? { rows: 1, cols: 1 };
    setGrid({ ...current, [axis]: Math.max(1, Math.min(MAX_GRID, current[axis] + delta)) });
  }

  function onMessage(e: any) {
    try {
      const msg = JSON.parse(e.nativeEvent.data);
      if (msg.type === 'state') {
        setGeometry(msg.geometry ?? null);
        setEditing(!!msg.editing);
        setPts(msg.pts ?? 0);
      }
    } catch {}
  }

  const inject = (fn: string) => webviewRef.current?.injectJavaScript(`window.${fn}();true;`);

  const html = useMemo(
    () => snapshotUri
      ? makeZoneDrawHtml(snapshotUri, zones, editingZoneId, initialShape, initialGeometry, initialGrid)
      : null,
    [snapshotUri, zones, editingZoneId, initialShape, initialGeometry, initialGrid]
  );

  const cShape   = canvasShape(uiShape);
  const gridOn   = !!grid && grid.rows * grid.cols > 1;
  const rotation = geometry?.shape === 'Rectangle' ? (geometry.rotation ?? 0) : 0;
  const drafting = !editing && uiShape === 'Polygon' && pts > 0;

  const hint =
    editing && cShape === 'Rectangle'
      ? 'Drag a corner to resize · the top grip to rotate · inside to move'
    : editing                ? 'Drag a handle to reshape · drag inside to move'
    : uiShape === 'Grid'     ? 'Drag to draw a grid zone'
    : uiShape === 'Rectangle'? 'Drag to draw a rectangle'
    : uiShape === 'Circle'   ? 'Drag from the center outward'
    : pts >= 3               ? 'Tap Close Shape, or keep adding points'
    :                          `Tap to add points (${pts}/3 minimum)`;

  const toolbar = (
    <View
      style={[
        isWide ? ves.drawRail : ves.drawToolbarInner,
        isWide
          ? { paddingTop: (insets.top || 0) + 12, paddingLeft: (insets.left || 0) + 12 }
          : { paddingBottom: insets.bottom || 10 },
      ]}
    >
      <View style={isWide ? ves.drawShapeCol : ves.drawShapeRow}>
        {UI_SHAPES.map(({ shape: s, label, Icon }) => {
          const active = uiShape === s;
          return (
            <TouchableOpacity
              key={s}
              style={[ves.drawShapeChip, isWide && ves.drawChipWide, active && ves.drawShapeChipActive]}
              onPress={() => changeShape(s)}
            >
              <Icon size={15} color={active ? "#0891b2" : "#fff"} />
              <Text style={[ves.drawShapeText, active && ves.drawShapeTextActive]}>{label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {(rotation !== 0 || geometry || pts > 0) && (
        <View style={isWide ? ves.drawColGroup : ves.drawToolRow}>
          {rotation !== 0 && (
            <TouchableOpacity
              onPress={() => webviewRef.current?.injectJavaScript('window.setRotation(0);true;')}
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

      {/* Cell steppers — only for the Grid shape, once a rectangle exists to divide. */}
      {uiShape === 'Grid' && geometry && (
        <View style={isWide ? ves.drawColGroup : ves.drawToolRow}>
          {isWide && <Text style={ves.drawRailLabel}>CELLS</Text>}
          {(['rows', 'cols'] as const).map(axis => (
            <View key={axis} style={ves.drawStepper}>
              <Text style={ves.drawStepperLabel}>{axis === 'rows' ? 'R' : 'C'}</Text>
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

      {/* On the rail, drop the actions to the foot so Save sits under the thumb. */}
      {isWide && <View style={ves.drawRailSpacer} />}

      <View style={isWide ? ves.drawColGroup : ves.drawToolRow}>
        <TouchableOpacity onPress={onCancel} style={[ves.drawCancelBtn, isWide && ves.drawChipWide]}>
          <Text style={ves.drawCancelText}>Cancel</Text>
        </TouchableOpacity>

        {!isWide && <View style={ves.drawToolSpacer} />}

        {drafting && (
          <TouchableOpacity onPress={() => inject('undoPoint')} style={[ves.drawCancelBtn, isWide && ves.drawChipWide]}>
            <Text style={ves.drawCancelText}>Undo</Text>
          </TouchableOpacity>
        )}
        {drafting && pts >= 3 && (
          <TouchableOpacity onPress={() => inject('closePolygon')} style={[ves.drawFinishBtn, isWide && ves.drawChipWide]}>
            <Text style={ves.drawFinishText}>Close Shape</Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity
          onPress={() => geometry && onDone(geometry, gridOn ? grid : undefined)}
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
        <VisionCanvas
          ref={webviewRef}
          html={html}
          style={StyleSheet.absoluteFill}
          onMessage={onMessage}
        />
      ) : (
        <View style={[StyleSheet.absoluteFill, { justifyContent: 'center', alignItems: 'center', padding: 24 }]}>
          <Text style={{ color: '#9ca3af', fontSize: 14, textAlign: 'center' }}>
            Select a camera to load a snapshot for zone drawing.
          </Text>
        </View>
      )}

      <View style={ves.drawHint} pointerEvents="none">
        <Text style={ves.drawHintText}>{hint}</Text>
      </View>
    </View>
  );

  return (
    <Modal visible={visible} animationType="slide" statusBarTranslucent onRequestClose={onCancel}>
      {/* Canvas and toolbar are siblings, so the image is sized to what's left rather
          than sitting under the controls. Wide: rail then image. Narrow: image then bar. */}
      <View style={[ves.drawModalRoot, isWide && ves.drawModalRootWide]}>
        {isWide ? (
          <>
            {toolbar}
            {canvasArea}
          </>
        ) : (
          <>
            {canvasArea}
            {toolbar}
          </>
        )}

        {/* Change-shape confirmation, drawn as the last child so it sits above the
            canvas (an app-root alert would render behind this modal's iframe on web). */}
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
