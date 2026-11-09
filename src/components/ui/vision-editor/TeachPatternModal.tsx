import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Modal, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Camera, RotateCcw } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { makeRegionDrawHtml } from "@/src/vision/visionHtml";
import { drawToRegion, regionToDraw, type DrawGeometry } from "@/src/vision/regionMath";
import type { PatternTemplate, Region } from "@/src/models/visionTools";
import { useIsWide } from "@/src/components/ui/responsive";
import { VisionCanvas } from "@/src/vision/VisionCanvas";
import type { VisionCanvasHandle } from "@/src/vision/visionCanvasTypes";
import { colors, radii, spacing } from "@/src/components/ui/kit";
import { FeedCanvas, type FeedCanvasHandle } from "@/src/components/vision/FeedCanvas";
import { FitChip, zoomScaleOf } from "@/src/components/vision/LiveViewerModal";
import { ves } from "./visionEditorStyles";

type Step = "frame" | "area" | "check";

const STEPS: { id: Step; label: string }[] = [
  { id: "frame", label: "Frame" },
  { id: "area",  label: "Area" },
  { id: "check", label: "Check" },
];

/** A box in the middle of the frame to start from when nothing was taught yet. */
const START_AREA: Region = { shape: "rect", x: 0.35, y: 0.3, width: 0.3, height: 0.4, rotation: 0 };

export type TeachPreview = { template: Record<string, unknown> | null; preview: string | null; taught: string | null };

/**
 * Teach a pattern from the camera, one step at a time:
 *   1. Frame — grab the current camera frame (again, until the part sits right).
 *   2. Area  — draw a rectangle round the part on that frame; drag its corners to size it and its
 *              top grip to turn it with the part. The top edge (left → right) is the pattern's 0°.
 *   3. Check — the controller cuts the pattern from inside the box, deskewed to the box, and shows
 *              it with the outlines it found; Save keeps it on the tool.
 * Nothing changes on the tool until Save, so Cancel at any step leaves it as it was.
 */
type FlowProps = {
  /** The area the pattern was last taught from, to start from. */
  initialRegion: Region | null;
  /** Grabs the current camera frame as a data URL (null when there is no frame). */
  onGrab: () => Promise<string | null>;
  /** Cuts the pattern from the frame inside the area, without saving anything. */
  onPreview: (image: string, region: Region) => Promise<TeachPreview>;
  onSave: (template: Record<string, unknown>) => void;
  onCancel: () => void;
};

export function TeachPatternModal({ visible, ...flow }: FlowProps & { visible: boolean }) {
  // The flow is mounted per opening, so each one starts over at the frame step with a fresh frame.
  return (
    <Modal visible={visible} animationType="slide" statusBarTranslucent onRequestClose={flow.onCancel}>
      {visible && <TeachFlow {...flow} />}
    </Modal>
  );
}

