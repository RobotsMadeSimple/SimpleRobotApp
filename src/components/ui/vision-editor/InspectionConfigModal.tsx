import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  BackHandler,
  PanResponder,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Check, ChevronDown, Eye, EyeOff, Plus, Trash2 } from "lucide-react-native";
import { BlobParamsPanel, ParamRow, SliderParamRow, ThresholdRangeRow, ToggleRow } from "@/src/components/vision/VisionParams";
import {
  ARUCO_DICTIONARIES,
  ArucoInspection,
  BARCODE_FORMATS,
  BarcodeInspection,
  BlobDetectionParams,
  BlobInspection,
  ColorCoverageInspection,
  ColorEntry,
  LineInspection,
  PolygonInspection,
  VisionResult,
  VisionZone,
  defaultBlobParams,
  defaultColorEntry,
} from "@/src/models/robotModels";
import { colors as kitColors, spacing, radii, shadows, accents, PageHeader } from "@/src/components/ui/kit";
import { DeleteIconButton } from "@/src/components/ui/DeleteIconButton";
import { VisionResults } from "@/src/components/ui/VisionResults";
import { VisionFeedViewer } from "@/src/components/vision/VisionFeedViewer";
import { ves } from "./visionEditorStyles";
import { usePaneLayout, wide } from "@/src/components/ui/responsive";
import { ZonePickerModal } from "./ZonePickerModal";
import { DictionaryPickerModal } from "./DictionaryPickerModal";
import { ColorEditModal } from "./ColorEditModal";
import { FormatPickerSheet } from "./InspectionTypePicker";

