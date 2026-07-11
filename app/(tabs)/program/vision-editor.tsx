import { SubPageHeader } from "@/src/components/ui/SubPageHeader";
import { DeleteIconButton } from "@/src/components/ui/DeleteIconButton";
import { VisionResults } from "@/src/components/ui/VisionResults";
import { FEED_HTML } from "@/src/vision/visionHtml";
import {
  ArucoInspection,
  BarcodeInspection,
  BlobInspection,
  CameraState,
  ColorCoverageInspection,
  LineInspection,
  PolygonInspection,
  VisionProgram,
  VisionResult,
  VisionZone,
  VisionZoneGeometry,
  defaultArucoInspection,
  defaultBarcodeInspection,
  defaultBlobParams,
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
  Animated,
  Keyboard,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { WebView } from "react-native-webview";
import { CameraPickerModal } from "@/src/components/ui/vision-editor/CameraPickerModal";
import { ZoneDrawModal } from "@/src/components/ui/vision-editor/ZoneDrawModal";
import { InspectionTypePicker, InspItem } from "@/src/components/ui/vision-editor/InspectionTypePicker";
import { InspectionConfigModal } from "@/src/components/ui/vision-editor/InspectionConfigModal";

// ── Main editor screen ─────────────────────────────────────────────────────────

export default function VisionEditorScreen() {
  const params         = useLocalSearchParams<{ program: string; runningIds?: string }>();
  const initialProg    = JSON.parse(params.program) as VisionProgram;
  const initialRunning = params.runningIds ? new Set<string>(JSON.parse(params.runningIds)) : new Set<string>();

  const [program, setProgram]     = useState<VisionProgram>(initialProg);
  const [name, setName]           = useState(initialProg.name);
  const [isRunning, setIsRunning]         = useState(initialRunning.has(initialProg.id));
  const [transitioning, setTransitioning] = useState<'starting' | 'stopping' | null>(null);
  const [saveStatus, setSaveStatus]       = useState<'idle' | 'saving' | 'saved'>('idle');

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

  const dirtySaveTimerRef     = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedFeedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isFirstRenderRef      = useRef(true);

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
      if (dirtySaveTimerRef.current) {
        clearTimeout(dirtySaveTimerRef.current);
        dirtySaveTimerRef.current = null;
        robotClient.saveVisionProgram({ ...programRef.current, name: nameRef.current }).catch(() => {});
      }
    });
  }, [navigation]);

  const feedWebViewRef           = useRef<any>(null);
  const feedSnapshotResolveRef   = useRef<((uri: string | null) => void) | null>(null);

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

  useEffect(() => {
    robotClient.getCameras().catch(() => {});
    return robotClient.onCameras(setCameras);
  }, []);

  // Poll structured inspection results while vision is running — shown as text
  // under the feed in the inspection config modal.
  const [visionResult, setVisionResult] = useState<VisionResult | null>(null);
  useEffect(() => {
    if (!isRunning || !program.id) { setVisionResult(null); return; }
    let cancelled = false;
    const poll = () => robotClient.getVisionResult(program.id)
      .then(r => { if (!cancelled) setVisionResult(r); })
      .catch(() => {});
    poll();
    const t = setInterval(poll, 1000);
    return () => { cancelled = true; clearInterval(t); };
  }, [isRunning, program.id]);

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
    setProgram(prev => ({ ...prev, colorInspections: (prev.colorInspections ?? []).map(i => i.id === updated.id ? updated : i) }));
  }
  function deleteColorInspection(id: string) {
    setProgram(prev => ({ ...prev, colorInspections: (prev.colorInspections ?? []).filter(i => i.id !== id) }));
  }

  function updatePolygonInspection(updated: PolygonInspection) {
    setProgram(prev => ({ ...prev, polygonInspections: (prev.polygonInspections ?? []).map(i => i.id === updated.id ? updated : i) }));
  }
  function deletePolygonInspection(id: string) {
    setProgram(prev => ({ ...prev, polygonInspections: (prev.polygonInspections ?? []).filter(i => i.id !== id) }));
  }

  function updateArucoInspection(updated: ArucoInspection) {
    setProgram(prev => ({ ...prev, arucoInspections: (prev.arucoInspections ?? []).map(i => i.id === updated.id ? updated : i) }));
  }
  function deleteArucoInspection(id: string) {
    setProgram(prev => ({ ...prev, arucoInspections: (prev.arucoInspections ?? []).filter(i => i.id !== id) }));
  }

  function updateLineInspection(updated: LineInspection) {
    setProgram(prev => ({ ...prev, lineInspections: (prev.lineInspections ?? []).map(i => i.id === updated.id ? updated : i) }));
  }
  function deleteLineInspection(id: string) {
    setProgram(prev => ({ ...prev, lineInspections: (prev.lineInspections ?? []).filter(i => i.id !== id) }));
  }

  function updateBarcodeInspection(updated: BarcodeInspection) {
    setProgram(prev => ({ ...prev, barcodeInspections: (prev.barcodeInspections ?? []).map(i => i.id === updated.id ? updated : i) }));
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
  function handleLineLiveUpdate(insp: LineInspection)       { updateLineInspection(insp); }

  const allInspections: InspItem[] = [
    ...program.inspections.map(insp => ({ kind: 'blob' as const, insp })),
    ...(program.colorInspections ?? []).map(insp => ({ kind: 'color' as const, insp })),
    ...(program.polygonInspections ?? []).map(insp => ({ kind: 'polygon' as const, insp })),
    ...(program.arucoInspections ?? []).map(insp => ({ kind: 'aruco' as const, insp })),
    ...(program.lineInspections ?? []).map(insp => ({ kind: 'line' as const, insp })),
    ...(program.barcodeInspections ?? []).map(insp => ({ kind: 'barcode' as const, insp })),
  ];

  async function toggleRunning() {
    if (transitioning) return;
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
      setTransitioning('stopping');
      try {
        await robotClient.stopVision(id).catch(() => {});
      } finally {
        setTransitioning(null);
      }
      setIsRunning(false);
    } else {
      setTransitioning('starting');
      try {
        await robotClient.startVision(id).catch(() => {});
      } finally {
        setTransitioning(null);
      }
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

        {/* Camera feed */}
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
        <Animated.View style={{ opacity: transitioning ? pulseAnim : 1 }}>
          <TouchableOpacity
            style={[styles.runBtn, isRunning ? styles.runBtnStop : styles.runBtnStart]}
            onPress={toggleRunning}
            activeOpacity={0.8}
            disabled={!!transitioning}
          >
            {transitioning
              ? <ActivityIndicator size="small" color="#fff" />
              : isRunning
                ? <EyeOff size={16} color="#fff" />
                : <Eye size={16} color="#fff" />
            }
            <Text style={styles.runBtnText}>
              {transitioning === 'starting' ? "Starting..."
                : transitioning === 'stopping' ? "Stopping..."
                : isRunning ? "Stop Vision"
                : "Start Vision"}
            </Text>
          </TouchableOpacity>
        </Animated.View>

        {/* ── Results ────────────────────────────────────────────────────────── */}
        {isRunning && visionResult && (
          <>
            <Text style={styles.sectionLabel}>RESULTS</Text>
            <VisionResults result={visionResult} />
          </>
        )}

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
            <DeleteIconButton
              size={14}
              style={styles.iconBtn}
              onPress={() => Alert.alert('Delete Zone', `Delete "${zone.name}"?`, [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Delete', style: 'destructive', onPress: () => deleteZone(zone.id) },
              ])}
            />
          </View>
        ))}

        <TouchableOpacity style={styles.addBtn} onPress={() => openZoneModal()} activeOpacity={0.75}>
          <Plus size={15} color="#0891b2" />
          <Text style={styles.addBtnText}>Add Zone</Text>
        </TouchableOpacity>

        {/* ── Inspections ──────────────────────────────────────────────────── */}
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
                <DeleteIconButton
                  size={15}
                  style={styles.iconBtn}
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
                />
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
        feedUrl={feedSourceUrl}
        isRunning={isRunning}
        transitioning={transitioning}
        onToggleRunning={toggleRunning}
        visionResult={visionResult}
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

  saveStatusRow:  { flexDirection: "row", alignItems: "center", gap: 5 },
  saveStatusText: { fontSize: 13, color: "#6b7280" },

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

  feedCard: {
    backgroundColor: "#111", borderRadius: 12, overflow: "hidden",
    height: 220,
    shadowColor: "#000", shadowOpacity: 0.1, shadowRadius: 6, elevation: 3,
  },
  feedPlaceholder:     { ...StyleSheet.absoluteFillObject, justifyContent: "center", alignItems: "center" },
  feedPlaceholderText: { color: "#6b7280", fontSize: 13 },

  runBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    borderRadius: 12, paddingVertical: 13,
    shadowColor: "#000", shadowOpacity: 0.08, shadowRadius: 6, elevation: 2,
  },
  runBtnStart: { backgroundColor: "#0891b2" },
  runBtnStop:  { backgroundColor: "#dc2626" },
  runBtnText:  { color: "#fff", fontSize: 14, fontWeight: "700" },

  sectionLabel: { fontSize: 11, fontWeight: "700", color: "#6b7280", letterSpacing: 0.8, marginBottom: 2 },

  emptyCard: {
    backgroundColor: "#fff", borderRadius: 12, padding: 16, alignItems: "center",
    shadowColor: "#000", shadowOpacity: 0.03, shadowRadius: 3, elevation: 1,
  },
  emptyText: { fontSize: 13, color: "#9ca3af", textAlign: "center" },

  zoneCard: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: "#fff", borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 11,
    shadowColor: "#000", shadowOpacity: 0.04, shadowRadius: 4, elevation: 1,
  },
  zoneNameInput: { flex: 1, fontSize: 14, fontWeight: "600", color: "#111827" },
  shapeBadge:    { fontSize: 11, color: "#9ca3af", backgroundColor: "#f3f4f6", borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  iconBtn:       { padding: 4 },

  addBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
    backgroundColor: "#fff", borderRadius: 12,
    paddingVertical: 13, borderWidth: 1.5, borderColor: "#e5e7eb", borderStyle: "dashed",
  },
  addBtnText: { fontSize: 14, fontWeight: "600", color: "#0891b2" },

  inspStepCard: {
    backgroundColor: "#fff", borderRadius: 14, borderLeftWidth: 4,
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
});
