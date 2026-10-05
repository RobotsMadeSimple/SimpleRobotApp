import { DeleteIconButton } from "@/src/components/ui/DeleteIconButton";
import { VisionResults } from "@/src/components/ui/VisionResults";
import { VisionFeedViewer } from "@/src/components/vision/VisionFeedViewer";
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
  VisionZoneGrid,
  defaultArucoInspection,
  defaultBarcodeInspection,
  defaultBlobParams,
  defaultColorCoverageInspection,
  defaultLineInspection,
  defaultPolygonInspection,
  } from "@/src/models/robotModels";
import { robotClient } from "@/src/services/RobotConnectService";
import { useLocalSearchParams,
  useNavigation } from "expo-router";
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
import { useCallback,
  useEffect,
  useMemo,
  useRef,
  useState } from "react";
import {
  ActivityIndicator,
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
import { appAlert } from "@/src/components/ui/AppAlert";
import { accents, colors, spacing, radii, shadows, InfoTip, PageHeader, StatusPill } from "@/src/components/ui/kit";
import { wide, usePaneLayout, useWideContent } from "@/src/components/ui/responsive";
import { DragHandle } from "@/src/components/ui/builder/StepRow";
import { CameraPickerModal } from "@/src/components/ui/vision-editor/CameraPickerModal";
import { CameraCalibrationBadge } from "@/src/components/ui/calibration/CameraCalibrationControls";
import { ZoneDrawModal } from "@/src/components/ui/vision-editor/ZoneDrawModal";
import { InspectionTypePicker, InspItem } from "@/src/components/ui/vision-editor/InspectionTypePicker";
import { InspectionConfigModal } from "@/src/components/ui/vision-editor/InspectionConfigModal";

// ── Main editor screen ─────────────────────────────────────────────────────────

export default function VisionEditorScreen() {
  const params         = useLocalSearchParams<{ program: string; runningIds?: string }>();
  const initialProg    = JSON.parse(params.program) as VisionProgram;
  const initialRunning = params.runningIds ? new Set<string>(JSON.parse(params.runningIds)) : new Set<string>();

  const paneLayout = usePaneLayout();
  const isWide  = paneLayout !== "single";
  const isSplit = paneLayout === "split";
  const wideContent = useWideContent();
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
  const [hiddenZoneIds, setHiddenZoneIds] = useState<Set<string>>(new Set());

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

  // The zones the feed should draw: every declared zone (so it shows whether or not an
  // inspection uses it) minus any the user has hidden via its per-zone eye toggle. The
  // shared VisionFeedViewer pushes these into the preview.
  const visibleZones = useMemo(
    () => program.zones.filter(z => !hiddenZoneIds.has(z.id)),
    [program.zones, hiddenZoneIds],
  );

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
    // Zone editing wants the raw camera frame — never the annotated/debug feed shown
    // while the program runs, and never the preview canvas (which now carries the zone
    // overlay). A fresh HTTP snapshot from the camera is that raw source.
    const url = program.cameraId ? robotClient.cameraSnapshotUrl(program.cameraId) : null;
    if (url) {
      try {
        const res  = await fetch(url + (url.includes('?') ? '&' : '?') + '_=' + Date.now());
        const blob = await res.blob();
        const ok = await new Promise<boolean>(resolve => {
          const reader = new FileReader();
          reader.onload  = () => { setSnapshotUri(reader.result as string); resolve(true); };
          reader.onerror = () => resolve(false);
          reader.readAsDataURL(blob);
        });
        if (ok) return;
      } catch { /* fall through to the preview grab */ }
    }
    // Fallback only if the raw snapshot is unavailable.
    setSnapshotUri(await grabFeedSnapshot());
  }, [program.cameraId, grabFeedSnapshot]);

  // Seeds the draw modal so an existing zone can be adjusted instead of redrawn.
  // Held steady while the modal is open — program.zones only changes on save, which
  // closes it, so the canvas is never reloaded out from under an in-progress edit.
  const editingZone = useMemo(
    () => (editingZoneId ? program.zones.find(z => z.id === editingZoneId) ?? null : null),
    [editingZoneId, program.zones]
  );

  function openZoneModal(editId?: string) {
    setEditingZoneId(editId ?? null);
    setZoneModalOpen(true);
    fetchSnapshot();
  }

  // Geometry and grid are edited together in the modal, so they come back together — a
  // lattice only means anything against the shape it was laid over.
  function onZoneDrawDone(geometry: VisionZoneGeometry, grid: VisionZoneGrid | undefined) {
    setZoneModalOpen(false);
    let updated: VisionProgram;
    if (editingZoneId) {
      updated = {
        ...program, name,
        zones: program.zones.map(z => z.id === editingZoneId ? { ...z, geometry, grid } : z),
      };
    } else {
      const newZone: VisionZone = {
        id: `zone_${Date.now()}`,
        name: `Zone ${program.zones.length + 1}`,
        geometry,
        grid,
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

  const allInspectionsRaw: InspItem[] = [
    ...program.inspections.map(insp => ({ kind: 'blob' as const, insp })),
    ...(program.colorInspections ?? []).map(insp => ({ kind: 'color' as const, insp })),
    ...(program.polygonInspections ?? []).map(insp => ({ kind: 'polygon' as const, insp })),
    ...(program.arucoInspections ?? []).map(insp => ({ kind: 'aruco' as const, insp })),
    ...(program.lineInspections ?? []).map(insp => ({ kind: 'line' as const, insp })),
    ...(program.barcodeInspections ?? []).map(insp => ({ kind: 'barcode' as const, insp })),
  ];
  // Apply the user's drag order. Stable sort: ids missing from inspectionOrder (a
  // freshly added inspection) keep their type-grouped position at the end.
  const inspOrder = program.inspectionOrder ?? [];
  const inspOrderRank = (id: string) => {
    const i = inspOrder.indexOf(id);
    return i === -1 ? Number.MAX_SAFE_INTEGER : i;
  };
  const allInspections: InspItem[] =
    [...allInspectionsRaw].sort((a, b) => inspOrderRank(a.insp.id) - inspOrderRank(b.insp.id));

  // Whether the current frame carries a result for a given inspection — gates the on-card
  // result strip so it doesn't show as an empty bordered sliver before results land.
  const inspHasResult = (id: string) => !!visionResult && (
    (visionResult.inspections     ?? []).some(i => i.inspectionId === id) ||
    (visionResult.colorResults    ?? []).some(c => c.inspectionId === id) ||
    (visionResult.polygonResults  ?? []).some(p => p.inspectionId === id) ||
    (visionResult.arucoResults    ?? []).some(a => a.inspectionId === id) ||
    (visionResult.lineResults     ?? []).some(l => l.inspectionId === id) ||
    (visionResult.barcodeResults  ?? []).some(b => b.inspectionId === id)
  );

  // ── Drag-to-reorder (zones + inspections) ──────────────────────────────────
  // Mirrors the program builder's step drag: a grip handle drives a PanResponder,
  // the drop index is worked out from measured row heights, and the parent ScrollView
  // is frozen while dragging. Reorder lands on release.
  type DragList = 'zone' | 'insp';
  type DragState = { list: DragList; id: string; fromIndex: number; toIndex: number };
  const [drag, setDrag] = useState<DragState | null>(null);
  const dragRef    = useRef<DragState | null>(null);
  const rowHeights = useRef<Map<string, number>>(new Map());
  const onRowLayout = useCallback((id: string, h: number) => { rowHeights.current.set(id, h); }, []);

  const idsForList = (list: DragList) =>
    list === 'zone' ? program.zones.map(z => z.id) : allInspections.map(i => i.insp.id);

  function calcDropIndex(list: DragList, fromIndex: number, dy: number): number {
    const ids = idsForList(list);
    if (fromIndex < 0 || ids.length < 2) return Math.max(0, Math.min(ids.length - 1, fromIndex));
    const DEFAULT_H = 60;
    let target = fromIndex, acc = 0;
    if (dy > 0) {
      for (let i = fromIndex + 1; i < ids.length; i++) {
        const h = rowHeights.current.get(ids[i]) ?? DEFAULT_H;
        if (dy > acc + h / 2) { target = i; acc += h; } else break;
      }
    } else {
      for (let i = fromIndex - 1; i >= 0; i--) {
        const h = rowHeights.current.get(ids[i]) ?? DEFAULT_H;
        if (-dy > acc + h / 2) { target = i; acc += h; } else break;
      }
    }
    return target;
  }

  function onDragStart(list: DragList, id: string) {
    const s: DragState = { list, id, fromIndex: idsForList(list).indexOf(id), toIndex: idsForList(list).indexOf(id) };
    dragRef.current = s; setDrag(s);
  }
  function onDragMove(list: DragList, id: string, dy: number) {
    const d = dragRef.current;
    if (!d || d.id !== id) return;
    const to = calcDropIndex(list, d.fromIndex, dy);
    if (to !== d.toIndex) { const u = { ...d, toIndex: to }; dragRef.current = u; setDrag(u); }
  }
  function onDragEnd(list: DragList, id: string) {
    const d = dragRef.current;
    if (d && d.id === id && d.toIndex !== d.fromIndex) {
      if (list === 'zone') {
        setProgram(prev => {
          const zones = [...prev.zones];
          const [m] = zones.splice(d.fromIndex, 1);
          zones.splice(d.toIndex, 0, m);
          return { ...prev, zones };
        });
      } else {
        const ids = allInspections.map(i => i.insp.id);
        const [m] = ids.splice(d.fromIndex, 1);
        ids.splice(d.toIndex, 0, m);
        setProgram(prev => ({ ...prev, inspectionOrder: ids }));
      }
    }
    dragRef.current = null; setDrag(null);
  }

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
  // On wide screens the feed sizes to the pane width at the camera's own aspect ratio
  // (default 4:3) so it's as large as the pane allows, rather than a short fixed strip.
  const feedAspect = selectedCam?.width && selectedCam?.height
    ? selectedCam.width / selectedCam.height
    : 4 / 3;

  // ── Shared render fragments (used by both narrow and wide layouts) ─────────

  // Program name + camera as one card. It lives in the same column as zones/inspections
  // (the editor column in wide mode), kept separate from the feed and its controls.
  const detailsCard = (
    <View style={styles.detailsCard}>
      <View style={styles.detailsRow}>
        <Text style={styles.rowLabel}>Name</Text>
        <TextInput
          style={styles.nameInput}
          value={name}
          onChangeText={setName}
          placeholder="Program name"
          placeholderTextColor={colors.textFaint}
          returnKeyType="done"
          onSubmitEditing={Keyboard.dismiss}
        />
      </View>
      <View style={styles.detailsDivider} />
      <TouchableOpacity style={styles.detailsRow} onPress={() => setCamPickerOpen(true)} activeOpacity={0.75}>
        <Text style={styles.rowLabel}>Camera</Text>
        <View style={[styles.dot, { backgroundColor: selectedCam?.connected ? colors.success : colors.borderStrong }]} />
        <Text style={styles.cameraValue} numberOfLines={1}>
          {selectedCam ? (selectedCam.name || selectedCam.id) : (program.cameraId || "Tap to select")}
        </Text>
        {!!program.cameraId && (
          <CameraCalibrationBadge cameraId={program.cameraId} calibrated={selectedCam?.calibrated} />
        )}
        <ChevronDown size={15} color={colors.textFaint} />
      </TouchableOpacity>
    </View>
  );

  const infoSection = (
    <>
      {/* Camera feed */}
      <VisionFeedViewer
        ref={feedWebViewRef}
        feedUrl={feedSourceUrl}
        zones={visibleZones}
        isWide={isWide}
        aspect={feedAspect}
        pointerEvents="none"
        onMessage={onFeedMessage}
        placeholder={program.cameraId ? "Connecting to camera…" : "Select a camera above"}
      />

      {/* Run / Stop */}
      <Animated.View style={{ opacity: transitioning ? pulseAnim : 1 }}>
        <TouchableOpacity
          style={[styles.runBtn, isRunning ? styles.runBtnStop : styles.runBtnStart]}
          onPress={toggleRunning}
          activeOpacity={0.8}
          disabled={!!transitioning}
        >
          {transitioning
            ? <ActivityIndicator size="small" color={colors.onAccent} />
            : isRunning
              ? <EyeOff size={16} color={colors.onAccent} />
              : <Eye size={16} color={colors.onAccent} />
          }
          <Text style={styles.runBtnText}>
            {transitioning === 'starting' ? "Starting..."
              : transitioning === 'stopping' ? "Stopping..."
              : isRunning ? "Stop Vision"
              : "Start Vision"}
          </Text>
        </TouchableOpacity>
      </Animated.View>
      {/* Per-inspection results now render on each inspection card below (see editorSection),
          so there's no separate aggregate results block here. */}
    </>
  );

  const editorSection = (
    <>
      {/* ── Zones ──────────────────────────────────────────────────────────── */}
      <View style={styles.sectionLabelRow}>
        <Text style={styles.sectionLabel}>ZONES</Text>
        <Text style={styles.sectionCount}>{program.zones.length}</Text>
        <View style={{ flex: 1 }} />
        <InfoTip text="A zone is a shape drawn over the camera image — rectangle, circle, polygon or grid. Inspections only look inside the zone they are attached to." />
      </View>

      {program.zones.length === 0 && (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyText}>No zones defined — add one to restrict where blobs are counted</Text>
        </View>
      )}

      {program.zones.map((zone, index) => {
        const isDragged = drag?.list === 'zone' && drag.id === zone.id;
        const dropAbove = !!(drag && drag.list === 'zone' && drag.id !== zone.id && drag.toIndex === index && drag.toIndex < drag.fromIndex);
        const dropBelow = !!(drag && drag.list === 'zone' && drag.id !== zone.id && drag.toIndex === index && drag.toIndex > drag.fromIndex);
        return (
        <View
          key={zone.id}
          onLayout={e => onRowLayout(zone.id, e.nativeEvent.layout.height)}
          style={[styles.noSelect, isDragged && styles.dragDim, dropAbove && styles.dropAbove, dropBelow && styles.dropBelow]}
        >
          <View style={styles.zoneCard}>
          <View style={styles.zoneCardRow}>
            <DragHandle
              stepId={zone.id}
              onStart={id => onDragStart('zone', id)}
              onMove={(id, dy) => onDragMove('zone', id, dy)}
              onEnd={id => onDragEnd('zone', id)}
            />
            {/* Cyan zone-marker dot: no kit token for this hue, kept as-is (see report). */}
            <View style={[styles.dot, { backgroundColor: "#22d3ee" }]} />
            <TextInput
              style={styles.zoneNameInput}
              value={zone.name}
              onChangeText={t => updateZone({ ...zone, name: t })}
            />
            <Text style={styles.shapeBadge}>
              {zone.grid && zone.grid.rows * zone.grid.cols > 1 ? 'Grid' : zone.geometry.shape}
            </Text>
            <TouchableOpacity
              onPress={() => setHiddenZoneIds(prev => {
                const next = new Set(prev);
                if (next.has(zone.id)) next.delete(zone.id); else next.add(zone.id);
                return next;
              })}
              style={styles.iconBtn}
              activeOpacity={1}
              hitSlop={8}
            >
              {/* Muted grey when hidden, cyan when shown. */}
              {hiddenZoneIds.has(zone.id)
                ? <EyeOff size={14} color={colors.textFaint} />
                : <Eye size={14} color={accents.cyan} />}
            </TouchableOpacity>
            <TouchableOpacity onPress={() => openZoneModal(zone.id)} style={styles.iconBtn} hitSlop={8}>
              <Pencil size={14} color={colors.textMuted} />
            </TouchableOpacity>
            <DeleteIconButton
              size={14}
              style={styles.iconBtn}
              onPress={() => appAlert('Delete Zone', `Delete "${zone.name}"?`, [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Delete', style: 'destructive', onPress: () => deleteZone(zone.id) },
              ])}
            />
          </View>
          </View>
        </View>
        );
      })}

      <TouchableOpacity style={styles.addBtn} onPress={() => openZoneModal()} activeOpacity={0.75}>
        <Plus size={15} color={accents.cyan} />
        <Text style={styles.addBtnText}>Add Zone</Text>
      </TouchableOpacity>
      {/* Zone/inspection domain accents: cyan and violet map to accents.cyan/accents.purple;
          fuchsia (#d946ef) has no matching kit token and stays literal, see report. */}

      {/* ── Inspections ──────────────────────────────────────────────────── */}
      <View style={[styles.sectionLabelRow, { marginTop: 8 }]}>
        <Text style={styles.sectionLabel}>INSPECTIONS</Text>
        <Text style={styles.sectionCount}>{program.inspections.length}</Text>
        <View style={{ flex: 1 }} />
        <InfoTip text="An inspection is one measurement — blob count, colour coverage, a barcode, an ArUco tag, a line or a polygon match. Its result is what a Run Vision step reads back into program variables." />
      </View>

      {allInspections.length === 0 && (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyText}>No inspections — add one to detect blobs or measure colors</Text>
        </View>
      )}

      {allInspections.map((item, index) => {
        const { kind, insp } = item;
        const linkedZone = program.zones.find(z => z.id === insp.zoneId);
        // Per-kind identity colors: polygon/aruco/barcode/blob/line happen to match kit
        // status/accent tokens exactly, so those are tokenized; color-coverage's fuchsia
        // has no kit equivalent hue and stays literal (see report).
        const accent     = kind === 'blob' ? accents.cyan : kind === 'polygon' ? colors.warning : kind === 'aruco' ? colors.success : kind === 'line' ? accents.purple : kind === 'barcode' ? colors.accent : '#d946ef';
        const iconBg     = kind === 'blob' ? accents.cyanSoft : kind === 'polygon' ? '#fef3c7' : kind === 'aruco' ? colors.successSoft : kind === 'line' ? accents.purpleSoft : kind === 'barcode' ? colors.accentSoft : '#fdf4ff';
        const typeLabel  = kind === 'blob' ? 'BLOB DETECTION' : kind === 'polygon' ? 'POLYGON DETECTION' : kind === 'aruco' ? 'ARUCO MARKER' : kind === 'line' ? 'LINE DETECTION' : kind === 'barcode' ? 'BARCODE / QR CODE' : 'COLOR COVERAGE';
        const isDragged = drag?.list === 'insp' && drag.id === insp.id;
        const dropAbove = !!(drag && drag.list === 'insp' && drag.id !== insp.id && drag.toIndex === index && drag.toIndex < drag.fromIndex);
        const dropBelow = !!(drag && drag.list === 'insp' && drag.id !== insp.id && drag.toIndex === index && drag.toIndex > drag.fromIndex);
        return (
          <View
            key={insp.id}
            onLayout={e => onRowLayout(insp.id, e.nativeEvent.layout.height)}
            style={[styles.noSelect, isDragged && styles.dragDim, dropAbove && styles.dropAbove, dropBelow && styles.dropBelow]}
          >
          <View style={[styles.inspStepCard, { borderLeftColor: accent }]}>
            <View style={styles.inspStepHeader}>
              <DragHandle
                stepId={insp.id}
                onStart={id => onDragStart('insp', id)}
                onMove={(id, dy) => onDragMove('insp', id, dy)}
                onEnd={id => onDragEnd('insp', id)}
              />
              {/* Only the icon + text opens the inspection. The switch and action buttons
                  are siblings, so a click on them doesn't also open it (on web the press
                  would otherwise bubble up to a wrapping touchable). */}
              <TouchableOpacity
                style={styles.inspTapArea}
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
              </TouchableOpacity>
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
                <Copy size={15} color={colors.textMuted} />
              </TouchableOpacity>
              <DeleteIconButton
                size={15}
                style={styles.iconBtn}
                onPress={() => appAlert('Delete Inspection', `Delete "${insp.name}"?`, [
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
            </View>
            {isRunning && inspHasResult(insp.id) && (
              <TouchableOpacity
                style={styles.inspResult}
                onPress={() => setConfigModal(item)}
                activeOpacity={0.75}
              >
                <VisionResults
                  result={visionResult}
                  only={insp.id}
                  colorInspections={program.colorInspections ?? []}
                  embedded
                />
              </TouchableOpacity>
            )}
          </View>
          </View>
        );
      })}

      <TouchableOpacity style={styles.addBtn} onPress={() => setTypePicker(true)} activeOpacity={0.75}>
        <Plus size={15} color={accents.purple} />
        <Text style={[styles.addBtnText, { color: accents.purple }]}>Add Inspection</Text>
      </TouchableOpacity>

      <View style={{ height: 40 }} />
    </>
  );

  return (
    <View style={styles.root}>
      {/* Hidden while an inspection is being edited — the inspection config
          renders as a full-screen subpage in its place. */}
      {configModal === null && (
      <>
      <PageHeader
        title={name || "Vision Program"}
        subtitle={`${program.zones.length} zone${program.zones.length !== 1 ? "s" : ""} · ${program.inspections.length} inspection${program.inspections.length !== 1 ? "s" : ""}${selectedCam ? ` · ${selectedCam.name || selectedCam.id}` : ""}${isRunning ? " · live" : ""}`}
        crumbs={[
          { label: "Program", href: "/program" },
          { label: "Vision", href: "/(tabs)/program/vision" },
          { label: name || "Vision Program" },
        ]}
        backTo="/(tabs)/program/vision"
        right={
          saveStatus === 'saving' ? (
            <View style={styles.saveStatusRow}>
              <ActivityIndicator size="small" color={colors.textMuted} />
              <Text style={styles.saveStatusText}>Saving…</Text>
            </View>
          ) : saveStatus === 'saved' ? (
            <View style={styles.saveStatusRow}>
              <Check size={14} color={colors.success} />
              <Text style={[styles.saveStatusText, { color: colors.success }]}>Saved</Text>
            </View>
          ) : (
            <StatusPill
              label={isRunning ? "Live" : "Stopped"}
              tone={isRunning ? "success" : "neutral"}
              dot
            />
          )
        }
      />

      {isWide ? (
        /* ── Wide layout: zones/inspections left, vision info + feed on the right ── */
        <View style={styles.wideRow}>
          <ScrollView
            style={styles.widePaneRight}
            contentContainerStyle={[styles.content, styles.wideEditorContent]}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            showsVerticalScrollIndicator={false}
            scrollEnabled={drag === null}
          >
            {detailsCard}
            {editorSection}
          </ScrollView>
          <ScrollView
            style={[styles.widePaneLeft, isSplit && wide.paneSplit]}
            contentContainerStyle={styles.widePaneLeftContent}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            showsVerticalScrollIndicator={false}
          >
            {infoSection}
          </ScrollView>
        </View>
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[styles.content, wideContent]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
          scrollEnabled={drag === null}
        >
          {detailsCard}
          {infoSection}
          {editorSection}
        </ScrollView>
      )}
      </>
      )}

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
        initialGeometry={editingZone?.geometry ?? null}
        initialGrid={editingZone?.grid ?? null}
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

// The zone's grid is edited in the draw modal now (via the Grid shape), so there is no
// separate per-zone grid toggle here anymore — a gridded zone simply reads as "Grid".

// ── Styles ─────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root:    { flex: 1, backgroundColor: colors.background },
  // Keep drag targets from turning into text selections mid-drag on web.
  noSelect: { userSelect: "none" },
  scroll:  { flex: 1 },
  content: { padding: spacing.lg, gap: spacing.sm },

  // ── Wide (desktop) two-pane layout ────────────────────────────────────────
  wideRow: {
    flex: 1, flexDirection: "row",
    width: "100%",
  },
  // The camera/feed pane. A proportion of the (uncapped) row width so the viewer grows
  // with the screen, bounded so it stays sensible on very wide and very narrow desktops.
  // In "split" mode wide.paneSplit overrides this to an even 50/50.
  widePaneLeft: {
    width: "46%", minWidth: 420, maxWidth: 820, flexGrow: 0, flexShrink: 0,
    borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: colors.border,
  },
  widePaneLeftContent: { paddingHorizontal: 20, paddingTop: 18, paddingBottom: spacing.xxl, gap: spacing.sm },
  widePaneRight: { flex: 1 },
  wideEditorContent: { width: "100%", maxWidth: 720, alignSelf: "center" },

  saveStatusRow:  { flexDirection: "row", alignItems: "center", gap: 5 },
  saveStatusText: { fontSize: 13, color: colors.textMuted },

  card: {
    flexDirection: "row", alignItems: "center", gap: 10,
    backgroundColor: colors.surface, borderRadius: radii.md,
    paddingHorizontal: 14, paddingVertical: spacing.md,
    ...shadows.soft,
  },
  rowLabel:    { fontSize: 12, fontWeight: "600", color: colors.textMuted, width: 60 },
  nameInput:   { flex: 1, fontSize: 14, color: colors.text },
  cameraValue: { flex: 1, fontSize: 14, color: colors.text },
  dot:         { width: 8, height: 8, borderRadius: 4 },

  runBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm,
    borderRadius: radii.md, paddingVertical: 13,
    ...shadows.soft,
  },
  // Cyan/red identity colors for the vision run state.
  runBtnStart: { backgroundColor: accents.cyan },
  runBtnStop:  { backgroundColor: colors.danger },
  runBtnText:  { color: colors.onAccent, fontSize: 14, fontWeight: "700" },

  sectionLabel: { fontSize: 11, fontWeight: "700", color: colors.textMuted, letterSpacing: 0.8, marginBottom: 2 },
  sectionLabelRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  sectionCount: {
    fontSize: 11, fontWeight: "700", color: colors.textFaint,
    backgroundColor: colors.surface, borderRadius: radii.pill,
    paddingHorizontal: spacing.sm, paddingVertical: 1, marginBottom: 2,
  },

  emptyCard: {
    backgroundColor: colors.surface, borderRadius: radii.md, padding: spacing.lg, alignItems: "center",
    ...shadows.soft,
  },
  emptyText: { fontSize: 13, color: colors.textFaint, textAlign: "center" },

  zoneCard: {
    backgroundColor: colors.surface, borderRadius: radii.md,
    paddingHorizontal: 14, paddingVertical: 11,
    ...shadows.soft,
  },
  zoneCardRow:   { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  zoneNameInput: { flex: 1, fontSize: 14, fontWeight: "600", color: colors.text, userSelect: "text" },

  // Program details card (name + camera).
  detailsCard: {
    backgroundColor: colors.surface, borderRadius: radii.md, overflow: "hidden",
    ...shadows.soft,
  },
  detailsRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 14, paddingVertical: spacing.md },
  // Slightly lighter than colors.border by design — no exact kit token, kept literal (see report).
  detailsDivider: { height: StyleSheet.hairlineWidth, backgroundColor: "#eef0f2" },

  // Drag-to-reorder feedback (zones + inspections). Applied to a non-elevated OUTER
  // wrapper, never the elevated card itself — Android renders a View blank when opacity
  // < 1 is set on the same view that has elevation.
  dragDim:    { opacity: 0.35 },
  dropAbove:  { borderTopWidth: 2.5, borderTopColor: accents.cyan, borderTopLeftRadius: radii.md, borderTopRightRadius: radii.md },
  dropBelow:  { borderBottomWidth: 2.5, borderBottomColor: accents.cyan, borderBottomLeftRadius: radii.md, borderBottomRightRadius: radii.md },

  shapeBadge:    { fontSize: 11, color: colors.textFaint, backgroundColor: colors.background, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  iconBtn:       { padding: spacing.xs },

  addBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
    backgroundColor: colors.surface, borderRadius: radii.md,
    paddingVertical: 13, borderWidth: 1.5, borderColor: colors.border, borderStyle: "dashed",
  },
  addBtnText: { fontSize: 14, fontWeight: "600", color: accents.cyan },

  inspStepCard: {
    backgroundColor: colors.surface, borderRadius: radii.lg, borderLeftWidth: 4,
    ...shadows.soft,
    overflow: "hidden",
  },
  inspStepHeader: {
    flexDirection: "row", alignItems: "center",
    paddingLeft: 10, paddingRight: 10, paddingVertical: 14, gap: 10,
  },
  // The tappable region (icon + text) inside the header; siblings (switch, buttons)
  // stay outside it so their clicks don't open the inspection.
  inspTapArea: { flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: 10 },
  inspStepIcon: {
    width: 36, height: 36, borderRadius: 10,
    // Default fallback fill (kind-specific iconBg is applied inline per row).
    backgroundColor: accents.cyanSoft,
    justifyContent: "center", alignItems: "center", flexShrink: 0,
  },
  inspStepText:   { flex: 1, minWidth: 0, gap: 1 },
  inspStepType:   { fontSize: 10, fontWeight: "700", letterSpacing: 0.5 },
  inspStepName:   { fontSize: 14, fontWeight: "600", color: colors.text },
  inspStepDetail: { fontSize: 12, color: colors.textMuted },
  // Live result strip at the foot of an inspection card (while vision is running).
  inspResult: {
    paddingHorizontal: 14, paddingBottom: spacing.sm,
  },
});
