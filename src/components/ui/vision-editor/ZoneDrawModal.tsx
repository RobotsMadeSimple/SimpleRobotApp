import React, { useEffect, useMemo, useRef, useState } from "react";
import { Modal, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Grid3x3, Minus, Plus, RotateCcw } from "lucide-react-native";
import { makeZoneDrawHtml } from "@/src/vision/visionHtml";
import { VisionZone, VisionZoneGeometry, VisionZoneGrid, VisionZoneShape } from "@/src/models/robotModels";
import { appAlert } from "@/src/components/ui/AppAlert";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { VisionCanvas } from "@/src/vision/VisionCanvas";
import type { VisionCanvasHandle } from "@/src/vision/visionCanvasTypes";
import { ves } from "./visionEditorStyles";

const SHAPES: { shape: VisionZoneShape; label: string }[] = [
  { shape: 'Rectangle', label: 'Rect' },
  { shape: 'Circle',    label: 'Circle' },
  { shape: 'Polygon',   label: 'Polygon' },
];

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
  const webviewRef = useRef<VisionCanvasHandle>(null);

  // The shape the canvas is *built* with. Kept out of the html deps below so that
  // switching shape injects instead of reloading the WebView — a reload would
  // resurrect initialGeometry on top of the new shape.
  const initialShape: VisionZoneShape = initialGeometry?.shape ?? 'Rectangle';

  const [shape, setShape]       = useState<VisionZoneShape>(initialShape);
  const [geometry, setGeometry] = useState<VisionZoneGeometry | null>(initialGeometry ?? null);
  const [editing, setEditing]   = useState(!!initialGeometry);
  const [pts, setPts]           = useState(0);
  const [grid, setGrid]         = useState<VisionZoneGrid | undefined>(initialGrid ?? undefined);

  useEffect(() => {
    if (!visible) return;
    setShape(initialShape);
    setGeometry(initialGeometry ?? null);
    setEditing(!!initialGeometry);
    setPts(0);
    setGrid(initialGrid ?? undefined);
  }, [visible, initialShape, initialGeometry, initialGrid]);

  // One place to push the grid down, so no stepper can forget to redraw. The html already
  // embeds the initial grid, so an early run before the WebView is ready costs nothing.
  useEffect(() => {
    webviewRef.current?.injectJavaScript(`window.setGrid(${JSON.stringify(grid ?? null)});true;`);
  }, [grid]);

  function applyShape(s: VisionZoneShape) {
    setShape(s);
    setGeometry(null);
    setEditing(false);
    setPts(0);
    webviewRef.current?.injectJavaScript(`window.setShape(${JSON.stringify(s)});true;`);
  }

  function changeShape(s: VisionZoneShape) {
    if (s === shape) return;
    // Switching shape discards the working geometry — a circle has no meaningful
    // polygon form — so confirm rather than silently dropping someone's edits.
    if (geometry || pts > 0) {
      appAlert("Change shape?", "This clears the shape you're working on.", [
        { text: "Cancel", style: "cancel" },
        { text: "Change", style: "destructive", onPress: () => applyShape(s) },
      ]);
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

  const gridOn   = !!grid && grid.rows * grid.cols > 1;
  const rotation = geometry?.shape === 'Rectangle' ? (geometry.rotation ?? 0) : 0;
  const drafting = !editing && shape === 'Polygon' && pts > 0;

  const hint =
    editing && shape === 'Rectangle'
      ? 'Drag a corner to resize · the top grip to rotate · inside to move'
    : editing               ? 'Drag a handle to reshape · drag inside to move'
    : shape === 'Rectangle' ? 'Drag to draw a rectangle'
    : shape === 'Circle'    ? 'Drag from the center outward'
    : pts >= 3              ? 'Tap Close Shape, or keep adding points'
    :                         `Tap to add points (${pts}/3 minimum)`;

  return (
    <Modal visible={visible} animationType="slide" statusBarTranslucent onRequestClose={onCancel}>
      <View style={ves.drawModalRoot}>
        {html ? (
          <VisionCanvas
            ref={webviewRef}
            html={html}
            style={StyleSheet.absoluteFill}
            onMessage={onMessage}
          />
        ) : (
          <View style={[StyleSheet.absoluteFill, { justifyContent: 'center', alignItems: 'center' }]}>
            <Text style={{ color: '#6b7280', fontSize: 14 }}>
              Select a camera above to load a snapshot for zone drawing.
            </Text>
          </View>
        )}

        <View style={ves.drawHint} pointerEvents="none">
          <Text style={ves.drawHintText}>{hint}</Text>
        </View>

        <View style={ves.drawToolbar} pointerEvents="box-none">
          <View style={[ves.drawToolbarInner, { paddingBottom: insets.bottom || 10 }]}>
            <View style={ves.drawToolRow}>
              <View style={ves.drawShapeRow}>
                {SHAPES.map(({ shape: s, label }) => (
                  <TouchableOpacity
                    key={s}
                    style={[ves.drawShapeChip, shape === s && ves.drawShapeChipActive]}
                    onPress={() => changeShape(s)}
                  >
                    <Text style={[ves.drawShapeText, shape === s && ves.drawShapeTextActive]}>{label}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {rotation !== 0 && (
                <TouchableOpacity
                  onPress={() => webviewRef.current?.injectJavaScript('window.setRotation(0);true;')}
                  style={ves.drawRotChip}
                  hitSlop={6}
                >
                  <RotateCcw size={12} color="#fdba74" />
                  <Text style={ves.drawRotChipText}>{rotation}°</Text>
                </TouchableOpacity>
              )}

              {(geometry || pts > 0) && (
                <TouchableOpacity onPress={clearShape} style={ves.drawClearBtn}>
                  <Text style={ves.drawClearText}>Clear</Text>
                </TouchableOpacity>
              )}
            </View>

            {/* Grid only means something once there is a shape to divide up. */}
            {geometry && (
              <View style={ves.drawToolRow}>
                <TouchableOpacity
                  style={[ves.drawGridToggle, gridOn && ves.drawGridToggleOn]}
                  onPress={() => setGrid(gridOn ? undefined : { rows: 2, cols: 2 })}
                  activeOpacity={0.75}
                >
                  <Grid3x3 size={13} color={gridOn ? "#67e8f9" : "rgba(255,255,255,0.6)"} />
                  <Text style={[ves.drawGridToggleText, gridOn && ves.drawGridToggleTextOn]}>GRID</Text>
                </TouchableOpacity>

                {!gridOn ? (
                  <Text style={ves.drawGridHint}>Off — color inspections measure the whole zone</Text>
                ) : (
                  <>
                    <View style={ves.drawToolSpacer} />
                    {(['rows', 'cols'] as const).map(axis => (
                      <View key={axis} style={ves.drawStepper}>
                        <Text style={ves.drawStepperLabel}>{axis === 'rows' ? 'R' : 'C'}</Text>
                        <TouchableOpacity style={ves.drawStepBtn} onPress={() => stepGrid(axis, -1)} hitSlop={6}>
                          <Minus size={12} color="rgba(255,255,255,0.75)" />
                        </TouchableOpacity>
                        <Text style={ves.drawStepValue}>{grid![axis]}</Text>
                        <TouchableOpacity style={ves.drawStepBtn} onPress={() => stepGrid(axis, 1)} hitSlop={6}>
                          <Plus size={12} color="rgba(255,255,255,0.75)" />
                        </TouchableOpacity>
                      </View>
                    ))}
                  </>
                )}
              </View>
            )}

            <View style={ves.drawToolRow}>
              <TouchableOpacity onPress={onCancel} style={ves.drawCancelBtn}>
                <Text style={ves.drawCancelText}>Cancel</Text>
              </TouchableOpacity>

              <View style={ves.drawToolSpacer} />

              {drafting && (
                <TouchableOpacity onPress={() => inject('undoPoint')} style={ves.drawCancelBtn}>
                  <Text style={ves.drawCancelText}>Undo</Text>
                </TouchableOpacity>
              )}
              {drafting && pts >= 3 && (
                <TouchableOpacity onPress={() => inject('closePolygon')} style={ves.drawFinishBtn}>
                  <Text style={ves.drawFinishText}>Close Shape</Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity
                onPress={() => geometry && onDone(geometry, gridOn ? grid : undefined)}
                disabled={!geometry}
                style={[ves.drawSaveBtn, !geometry && ves.drawSaveBtnDisabled]}
              >
                <Text style={ves.drawSaveText}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}
