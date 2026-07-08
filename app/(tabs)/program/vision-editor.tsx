import { SubPageHeader } from "@/src/components/ui/SubPageHeader";
import { BottomSheet } from "@/src/components/ui/BottomSheet";
import { makeZoneDrawHtml, FEED_HTML, makeColorPickHtml } from "@/src/vision/visionHtml";
import { BlobParamsPanel, ParamRow, SliderParamRow, ThresholdRangeRow, ToggleRow } from "@/src/components/vision/VisionParams";
import {
  ARUCO_DICTIONARIES,
  BARCODE_FORMATS,
  ArucoInspection,
  BarcodeInspection,
  BlobDetectionParams,
  BlobInspection,
  CameraState,
  ColorCoverageInspection,
  ColorEntry,
  LineInspection,
  PolygonInspection,
  VisionProgram,
  VisionZone,
  VisionZoneGeometry,
  VisionZoneShape,
  defaultArucoInspection,
  defaultBarcodeInspection,
  defaultBlobParams,
  defaultColorEntry,
  defaultColorCoverageInspection,
  defaultLineInspection,
  defaultPolygonInspection,
} from "@/src/models/robotModels";
import { robotClient } from "@/src/services/RobotConnectService";
import { useLocalSearchParams, useNavigation } from "expo-router";
import {
  Barcode,
  Check,
  ChevronDown,
  Copy,
  Eye,
  EyeOff,
  Hexagon,
  Minus,
  Palette,
  Pencil,
  Plus,
  QrCode,
  ScanSearch,
  Trash2,
} from "lucide-react-native";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  Modal,
  PanResponder,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { WebView } from "react-native-webview";

// ── Camera picker modal ────────────────────────────────────────────────────────

function CameraPickerModal({ visible, cameras, selected, onSelect, onClose }: {
  visible: boolean; cameras: CameraState[]; selected: string;
  onSelect: (id: string) => void; onClose: () => void;
}) {
  return (
    <BottomSheet visible={visible} onClose={onClose} title="Select Camera">
      {cameras.length === 0 ? (
        <Text style={styles.sheetEmpty}>No cameras configured</Text>
      ) : cameras.map(cam => (
        <TouchableOpacity
          key={cam.id}
          style={[styles.sheetRow, cam.id === selected && styles.sheetRowActive]}
          onPress={() => { onSelect(cam.id); onClose(); }}
        >
          <View style={[styles.dot, { backgroundColor: cam.connected ? "#22c55e" : "#d1d5db" }]} />
          <View style={{ flex: 1 }}>
            <Text style={styles.sheetRowName}>{cam.name || cam.id}</Text>
            <Text style={styles.sheetRowSub}>{cam.id} · {cam.width}×{cam.height}</Text>
          </View>
          {cam.id === selected && <Check size={16} color="#0891b2" />}
        </TouchableOpacity>
      ))}
    </BottomSheet>
  );
}

// ── Zone picker modal ──────────────────────────────────────────────────────────

function ZonePickerModal({ visible, zones, selected, onSelect, onClose }: {
  visible: boolean; zones: VisionZone[]; selected: string | null;
  onSelect: (id: string | null) => void; onClose: () => void;
}) {
  return (
    <BottomSheet visible={visible} onClose={onClose} title="Select Zone">
      <TouchableOpacity
        style={[styles.sheetRow, selected === null && styles.sheetRowActive]}
        onPress={() => { onSelect(null); onClose(); }}
      >
        <View style={[styles.dot, { backgroundColor: "#9ca3af" }]} />
        <View style={{ flex: 1 }}>
          <Text style={styles.sheetRowName}>None — full image</Text>
          <Text style={styles.sheetRowSub}>All blobs in frame are reported</Text>
        </View>
        {selected === null && <Check size={16} color="#0891b2" />}
      </TouchableOpacity>
      {zones.map(zone => (
        <TouchableOpacity
          key={zone.id}
          style={[styles.sheetRow, zone.id === selected && styles.sheetRowActive]}
          onPress={() => { onSelect(zone.id); onClose(); }}
        >
          <View style={[styles.dot, { backgroundColor: "#22d3ee" }]} />
          <View style={{ flex: 1 }}>
            <Text style={styles.sheetRowName}>{zone.name}</Text>
            <Text style={styles.sheetRowSub}>{zone.geometry.shape}</Text>
          </View>
          {zone.id === selected && <Check size={16} color="#0891b2" />}
        </TouchableOpacity>
      ))}
    </BottomSheet>
  );
}

// ── Color pick modal ───────────────────────────────────────────────────────────

function ColorPickModal({ visible, snapshotUri, onPick, onClose }: {
  visible: boolean;
  snapshotUri: string | null;
  onPick: (r: number, g: number, b: number) => void;
  onClose: () => void;
}) {
  const html = snapshotUri ? makeColorPickHtml(snapshotUri) : null;
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: '#000' }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
          paddingHorizontal: 16, paddingTop: 52, paddingBottom: 10, backgroundColor: 'rgba(0,0,0,0.7)' }}>
          <Text style={{ color: '#fff', fontSize: 14, fontWeight: '600' }}>Tap to pick a color</Text>
          <TouchableOpacity onPress={onClose}
            style={{ backgroundColor: '#374151', borderRadius: 8, paddingHorizontal: 14, paddingVertical: 6 }}>
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>Cancel</Text>
          </TouchableOpacity>
        </View>
        <View style={{ flex: 1 }}>
          {html ? (
            <WebView source={{ html }} scrollEnabled={false} originWhitelist={['*']} javaScriptEnabled
              onMessage={e => {
                try {
                  const msg = JSON.parse(e.nativeEvent.data);
                  if (msg.type === 'color') { onPick(msg.r, msg.g, msg.b); onClose(); }
                } catch {}
              }}
            />
          ) : (
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 }}>
              <ActivityIndicator size="large" color="#0891b2" />
              <Text style={{ color: '#9ca3af', fontSize: 13 }}>Loading snapshot…</Text>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

// ── Channel row (R / G / B) with draggable slider ─────────────────────────────