function TeachFlow({ initialRegion, onGrab, onPreview, onSave, onCancel }: FlowProps) {
  const insets = useSafeAreaInsets();
  const isWide = useIsWide();
  const canvasRef = useRef<VisionCanvasHandle>(null);

  const [step, setStep]         = useState<Step>("frame");
  const [frame, setFrame]       = useState<string | null>(null);
  const [grabbing, setGrabbing] = useState(true);
  const [geometry, setGeometry] = useState<DrawGeometry | null>(null);
  const [area, setArea]         = useState<Region>(initialRegion ?? START_AREA);
  const [busy, setBusy]         = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const [result, setResult]     = useState<TeachPreview | null>(null);
  // The draw canvas document, built when the area step is entered (edits then stay inside it).
  const [html, setHtml]         = useState<string | null>(null);
  // Zoom of whichever canvas is showing (every step's frame zooms), tied to its step and document.
  const [zoomOf, setZoomOf]     = useState<{ key: string; scale: number }>({ key: "", scale: 1 });
  const zoomKey = `${step}:${step === "area" ? html : step === "frame" ? frame : result?.preview}`;
  const zoom = zoomOf.key === zoomKey ? zoomOf.scale : 1;
  const zoomRef = useRef<FeedCanvasHandle>(null);
  const onZoomMessage = (e: { nativeEvent: { data: string } }) => {
    const z = zoomScaleOf(e.nativeEvent.data);
    if (z !== null) setZoomOf({ key: zoomKey, scale: z });
  };

  const grabbed = (uri: string | null) => {
    setFrame(uri);
    setError(uri ? null : "No camera frame — check the camera is connected.");
    setGrabbing(false);
  };

  function grab() {
    setGrabbing(true);
    setError(null);
    onGrab().then(grabbed, () => grabbed(null));
  }

  // A frame straight away on opening.
  const onGrabRef = useRef(onGrab);
  useEffect(() => {
    onGrabRef.current().then(grabbed, () => grabbed(null));
  }, []);

  function onCanvasMessage(e: { nativeEvent: { data: string } }) {
    onZoomMessage(e);
    try {
      const msg = JSON.parse(e.nativeEvent.data);
      if (msg.type === "state") setGeometry(msg.geometry ?? null);
    } catch {}
  }

  function openArea(r: Region) {
    if (!frame) return;
    const g = regionToDraw(r.shape === "rect" ? r : START_AREA);
    setGeometry(g);
    setHtml(makeRegionDrawHtml(frame, [], null, "Rectangle", g, null));
    setStep("area");
  }

  async function check() {
    if (!frame || !geometry) return;
    const region = drawToRegion(geometry);
    setArea(region);
    setBusy(true);
    setError(null);
    try {
      const r = await onPreview(frame, region);
      if (!r.template) { setError("Nothing could be cut from that area — try a bigger box."); return; }
      setResult(r);
      setStep("check");
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  }

  function save() {
    if (result?.template) onSave(result.template);
  }

  const tpl = result?.template as PatternTemplate | null | undefined;
  const rotation = geometry?.shape === "Rectangle" ? geometry.rotation ?? 0 : 0;

  const hint =
    step === "frame" ? "Place a good part in view, then grab the frame"
    : step === "area" ? "Drag a corner to resize · the top grip to turn the box with the part · inside to move · pinch or scroll to zoom"
    : "Green: the outlines found in the pattern. Red arrow: its 0° direction";

  const stepBar = (
    <View style={[st.steps, { paddingTop: (insets.top || 0) + 10 }]}>
      {STEPS.map((s, i) => {
        const on = s.id === step;
        const done = STEPS.findIndex(x => x.id === step) > i;
        return (
          <View key={s.id} style={st.stepItem}>
            <View style={[st.stepDot, (on || done) && st.stepDotOn]}>
              <Text style={[st.stepNum, (on || done) && st.stepNumOn]}>{i + 1}</Text>
            </View>
            <Text style={[st.stepLabel, on && st.stepLabelOn]}>{s.label}</Text>
          </View>
        );
      })}
    </View>
  );

  const body = (
    <View style={ves.drawCanvasArea}>
      {step === "frame" && (
        frame
          ? <FeedCanvas ref={zoomRef} feedUrl={frame} zoomable style={StyleSheet.absoluteFill} onMessage={onZoomMessage} />
          : <View style={st.center}>{grabbing ? <ActivityIndicator color="#fff" /> : <Text style={st.faint}>No frame yet</Text>}</View>
      )}
      {step === "area" && html && (
        <VisionCanvas ref={canvasRef} html={html} style={StyleSheet.absoluteFill} onMessage={onCanvasMessage} />
      )}
      {step === "check" && result?.preview && (
        <View style={st.previewWrap}>
          <FeedCanvas
            ref={zoomRef}
            feedUrl={`data:image/png;base64,${result.preview}`}
            zoomable
            style={st.previewImg}
            onMessage={onZoomMessage}
          />
          {tpl && (
            <Text style={st.previewInfo}>
              {tpl.width} × {tpl.height} px · box at {fmtDeg(tpl.angle ?? 0)} · {(tpl.contours ?? []).length} outline{(tpl.contours ?? []).length !== 1 ? "s" : ""}
            </Text>
          )}
          <Text style={st.previewNote}>
            Matches report their angle from this orientation: 0° is the part as it lies in the box now.
          </Text>
        </View>
      )}
      <View style={[ves.drawHint, { top: 8 }]} pointerEvents="none">
        <Text style={ves.drawHintText}>{hint}</Text>
      </View>
      <FitChip
        scale={zoom}
        style={{ position: "absolute", right: 12, bottom: 12 }}
        onPress={() => (step === "area" ? canvasRef.current?.injectJavaScript("window.resetZoom();true;") : zoomRef.current?.resetZoom())}
      />
      {busy && (
        <View style={st.busy} pointerEvents="none"><ActivityIndicator color="#fff" size="large" /></View>
      )}
    </View>
  );

  const toolbar = (
    <View
      style={[
        isWide ? ves.drawRail : ves.drawToolbarInner,
        isWide ? { paddingLeft: (insets.left || 0) + 12 } : { paddingBottom: insets.bottom || 10 },
      ]}
    >
      {!!error && <Text style={st.error}>{error}</Text>}

      {step === "frame" && (
        <View style={isWide ? ves.drawColGroup : ves.drawToolRow}>
          <TouchableOpacity onPress={grab} disabled={grabbing} style={[ves.drawShapeChip, isWide && ves.drawChipWide]} accessibilityLabel="Grab frame">
            <Camera size={15} color={colors.onAccent} />
            <Text style={ves.drawShapeText}>{frame ? "Grab again" : "Grab frame"}</Text>
          </TouchableOpacity>
        </View>
      )}

      {step === "area" && rotation !== 0 && (
        <View style={isWide ? ves.drawColGroup : ves.drawToolRow}>
          <TouchableOpacity
            onPress={() => canvasRef.current?.injectJavaScript("window.setRotation(0);true;")}
            style={[ves.drawRotChip, isWide && ves.drawChipWide]}
            hitSlop={6}
            accessibilityLabel="Square the box"
          >
            <RotateCcw size={12} color="#fdba74" />
            <Text style={ves.drawRotChipText}>{fmtDeg(rotation)}</Text>
          </TouchableOpacity>
        </View>
      )}

      {isWide && <View style={ves.drawRailSpacer} />}

      <View style={isWide ? ves.drawColGroup : ves.drawToolRow}>
        <TouchableOpacity onPress={onCancel} style={[ves.drawCancelBtn, isWide && ves.drawChipWide]}>
          <Text style={ves.drawCancelText}>Cancel</Text>
        </TouchableOpacity>
        {!isWide && <View style={ves.drawToolSpacer} />}
        {step !== "frame" && (
          <TouchableOpacity onPress={() => (step === "check" ? openArea(area) : setStep("frame"))} style={[ves.drawCancelBtn, isWide && ves.drawChipWide]} disabled={busy}>
            <Text style={ves.drawCancelText}>Back</Text>
          </TouchableOpacity>
        )}
        {step === "frame" && (
          <PrimaryBtn label="Next" disabled={!frame || grabbing} wide={isWide} onPress={() => openArea(area)} />
        )}
        {step === "area" && (
          <PrimaryBtn label="Next" disabled={!geometry || busy} wide={isWide} onPress={check} />
        )}
        {step === "check" && (
          <PrimaryBtn label="Save pattern" disabled={!result?.template} wide={isWide} onPress={save} />
        )}
      </View>
    </View>
  );

  return (
    <View style={ves.drawModalRoot}>
      {stepBar}
      <View style={[{ flex: 1 }, isWide && ves.drawModalRootWide]}>
        {isWide ? (<>{toolbar}{body}</>) : (<>{body}{toolbar}</>)}
      </View>
    </View>
  );
}

function PrimaryBtn({ label, disabled, wide, onPress }: { label: string; disabled: boolean; wide: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity onPress={onPress} disabled={disabled} style={[ves.drawSaveBtn, wide && ves.drawChipWide, disabled && ves.drawSaveBtnDisabled]}>
      <Text style={ves.drawSaveText}>{label}</Text>
    </TouchableOpacity>
  );
}

const fmtDeg = (d: number) => `${Math.round(d * 10) / 10}°`;

const st = StyleSheet.create({
  steps: {
    flexDirection: "row", justifyContent: "center", gap: spacing.lg,
    paddingBottom: spacing.sm, backgroundColor: colors.overlayDark,
  },
  stepItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  stepDot: {
    width: 20, height: 20, borderRadius: 10, alignItems: "center", justifyContent: "center",
    borderWidth: 1.5, borderColor: "rgba(255,255,255,0.35)",
  },
  stepDotOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  stepNum: { fontSize: 11, fontWeight: "700", color: "rgba(255,255,255,0.6)" },
  stepNumOn: { color: colors.onAccent },
  stepLabel: { fontSize: 13, fontWeight: "600", color: "rgba(255,255,255,0.55)" },
  stepLabelOn: { color: colors.onAccent },
  center: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, alignItems: "center", justifyContent: "center" },
  faint: { color: "rgba(255,255,255,0.55)", fontSize: 14 },
  busy: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.35)" },
  previewWrap: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.lg, paddingTop: 44, gap: spacing.sm },
  previewImg: { width: "100%", flex: 1, maxWidth: 520 },
  previewInfo: { color: colors.onAccent, fontSize: 14, fontWeight: "700", fontVariant: ["tabular-nums"] },
  previewNote: { color: "rgba(255,255,255,0.65)", fontSize: 12, textAlign: "center", maxWidth: 420 },
  error: {
    color: "#fecaca", fontSize: 12, backgroundColor: "rgba(239,68,68,0.2)",
    borderRadius: radii.sm, paddingHorizontal: spacing.sm, paddingVertical: 6,
  },
});
