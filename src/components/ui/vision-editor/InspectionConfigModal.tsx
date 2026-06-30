import React, { useEffect, useRef, useState } from "react";
import {
  Modal,
  PanResponder,
  SafeAreaView,
  ScrollView,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Check, ChevronDown, Plus, Trash2 } from "lucide-react-native";
import { BlobParamsPanel, ParamRow, SliderParamRow, ThresholdRangeRow, ToggleRow } from "@/src/components/vision/VisionParams";
import {
  ARUCO_DICTIONARIES,
  ArucoInspection,
  BarcodeInspection,
  BlobDetectionParams,
  BlobInspection,
  ColorCoverageInspection,
  ColorEntry,
  LineInspection,
  PolygonInspection,
  VisionZone,
  defaultBlobParams,
  defaultColorEntry,
} from "@/src/models/robotModels";
import { FEED_HTML } from "@/src/vision/visionHtml";
import { WebView } from "react-native-webview";
import { ves } from "./visionEditorStyles";
import { ZonePickerModal } from "./ZonePickerModal";
import { DictionaryPickerModal } from "./DictionaryPickerModal";
import { ColorEditModal } from "./ColorEditModal";
import { FormatPickerSheet } from "./InspectionTypePicker";

export function InspectionConfigModal({
  visible, kind, initialBlob, initialColor, initialPolygon, initialAruco, initialLine, initialBarcode, zones,
  snapshotUri, onFetchSnapshot, onSaveBlob, onSaveColor, onSavePolygon, onSaveAruco, onSaveLine, onSaveBarcode, onClose,
  debugUrl, onLiveUpdate, onLiveUpdateBlob, onLiveUpdateColor, onLiveUpdateAruco, onLiveUpdateLine,
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
  debugUrl?: string | null;
  onLiveUpdate?: (insp: PolygonInspection) => void;
  onLiveUpdateBlob?: (insp: BlobInspection) => void;
  onLiveUpdateColor?: (insp: ColorCoverageInspection) => void;
  onLiveUpdateAruco?: (insp: ArucoInspection) => void;
  onLiveUpdateLine?: (insp: LineInspection) => void;
}) {
  const [name, setName]               = useState('');
  const [enabled, setEnabled]         = useState(true);
  const [zoneId, setZoneId]           = useState<string | null>(null);
  const [blobParams, setBlobParams]   = useState<BlobDetectionParams>(defaultBlobParams());
  const [colors, setColors]           = useState<ColorEntry[]>([]);
  const [minCoverage, setMinCoverage] = useState<number | null>(null);
  const [maxCoverage, setMaxCoverage] = useState<number | null>(null);
  const [minCoverageText, setMinCoverageText] = useState('50');
  const [maxCoverageText, setMaxCoverageText] = useState('90');

  const minCovBarWRef  = useRef(1);
  const minCovValRef   = useRef(50);
  const minCovStartRef = useRef(50);
  minCovValRef.current = minCoverage ?? 50;

  const maxCovBarWRef  = useRef(1);
  const maxCovValRef   = useRef(90);
  const maxCovStartRef = useRef(90);
  maxCovValRef.current = maxCoverage ?? 90;

  const minCovPan = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onPanResponderGrant: () => { minCovStartRef.current = minCovValRef.current; },
    onPanResponderMove: (_, g) => {
      if (Math.abs(g.dy) > Math.abs(g.dx) + 5) return;
      const v = Math.round(Math.max(0, Math.min(100,
        minCovStartRef.current + (g.dx / Math.max(1, minCovBarWRef.current)) * 100)) * 10) / 10;
      setMinCoverage(v); setMinCoverageText(String(v));
    },
    onPanResponderRelease: () => {},
  })).current;

  const maxCovPan = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onPanResponderGrant: () => { maxCovStartRef.current = maxCovValRef.current; },
    onPanResponderMove: (_, g) => {
      if (Math.abs(g.dy) > Math.abs(g.dx) + 5) return;
      const v = Math.round(Math.max(0, Math.min(100,
        maxCovStartRef.current + (g.dx / Math.max(1, maxCovBarWRef.current)) * 100)) * 10) / 10;
      setMaxCoverage(v); setMaxCoverageText(String(v));
    },
    onPanResponderRelease: () => {},
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
  const [debugPaused, setDebugPaused]         = useState(false);
  const debugWebviewRef = useRef<any>(null);

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

  // Start / stop the debug feed when visibility, URL, or paused state changes
  useEffect(() => {
    if (!debugWebviewRef.current || !debugUrl) return;
    if (visible && !debugPaused) {
      debugWebviewRef.current.injectJavaScript(`window.setFeed(${JSON.stringify(debugUrl)});true;`);
    } else {
      debugWebviewRef.current.injectJavaScript(`window.pauseFeed();true;`);
    }
  }, [visible, debugUrl, debugPaused]);

  useEffect(() => {
    if (!visible) return;
    setDebugPaused(false);
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

  const linkedZone = zones.find(z => z.id === zoneId);
  const accent     = kind === 'blob' ? '#0891b2' : kind === 'polygon' ? '#d97706' : kind === 'aruco' ? '#16a34a' : kind === 'line' ? '#7c3aed' : kind === 'barcode' ? '#2563eb' : '#d946ef';

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={handleClose}>
      <SafeAreaView style={ves.configRoot}>
        <View style={ves.configHeader}>
          <Text style={ves.configTitle}>
            {kind === 'blob' ? 'Blob Detection' : kind === 'polygon' ? 'Polygon Detection' : kind === 'aruco' ? 'ArUco Marker' : kind === 'line' ? 'Line Detection' : kind === 'barcode' ? 'Barcode / QR Code' : 'Color Coverage'}
          </Text>
          <TouchableOpacity onPress={handleClose} style={ves.configDoneBtn}>
            <Check size={15} color="#fff" />
            <Text style={ves.configDoneBtnText}>Done</Text>
          </TouchableOpacity>
        </View>

        {/* Live debug feed */}
        {debugUrl && (
          <View style={{ height: 210, backgroundColor: '#0d1117' }}>
            <WebView
              ref={debugWebviewRef}
              source={{ html: FEED_HTML }}
              style={{ flex: 1, backgroundColor: '#0d1117' }}
              scrollEnabled={false}
              originWhitelist={['*']}
              javaScriptEnabled
              onLoad={() => {
                if (!debugPaused && debugUrl)
                  debugWebviewRef.current?.injectJavaScript(`window.setFeed(${JSON.stringify(debugUrl)});true;`);
              }}
            />
            {/* LIVE badge */}
            {!debugPaused && (
              <View style={{ position: 'absolute', top: 8, left: 8, flexDirection: 'row',
                alignItems: 'center', gap: 4, backgroundColor: 'rgba(220,38,38,0.85)',
                borderRadius: 6, paddingHorizontal: 6, paddingVertical: 3 }}>
                <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#fff' }} />
                <Text style={{ color: '#fff', fontSize: 10, fontWeight: '700' }}>LIVE</Text>
              </View>
            )}
            {/* Pause / Resume */}
            <TouchableOpacity
              onPress={() => {
                const next = !debugPaused;
                setDebugPaused(next);
                debugWebviewRef.current?.injectJavaScript(
                  next ? `window.pauseFeed();true;` : `window.resumeFeed();true;`
                );
              }}
              style={{ position: 'absolute', top: 8, right: 8,
                backgroundColor: 'rgba(0,0,0,0.65)', borderRadius: 8,
                paddingHorizontal: 10, paddingVertical: 5 }}
              activeOpacity={0.75}
            >
              <Text style={{ color: '#fff', fontSize: 12, fontWeight: '600' }}>
                {debugPaused ? '▶ Resume' : '⏸ Pause'}
              </Text>
            </TouchableOpacity>
            {/* Legend strip — kind-specific */}
            <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0,
              flexDirection: 'row', justifyContent: 'center', gap: 14,
              backgroundColor: 'rgba(0,0,0,0.6)', paddingVertical: 5 }}>
              {(kind === 'polygon'
                  ? [['#4b5563','Area fail'],['#f97316','Wrong sides'],['#22c55e','Matched']]
                  : kind === 'blob'
                    ? [['#22c55e','Detected blob']]
                    : kind === 'color'
                      ? [['#3cc800','Color match'],['#d946ef','Zone border']]
                      : kind === 'line'
                        ? [['#22c55e','Matched'],['#f97316','Angle filtered']]
                        : kind === 'barcode'
                          ? [['#1e90ff','Detected code']]
                          : [['#00ff7f','Detected marker']]
              ).map(([color, label]) => (
                <View key={label} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <View style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: color }} />
                  <Text style={{ color: '#d1d5db', fontSize: 10 }}>{label}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: 14, gap: 10 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Name */}
          <View style={ves.configCard}>
            <Text style={ves.configFieldLabel}>Name</Text>
            <TextInput
              style={ves.configNameInput}
              value={name}
              onChangeText={setName}
              placeholder="Inspection name"
              placeholderTextColor="#9ca3af"
            />
          </View>

          {/* Enabled */}
          <View style={ves.configCard}>
            <Text style={[ves.configFieldLabel, { flex: 1 }]}>Enabled</Text>
            <Switch value={enabled} onValueChange={setEnabled} trackColor={{ true: accent }} />
          </View>

          {/* Zone */}
          <TouchableOpacity
            style={ves.configCard}
            onPress={() => setZonePickerOpen(true)}
            activeOpacity={0.75}
          >
            <Text style={ves.configFieldLabel}>Zone</Text>
            <Text style={{ flex: 1, fontSize: 14, color: '#111827' }}>
              {linkedZone?.name ?? 'Full image'}
            </Text>
            <ChevronDown size={15} color="#9ca3af" />
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
                style={[ves.configCard, { marginBottom: 8 }]}
                onPress={() => setDictPickerOpen(true)}
                activeOpacity={0.75}
              >
                <Text style={ves.paramLabel}>Dictionary</Text>
                <Text style={{ flex: 1, fontSize: 13, color: '#111827' }}>
                  {ARUCO_DICTIONARIES.find(d => d.id === arucoDictId)?.label ?? String(arucoDictId)}
                </Text>
                <ChevronDown size={14} color="#9ca3af" />
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
                style={[ves.configCard, { marginBottom: 4 }]}
                onPress={() => setFormatPickerOpen(true)}
                activeOpacity={0.75}
              >
                <Text style={ves.paramLabel}>Formats</Text>
                <Text style={{ flex: 1, fontSize: 13, color: '#111827' }}>
                  {barcodeFormats.length === 0
                    ? 'All formats'
                    : barcodeFormats.map(f => BARCODE_FORMATS.find(b => b.id === f)?.label ?? f).join(', ')}
                </Text>
                <ChevronDown size={14} color="#9ca3af" />
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
              <Text style={[ves.sectionLabel, { marginTop: 4 }]}>COLORS TO MATCH</Text>

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
                    borderWidth: 1, borderColor: '#d1d5db',
                  }} />
                  <Text style={{ flex: 1, fontSize: 12, color: '#374151' }}>
                    rgb({ce.r}, {ce.g}, {ce.b})
                  </Text>
                  <View style={{
                    backgroundColor: '#f0f9ff', borderRadius: 5,
                    paddingHorizontal: 6, paddingVertical: 2,
                    borderWidth: 1, borderColor: '#bae6fd',
                  }}>
                    <Text style={{ fontSize: 10, fontWeight: '700', color: '#0891b2' }}>
                      ±{ce.tolerance}
                    </Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => setColors(prev => prev.filter(c => c.id !== ce.id))}
                    hitSlop={8} style={ves.iconBtn}
                  >
                    <Trash2 size={13} color="#ef4444" />
                  </TouchableOpacity>
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

              <Text style={[ves.sectionLabel, { marginTop: 4 }]}>PASS / FAIL THRESHOLDS</Text>

              <View style={[ves.configCard, { flexDirection: 'column', alignItems: 'stretch', gap: 0, paddingVertical: 10 }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <Switch
                    value={minCoverage !== null}
                    onValueChange={v => { setMinCoverage(v ? 50 : null); if (v) setMinCoverageText('50'); }}
                    trackColor={{ true: '#16a34a' }}
                    style={{ transform: [{ scaleX: 0.75 }, { scaleY: 0.75 }] }}
                  />
                  <Text style={{ fontSize: 13, color: '#374151', flex: 1 }}>Min coverage</Text>
                  {minCoverage !== null && (
                    <>
                      <TextInput
                        style={[ves.paramInput, { width: 60 }]}
                        keyboardType="numeric"
                        value={minCoverageText}
                        onChangeText={t => {
                          setMinCoverageText(t);
                          const n = parseFloat(t);
                          if (!isNaN(n)) setMinCoverage(Math.min(100, Math.max(0, n)));
                        }}
                        onBlur={() => {
                          if (minCoverageText.trim() === '' || isNaN(parseFloat(minCoverageText)))
                            setMinCoverageText(String(minCoverage));
                        }}
                      />
                      <Text style={{ fontSize: 11, color: '#9ca3af' }}>%</Text>
                    </>
                  )}
                </View>
                {minCoverage !== null && (
                  <View
                    style={{ marginTop: 10, height: 22, position: 'relative' }}
                    onLayout={e => { minCovBarWRef.current = e.nativeEvent.layout.width; }}
                    {...minCovPan.panHandlers}
                  >
                    <View style={{
                      position: 'absolute', left: 0, right: 0,
                      top: (22 - 5) / 2, height: 5, borderRadius: 3,
                      backgroundColor: '#e5e7eb', overflow: 'hidden',
                    }}>
                      <View style={{ width: `${minCoverage}%`, height: '100%', borderRadius: 3, backgroundColor: '#16a34a' }} />
                    </View>
                    <View style={{
                      position: 'absolute', left: `${minCoverage}%`, top: 0,
                      width: 22, height: 22, marginLeft: -11,
                      justifyContent: 'center', alignItems: 'center',
                    }}>
                      <View style={{
                        width: 18, height: 18, borderRadius: 9,
                        backgroundColor: '#fff', borderWidth: 2, borderColor: '#16a34a',
                        shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 2, elevation: 2,
                      }} />
                    </View>
                  </View>
                )}
              </View>

              <View style={[ves.configCard, { flexDirection: 'column', alignItems: 'stretch', gap: 0, paddingVertical: 10 }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <Switch
                    value={maxCoverage !== null}
                    onValueChange={v => { setMaxCoverage(v ? 90 : null); if (v) setMaxCoverageText('90'); }}
                    trackColor={{ true: '#dc2626' }}
                    style={{ transform: [{ scaleX: 0.75 }, { scaleY: 0.75 }] }}
                  />
                  <Text style={{ fontSize: 13, color: '#374151', flex: 1 }}>Max coverage</Text>
                  {maxCoverage !== null && (
                    <>
                      <TextInput
                        style={[ves.paramInput, { width: 60 }]}
                        keyboardType="numeric"
                        value={maxCoverageText}
                        onChangeText={t => {
                          setMaxCoverageText(t);
                          const n = parseFloat(t);
                          if (!isNaN(n)) setMaxCoverage(Math.min(100, Math.max(0, n)));
                        }}
                        onBlur={() => {
                          if (maxCoverageText.trim() === '' || isNaN(parseFloat(maxCoverageText)))
                            setMaxCoverageText(String(maxCoverage));
                        }}
                      />
                      <Text style={{ fontSize: 11, color: '#9ca3af' }}>%</Text>
                    </>
                  )}
                </View>
                {maxCoverage !== null && (
                  <View
                    style={{ marginTop: 10, height: 22, position: 'relative' }}
                    onLayout={e => { maxCovBarWRef.current = e.nativeEvent.layout.width; }}
                    {...maxCovPan.panHandlers}
                  >
                    <View style={{
                      position: 'absolute', left: 0, right: 0,
                      top: (22 - 5) / 2, height: 5, borderRadius: 3,
                      backgroundColor: '#e5e7eb', overflow: 'hidden',
                    }}>
                      <View style={{ width: `${maxCoverage}%`, height: '100%', borderRadius: 3, backgroundColor: '#dc2626' }} />
                    </View>
                    <View style={{
                      position: 'absolute', left: `${maxCoverage}%`, top: 0,
                      width: 22, height: 22, marginLeft: -11,
                      justifyContent: 'center', alignItems: 'center',
                    }}>
                      <View style={{
                        width: 18, height: 18, borderRadius: 9,
                        backgroundColor: '#fff', borderWidth: 2, borderColor: '#dc2626',
                        shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 2, elevation: 2,
                      }} />
                    </View>
                  </View>
                )}
              </View>
            </>
          )}

          <View style={{ height: 40 }} />
        </ScrollView>
      </SafeAreaView>

      <ZonePickerModal
        visible={zonePickerOpen}
        zones={zones}
        selected={zoneId}
        onSelect={id => setZoneId(id)}
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
    </Modal>
  );
}