function ChannelRow({ label, value, onChange, accent }: {
  label: string; value: number; onChange: (n: number) => void; accent: string;
}) {
  const THUMB_D = 18;
  const ROW_H   = THUMB_D + 4;

  const [text, setText] = useState(String(value));
  useEffect(() => { setText(String(value)); }, [value]);

  const barWRef     = useRef(1);
  const valueRef    = useRef(value);
  const startValRef = useRef(value);
  const onChangeRef = useRef(onChange);
  valueRef.current    = value;
  onChangeRef.current = onChange;

  const pan = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onPanResponderGrant: () => { startValRef.current = valueRef.current; },
    onPanResponderMove: (_, g) => {
      if (Math.abs(g.dy) > Math.abs(g.dx) + 5) return;
      const v = Math.round(Math.max(0, Math.min(255,
        startValRef.current + (g.dx / Math.max(1, barWRef.current)) * 255)));
      onChangeRef.current(v);
    },
    onPanResponderRelease: () => {},
  })).current;

  const frac = value / 255;

  return (
    <View style={{ marginBottom: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <Text style={{ fontSize: 12, fontWeight: '700', color: accent, width: 16 }}>{label}</Text>
        <View
          style={{ flex: 1, height: ROW_H, position: 'relative' }}
          onLayout={e => { barWRef.current = e.nativeEvent.layout.width; }}
          {...pan.panHandlers}
        >
          <View style={{
            position: 'absolute', left: 0, right: 0,
            top: (ROW_H - 5) / 2, height: 5, borderRadius: 3,
            backgroundColor: '#e5e7eb', overflow: 'hidden',
          }}>
            <View style={{ width: `${frac * 100}%`, height: '100%', borderRadius: 3, backgroundColor: accent }} />
          </View>
          <View style={{
            position: 'absolute', left: `${frac * 100}%`, top: 0,
            width: THUMB_D, height: ROW_H, marginLeft: -THUMB_D / 2,
            justifyContent: 'center', alignItems: 'center',
          }}>
            <View style={{
              width: THUMB_D, height: THUMB_D, borderRadius: THUMB_D / 2,
              backgroundColor: '#fff', borderWidth: 2, borderColor: accent,
              shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 2, elevation: 2,
            }} />
          </View>
        </View>
        <TextInput
          style={{ borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 4, fontSize: 13, color: '#111827', width: 52, textAlign: 'right' }}
          keyboardType="numeric"
          value={text}
          onChangeText={t => {
            setText(t);
            const n = parseInt(t, 10);
            if (!isNaN(n)) onChange(Math.round(Math.max(0, Math.min(255, n))));
          }}
          onBlur={() => {
            if (text.trim() === '' || isNaN(parseInt(text, 10))) setText(String(value));
          }}
        />
      </View>
    </View>
  );
}

// ── Color entry editor modal ───────────────────────────────────────────────────

function ColorEditModal({ visible, entry, onSave, onClose, snapshotUri, onFetchSnapshot }: {
  visible: boolean;
  entry: ColorEntry | null;
  onSave: (updated: ColorEntry) => void;
  onClose: () => void;
  snapshotUri: string | null;
  onFetchSnapshot: () => Promise<void>;
}) {
  const [r, setR] = useState(128);
  const [g, setG] = useState(128);
  const [b, setB] = useState(128);
  const [tol, setTol]     = useState(20);
  const [tolText, setTolText] = useState('20');
  const [pickOpen, setPickOpen] = useState(false);

  const tolBarWRef  = useRef(1);
  const tolValRef   = useRef(20);
  const tolStartRef = useRef(20);
  tolValRef.current = tol;

  const tolPan = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onPanResponderGrant: () => { tolStartRef.current = tolValRef.current; },
    onPanResponderMove: (_, g) => {
      if (Math.abs(g.dy) > Math.abs(g.dx) + 5) return;
      const v = Math.round(Math.max(0, Math.min(100,
        tolStartRef.current + (g.dx / Math.max(1, tolBarWRef.current)) * 100)));
      setTol(v); setTolText(String(v));
    },
    onPanResponderRelease: () => {},
  })).current;

  useEffect(() => {
    if (entry && visible) {
      setR(entry.r); setG(entry.g); setB(entry.b);
      setTol(entry.tolerance); setTolText(String(entry.tolerance));
    }
  }, [entry, visible]);

  function openPick() {
    setPickOpen(true);
    onFetchSnapshot();
  }

  const tolFrac = tol / 100;
  const TTHUMB  = 18;
  const TROW_H  = TTHUMB + 4;

  return (
    <>
      <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose}>
          <TouchableOpacity style={[styles.sheet, { paddingBottom: 20 }]} activeOpacity={1} onPress={() => {}}>
            <Text style={styles.sheetTitle}>Color Entry</Text>

            {/* Preview swatch */}
            <View style={{ alignSelf: 'center', marginBottom: 14, gap: 8, alignItems: 'center' }}>
              <View style={{ width: 64, height: 64, borderRadius: 16, backgroundColor: `rgb(${r},${g},${b})`,
                borderWidth: 1, borderColor: '#e5e7eb', shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 6, elevation: 3 }} />
              <TouchableOpacity onPress={openPick} activeOpacity={0.75}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 5,
                  backgroundColor: '#0891b2', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 }}>
                <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>Pick from Camera</Text>
              </TouchableOpacity>
            </View>

            <ChannelRow label="R" value={r} onChange={setR} accent="#dc2626" />
            <ChannelRow label="G" value={g} onChange={setG} accent="#16a34a" />
            <ChannelRow label="B" value={b} onChange={setB} accent="#2563eb" />

            {/* Tolerance — text input + draggable slider */}
            <View style={{ marginTop: 2 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <Text style={{ fontSize: 12, fontWeight: '700', color: '#6b7280', width: 70 }}>Tolerance</Text>
                <TextInput
                  style={{ flex: 1, borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4, fontSize: 13, color: '#111827' }}
                  keyboardType="numeric"
                  value={tolText}
                  onChangeText={t => {
                    setTolText(t);
                    const n = parseInt(t, 10);
                    if (!isNaN(n)) setTol(Math.round(Math.max(0, Math.min(100, n))));
                  }}
                  onBlur={() => {
                    if (tolText.trim() === '' || isNaN(parseInt(tolText, 10))) setTolText(String(tol));
                  }}
                />
                <Text style={{ fontSize: 11, color: '#9ca3af' }}>/ 100</Text>
              </View>
              <View
                style={{ height: TROW_H, position: 'relative', marginBottom: 2 }}
                onLayout={e => { tolBarWRef.current = e.nativeEvent.layout.width; }}
                {...tolPan.panHandlers}
              >
                <View style={{
                  position: 'absolute', left: 0, right: 0,
                  top: (TROW_H - 5) / 2, height: 5, borderRadius: 3,
                  backgroundColor: '#e5e7eb', overflow: 'hidden',
                }}>
                  <View style={{ width: `${tolFrac * 100}%`, height: '100%', borderRadius: 3, backgroundColor: '#6b7280' }} />
                </View>
                <View style={{
                  position: 'absolute', left: `${tolFrac * 100}%`, top: 0,
                  width: TTHUMB, height: TROW_H, marginLeft: -TTHUMB / 2,
                  justifyContent: 'center', alignItems: 'center',
                }}>
                  <View style={{
                    width: TTHUMB, height: TTHUMB, borderRadius: TTHUMB / 2,
                    backgroundColor: '#fff', borderWidth: 2, borderColor: '#6b7280',
                    shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 2, elevation: 2,
                  }} />
                </View>
              </View>
            </View>
            <Text style={{ fontSize: 11, color: '#9ca3af', marginTop: 2, marginBottom: 14 }}>
              0 = exact match · 100 = very loose
            </Text>

            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TouchableOpacity onPress={onClose} activeOpacity={0.75}
                style={{ flex: 1, paddingVertical: 9, borderRadius: 8, backgroundColor: '#f3f4f6', alignItems: 'center' }}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: '#6b7280' }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => { if (entry) onSave({ ...entry, r, g, b, tolerance: tol }); onClose(); }}
                activeOpacity={0.75}
                style={{ flex: 1, paddingVertical: 9, borderRadius: 8, backgroundColor: '#0891b2', alignItems: 'center' }}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: '#fff' }}>Save</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
      <ColorPickModal
        visible={pickOpen}
        snapshotUri={snapshotUri}
        onPick={(pr, pg, pb) => { setR(pr); setG(pg); setB(pb); }}
        onClose={() => setPickOpen(false)}
      />
    </>
  );
}

// ── Zone draw modal ────────────────────────────────────────────────────────────