export function InspectionConfigModal({
  visible, kind, initialBlob, initialColor, initialPolygon, initialAruco, initialLine, initialBarcode, zones,
  snapshotUri, onFetchSnapshot, onSaveBlob, onSaveColor, onSavePolygon, onSaveAruco, onSaveLine, onSaveBarcode, onClose,
  feedUrl, isRunning, transitioning, onToggleRunning, visionResult,
  onLiveUpdate, onLiveUpdateBlob, onLiveUpdateColor, onLiveUpdateAruco, onLiveUpdateLine,
}: {
  visible: boolean;
  kind: 'blob' | 'color' | 'polygon' | 'aruco' | 'line' | 'barcode' | null;
  initialBlob: BlobInspection | null;
  initialColor: ColorCoverageInspection | null;
  initialPolygon: PolygonInspection | null;
  initialAruco: ArucoInspection | null;
  initialLine: LineInspection | null;
  initialBarcode: BarcodeInspection | null;
  zones: VisionZone[];
  snapshotUri: string | null;
  onFetchSnapshot: () => Promise<void>;
  onSaveBlob: (insp: BlobInspection) => void;
  onSaveColor: (insp: ColorCoverageInspection) => void;
  onSavePolygon: (insp: PolygonInspection) => void;
  onSaveAruco: (insp: ArucoInspection) => void;
  onSaveLine: (insp: LineInspection) => void;
  onSaveBarcode: (insp: BarcodeInspection) => void;
  onClose: () => void;
  // Same live feed the main editor view uses: annotated stream while running,
  // raw camera stream otherwise (ws:// URL), plus the Start/Stop Vision control.
  feedUrl?: string | null;
  isRunning?: boolean;
  transitioning?: 'starting' | 'stopping' | null;
  onToggleRunning?: () => void;
  visionResult?: VisionResult | null;
  onLiveUpdate?: (insp: PolygonInspection) => void;
  onLiveUpdateBlob?: (insp: BlobInspection) => void;
  onLiveUpdateColor?: (insp: ColorCoverageInspection) => void;
  onLiveUpdateAruco?: (insp: ArucoInspection) => void;
  onLiveUpdateLine?: (insp: LineInspection) => void;
}) {
  const paneLayout = usePaneLayout();
  const isWide  = paneLayout !== "single";
  const isSplit = paneLayout === "split";
  const [name, setName]               = useState('');
  const [enabled, setEnabled]         = useState(true);
  const [zoneId, setZoneId]           = useState<string | null>(null);
  const [blobParams, setBlobParams]   = useState<BlobDetectionParams>(defaultBlobParams());
  const [colors, setColors]           = useState<ColorEntry[]>([]);
  const [minCoverage, setMinCoverage] = useState<number | null>(null);
  const [maxCoverage, setMaxCoverage] = useState<number | null>(null);
  const [minCoverageText, setMinCoverageText] = useState('50');
  const [maxCoverageText, setMaxCoverageText] = useState('90');

  // One range slider drives both bounds. Refs (not state) because the PanResponder is
  // created once and would otherwise close over stale values.
  const covBarWRef   = useRef(1);
  const minCovValRef = useRef(50);
  const maxCovValRef = useRef(90);
  const minOnRef     = useRef(false);
  const maxOnRef     = useRef(false);
  minCovValRef.current = minCoverage ?? 50;
  maxCovValRef.current = maxCoverage ?? 90;
  minOnRef.current     = minCoverage !== null;
  maxOnRef.current     = maxCoverage !== null;

  // One pan responder per thumb — each thumb owns its own drag. Detecting which thumb
  // from the touch position was unreliable (locationX reads as ~0 on web, so it always
  // picked the min); giving each thumb its own handler is robust everywhere. Each is
  // clamped against the other so the min can never pass the max (an empty pass band).
  const minDragStart = useRef(0);
  const maxDragStart = useRef(0);
  const dxToPct = (g: { dx: number }) => (g.dx / Math.max(1, covBarWRef.current)) * 100;
  const clampPct = (v: number) => Math.round(Math.max(0, Math.min(100, v)) * 10) / 10;

  const minThumbPan = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: () => { minDragStart.current = minCovValRef.current; },
    onPanResponderMove: (_, g) => {
      if (Math.abs(g.dy) > Math.abs(g.dx) + 5) return;
      let v = clampPct(minDragStart.current + dxToPct(g));
      if (maxOnRef.current) v = Math.min(v, maxCovValRef.current);
      setMinCoverage(v); setMinCoverageText(String(v));
    },
  })).current;

  const maxThumbPan = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: () => { maxDragStart.current = maxCovValRef.current; },
    onPanResponderMove: (_, g) => {
      if (Math.abs(g.dy) > Math.abs(g.dx) + 5) return;
      let v = clampPct(maxDragStart.current + dxToPct(g));
      if (minOnRef.current) v = Math.max(v, minCovValRef.current);
      setMaxCoverage(v); setMaxCoverageText(String(v));
    },
  })).current;

  // Polygon-specific state
  const [polySides, setPolySides]         = useState(4);
  const [polyMinArea, setPolyMinArea]     = useState(1000);
  const [polyMaxArea, setPolyMaxArea]     = useState(100000);
  const [polyEpsilon, setPolyEpsilon]     = useState(0.04);
  const [polyMinThresh, setPolyMinThresh] = useState(50);
  const [polyMaxThresh, setPolyMaxThresh] = useState(200);
  const [polyInverted, setPolyInverted]   = useState(false);

  // ArUco-specific state
  const [arucoDictId,      setArucoDictId]      = useState(1);
  const [arucoMinArea,     setArucoMinArea]     = useState(100);
  const [arucoMaxArea,     setArucoMaxArea]     = useState(100000);
  const [dictPickerOpen,   setDictPickerOpen]   = useState(false);

  // Line-specific state
  const [lineCannyT1,       setLineCannyT1]       = useState(50);
  const [lineCannyT2,       setLineCannyT2]       = useState(150);
  const [lineHoughThresh,   setLineHoughThresh]   = useState(50);
  const [lineMinLineLen,    setLineMinLineLen]    = useState(30);
  const [lineMaxLineGap,    setLineMaxLineGap]    = useState(10);
  const [lineFilterByAngle, setLineFilterByAngle] = useState(false);
  const [lineMinAngle,      setLineMinAngle]      = useState(0);
  const [lineMaxAngle,      setLineMaxAngle]      = useState(180);

  // Barcode-specific state
  const [barcodeFormats,    setBarcodeFormats]   = useState<string[]>([]);
  const [formatPickerOpen,  setFormatPickerOpen] = useState(false);

  const initialBarcodeRef   = useRef(initialBarcode);
  initialBarcodeRef.current = initialBarcode;

  const [zonePickerOpen, setZonePickerOpen]   = useState(false);
  const [colorEditState, setColorEditState]   = useState<{ entry: ColorEntry } | null>(null);

  // Pulse the Start/Stop button while a start/stop transition is in flight — mirrors the main view.
  const pulseAnim = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (!transitioning) { pulseAnim.setValue(1); return; }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 0.55, duration: 550, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1,    duration: 550, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [transitioning]);

  // Refs so notifyLiveUpdate always sees the latest state without stale closures
  const polyStateRef = useRef({ name, enabled, zoneId, polySides, polyMinArea, polyMaxArea, polyEpsilon, polyMinThresh, polyMaxThresh, polyInverted });
  polyStateRef.current = { name, enabled, zoneId, polySides, polyMinArea, polyMaxArea, polyEpsilon, polyMinThresh, polyMaxThresh, polyInverted };
  const initialPolygonRef    = useRef(initialPolygon);
  initialPolygonRef.current  = initialPolygon;
  const onLiveUpdateRef        = useRef(onLiveUpdate);
  onLiveUpdateRef.current      = onLiveUpdate;
  const onLiveUpdateBlobRef    = useRef(onLiveUpdateBlob);
  onLiveUpdateBlobRef.current  = onLiveUpdateBlob;
  const onLiveUpdateColorRef   = useRef(onLiveUpdateColor);
  onLiveUpdateColorRef.current = onLiveUpdateColor;
  const onLiveUpdateArucoRef   = useRef(onLiveUpdateAruco);
  onLiveUpdateArucoRef.current = onLiveUpdateAruco;

  const initialBlobRef    = useRef(initialBlob);
  initialBlobRef.current  = initialBlob;
  const initialColorRef   = useRef(initialColor);
  initialColorRef.current = initialColor;
  const initialArucoRef   = useRef(initialAruco);
  initialArucoRef.current = initialAruco;
  const initialLineRef    = useRef(initialLine);
  initialLineRef.current  = initialLine;
  const onLiveUpdateLineRef   = useRef(onLiveUpdateLine);
  onLiveUpdateLineRef.current = onLiveUpdateLine;

  function notifyLiveUpdate(patch: Partial<PolygonInspection>) {
    const init = initialPolygonRef.current;
    if (!init || kind !== 'polygon') return;
    const s = polyStateRef.current;
    onLiveUpdateRef.current?.({
      ...init,
      name: s.name, enabled: s.enabled, zoneId: s.zoneId,
      sides: s.polySides, minArea: s.polyMinArea, maxArea: s.polyMaxArea,
      epsilon: s.polyEpsilon, minThreshold: s.polyMinThresh, maxThreshold: s.polyMaxThresh,
      invertThreshold: s.polyInverted,
      ...patch,
    });
  }

  // Debounced live-update saves for non-polygon kinds
  useEffect(() => {
    if (!visible || kind !== 'blob') return;
    const init = initialBlobRef.current; if (!init) return;
    const t = setTimeout(() => {
      onLiveUpdateBlobRef.current?.({ ...init, name, enabled, zoneId, blobParams });
    }, 300);
    return () => clearTimeout(t);
  }, [blobParams, name, enabled, zoneId]);

  useEffect(() => {
    if (!visible || kind !== 'color') return;
    const init = initialColorRef.current; if (!init) return;
    const t = setTimeout(() => {
      onLiveUpdateColorRef.current?.({ ...init, name, enabled, zoneId, colors, minCoverage, maxCoverage });
    }, 300);
    return () => clearTimeout(t);
  }, [colors, minCoverage, maxCoverage, name, enabled, zoneId]);

  useEffect(() => {
    if (!visible || kind !== 'aruco') return;
    const init = initialArucoRef.current; if (!init) return;
    const t = setTimeout(() => {
      onLiveUpdateArucoRef.current?.({
        ...init, name, enabled, zoneId,
        dictionaryId: arucoDictId, minMarkerArea: arucoMinArea, maxMarkerArea: arucoMaxArea,
      });
    }, 300);
    return () => clearTimeout(t);
  }, [arucoDictId, arucoMinArea, arucoMaxArea, name, enabled, zoneId]);

  useEffect(() => {
    if (!visible || kind !== 'line') return;
    const init = initialLineRef.current; if (!init) return;
    const t = setTimeout(() => {
      onLiveUpdateLineRef.current?.({
        ...init, name, enabled, zoneId,
        cannyThreshold1: lineCannyT1, cannyThreshold2: lineCannyT2,
        houghThreshold: lineHoughThresh,
        minLineLength: lineMinLineLen, maxLineGap: lineMaxLineGap,
        filterByAngle: lineFilterByAngle, minAngle: lineMinAngle, maxAngle: lineMaxAngle,
      });
    }, 300);
    return () => clearTimeout(t);
  }, [lineCannyT1, lineCannyT2, lineHoughThresh, lineMinLineLen, lineMaxLineGap,
      lineFilterByAngle, lineMinAngle, lineMaxAngle, name, enabled, zoneId]);

  useEffect(() => {
    if (!visible) return;
    if (kind === 'blob' && initialBlob) {
      setName(initialBlob.name);
      setEnabled(initialBlob.enabled);
      setZoneId(initialBlob.zoneId);
      setBlobParams({ ...initialBlob.blobParams });
    } else if (kind === 'color' && initialColor) {
      setName(initialColor.name);
      setEnabled(initialColor.enabled);
      setZoneId(initialColor.zoneId);
      setColors([...initialColor.colors]);
      setMinCoverage(initialColor.minCoverage);
      setMaxCoverage(initialColor.maxCoverage);
      if (initialColor.minCoverage !== null) setMinCoverageText(String(initialColor.minCoverage));
      if (initialColor.maxCoverage !== null) setMaxCoverageText(String(initialColor.maxCoverage));
    } else if (kind === 'polygon' && initialPolygon) {
      setName(initialPolygon.name);
      setEnabled(initialPolygon.enabled);
      setZoneId(initialPolygon.zoneId);
      setPolySides(initialPolygon.sides);
      setPolyMinArea(initialPolygon.minArea);
      setPolyMaxArea(initialPolygon.maxArea);
      setPolyEpsilon(initialPolygon.epsilon);
      setPolyMinThresh(initialPolygon.minThreshold);
      setPolyMaxThresh(initialPolygon.maxThreshold);
      setPolyInverted(initialPolygon.invertThreshold ?? false);
    } else if (kind === 'aruco' && initialAruco) {
      setName(initialAruco.name);
      setEnabled(initialAruco.enabled);
      setZoneId(initialAruco.zoneId);
      setArucoDictId(initialAruco.dictionaryId);
      setArucoMinArea(initialAruco.minMarkerArea);
      setArucoMaxArea(initialAruco.maxMarkerArea);
    } else if (kind === 'line' && initialLine) {
      setName(initialLine.name);
      setEnabled(initialLine.enabled);
      setZoneId(initialLine.zoneId);
      setLineCannyT1(initialLine.cannyThreshold1);
      setLineCannyT2(initialLine.cannyThreshold2);
      setLineHoughThresh(initialLine.houghThreshold);
      setLineMinLineLen(initialLine.minLineLength);
      setLineMaxLineGap(initialLine.maxLineGap);
      setLineFilterByAngle(initialLine.filterByAngle);
      setLineMinAngle(initialLine.minAngle);
      setLineMaxAngle(initialLine.maxAngle);
    } else if (kind === 'barcode' && initialBarcode) {
      setName(initialBarcode.name);
      setEnabled(initialBarcode.enabled);
      setZoneId(initialBarcode.zoneId);
      setBarcodeFormats([...initialBarcode.formats]);
    }
  }, [visible, kind, initialBlob, initialColor, initialPolygon, initialAruco, initialLine, initialBarcode]);

  // Rendered as an in-place subpage (not a Modal), so the Android hardware back
  // button must close-and-save instead of popping the vision-editor route.
  const handleCloseRef = useRef<() => void>(() => {});
  useEffect(() => {
    if (!visible) return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      handleCloseRef.current();
      return true;
    });
    return () => sub.remove();
  }, [visible]);

  function handleClose() {
    if (kind === 'blob' && initialBlob) {
      onSaveBlob({ ...initialBlob, name, enabled, zoneId, blobParams });
    } else if (kind === 'color' && initialColor) {
      onSaveColor({ ...initialColor, name, enabled, zoneId, colors, minCoverage, maxCoverage });
    } else if (kind === 'polygon' && initialPolygon) {
      onSavePolygon({ ...initialPolygon, name, enabled, zoneId,
        sides: polySides, minArea: polyMinArea, maxArea: polyMaxArea,
        epsilon: polyEpsilon, minThreshold: polyMinThresh, maxThreshold: polyMaxThresh,
        invertThreshold: polyInverted });
    } else if (kind === 'aruco' && initialAruco) {
      onSaveAruco({ ...initialAruco, name, enabled, zoneId,
        dictionaryId: arucoDictId, minMarkerArea: arucoMinArea, maxMarkerArea: arucoMaxArea });
    } else if (kind === 'line' && initialLine) {
      onSaveLine({ ...initialLine, name, enabled, zoneId,
        cannyThreshold1: lineCannyT1, cannyThreshold2: lineCannyT2,
        houghThreshold: lineHoughThresh,
        minLineLength: lineMinLineLen, maxLineGap: lineMaxLineGap,
        filterByAngle: lineFilterByAngle, minAngle: lineMinAngle, maxAngle: lineMaxAngle });
    } else if (kind === 'barcode' && initialBarcode) {
      onSaveBarcode({ ...initialBarcode, name, enabled, zoneId, formats: barcodeFormats });
    }
    onClose();
  }

  handleCloseRef.current = handleClose;

  if (!visible) return null;

  const linkedZone = zones.find(z => z.id === zoneId);
  const accent     = kind === 'blob' ? '#0891b2' : kind === 'polygon' ? '#d97706' : kind === 'aruco' ? '#16a34a' : kind === 'line' ? '#7c3aed' : kind === 'barcode' ? '#2563eb' : '#d946ef';
  const configTitle = kind === 'blob' ? 'Blob Detection' : kind === 'polygon' ? 'Polygon Detection' : kind === 'aruco' ? 'ArUco Marker' : kind === 'line' ? 'Line Detection' : kind === 'barcode' ? 'Barcode / QR Code' : 'Color Coverage';

  // Live feed — mirrors the main editor view: annotated stream while running,
  // raw camera stream otherwise, with the same Start/Stop control. Rendered
  // above the config fields on phones, in a left pane on wide screens.
  const feedSection = (
    <View style={ws.feedPad}>
        {/* Shared with the vision editor: same frame, same padding, zones always drawn. */}
        <VisionFeedViewer
          feedUrl={feedUrl ?? null}
          zones={zones}
          isWide={isWide}
          placeholder="No camera feed"
        />

        {onToggleRunning && (
          <View>
            <Animated.View style={{ opacity: transitioning ? pulseAnim : 1 }}>
              <TouchableOpacity
                style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm,
                  borderRadius: radii.md, paddingVertical: spacing.md,
                  backgroundColor: isRunning ? kitColors.danger : accents.cyan }}
                onPress={onToggleRunning}
                activeOpacity={0.8}
                disabled={!!transitioning}
              >
                {transitioning
                  ? <ActivityIndicator size="small" color={kitColors.onAccent} />
                  : isRunning
                    ? <EyeOff size={16} color={kitColors.onAccent} />
                    : <Eye size={16} color={kitColors.onAccent} />}
                <Text style={{ color: kitColors.onAccent, fontSize: 14, fontWeight: '700' }}>
                  {transitioning === 'starting' ? 'Starting...'
                    : transitioning === 'stopping' ? 'Stopping...'
                    : isRunning ? 'Stop Vision'
                    : 'Start Vision'}
                </Text>
              </TouchableOpacity>
            </Animated.View>
          </View>
        )}

        {isRunning && (
          <View>
            <VisionResults
              result={visionResult ?? null}
              only={initialBlob?.id ?? initialColor?.id ?? initialPolygon?.id ?? initialAruco?.id ?? initialLine?.id ?? initialBarcode?.id}
              // Feed the thresholds being edited so the coverage bar tracks them live.
              colorInspections={initialColor ? [{ ...initialColor, minCoverage, maxCoverage }] : undefined}
            />
          </View>
        )}
    </View>
  );

  return (
    <View style={ves.configRoot}>
        <PageHeader
          title={configTitle}
          subtitle={name || undefined}
          // Full-screen modal, not a route — ancestor crumb is a plain label
          // (no href, so it's non-tappable) purely to surface the "‹ Vision
          // Editor" back affordance on narrow; onBack always runs handleClose
          // (commit + close) regardless of which affordance is tapped.
          crumbs={[{ label: "Vision Editor" }, { label: configTitle }]}
          onBack={handleClose}
          right={
            <TouchableOpacity onPress={handleClose} style={ves.configDoneBtn}>
              <Check size={15} color={kitColors.onAccent} />
              <Text style={ves.configDoneBtnText}>Done</Text>
            </TouchableOpacity>
          }
        />

        <View style={isWide ? ws.wideRow : ws.stack}>
        {/* Narrow: feed stacks on top. Wide: it moves to a fixed pane on the right (below). */}
        {!isWide && feedSection}

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={[{ padding: spacing.lg, gap: spacing.sm }, isWide && ws.rightPaneContent]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Name + Enabled grouped under one header */}
          <View style={ves.groupCard}>
            <Text style={ves.groupTitle}>DETAILS</Text>
            <View style={ves.groupRow}>
              <Text style={ves.configFieldLabel}>Name</Text>
              <TextInput
                style={ves.configNameInput}
                value={name}
                onChangeText={setName}
                placeholder="Inspection name"
                placeholderTextColor={kitColors.textFaint}
              />
            </View>
            <View style={[ves.groupRow, ves.groupRowBorder]}>
              <Text style={[ves.configFieldLabel, { flex: 1 }]}>Enabled</Text>
              <Switch value={enabled} onValueChange={setEnabled} trackColor={{ true: accent }} />
            </View>
          </View>

          {/* Zone */}
          <TouchableOpacity
            style={ves.configCard}
            onPress={() => setZonePickerOpen(true)}
            activeOpacity={0.75}
          >
            <Text style={ves.configFieldLabel}>Zone</Text>
            <Text style={{ flex: 1, fontSize: 14, color: kitColors.text }}>
              {linkedZone?.name ?? 'Full image'}
            </Text>
            <ChevronDown size={15} color={kitColors.textFaint} />
          </TouchableOpacity>

          {/* Blob params */}
          {kind === 'blob' && (
            <BlobParamsPanel params={blobParams} onUpdate={setBlobParams} />
          )}

          {/* Polygon params */}
          {kind === 'polygon' && (
            <View style={ves.blobPanel}>
              <Text style={ves.blobPanelTitle}>Polygon Detection</Text>
              <ParamRow label="Sides" value={polySides} min={3} max={20}
                onChange={v => { const n = Math.round(v); setPolySides(n); notifyLiveUpdate({ sides: n }); }}
                desc="Number of corners the shape must have — 3=triangle, 4=rectangle, 5=pentagon, 6=hexagon" />
              <ParamRow label="Min Area (px²)" value={polyMinArea} min={1} max={9999999}
                onChange={v => { setPolyMinArea(v); notifyLiveUpdate({ minArea: v }); }}
                desc="Ignore contours smaller than this — raise to filter out noise and small specks" />
              <ParamRow label="Max Area (px²)" value={polyMaxArea} min={1} max={9999999}
                onChange={v => { setPolyMaxArea(v); notifyLiveUpdate({ maxArea: v }); }}
                desc="Ignore contours larger than this — lower to exclude large background regions" />
              <SliderParamRow label="Epsilon" value={polyEpsilon} min={0.001} max={0.5}
                onChange={v => { setPolyEpsilon(v); notifyLiveUpdate({ epsilon: v }); }}
                desc="Approximation tolerance as a fraction of the perimeter — lower values require a more precise match (start at 0.04, loosen if shapes aren't detected)" />
              <ThresholdRangeRow
                minVal={polyMinThresh} maxVal={polyMaxThresh} inverted={polyInverted}
                onMinChange={v => { setPolyMinThresh(v); notifyLiveUpdate({ minThreshold: v }); }}
                onMaxChange={v => { setPolyMaxThresh(v); notifyLiveUpdate({ maxThreshold: v }); }}
                onInvertChange={v => { setPolyInverted(v); notifyLiveUpdate({ invertThreshold: v }); }}
              />
            </View>
          )}

          {/* ArUco params */}
          {kind === 'aruco' && (
            <View style={ves.blobPanel}>
              <Text style={ves.blobPanelTitle}>ArUco Detection</Text>

              <TouchableOpacity
                style={[ves.configCard, { marginBottom: spacing.sm }]}
                onPress={() => setDictPickerOpen(true)}
                activeOpacity={0.75}
              >
                <Text style={ves.paramLabel}>Dictionary</Text>
                <Text style={{ flex: 1, fontSize: 13, color: kitColors.text }}>
                  {ARUCO_DICTIONARIES.find(d => d.id === arucoDictId)?.label ?? String(arucoDictId)}
                </Text>
                <ChevronDown size={14} color={kitColors.textFaint} />
              </TouchableOpacity>
              <Text style={ves.paramDesc}>
                Must match the dictionary used to generate the printed markers.
                4×4 (100) is the most common choice for small deployments.
              </Text>

              <ParamRow label="Min Area (px²)" value={arucoMinArea} min={1} max={9999999}
                onChange={setArucoMinArea}
                desc="Reject markers whose bounding box area is below this — filters out noise and tiny false detections" />
              <ParamRow label="Max Area (px²)" value={arucoMaxArea} min={1} max={9999999}
                onChange={setArucoMaxArea}
                desc="Reject markers larger than this — useful when the camera sees both large background patterns and small markers" />
            </View>
          )}

          {/* Line params */}
          {kind === 'line' && (
            <View style={ves.blobPanel}>
              <Text style={ves.blobPanelTitle}>Line Detection</Text>
              <SliderParamRow label="Canny Min" value={lineCannyT1} min={0} max={255}
                onChange={v => setLineCannyT1(Math.round(v))}
                desc="Lower Canny threshold — higher values detect fewer, stronger edges" />
              <SliderParamRow label="Canny Max" value={lineCannyT2} min={0} max={255}
                onChange={v => setLineCannyT2(Math.round(v))}
                desc="Upper Canny threshold — should be 2–3× the lower value for best results" />
              <SliderParamRow label="Hough Threshold" value={lineHoughThresh} min={1} max={255}
                onChange={v => setLineHoughThresh(Math.round(v))}
                desc="Minimum edge votes required to detect a line — higher = fewer but more certain lines" />
              <ParamRow label="Min Length (px)" value={lineMinLineLen} min={1} max={9999}
                onChange={v => setLineMinLineLen(v)}
                desc="Minimum pixel length of a line segment — raise to ignore short edges and noise" />
              <ParamRow label="Max Gap (px)" value={lineMaxLineGap} min={0} max={9999}
                onChange={v => setLineMaxLineGap(v)}
                desc="Maximum gap between collinear segments to bridge into one line" />
              <ToggleRow label="Filter by Angle" value={lineFilterByAngle}
                onChange={v => setLineFilterByAngle(v)}
                desc="When on, only keep lines whose angle falls within the range below (0°=horizontal, 90°=vertical)" />
              {lineFilterByAngle && (
                <>
                  <SliderParamRow label="Min Angle (°)" value={lineMinAngle} min={0} max={180}
                    onChange={v => setLineMinAngle(Math.round(v))}
                    desc="Minimum angle in degrees" />
                  <SliderParamRow label="Max Angle (°)" value={lineMaxAngle} min={0} max={180}
                    onChange={v => setLineMaxAngle(Math.round(v))}
                    desc="Maximum angle in degrees" />
                </>
              )}
            </View>
          )}

          {/* Barcode / QR params */}
          {kind === 'barcode' && (
            <View style={ves.blobPanel}>
              <Text style={ves.blobPanelTitle}>Barcode / QR Detection</Text>
              <TouchableOpacity
                style={[ves.configCard, { marginBottom: spacing.xs }]}
                onPress={() => setFormatPickerOpen(true)}
                activeOpacity={0.75}
              >
                <Text style={ves.paramLabel}>Formats</Text>
                <Text style={{ flex: 1, fontSize: 13, color: kitColors.text }}>
                  {barcodeFormats.length === 0
                    ? 'All formats'
                    : barcodeFormats.map(f => BARCODE_FORMATS.find(b => b.id === f)?.label ?? f).join(', ')}
                </Text>
                <ChevronDown size={14} color={kitColors.textFaint} />
              </TouchableOpacity>
              <Text style={ves.paramDesc}>
                Select specific formats to speed up detection, or leave as "All formats" to scan everything.
              </Text>
              <FormatPickerSheet
                visible={formatPickerOpen}
                selected={barcodeFormats}
                onToggle={id => setBarcodeFormats(prev =>
                  prev.includes(id) ? prev.filter(f => f !== id) : [...prev, id]
                )}
                onClose={() => setFormatPickerOpen(false)}
              />
            </View>
          )}

          {/* Color coverage */}
          {kind === 'color' && (
            <>
              <View style={ves.groupCard}>
                <Text style={ves.groupTitle}>COLORS TO MATCH</Text>

                {colors.length === 0 && (
                  <View style={ves.emptyCard}>
                    <Text style={ves.emptyText}>No colors yet — add at least one</Text>
                  </View>
                )}

                {colors.map(ce => (
                  <TouchableOpacity
                    key={ce.id}
                    style={ves.colorEntryRow}
                    onPress={() => setColorEditState({ entry: ce })}
                    activeOpacity={0.75}
                  >
                    <View style={{
                      width: 28, height: 28, borderRadius: 6,
                      backgroundColor: `rgb(${ce.r},${ce.g},${ce.b})`,
                      borderWidth: 1, borderColor: kitColors.borderStrong,
                    }} />
                    <Text style={{ flex: 1, fontSize: 12, color: kitColors.textSecondary }}>
                      rgb({ce.r}, {ce.g}, {ce.b})
                    </Text>
                    <View style={{
                      backgroundColor: '#f0f9ff', borderRadius: 5,
                      paddingHorizontal: 6, paddingVertical: 2,
                      borderWidth: 1, borderColor: '#bae6fd',
                    }}>
                      <Text style={{ fontSize: 10, fontWeight: '700', color: accents.cyan }}>
                        ±{ce.tolerance}
                      </Text>
                    </View>
                    <DeleteIconButton
                      size={13}
                      onPress={() => setColors(prev => prev.filter(c => c.id !== ce.id))}
                      style={ves.iconBtn}
                    />
                  </TouchableOpacity>
                ))}

                <TouchableOpacity
                  style={ves.addBtn}
                  onPress={() => setColorEditState({ entry: defaultColorEntry() })}
                  activeOpacity={0.75}
                >
                  <Plus size={13} color="#d946ef" />
                  <Text style={[ves.addBtnText, { color: '#d946ef' }]}>Add Color</Text>
                </TouchableOpacity>
              </View>

              <Text style={[ves.sectionLabel, { marginTop: 4 }]}>PASS / FAIL THRESHOLDS</Text>

              <View style={[ves.configCard, { flexDirection: 'column', alignItems: 'stretch', gap: 0, paddingVertical: spacing.sm }]}>
                {/* Min row */}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                  <Switch
                    value={minCoverage !== null}
                    onValueChange={v => { setMinCoverage(v ? 50 : null); if (v) setMinCoverageText('50'); }}
                    trackColor={{ true: kitColors.success }}
                    style={{ transform: [{ scaleX: 0.75 }, { scaleY: 0.75 }] }}
                  />
                  <Text style={{ fontSize: 13, color: kitColors.textSecondary, flex: 1 }}>Min coverage</Text>
                  {minCoverage !== null && (
                    <>
                      <TextInput
                        style={[ves.paramInput, { width: 60 }]}
                        keyboardType="numeric"
                        value={minCoverageText}
                        onChangeText={t => {
                          setMinCoverageText(t);
                          const n = parseFloat(t);
                          // Clamp to the max, so the min can never be set above it.
                          if (!isNaN(n)) setMinCoverage(Math.min(maxCoverage ?? 100, Math.max(0, n)));
                        }}
                        onBlur={() => {
                          if (minCoverageText.trim() === '' || isNaN(parseFloat(minCoverageText)))
                            setMinCoverageText(String(minCoverage));
                        }}
                      />
                      <Text style={{ fontSize: 11, color: kitColors.textFaint }}>%</Text>
                    </>
                  )}
                </View>

                {/* Max row */}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.sm }}>
                  <Switch
                    value={maxCoverage !== null}
                    onValueChange={v => { setMaxCoverage(v ? 90 : null); if (v) setMaxCoverageText('90'); }}
                    trackColor={{ true: kitColors.danger }}
                    style={{ transform: [{ scaleX: 0.75 }, { scaleY: 0.75 }] }}
                  />
                  <Text style={{ fontSize: 13, color: kitColors.textSecondary, flex: 1 }}>Max coverage</Text>
                  {maxCoverage !== null && (
                    <>
                      <TextInput
                        style={[ves.paramInput, { width: 60 }]}
                        keyboardType="numeric"
                        value={maxCoverageText}
                        onChangeText={t => {
                          setMaxCoverageText(t);
                          const n = parseFloat(t);
                          // Clamp to the min, so the max can never be set below it.
                          if (!isNaN(n)) setMaxCoverage(Math.max(minCoverage ?? 0, Math.min(100, n)));
                        }}
                        onBlur={() => {
                          if (maxCoverageText.trim() === '' || isNaN(parseFloat(maxCoverageText)))
                            setMaxCoverageText(String(maxCoverage));
                        }}
                      />
                      <Text style={{ fontSize: 11, color: kitColors.textFaint }}>%</Text>
                    </>
                  )}
                </View>

                {/* One merged range slider — green min thumb, red max thumb, the pass band
                    (coverage between them) filled between. */}
                {(minCoverage !== null || maxCoverage !== null) && (
                  <View
                    style={{ marginTop: 14, height: 28, position: 'relative' }}
                    onLayout={e => { covBarWRef.current = e.nativeEvent.layout.width; }}
                  >
                    <View style={{
                      position: 'absolute', left: 0, right: 0,
                      top: (28 - 5) / 2, height: 5, borderRadius: 3,
                      backgroundColor: kitColors.border, overflow: 'hidden',
                    }}>
                      <View style={{
                        position: 'absolute', top: 0, bottom: 0,
                        left: `${minCoverage ?? 0}%`,
                        right: `${maxCoverage !== null ? 100 - maxCoverage : 0}%`,
                        backgroundColor: '#86efac',
                      }} />
                    </View>
                    {minCoverage !== null && (
                      <View
                        {...minThumbPan.panHandlers}
                        hitSlop={{ top: 8, bottom: 8, left: 10, right: 10 }}
                        style={{
                          position: 'absolute', left: `${minCoverage}%`, top: 0,
                          width: 28, height: 28, marginLeft: -14,
                          justifyContent: 'center', alignItems: 'center',
                        }}
                      >
                        <View style={{
                          width: 18, height: 18, borderRadius: radii.sm,
                          backgroundColor: kitColors.surface, borderWidth: 2, borderColor: kitColors.success,
                          ...shadows.soft,
                        }} />
                      </View>
                    )}
                    {maxCoverage !== null && (
                      <View
                        {...maxThumbPan.panHandlers}
                        hitSlop={{ top: 8, bottom: 8, left: 10, right: 10 }}
                        style={{
                          position: 'absolute', left: `${maxCoverage}%`, top: 0,
                          width: 28, height: 28, marginLeft: -14,
                          justifyContent: 'center', alignItems: 'center',
                        }}
                      >
                        <View style={{
                          width: 18, height: 18, borderRadius: radii.sm,
                          backgroundColor: kitColors.surface, borderWidth: 2, borderColor: kitColors.danger,
                          ...shadows.soft,
                        }} />
                      </View>
                    )}
                  </View>
                )}
              </View>
            </>
          )}

          <View style={{ height: 40 }} />
        </ScrollView>

        {isWide && (
          /* Wide layout: feed + run + results in a fixed pane on the right */
          <ScrollView
            style={[ws.feedPane, isSplit && wide.paneSplit]}
            contentContainerStyle={ws.leftPaneContent}
            showsVerticalScrollIndicator={false}
          >
            {feedSection}
          </ScrollView>
        )}
        </View>

      <ZonePickerModal
        visible={zonePickerOpen}
        zones={zones}
        selected={zoneId}
        onSelect={id => { setZoneId(id); notifyLiveUpdate({ zoneId: id }); }}
        onClose={() => setZonePickerOpen(false)}
      />

      <DictionaryPickerModal
        visible={dictPickerOpen}
        selected={arucoDictId}
        onSelect={setArucoDictId}
        onClose={() => setDictPickerOpen(false)}
      />

      <ColorEditModal
        visible={colorEditState !== null}
        entry={colorEditState?.entry ?? null}
        onSave={entry => {
          setColors(prev => {
            const idx = prev.findIndex(c => c.id === entry.id);
            return idx >= 0
              ? prev.map(c => c.id === entry.id ? entry : c)
              : [...prev, entry];
          });
        }}
        onClose={() => setColorEditState(null)}
        snapshotUri={snapshotUri}
        onFetchSnapshot={onFetchSnapshot}
      />
    </View>
  );
}

// ── Wide (desktop) two-pane layout ────────────────────────────────────────────

const ws = StyleSheet.create({
  stack: { flex: 1 },
  // Padding around the frame + its controls. Matches the vision editor's feed pane
  // (paddingHorizontal 20 / paddingTop 18) so the frame sits identically in both editors.
  feedPad: { paddingHorizontal: 20, paddingTop: 18, gap: 10 },
  wideRow: {
    flex: 1, flexDirection: "row",
    width: "100%",
  },
  // Feed pane (on the right) grows with the (uncapped) row width, bounded for very
  // wide/narrow desktops. "split" mode overrides this to an even 50/50 via wide.paneSplit.
  feedPane: {
    width: "46%", minWidth: 420, maxWidth: 820, flexGrow: 0, flexShrink: 0,
    borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: kitColors.border,
  },
  leftPaneContent: { paddingBottom: spacing.xl },
  rightPaneContent: { width: "100%", maxWidth: 720, alignSelf: "center" },
});