function ZoneDrawModal({ visible, snapshotUri, zones, editingZoneId, onDone, onCancel }: {
  visible: boolean;
  snapshotUri: string | null;
  zones: VisionZone[];
  editingZoneId: string | null;
  onDone: (geometry: VisionZoneGeometry) => void;
  onCancel: () => void;
}) {
  const insets                          = useSafeAreaInsets();
  const [shape, setShape]               = useState<VisionZoneShape>('Rectangle');
  const [polyReady, setPolyReady]       = useState(false);
  const webviewRef                      = useRef<any>(null);

  useEffect(() => {
    if (visible) { setShape('Rectangle'); setPolyReady(false); }
  }, [visible]);

  function changeShape(s: VisionZoneShape) {
    setShape(s);
    setPolyReady(false);
    webviewRef.current?.injectJavaScript(`window.setShape(${JSON.stringify(s)});true;`);
  }

  function onMessage(e: any) {
    try {
      const msg = JSON.parse(e.nativeEvent.data);
      if (msg.type === 'zone' && msg.geometry) {
        onDone(msg.geometry as VisionZoneGeometry);
      } else if (msg.type === 'polypts') {
        setPolyReady(msg.count >= 3);
      }
    } catch {}
  }

  function finishPolygon() {
    webviewRef.current?.injectJavaScript(`window.finishPolygon();true;`);
  }

  const html = snapshotUri
    ? makeZoneDrawHtml(snapshotUri, zones, editingZoneId, shape)
    : null;

  const SHAPES: { shape: VisionZoneShape; label: string }[] = [
    { shape: 'Rectangle', label: 'Rect' },
    { shape: 'Circle',    label: 'Circle' },
    { shape: 'Polygon',   label: 'Polygon' },
  ];

  return (
    <Modal visible={visible} animationType="slide" statusBarTranslucent onRequestClose={onCancel}>
      <View style={styles.drawModalRoot}>
        {html ? (
          <WebView
            ref={webviewRef}
            source={{ html }}
            style={StyleSheet.absoluteFill}
            scrollEnabled={false}
            originWhitelist={["*"]}
            javaScriptEnabled
            onMessage={onMessage}
          />
        ) : (
          <View style={[StyleSheet.absoluteFill, { justifyContent: 'center', alignItems: 'center' }]}>
            <Text style={{ color: '#6b7280', fontSize: 14 }}>
              Select a camera above to load a snapshot for zone drawing.
            </Text>
          </View>
        )}

        {/* Hint text — top, below status bar */}
        <View style={styles.drawHint} pointerEvents="none">
          <Text style={styles.drawHintText}>
            {shape === 'Rectangle' ? 'Drag to draw a rectangle' :
             shape === 'Circle'    ? 'Drag from center outward' :
             polyReady             ? 'Tap Finish or keep adding points' :
                                    'Tap to add points (need 3+)'}
          </Text>
        </View>

        {/* Bottom toolbar */}
        <View style={styles.drawToolbar} pointerEvents="box-none">
          <View style={[styles.drawToolbarInner, { paddingBottom: insets.bottom || 10 }]}>
            <TouchableOpacity onPress={onCancel} style={styles.drawCancelBtn}>
              <Text style={styles.drawCancelText}>Cancel</Text>
            </TouchableOpacity>

            <View style={styles.drawShapeRow}>
              {SHAPES.map(({ shape: s, label }) => (
                <TouchableOpacity
                  key={s}
                  style={[styles.drawShapeChip, shape === s && styles.drawShapeChipActive]}
                  onPress={() => changeShape(s)}
                >
                  <Text style={[styles.drawShapeText, shape === s && styles.drawShapeTextActive]}>{label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {shape === 'Polygon' && polyReady && (
              <TouchableOpacity onPress={finishPolygon} style={styles.drawFinishBtn}>
                <Text style={styles.drawFinishText}>Finish</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ── Shared inspection discriminated union ──────────────────────────────────────

type InspItem =
  | { kind: 'blob';    insp: BlobInspection }
  | { kind: 'color';   insp: ColorCoverageInspection }
  | { kind: 'polygon'; insp: PolygonInspection }
  | { kind: 'aruco';   insp: ArucoInspection }
  | { kind: 'line';    insp: LineInspection }
  | { kind: 'barcode'; insp: BarcodeInspection };

// ── Inspection type picker ─────────────────────────────────────────────────────

function InspectionTypePicker({
  visible, onSelect, onClose,
}: {
  visible: boolean;
  onSelect: (kind: 'blob' | 'color' | 'polygon' | 'aruco' | 'line' | 'barcode') => void;
  onClose: () => void;
}) {
  return (
    <BottomSheet visible={visible} onClose={onClose} title="Add Inspection">
      <TouchableOpacity style={styles.sheetRow} onPress={() => { onSelect('blob'); onClose(); }} activeOpacity={0.75}>
        <View style={styles.typePickerIcon}><ScanSearch size={18} color="#0891b2" /></View>
        <View style={{ flex: 1 }}>
          <Text style={styles.sheetRowName}>Blob Detection</Text>
          <Text style={styles.sheetRowSub}>Detect and count objects by shape</Text>
        </View>
      </TouchableOpacity>
      <TouchableOpacity style={styles.sheetRow} onPress={() => { onSelect('color'); onClose(); }} activeOpacity={0.75}>
        <View style={[styles.typePickerIcon, { backgroundColor: '#fdf4ff' }]}><Palette size={18} color="#d946ef" /></View>
        <View style={{ flex: 1 }}>
          <Text style={styles.sheetRowName}>Color Coverage</Text>
          <Text style={styles.sheetRowSub}>Measure pixel color percentage in a zone</Text>
        </View>
      </TouchableOpacity>
      <TouchableOpacity style={styles.sheetRow} onPress={() => { onSelect('polygon'); onClose(); }} activeOpacity={0.75}>
        <View style={[styles.typePickerIcon, { backgroundColor: '#fef3c7' }]}><Hexagon size={18} color="#d97706" /></View>
        <View style={{ flex: 1 }}>
          <Text style={styles.sheetRowName}>Polygon Detection</Text>
          <Text style={styles.sheetRowSub}>Find N-sided shapes and measure orientation</Text>
        </View>
      </TouchableOpacity>
      <TouchableOpacity style={styles.sheetRow} onPress={() => { onSelect('aruco'); onClose(); }} activeOpacity={0.75}>
        <View style={[styles.typePickerIcon, { backgroundColor: '#f0fdf4' }]}><QrCode size={18} color="#16a34a" /></View>
        <View style={{ flex: 1 }}>
          <Text style={styles.sheetRowName}>ArUco Marker</Text>
          <Text style={styles.sheetRowSub}>Detect ArUco fiducial markers and read their IDs</Text>
        </View>
      </TouchableOpacity>
      <TouchableOpacity style={styles.sheetRow} onPress={() => { onSelect('line'); onClose(); }} activeOpacity={0.75}>
        <View style={[styles.typePickerIcon, { backgroundColor: '#f5f3ff' }]}><Minus size={18} color="#7c3aed" /></View>
        <View style={{ flex: 1 }}>
          <Text style={styles.sheetRowName}>Line Detection</Text>
          <Text style={styles.sheetRowSub}>Detect straight lines using Canny edges and Hough transform</Text>
        </View>
      </TouchableOpacity>
      <TouchableOpacity style={styles.sheetRow} onPress={() => { onSelect('barcode'); onClose(); }} activeOpacity={0.75}>
        <View style={[styles.typePickerIcon, { backgroundColor: '#eff6ff' }]}><Barcode size={18} color="#2563eb" /></View>
        <View style={{ flex: 1 }}>
          <Text style={styles.sheetRowName}>Barcode / QR Code</Text>
          <Text style={styles.sheetRowSub}>Read QR codes, Code 128, EAN, Data Matrix and more</Text>
        </View>
      </TouchableOpacity>
    </BottomSheet>
  );
}

function FormatPickerSheet({ visible, selected, onToggle, onClose }: {
  visible: boolean;
  selected: string[];
  onToggle: (id: string) => void;
  onClose: () => void;
}) {
  return (
    <BottomSheet visible={visible} onClose={onClose} title="Barcode Formats">
      <Text style={{ fontSize: 12, color: '#6b7280', marginBottom: 6 }}>
        Leave all unchecked to scan every supported format
      </Text>
      <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 320 }}>
        {BARCODE_FORMATS.map(f => {
          const active = selected.includes(f.id);
          return (
            <TouchableOpacity
              key={f.id}
              style={[styles.sheetRow, active && styles.sheetRowActive]}
              onPress={() => onToggle(f.id)}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.sheetRowName}>{f.label}</Text>
              </View>
              {active && <Check size={16} color="#2563eb" />}
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </BottomSheet>
  );
}

// ── Inspection config modal ────────────────────────────────────────────────────

function DictionaryPickerModal({ visible, selected, onSelect, onClose }: {
  visible: boolean; selected: number;
  onSelect: (id: number) => void; onClose: () => void;
}) {
  return (
    <BottomSheet visible={visible} onClose={onClose} title="ArUco Dictionary">
      <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 320 }}>
        {ARUCO_DICTIONARIES.map(d => (
          <TouchableOpacity
            key={d.id}
            style={[styles.sheetRow, d.id === selected && styles.sheetRowActive]}
            onPress={() => { onSelect(d.id); onClose(); }}
          >
            <View style={{ flex: 1 }}>
              <Text style={styles.sheetRowName}>{d.label}</Text>
            </View>
            {d.id === selected && <Check size={16} color="#0891b2" />}
          </TouchableOpacity>
        ))}
      </ScrollView>
    </BottomSheet>
  );
}

function InspectionConfigModal({
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
      <SafeAreaView style={styles.configRoot}>
        <View style={styles.configHeader}>
          <Text style={styles.configTitle}>
            {kind === 'blob' ? 'Blob Detection' : kind === 'polygon' ? 'Polygon Detection' : kind === 'aruco' ? 'ArUco Marker' : kind === 'line' ? 'Line Detection' : kind === 'barcode' ? 'Barcode / QR Code' : 'Color Coverage'}
          </Text>
          <TouchableOpacity onPress={handleClose} style={styles.configDoneBtn}>
            <Check size={15} color="#fff" />
            <Text style={styles.configDoneBtnText}>Done</Text>
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
          <View style={styles.configCard}>
            <Text style={styles.configFieldLabel}>Name</Text>
            <TextInput
              style={styles.configNameInput}
              value={name}
              onChangeText={setName}
              placeholder="Inspection name"
              placeholderTextColor="#9ca3af"
            />
          </View>

          {/* Enabled */}
          <View style={styles.configCard}>
            <Text style={[styles.configFieldLabel, { flex: 1 }]}>Enabled</Text>
            <Switch value={enabled} onValueChange={setEnabled} trackColor={{ true: accent }} />
          </View>

          {/* Zone */}
          <TouchableOpacity
            style={styles.configCard}
            onPress={() => setZonePickerOpen(true)}
            activeOpacity={0.75}
          >
            <Text style={styles.configFieldLabel}>Zone</Text>
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
            <View style={styles.blobPanel}>
              <Text style={styles.blobPanelTitle}>Polygon Detection</Text>
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
            <View style={styles.blobPanel}>
              <Text style={styles.blobPanelTitle}>ArUco Detection</Text>

              <TouchableOpacity
                style={[styles.configCard, { marginBottom: 8 }]}
                onPress={() => setDictPickerOpen(true)}
                activeOpacity={0.75}
              >
                <Text style={styles.paramLabel}>Dictionary</Text>
                <Text style={{ flex: 1, fontSize: 13, color: '#111827' }}>
                  {ARUCO_DICTIONARIES.find(d => d.id === arucoDictId)?.label ?? String(arucoDictId)}
                </Text>
                <ChevronDown size={14} color="#9ca3af" />
              </TouchableOpacity>
              <Text style={styles.paramDesc}>
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
            <View style={styles.blobPanel}>
              <Text style={styles.blobPanelTitle}>Line Detection</Text>
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
            <View style={styles.blobPanel}>
              <Text style={styles.blobPanelTitle}>Barcode / QR Detection</Text>
              <TouchableOpacity
                style={[styles.configCard, { marginBottom: 4 }]}
                onPress={() => setFormatPickerOpen(true)}
                activeOpacity={0.75}
              >
                <Text style={styles.paramLabel}>Formats</Text>
                <Text style={{ flex: 1, fontSize: 13, color: '#111827' }}>
                  {barcodeFormats.length === 0
                    ? 'All formats'
                    : barcodeFormats.map(f => BARCODE_FORMATS.find(b => b.id === f)?.label ?? f).join(', ')}
                </Text>
                <ChevronDown size={14} color="#9ca3af" />
              </TouchableOpacity>
              <Text style={styles.paramDesc}>
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
              <Text style={[styles.sectionLabel, { marginTop: 4 }]}>COLORS TO MATCH</Text>

              {colors.length === 0 && (
                <View style={styles.emptyCard}>
                  <Text style={styles.emptyText}>No colors yet — add at least one</Text>
                </View>
              )}

              {colors.map(ce => (
                <TouchableOpacity
                  key={ce.id}
                  style={styles.colorEntryRow}
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
                    hitSlop={8} style={styles.iconBtn}
                  >
                    <Trash2 size={13} color="#ef4444" />
                  </TouchableOpacity>
                </TouchableOpacity>
              ))}

              <TouchableOpacity
                style={styles.addBtn}
                onPress={() => setColorEditState({ entry: defaultColorEntry() })}
                activeOpacity={0.75}
              >
                <Plus size={13} color="#d946ef" />
                <Text style={[styles.addBtnText, { color: '#d946ef' }]}>Add Color</Text>
              </TouchableOpacity>

              <Text style={[styles.sectionLabel, { marginTop: 4 }]}>PASS / FAIL THRESHOLDS</Text>

              <View style={[styles.configCard, { flexDirection: 'column', alignItems: 'stretch', gap: 0, paddingVertical: 10 }]}>
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
                        style={[styles.paramInput, { width: 60 }]}
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

              <View style={[styles.configCard, { flexDirection: 'column', alignItems: 'stretch', gap: 0, paddingVertical: 10 }]}>
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
                        style={[styles.paramInput, { width: 60 }]}
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

// ── Main editor screen ─────────────────────────────────────────────────────────

export default function VisionEditorScreen() {
  const params         = useLocalSearchParams<{ program: string; runningIds?: string }>();
  const initialProg    = JSON.parse(params.program) as VisionProgram;
  const initialRunning = params.runningIds ? new Set<string>(JSON.parse(params.runningIds)) : new Set<string>();

  const [program, setProgram]     = useState<VisionProgram>(initialProg);
  const [name, setName]           = useState(initialProg.name);
  const [isRunning, setIsRunning] = useState(initialRunning.has(initialProg.id));
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [cameras, setCameras]     = useState<CameraState[]>([]);

  // Modal states
  const [camPickerOpen, setCamPickerOpen] = useState(false);
  const [zoneModalOpen, setZoneModalOpen] = useState(false);
  const [editingZoneId, setEditingZoneId] = useState<string | null>(null);
  const [snapshotUri, setSnapshotUri]     = useState<string | null>(null);
  const [configModal, setConfigModal]     = useState<InspItem | null>(null);
  const [typePicker, setTypePicker]       = useState(false);

  const programRef  = useRef(program);
  const nameRef     = useRef(name);
  programRef.current = program;
  nameRef.current    = name;

  const dirtySaveTimerRef    = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedFeedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isFirstRenderRef     = useRef(true);

  // Auto-save whenever program state or name changes (skip the very first render)
  useEffect(() => {
    if (isFirstRenderRef.current) { isFirstRenderRef.current = false; return; }
    if (dirtySaveTimerRef.current) clearTimeout(dirtySaveTimerRef.current);
    dirtySaveTimerRef.current = setTimeout(() => {
      autoSave({ ...programRef.current, name: nameRef.current });
    }, 400);
  }, [program, name]);

  const navigation = useNavigation();
  useEffect(() => {
    return navigation.addListener('beforeRemove', () => {
      // Flush any pending debounced save immediately before leaving
      if (dirtySaveTimerRef.current) {
        clearTimeout(dirtySaveTimerRef.current);
        dirtySaveTimerRef.current = null;
        robotClient.saveVisionProgram({ ...programRef.current, name: nameRef.current }).catch(() => {});
      }
    });
  }, [navigation]);

  // Feed WebView ref — URL updates are injected without rebuilding the WebView
  const feedWebViewRef = useRef<any>(null);
  const feedSnapshotResolveRef = useRef<((uri: string | null) => void) | null>(null);

  const feedSourceUrl = useMemo(() => {
    if (isRunning && program.id) return robotClient.visionWsUrl(program.id);
    if (program.cameraId)       return robotClient.cameraWsUrl(program.cameraId);
    return null;
  }, [isRunning, program.id, program.cameraId]);

  const injectFeedUrl = useCallback(() => {
    feedWebViewRef.current?.injectJavaScript(
      `window.setFeed(${JSON.stringify(feedSourceUrl)});true;`
    );
  }, [feedSourceUrl]);

  useEffect(() => { injectFeedUrl(); }, [injectFeedUrl]);

  // Cameras
  useEffect(() => {
    robotClient.getCameras().catch(() => {});
    return robotClient.onCameras(setCameras);
  }, []);

  // Grab the current displayed frame from the live feed WebView canvas — no network
  // round-trip. Injects JS to read the canvas and receive the data URL via onMessage.
  const grabFeedSnapshot = useCallback((): Promise<string | null> => {
    return new Promise(resolve => {
      feedSnapshotResolveRef.current = resolve;
      feedWebViewRef.current?.injectJavaScript(
        `(function(){try{var d=c.toDataURL('image/jpeg',0.85);` +
        `window.ReactNativeWebView.postMessage(JSON.stringify({type:'feedSnapshot',data:d}));}` +
        `catch(e){window.ReactNativeWebView.postMessage(JSON.stringify({type:'feedSnapshot',data:null}));}` +
        `})();true;`
      );
      setTimeout(() => {
        if (feedSnapshotResolveRef.current === resolve) {
          feedSnapshotResolveRef.current = null;
          resolve(null);
        }
      }, 1500);
    });
  }, []);

  const onFeedMessage = useCallback((e: any) => {
    try {
      const msg = JSON.parse(e.nativeEvent.data);
      if (msg.type === 'feedSnapshot' && feedSnapshotResolveRef.current) {
        const resolve = feedSnapshotResolveRef.current;
        feedSnapshotResolveRef.current = null;
        if (msg.data) setSnapshotUri(msg.data);
        resolve(msg.data ?? null);
      }
    } catch {}
  }, []);

  // Snapshot for zone drawing / color picker: grabs the live feed canvas first
  // (instant, no network), falls back to HTTP snapshot if feed isn't running.
  const fetchSnapshot = useCallback(async () => {
    const grabbed = await grabFeedSnapshot();
    if (grabbed) { setSnapshotUri(grabbed); return; }
    const url = program.cameraId ? robotClient.cameraSnapshotUrl(program.cameraId) : null;
    if (!url) { setSnapshotUri(null); return; }
    try {
      const res  = await fetch(url);
      const blob = await res.blob();
      await new Promise<void>(resolve => {
        const reader = new FileReader();
        reader.onload  = () => { setSnapshotUri(reader.result as string); resolve(); };
        reader.onerror = () => resolve();
        reader.readAsDataURL(blob);
      });
    } catch { setSnapshotUri(null); }
  }, [program.cameraId, grabFeedSnapshot]);

  function openZoneModal(editId?: string) {
    setEditingZoneId(editId ?? null);
    setZoneModalOpen(true);
    fetchSnapshot();
  }

  function onZoneDrawDone(geometry: VisionZoneGeometry) {
    setZoneModalOpen(false);
    let updated: VisionProgram;
    if (editingZoneId) {
      updated = {
        ...program, name,
        zones: program.zones.map(z => z.id === editingZoneId ? { ...z, geometry } : z),
      };
    } else {
      const newZone: VisionZone = {
        id: `zone_${Date.now()}`,
        name: `Zone ${program.zones.length + 1}`,
        geometry,
      };
      updated = { ...program, name, zones: [...program.zones, newZone] };
    }
    setProgram(updated);
  }

  async function autoSave(prog: VisionProgram) {
    setSaveStatus('saving');
    try {
      const result: any = await robotClient.saveVisionProgram(prog);
      if (result?.programId && !prog.id) {
        setProgram(prev => ({ ...prev, id: result.programId }));
      }
      setSaveStatus('saved');
      if (savedFeedbackTimerRef.current) clearTimeout(savedFeedbackTimerRef.current);
      savedFeedbackTimerRef.current = setTimeout(() => setSaveStatus('idle'), 1500);
    } catch {
      setSaveStatus('idle');
    }
  }

  function updateZone(updated: VisionZone) {
    setProgram(prev => ({ ...prev, zones: prev.zones.map(z => z.id === updated.id ? updated : z) }));
  }

  function deleteZone(id: string) {
    setProgram(prev => ({
      ...prev,
      zones: prev.zones.filter(z => z.id !== id),
      inspections:        prev.inspections.map(i => i.zoneId === id ? { ...i, zoneId: null } : i),
      colorInspections:   (prev.colorInspections ?? []).map(i => i.zoneId === id ? { ...i, zoneId: null } : i),
      polygonInspections: (prev.polygonInspections ?? []).map(i => i.zoneId === id ? { ...i, zoneId: null } : i),
      arucoInspections:    (prev.arucoInspections ?? []).map(i => i.zoneId === id ? { ...i, zoneId: null } : i),
      lineInspections:     (prev.lineInspections ?? []).map(i => i.zoneId === id ? { ...i, zoneId: null } : i),
      barcodeInspections:  (prev.barcodeInspections ?? []).map(i => i.zoneId === id ? { ...i, zoneId: null } : i),
    }));
  }

  function updateInspection(updated: BlobInspection) {
    setProgram(prev => ({ ...prev, inspections: prev.inspections.map(i => i.id === updated.id ? updated : i) }));
  }

  function deleteInspection(id: string) {
    setProgram(prev => ({ ...prev, inspections: prev.inspections.filter(i => i.id !== id) }));
  }

  function updateColorInspection(updated: ColorCoverageInspection) {
    setProgram(prev => ({
      ...prev,
      colorInspections: (prev.colorInspections ?? []).map(i => i.id === updated.id ? updated : i),
    }));
  }

  function deleteColorInspection(id: string) {
    setProgram(prev => ({ ...prev, colorInspections: (prev.colorInspections ?? []).filter(i => i.id !== id) }));
  }

  function updatePolygonInspection(updated: PolygonInspection) {
    setProgram(prev => ({
      ...prev,
      polygonInspections: (prev.polygonInspections ?? []).map(i => i.id === updated.id ? updated : i),
    }));
  }

  function deletePolygonInspection(id: string) {
    setProgram(prev => ({ ...prev, polygonInspections: (prev.polygonInspections ?? []).filter(i => i.id !== id) }));
  }

  function updateArucoInspection(updated: ArucoInspection) {
    setProgram(prev => ({
      ...prev,
      arucoInspections: (prev.arucoInspections ?? []).map(i => i.id === updated.id ? updated : i),
    }));
  }

  function deleteArucoInspection(id: string) {
    setProgram(prev => ({ ...prev, arucoInspections: (prev.arucoInspections ?? []).filter(i => i.id !== id) }));
  }

  function updateLineInspection(updated: LineInspection) {
    setProgram(prev => ({
      ...prev,
      lineInspections: (prev.lineInspections ?? []).map(i => i.id === updated.id ? updated : i),
    }));
  }

  function deleteLineInspection(id: string) {
    setProgram(prev => ({ ...prev, lineInspections: (prev.lineInspections ?? []).filter(i => i.id !== id) }));
  }

  function updateBarcodeInspection(updated: BarcodeInspection) {
    setProgram(prev => ({
      ...prev,
      barcodeInspections: (prev.barcodeInspections ?? []).map(i => i.id === updated.id ? updated : i),
    }));
  }

  function deleteBarcodeInspection(id: string) {
    setProgram(prev => ({ ...prev, barcodeInspections: (prev.barcodeInspections ?? []).filter(i => i.id !== id) }));
  }

  function duplicateInspection(item: InspItem) {
    const newId   = `insp_${Date.now()}`;
    const newName = `${item.insp.name} (copy)`;
    if (item.kind === 'blob') {
      const dup: BlobInspection = { ...(item.insp as BlobInspection), id: newId, name: newName };
      setProgram(prev => ({ ...prev, inspections: [...prev.inspections, dup] }));
    } else if (item.kind === 'color') {
      const dup: ColorCoverageInspection = { ...(item.insp as ColorCoverageInspection), id: newId, name: newName };
      setProgram(prev => ({ ...prev, colorInspections: [...(prev.colorInspections ?? []), dup] }));
    } else if (item.kind === 'polygon') {
      const dup: PolygonInspection = { ...(item.insp as PolygonInspection), id: newId, name: newName };
      setProgram(prev => ({ ...prev, polygonInspections: [...(prev.polygonInspections ?? []), dup] }));
    } else if (item.kind === 'aruco') {
      const dup: ArucoInspection = { ...(item.insp as ArucoInspection), id: newId, name: newName };
      setProgram(prev => ({ ...prev, arucoInspections: [...(prev.arucoInspections ?? []), dup] }));
    } else if (item.kind === 'line') {
      const dup: LineInspection = { ...(item.insp as LineInspection), id: newId, name: newName };
      setProgram(prev => ({ ...prev, lineInspections: [...(prev.lineInspections ?? []), dup] }));
    } else if (item.kind === 'barcode') {
      const dup: BarcodeInspection = { ...(item.insp as BarcodeInspection), id: newId, name: newName };
      setProgram(prev => ({ ...prev, barcodeInspections: [...(prev.barcodeInspections ?? []), dup] }));
    }
  }

  function handlePolygonLiveUpdate(insp: PolygonInspection) { updatePolygonInspection(insp); }
  function handleBlobLiveUpdate(insp: BlobInspection)       { updateInspection(insp); }
  function handleColorLiveUpdate(insp: ColorCoverageInspection) { updateColorInspection(insp); }
  function handleArucoLiveUpdate(insp: ArucoInspection)     { updateArucoInspection(insp); }
  function handleLineLiveUpdate(insp: LineInspection)        { updateLineInspection(insp); }

  const allInspections: InspItem[] = [
    ...program.inspections.map(insp => ({ kind: 'blob' as const, insp })),
    ...(program.colorInspections ?? []).map(insp => ({ kind: 'color' as const, insp })),
    ...(program.polygonInspections ?? []).map(insp => ({ kind: 'polygon' as const, insp })),
    ...(program.arucoInspections ?? []).map(insp => ({ kind: 'aruco' as const, insp })),
    ...(program.lineInspections ?? []).map(insp => ({ kind: 'line' as const, insp })),
    ...(program.barcodeInspections ?? []).map(insp => ({ kind: 'barcode' as const, insp })),
  ];

  async function toggleRunning() {
    let id = program.id;
    if (!id) {
      try {
        const result: any = await robotClient.saveVisionProgram({ ...program, name });
        if (result?.programId) {
          id = result.programId;
          setProgram(prev => ({ ...prev, id: result.programId, lastUpdatedUnixMs: result.lastUpdatedUnixMs }));
        }
      } catch {}
      if (!id) return;
    }
    if (isRunning) {
      await robotClient.stopVision(id).catch(() => {});
      setIsRunning(false);
    } else {
      await robotClient.startVision(id).catch(() => {});
      setIsRunning(true);
    }
  }

  const selectedCam = cameras.find(c => c.id === program.cameraId);

  return (
    <View style={styles.root}>
      <SubPageHeader
        title={name}
        right={
          saveStatus === 'saving' ? (
            <View style={styles.saveStatusRow}>
              <ActivityIndicator size="small" color="#6b7280" />
              <Text style={styles.saveStatusText}>Saving…</Text>
            </View>
          ) : saveStatus === 'saved' ? (
            <View style={styles.saveStatusRow}>
              <Check size={14} color="#16a34a" />
              <Text style={[styles.saveStatusText, { color: '#16a34a' }]}>Saved</Text>
            </View>
          ) : null
        }
      />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
      >
        {/* Name */}
        <View style={styles.card}>
          <Text style={styles.rowLabel}>Name</Text>
          <TextInput
            style={styles.nameInput}
            value={name}
            onChangeText={setName}
            placeholder="Program name"
            placeholderTextColor="#9ca3af"
            returnKeyType="done"
            onSubmitEditing={Keyboard.dismiss}
          />
        </View>

        {/* Camera */}
        <TouchableOpacity style={styles.card} onPress={() => setCamPickerOpen(true)} activeOpacity={0.75}>
          <Text style={styles.rowLabel}>Camera</Text>
          <View style={[styles.dot, { backgroundColor: selectedCam?.connected ? "#22c55e" : "#d1d5db" }]} />
          <Text style={styles.cameraValue} numberOfLines={1}>
            {selectedCam ? (selectedCam.name || selectedCam.id) : (program.cameraId || "Tap to select")}
          </Text>
          <ChevronDown size={15} color="#9ca3af" />
        </TouchableOpacity>

        {/* Camera feed — WebView canvas updates in-place, no flicker */}
        <View style={styles.feedCard} pointerEvents="none">
          <WebView
            ref={feedWebViewRef}
            source={{ html: FEED_HTML }}
            style={{ flex: 1, backgroundColor: "#111" }}
            scrollEnabled={false}
            originWhitelist={["*"]}
            javaScriptEnabled
            focusable={false}
            accessible={false}
            onLoad={injectFeedUrl}
            onMessage={onFeedMessage}
          />
          {!feedSourceUrl && (
            <View style={styles.feedPlaceholder}>
              <Text style={styles.feedPlaceholderText}>
                {program.cameraId ? "Connecting to camera…" : "Select a camera above"}
              </Text>
            </View>
          )}
        </View>

        {/* Run / Stop */}
        <TouchableOpacity
          style={[styles.runBtn, isRunning ? styles.runBtnStop : styles.runBtnStart]}
          onPress={toggleRunning}
          activeOpacity={0.8}
        >
          {isRunning ? <EyeOff size={16} color="#fff" /> : <Eye size={16} color="#fff" />}
          <Text style={styles.runBtnText}>{isRunning ? "Stop Vision" : "Start Vision"}</Text>
        </TouchableOpacity>

        {/* ── Zones ──────────────────────────────────────────────────────────── */}
        <Text style={styles.sectionLabel}>ZONES</Text>

        {program.zones.length === 0 && (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>No zones defined — add one to restrict where blobs are counted</Text>
          </View>
        )}

        {program.zones.map(zone => (
          <View key={zone.id} style={styles.zoneCard}>
            <View style={[styles.dot, { backgroundColor: "#22d3ee" }]} />
            <TextInput
              style={styles.zoneNameInput}
              value={zone.name}
              onChangeText={t => updateZone({ ...zone, name: t })}
            />
            <Text style={styles.shapeBadge}>{zone.geometry.shape}</Text>
            <TouchableOpacity onPress={() => openZoneModal(zone.id)} style={styles.iconBtn} hitSlop={8}>
              <Pencil size={14} color="#6b7280" />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => Alert.alert('Delete Zone', `Delete "${zone.name}"?`, [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Delete', style: 'destructive', onPress: () => deleteZone(zone.id) },
              ])}
              style={styles.iconBtn} hitSlop={8}
            >
              <Trash2 size={14} color="#ef4444" />
            </TouchableOpacity>
          </View>
        ))}

        <TouchableOpacity style={styles.addBtn} onPress={() => openZoneModal()} activeOpacity={0.75}>
          <Plus size={15} color="#0891b2" />
          <Text style={styles.addBtnText}>Add Zone</Text>
        </TouchableOpacity>

        {/* ── Inspections (unified) ────────────────────────────────────────── */}
        <Text style={[styles.sectionLabel, { marginTop: 8 }]}>INSPECTIONS</Text>

        {allInspections.length === 0 && (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>No inspections — add one to detect blobs or measure colors</Text>
          </View>
        )}

        {allInspections.map((item, index) => {
          const { kind, insp } = item;
          const linkedZone = program.zones.find(z => z.id === insp.zoneId);
          const accent     = kind === 'blob' ? '#0891b2' : kind === 'polygon' ? '#d97706' : kind === 'aruco' ? '#16a34a' : kind === 'line' ? '#7c3aed' : kind === 'barcode' ? '#2563eb' : '#d946ef';
          const iconBg     = kind === 'blob' ? '#ecfeff' : kind === 'polygon' ? '#fef3c7' : kind === 'aruco' ? '#f0fdf4' : kind === 'line' ? '#f5f3ff' : kind === 'barcode' ? '#eff6ff' : '#fdf4ff';
          const typeLabel  = kind === 'blob' ? 'BLOB DETECTION' : kind === 'polygon' ? 'POLYGON DETECTION' : kind === 'aruco' ? 'ARUCO MARKER' : kind === 'line' ? 'LINE DETECTION' : kind === 'barcode' ? 'BARCODE / QR CODE' : 'COLOR COVERAGE';
          return (
            <View key={insp.id} style={[styles.inspStepCard, { borderLeftColor: accent }]}>
              <TouchableOpacity
                style={styles.inspStepHeader}
                onPress={() => setConfigModal(item)}
                activeOpacity={0.75}
              >
                <View style={[styles.inspStepIcon, { backgroundColor: iconBg }]}>
                  {kind === 'blob'    ? <ScanSearch size={18} color={accent} /> :
                   kind === 'polygon' ? <Hexagon    size={18} color={accent} /> :
                   kind === 'aruco'   ? <QrCode     size={18} color={accent} /> :
                   kind === 'line'    ? <Minus      size={18} color={accent} /> :
                   kind === 'barcode' ? <Barcode    size={18} color={accent} /> :
                                       <Palette    size={18} color={accent} />}
                </View>
                <View style={styles.inspStepText}>
                  <Text style={[styles.inspStepType, { color: accent }]}>
                    {index + 1} · {typeLabel}
                  </Text>
                  <Text style={styles.inspStepName}>{insp.name}</Text>
                  <Text style={styles.inspStepDetail}>
                    {linkedZone?.name ?? 'Full image'}
                    {kind === 'polygon' ? ` · ${(insp as PolygonInspection).sides} sides` : ''}
                    {kind === 'aruco'   ? ` · dict ${(insp as ArucoInspection).dictionaryId}` : ''}
                    {kind === 'barcode' && (insp as BarcodeInspection).formats.length > 0
                      ? ` · ${(insp as BarcodeInspection).formats.length} format(s)` : ''}
                  </Text>
                </View>
                <Switch
                  value={insp.enabled}
                  onValueChange={v => {
                    if (kind === 'blob')         updateInspection({ ...(insp as BlobInspection), enabled: v });
                    else if (kind === 'polygon') updatePolygonInspection({ ...(insp as PolygonInspection), enabled: v });
                    else if (kind === 'aruco')   updateArucoInspection({ ...(insp as ArucoInspection), enabled: v });
                    else if (kind === 'line')    updateLineInspection({ ...(insp as LineInspection), enabled: v });
                    else if (kind === 'barcode') updateBarcodeInspection({ ...(insp as BarcodeInspection), enabled: v });
                    else                         updateColorInspection({ ...(insp as ColorCoverageInspection), enabled: v });
                  }}
                  trackColor={{ true: accent }}
                  style={{ transform: [{ scaleX: 0.8 }, { scaleY: 0.8 }] }}
                />
                <TouchableOpacity onPress={() => duplicateInspection(item)} hitSlop={8} style={styles.iconBtn}>
                  <Copy size={15} color="#6b7280" />
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => Alert.alert('Delete Inspection', `Delete "${insp.name}"?`, [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Delete', style: 'destructive', onPress: () => {
                      if (kind === 'blob')         deleteInspection(insp.id);
                      else if (kind === 'polygon') deletePolygonInspection(insp.id);
                      else if (kind === 'aruco')   deleteArucoInspection(insp.id);
                      else if (kind === 'line')    deleteLineInspection(insp.id);
                      else if (kind === 'barcode') deleteBarcodeInspection(insp.id);
                      else                         deleteColorInspection(insp.id);
                    }},
                  ])}
                  hitSlop={8} style={styles.iconBtn}
                >
                  <Trash2 size={15} color="#ef4444" />
                </TouchableOpacity>
              </TouchableOpacity>
            </View>
          );
        })}

        <TouchableOpacity style={styles.addBtn} onPress={() => setTypePicker(true)} activeOpacity={0.75}>
          <Plus size={15} color="#7c3aed" />
          <Text style={[styles.addBtnText, { color: '#7c3aed' }]}>Add Inspection</Text>
        </TouchableOpacity>

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Modals */}
      <CameraPickerModal
        visible={camPickerOpen}
        cameras={cameras}
        selected={program.cameraId}
        onSelect={id => setProgram(p => ({ ...p, cameraId: id }))}
        onClose={() => setCamPickerOpen(false)}
      />

      <ZoneDrawModal
        visible={zoneModalOpen}
        snapshotUri={snapshotUri}
        zones={program.zones}
        editingZoneId={editingZoneId}
        onDone={onZoneDrawDone}
        onCancel={() => setZoneModalOpen(false)}
      />

      <InspectionTypePicker
        visible={typePicker}
        onSelect={kind => {
          const totalCount = program.inspections.length +
            (program.colorInspections ?? []).length +
            (program.polygonInspections ?? []).length +
            (program.arucoInspections ?? []).length +
            (program.lineInspections ?? []).length +
            (program.barcodeInspections ?? []).length;
          if (kind === 'blob') {
            const newInsp: BlobInspection = {
              id: `insp_${Date.now()}`,
              name: `Inspection ${totalCount + 1}`,
              enabled: true,
              zoneId: null,
              blobParams: defaultBlobParams(),
            };
            setProgram(prev => ({ ...prev, inspections: [...prev.inspections, newInsp] }));
            setConfigModal({ kind: 'blob', insp: newInsp });
          } else if (kind === 'color') {
            const newInsp = defaultColorCoverageInspection(totalCount);
            setProgram(prev => ({ ...prev, colorInspections: [...(prev.colorInspections ?? []), newInsp] }));
            setConfigModal({ kind: 'color', insp: newInsp });
          } else if (kind === 'aruco') {
            const newInsp = defaultArucoInspection(totalCount);
            setProgram(prev => ({ ...prev, arucoInspections: [...(prev.arucoInspections ?? []), newInsp] }));
            setConfigModal({ kind: 'aruco', insp: newInsp });
          } else if (kind === 'line') {
            const newInsp = defaultLineInspection(totalCount);
            setProgram(prev => ({ ...prev, lineInspections: [...(prev.lineInspections ?? []), newInsp] }));
            setConfigModal({ kind: 'line', insp: newInsp });
          } else if (kind === 'barcode') {
            const newInsp = defaultBarcodeInspection(totalCount);
            setProgram(prev => ({ ...prev, barcodeInspections: [...(prev.barcodeInspections ?? []), newInsp] }));
            setConfigModal({ kind: 'barcode', insp: newInsp });
          } else {
            const newInsp = defaultPolygonInspection(totalCount);
            setProgram(prev => ({ ...prev, polygonInspections: [...(prev.polygonInspections ?? []), newInsp] }));
            setConfigModal({ kind: 'polygon', insp: newInsp });
          }
        }}
        onClose={() => setTypePicker(false)}
      />

      <InspectionConfigModal
        visible={configModal !== null}
        kind={configModal?.kind ?? null}
        initialBlob={configModal?.kind === 'blob' ? (configModal.insp as BlobInspection) : null}
        initialColor={configModal?.kind === 'color' ? (configModal.insp as ColorCoverageInspection) : null}
        initialPolygon={configModal?.kind === 'polygon' ? (configModal.insp as PolygonInspection) : null}
        initialAruco={configModal?.kind === 'aruco' ? (configModal.insp as ArucoInspection) : null}
        initialLine={configModal?.kind === 'line' ? (configModal.insp as LineInspection) : null}
        initialBarcode={configModal?.kind === 'barcode' ? (configModal.insp as BarcodeInspection) : null}
        zones={program.zones}
        snapshotUri={snapshotUri}
        onFetchSnapshot={fetchSnapshot}
        onSaveBlob={insp => {
          updateInspection(insp);
          autoSave({ ...program, name, inspections: program.inspections.map(i => i.id === insp.id ? insp : i) });
        }}
        onSaveColor={insp => {
          updateColorInspection(insp);
          autoSave({ ...program, name, colorInspections: (program.colorInspections ?? []).map(i => i.id === insp.id ? insp : i) });
        }}
        onSavePolygon={insp => {
          updatePolygonInspection(insp);
          autoSave({ ...program, name, polygonInspections: (program.polygonInspections ?? []).map(i => i.id === insp.id ? insp : i) });
        }}
        onSaveAruco={insp => {
          updateArucoInspection(insp);
          autoSave({ ...program, name, arucoInspections: (program.arucoInspections ?? []).map(i => i.id === insp.id ? insp : i) });
        }}
        onSaveLine={insp => {
          updateLineInspection(insp);
          autoSave({ ...program, name, lineInspections: (program.lineInspections ?? []).map(i => i.id === insp.id ? insp : i) });
        }}
        onSaveBarcode={insp => {
          updateBarcodeInspection(insp);
          autoSave({ ...program, name, barcodeInspections: (program.barcodeInspections ?? []).map(i => i.id === insp.id ? insp : i) });
        }}
        debugUrl={configModal && program.id
          ? configModal.kind === 'polygon'
            ? robotClient.visionPolygonDebugUrl(program.id, configModal.insp.id)
            : configModal.kind === 'line'
              ? robotClient.visionLineDebugUrl(program.id, configModal.insp.id)
              : robotClient.visionAnnotatedUrl(program.id)
          : null}
        onLiveUpdate={handlePolygonLiveUpdate}
        onLiveUpdateBlob={handleBlobLiveUpdate}
        onLiveUpdateColor={handleColorLiveUpdate}
        onLiveUpdateAruco={handleArucoLiveUpdate}
        onLiveUpdateLine={handleLineLiveUpdate}
        onClose={() => setConfigModal(null)}
      />
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root:    { flex: 1, backgroundColor: "#f3f4f6" },
  scroll:  { flex: 1 },
  content: { padding: 14, gap: 8 },

  saveStatusRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  saveStatusText: { fontSize: 13, color: "#6b7280" },

  // Shared card
  card: {
    flexDirection: "row", alignItems: "center", gap: 10,
    backgroundColor: "#fff", borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 12,
    shadowColor: "#000", shadowOpacity: 0.04, shadowRadius: 4, elevation: 1,
  },
  rowLabel:    { fontSize: 12, fontWeight: "600", color: "#6b7280", width: 60 },
  nameInput:   { flex: 1, fontSize: 14, color: "#111827" },
  cameraValue: { flex: 1, fontSize: 14, color: "#111827" },
  dot:         { width: 8, height: 8, borderRadius: 4 },

  // Camera feed
  feedCard: {
    backgroundColor: "#111", borderRadius: 12, overflow: "hidden",
    height: 220,
    shadowColor: "#000", shadowOpacity: 0.1, shadowRadius: 6, elevation: 3,
  },
  feedPlaceholder: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center", alignItems: "center",
  },
  feedPlaceholderText: { color: "#6b7280", fontSize: 13 },

  // Run/Stop button
  runBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    borderRadius: 12, paddingVertical: 13,
    shadowColor: "#000", shadowOpacity: 0.08, shadowRadius: 6, elevation: 2,
  },
  runBtnStart: { backgroundColor: "#0891b2" },
  runBtnStop:  { backgroundColor: "#dc2626" },
  runBtnText:  { color: "#fff", fontSize: 14, fontWeight: "700" },

  // Section label
  sectionLabel: { fontSize: 11, fontWeight: "700", color: "#6b7280", letterSpacing: 0.8, marginBottom: 2 },

  // Empty placeholder
  emptyCard: {
    backgroundColor: "#fff", borderRadius: 12, padding: 16, alignItems: "center",
    shadowColor: "#000", shadowOpacity: 0.03, shadowRadius: 3, elevation: 1,
  },
  emptyText: { fontSize: 13, color: "#9ca3af", textAlign: "center" },

  // Zone card
  zoneCard: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: "#fff", borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 11,
    shadowColor: "#000", shadowOpacity: 0.04, shadowRadius: 4, elevation: 1,
  },
  zoneNameInput: { flex: 1, fontSize: 14, fontWeight: "600", color: "#111827" },
  shapeBadge:    { fontSize: 11, color: "#9ca3af", backgroundColor: "#f3f4f6", borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  iconBtn:       { padding: 4 },

  // Add button (at bottom of each section)
  addBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
    backgroundColor: "#fff", borderRadius: 12,
    paddingVertical: 13, borderWidth: 1.5, borderColor: "#e5e7eb", borderStyle: "dashed",
  },
  addBtnText: { fontSize: 14, fontWeight: "600", color: "#0891b2" },

  // Inspection step cards (unified blob + color)
  inspStepCard: {
    backgroundColor: "#fff",
    borderRadius: 14,
    borderLeftWidth: 4,
    shadowColor: "#000", shadowOpacity: 0.06, shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 }, elevation: 2,
    overflow: "hidden",
  },
  inspStepHeader: {
    flexDirection: "row", alignItems: "center",
    paddingLeft: 10, paddingRight: 10, paddingVertical: 14, gap: 10,
  },
  inspStepIcon: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: "#ecfeff",
    justifyContent: "center", alignItems: "center", flexShrink: 0,
  },
  inspStepText:   { flex: 1, minWidth: 0, gap: 1 },
  inspStepType:   { fontSize: 10, fontWeight: "700", letterSpacing: 0.5 },
  inspStepName:   { fontSize: 14, fontWeight: "600", color: "#111827" },
  inspStepDetail: { fontSize: 12, color: "#6b7280" },

  // Type picker icon (in bottom sheet)
  typePickerIcon: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: "#ecfeff",
    justifyContent: "center", alignItems: "center",
  },

  // Inspection config modal
  configRoot: { flex: 1, backgroundColor: "#f3f4f6" },
  configHeader: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 16, paddingVertical: 12,
    backgroundColor: "#fff",
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "#e5e7eb",
  },
  configTitle: { flex: 1, fontSize: 17, fontWeight: "700", color: "#111827" },
  configDoneBtn: {
    flexDirection: "row", alignItems: "center", gap: 5,
    backgroundColor: "#16a34a", borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6,
  },
  configDoneBtnText: { fontSize: 13, fontWeight: "700", color: "#fff" },
  configCard: {
    flexDirection: "row", alignItems: "center", gap: 10,
    backgroundColor: "#fff", borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 12,
    shadowColor: "#000", shadowOpacity: 0.04, shadowRadius: 4, elevation: 1,
  },
  configFieldLabel: { fontSize: 12, fontWeight: "600", color: "#6b7280", width: 60 },
  configNameInput: { flex: 1, fontSize: 14, color: "#111827" },
  colorEntryRow: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: "#f9fafb", borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 7,
    borderWidth: 1, borderColor: "#e5e7eb",
  },

  // Blob panel (used inside InspectionConfigModal)
  blobPanel: {
    padding: 14, gap: 10,
    backgroundColor: "#f9fafb",
    borderRadius: 12,
    shadowColor: "#000", shadowOpacity: 0.04, shadowRadius: 4, elevation: 1,
  },
  blobPanelTitle: { fontSize: 12, fontWeight: "700", color: "#374151", marginBottom: 2 },
  paramRow:   { flexDirection: "row", alignItems: "center", gap: 8 },
  paramLabel: { flex: 1, fontSize: 13, color: "#374151" },
  paramDesc:  { fontSize: 11, color: "#9ca3af", marginTop: 2, lineHeight: 15 },
  paramInput: {
    width: 80, borderWidth: 1, borderColor: "#d1d5db", borderRadius: 8,
    paddingHorizontal: 8, paddingVertical: 4, textAlign: "right",
    fontSize: 13, color: "#111827",
  },

  // Bottom sheet modals
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: "#fff", borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 20, paddingBottom: 36, gap: 4,
  },
  sheetTitle:     { fontSize: 16, fontWeight: "700", color: "#111827", marginBottom: 10 },
  sheetEmpty:     { fontSize: 13, color: "#9ca3af", textAlign: "center", padding: 20 },
  sheetRow: {
    flexDirection: "row", alignItems: "center", gap: 10, padding: 12, borderRadius: 10,
  },
  sheetRowActive: { backgroundColor: "#ecfeff" },
  sheetRowName:   { fontSize: 14, fontWeight: "600", color: "#111827" },
  sheetRowSub:    { fontSize: 11, color: "#9ca3af", marginTop: 1 },

  // Zone draw modal
  drawModalRoot: { flex: 1, backgroundColor: "#000" },
  drawToolbar: {
    position: "absolute", bottom: 0, left: 0, right: 0, zIndex: 10,
  },
  drawToolbarInner: {
    flexDirection: "row", alignItems: "center", gap: 8,
    paddingHorizontal: 12, paddingVertical: 10,
    backgroundColor: "rgba(0,0,0,0.6)",
  },
  drawCancelBtn: {
    paddingHorizontal: 12, paddingVertical: 7,
    backgroundColor: "rgba(255,255,255,0.15)", borderRadius: 8,
  },
  drawCancelText: { color: "#fff", fontSize: 13, fontWeight: "600" },
  drawShapeRow:   { flex: 1, flexDirection: "row", gap: 6, justifyContent: "center" },
  drawShapeChip: {
    paddingHorizontal: 12, paddingVertical: 7,
    backgroundColor: "rgba(255,255,255,0.15)", borderRadius: 8,
  },
  drawShapeChipActive: { backgroundColor: "#fff" },
  drawShapeText:       { fontSize: 13, fontWeight: "600", color: "#fff" },
  drawShapeTextActive: { color: "#0891b2" },
  drawFinishBtn: {
    paddingHorizontal: 12, paddingVertical: 7,
    backgroundColor: "#16a34a", borderRadius: 8,
  },
  drawFinishText: { color: "#fff", fontSize: 13, fontWeight: "700" },
  drawHint: {
    position: "absolute", top: 56, left: 0, right: 0, alignItems: "center",
  },
  drawHintText: {
    color: "rgba(255,255,255,0.65)", fontSize: 12,
    backgroundColor: "rgba(0,0,0,0.4)", paddingHorizontal: 12, paddingVertical: 5, borderRadius: 8,
  },
});
