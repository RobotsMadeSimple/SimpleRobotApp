import { DeleteIconButton } from "@/src/components/ui/DeleteIconButton";
import { StatusChip, VisionResults, summarizeResult } from "@/src/components/ui/VisionResults";
import { VisionFeedViewer } from "@/src/components/vision/VisionFeedViewer";
import { CameraState } from "@/src/models/robotModels";
import {
  TOOL_META, dependentsOf, fixtureDepth, layerOrderProblems, newLayer, newTool, newVisionId,
  normalizeVisionProgram, orderProblems,
  type ImageLayer, type Pose, type Region, type VisionProgram, type VisionResult, type VisionTool, type VisionToolType,
} from "@/src/models/visionTools";
import { robotClient } from "@/src/services/RobotConnectService";
import { useLocalSearchParams, useNavigation } from "expo-router";
import { AlertTriangle, ArrowDown, ArrowUp, Check, ChevronDown, ChevronRight, Copy, Layers, Plus } from "lucide-react-native";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator, Image, Keyboard, ScrollView, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View,
} from "react-native";
import { appAlert } from "@/src/components/ui/AppAlert";
import { accents, colors, spacing, radii, shadows, InfoTip, PageHeader, StatusPill } from "@/src/components/ui/kit";
import { wide, usePaneLayout, useWideContent } from "@/src/components/ui/responsive";
import { DragHandle } from "@/src/components/ui/builder/StepRow";
import { CameraPickerModal } from "@/src/components/ui/vision-editor/CameraPickerModal";
import { CameraCalibrationBadge } from "@/src/components/ui/calibration/CameraCalibrationControls";
import { ToolTile, ToolTypePicker, CATEGORY_TINT } from "@/src/components/ui/vision-editor/ToolPickers";
import { ToolConfigPage } from "@/src/components/ui/vision-editor/ToolConfigPage";
import { LayerEditorPage } from "@/src/components/ui/vision-editor/LayerEditorPage";
import { RunVisionButton } from "@/src/components/ui/vision-editor/EditorBits";
import { buildOverlay } from "@/src/vision/feedOverlay";
import { fixtureTransform, transformRegion } from "@/src/vision/regionMath";

type Page = null | { kind: "tool"; id: string } | { kind: "layer"; id: string };

// ── Main editor screen ─────────────────────────────────────────────────────────

export default function VisionEditorScreen() {
  const params         = useLocalSearchParams<{ program: string; runningIds?: string }>();
  const initialProg    = useMemo(() => normalizeVisionProgram(JSON.parse(params.program)), []); // eslint-disable-line react-hooks/exhaustive-deps
  const initialRunning = params.runningIds ? new Set<string>(JSON.parse(params.runningIds)) : new Set<string>();

  const paneLayout = usePaneLayout();
  const isWide  = paneLayout !== "single";
  const isSplit = paneLayout === "split";
  const wideContent = useWideContent();
  const [program, setProgram]     = useState<VisionProgram>(initialProg);
  const [name, setName]           = useState(initialProg.name);
  const [isRunning, setIsRunning]         = useState(initialRunning.has(initialProg.id));
  const [transitioning, setTransitioning] = useState<"starting" | "stopping" | null>(null);
  const [saveStatus, setSaveStatus]       = useState<"idle" | "saving" | "saved">("idle");
  const [cameras, setCameras]     = useState<CameraState[]>([]);
  const [camPickerOpen, setCamPickerOpen] = useState(false);
  const [typePicker, setTypePicker]       = useState(false);
  const [snapshotUri, setSnapshotUri]     = useState<string | null>(null);
  const [snapshotSize, setSnapshotSize]   = useState<{ width: number; height: number } | null>(null);
  const [page, setPage]                   = useState<Page>(null);

  const programRef  = useRef(program);
  const nameRef     = useRef(name);
  const dirtySaveTimerRef     = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedFeedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isFirstRenderRef      = useRef(true);

  const autoSave = useCallback(async (prog: VisionProgram) => {
    setSaveStatus("saving");
    try {
      const result: any = await robotClient.saveVisionProgram(prog);
      if (result?.programId && !prog.id) setProgram(prev => ({ ...prev, id: result.programId }));
      setSaveStatus("saved");
      if (savedFeedbackTimerRef.current) clearTimeout(savedFeedbackTimerRef.current);
      savedFeedbackTimerRef.current = setTimeout(() => setSaveStatus("idle"), 1500);
    } catch {
      setSaveStatus("idle");
    }
  }, []);

  // Auto-save whenever program state or name changes (skip the very first render). The refs carry
  // the latest values to the debounced save and to the save-on-leave below.
  useEffect(() => {
    programRef.current = program;
    nameRef.current = name;
    if (isFirstRenderRef.current) { isFirstRenderRef.current = false; return; }
    if (dirtySaveTimerRef.current) clearTimeout(dirtySaveTimerRef.current);
    dirtySaveTimerRef.current = setTimeout(() => {
      dirtySaveTimerRef.current = null;
      autoSave({ ...programRef.current, name: nameRef.current });
    }, 400);
  }, [program, name, autoSave]);

  const navigation = useNavigation();
  useEffect(() => {
    return navigation.addListener("beforeRemove", () => {
      if (dirtySaveTimerRef.current) {
        clearTimeout(dirtySaveTimerRef.current);
        dirtySaveTimerRef.current = null;
        robotClient.saveVisionProgram({ ...programRef.current, name: nameRef.current }).catch(() => {});
      }
    });
  }, [navigation]);

  const feedWebViewRef         = useRef<any>(null);
  const feedSnapshotResolveRef = useRef<((uri: string | null) => void) | null>(null);

  // Always the raw camera stream: the editor draws the tool overlay itself (highlighting the tool being
  // edited), so the controller's annotated vision stream would draw everything twice.
  const feedSourceUrl = useMemo(
    () => (program.cameraId ? robotClient.cameraWsUrl(program.cameraId) : null),
    [program.cameraId],
  );

  useEffect(() => {
    robotClient.getCameras().catch(() => {});
    return robotClient.onCameras(setCameras);
  }, []);

  // Latest result while vision runs — drives the overlay, the status chips and the live values.
  const [polledResult, setPolledResult] = useState<VisionResult | null>(null);
  useEffect(() => {
    if (!isRunning || !program.id) return;
    let cancelled = false;
    const poll = () => robotClient.getVisionResult(program.id)
      .then(r => { if (!cancelled) setPolledResult(r); })
      .catch(() => {});
    poll();
    const t = setInterval(poll, 1000);
    return () => { cancelled = true; clearInterval(t); };
  }, [isRunning, program.id]);
  const visionResult = isRunning ? polledResult : null;

  // The controller captures a fixture's reference itself on its first good run (when it has none)
  // and saves it. Pull those in, or the next autosave would clear them again.
  const refSyncAtRef = useRef(0);
  useEffect(() => {
    if (!polledResult || !program.id) return;
    const missing = program.tools.some(t => !t.reference && TOOL_META[t.type]?.makesPose
      && polledResult.tools?.some(r => r.id === t.id && r.status === "ok" && r.pose));
    if (!missing || Date.now() - refSyncAtRef.current < 3000) return;
    refSyncAtRef.current = Date.now();
    robotClient.getVisionPrograms().then(({ programs }) => {
      const remote = programs.find(p => p.id === program.id);
      if (!remote) return;
      setProgram(p => {
        let changed = false;
        const tools = p.tools.map(t => {
          const ref = !t.reference ? remote.tools.find(x => x.id === t.id)?.reference : null;
          if (!ref) return t;
          changed = true;
          return { ...t, reference: ref };
        });
        return changed ? { ...p, tools } : p;
      });
    }).catch(() => {});
  }, [polledResult, program.id, program.tools]);
  const showResults = isRunning;

  const selectedCam = cameras.find(c => c.id === program.cameraId);
  // Frame size in pixels: results are pixels of it, regions are fractions of it.
  const resW = visionResult?.imageWidth, resH = visionResult?.imageHeight;
  const frame = resW && resH ? { width: resW, height: resH }
    : selectedCam?.width && selectedCam?.height ? { width: selectedCam.width, height: selectedCam.height }
    : snapshotSize ?? { width: 640, height: 480 };
  const feedAspect = frame.width / frame.height;

  // ── Snapshot (the raw frame regions are drawn on) ──────────────────────────
  const grabFeedSnapshot = useCallback((): Promise<string | null> => new Promise(resolve => {
    feedSnapshotResolveRef.current = resolve;
    feedWebViewRef.current?.injectJavaScript(
      `(function(){try{var d=c.toDataURL('image/jpeg',0.85);` +
      `window.ReactNativeWebView.postMessage(JSON.stringify({type:'feedSnapshot',data:d}));}` +
      `catch(e){window.ReactNativeWebView.postMessage(JSON.stringify({type:'feedSnapshot',data:null}));}` +
      `})();true;`);
    setTimeout(() => {
      if (feedSnapshotResolveRef.current === resolve) { feedSnapshotResolveRef.current = null; resolve(null); }
    }, 1500);
  }), []);

  const onFeedMessage = useCallback((e: any) => {
    try {
      const msg = JSON.parse(e.nativeEvent.data);
      if (msg.type === "feedSnapshot" && feedSnapshotResolveRef.current) {
        const resolve = feedSnapshotResolveRef.current;
        feedSnapshotResolveRef.current = null;
        resolve(msg.data ?? null);
      }
    } catch {}
  }, []);

  const fetchSnapshot = useCallback(async (): Promise<string | null> => {
    // Regions are drawn on the raw camera frame — never the annotated feed.
    let uri: string | null = null;
    const url = program.cameraId ? robotClient.cameraSnapshotUrl(program.cameraId) : null;
    if (url) {
      try {
        const res  = await fetch(url + (url.includes("?") ? "&" : "?") + "_=" + Date.now());
        const blob = await res.blob();
        uri = await new Promise<string | null>(resolve => {
          const reader = new FileReader();
          reader.onload  = () => resolve(reader.result as string);
          reader.onerror = () => resolve(null);
          reader.readAsDataURL(blob);
        });
      } catch { /* fall through to the preview grab */ }
    }
    if (!uri) uri = await grabFeedSnapshot();
    setSnapshotUri(uri);
    if (uri) Image.getSize(uri, (width, height) => setSnapshotSize({ width, height }), () => {});
    return uri;
  }, [program.cameraId, grabFeedSnapshot]);

  // ── Program edits ──────────────────────────────────────────────────────────
  const updateTool  = (t: VisionTool)  => setProgram(p => ({ ...p, tools: p.tools.map(x => (x.id === t.id ? t : x)) }));
  const updateLayer = (l: ImageLayer)  => setProgram(p => ({ ...p, layers: p.layers.map(x => (x.id === l.id ? l : x)) }));

  function addTool(type: VisionToolType) {
    const t = newTool(type, program.tools);
    setProgram(p => ({ ...p, tools: [...p.tools, t] }));
    setPage({ kind: "tool", id: t.id });
  }

  function duplicateTool(t: VisionTool) {
    const copy: VisionTool = { ...JSON.parse(JSON.stringify(t)), id: newVisionId("t"), name: `${t.name} (copy)` };
    setProgram(p => {
      const i = p.tools.findIndex(x => x.id === t.id);
      const tools = [...p.tools];
      tools.splice(i + 1, 0, copy);
      return { ...p, tools };
    });
  }

  function deleteTool(t: VisionTool) {
    const deps = dependentsOf(t.id, program.tools);
    const direct = program.tools.filter(x => x.fixtureId === t.id || (Array.isArray(x.params.sources) && (x.params.sources as string[]).includes(t.id)));
    appAlert("Delete tool", deps.size
      ? `Delete "${t.name}"? ${direct.length} tool${direct.length !== 1 ? "s use" : " uses"} it; they will lose that link.`
      : `Delete "${t.name}"?`, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => setProgram(p => ({
        ...p,
        tools: p.tools.filter(x => x.id !== t.id).map(x => {
          const src = Array.isArray(x.params.sources) ? (x.params.sources as string[]) : null;
          if (x.fixtureId !== t.id && !(src && src.includes(t.id))) return x;
          return {
            ...x,
            fixtureId: x.fixtureId === t.id ? null : x.fixtureId,
            params: src ? { ...x.params, sources: src.map(s => (s === t.id ? "" : s)) } : x.params,
          };
        }),
      })) },
    ]);
  }

  function addLayer() {
    const l = newLayer(program.layers);
    setProgram(p => ({ ...p, layers: [...p.layers, l] }));
    setPage({ kind: "layer", id: l.id });
  }

  function deleteLayer(l: ImageLayer) {
    const users = program.tools.filter(t => t.input === l.id).length;
    appAlert("Delete layer", `Delete "${l.name}"?${users ? ` ${users} tool${users !== 1 ? "s" : ""} will read the camera image instead.` : ""}`, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => setProgram(p => ({
        ...p,
        layers: p.layers.filter(x => x.id !== l.id).map(x => (x.input === l.id ? { ...x, input: "camera" } : x)),
        tools: p.tools.map(t => (t.input === l.id ? { ...t, input: "camera" } : t)),
      })) },
    ]);
  }

  function moveLayer(i: number, d: number) {
    const j = i + d;
    if (j < 0 || j >= program.layers.length) return;
    const layers = [...program.layers];
    [layers[i], layers[j]] = [layers[j], layers[i]];
    const before = Object.keys(layerOrderProblems(program.layers));
    const bad = Object.keys(layerOrderProblems(layers)).filter(id => !before.includes(id));
    if (bad.length) {
      const l = layers.find(x => x.id === bad[0])!;
      appAlert("Can't move there", `"${l.name}" reads another layer, which has to stay above it.`);
      return;
    }
    setProgram(p => ({ ...p, layers }));
  }

  /**
   * "Set reference": the fixture's pose on the current image becomes its reference. Tools that
   * follow it are re-based so they stay exactly where they show now instead of jumping.
   */
  async function setReference(toolId: string) {
    const tool = program.tools.find(t => t.id === toolId);
    if (!tool) return;
    const r = visionResult?.tools?.find(x => x.id === toolId);
    let pose: Pose | null = r?.status === "ok" && r.pose ? r.pose : null;
    if (!pose && program.id) pose = await robotClient.setVisionToolReference(program.id, toolId).catch(() => null);
    if (!pose) {
      appAlert("Nothing found", `"${tool.name}" has to find the part before its position can be the reference. Start vision and check the tool finds it, then try again.`);
      return;
    }
    const now = pose;
    const old = tool.reference;
    const T = old ? fixtureTransform(old, now) : null;
    const W = frame.width, H = frame.height;
    setProgram(p => ({
      ...p,
      tools: p.tools.map(t => {
        if (t.id === toolId) return { ...t, reference: now };
        if (t.fixtureId !== toolId || !T) return t;
        const rb = t.params.regionB as Region | null | undefined;
        return {
          ...t,
          region: t.region ? transformRegion(t.region, T, W, H) : t.region,
          params: rb ? { ...t.params, regionB: transformRegion(rb, T, W, H) } : t.params,
        };
      }),
    }));
  }

  async function teach(toolId: string) {
    const tool = program.tools.find(t => t.id === toolId);
    if (!tool) return;
    if (!program.id) { appAlert("Not saved yet", "Wait a moment for the program to save, then teach again."); return; }
    try {
      // Save first so the controller teaches from the region as it is on screen.
      await robotClient.saveVisionProgram({ ...programRef.current, name: nameRef.current });
      await robotClient.teachVisionTool(program.id, toolId);
      // The controller stores the template on the program; take it from there so the next
      // autosave keeps it.
      const { programs } = await robotClient.getVisionPrograms();
      const template = programs.find(p => p.id === program.id)?.tools.find(t => t.id === toolId)?.params.template ?? null;
      if (!template) { appAlert("Nothing taught", "No part was found inside the area. Place a good part in the area and try again."); return; }
      setProgram(p => ({ ...p, tools: p.tools.map(t => (t.id === toolId ? { ...t, params: { ...t.params, template: template as object } } : t)) }));
    } catch (e: any) {
      appAlert("Teach failed", e?.message ?? String(e));
    }
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
    setTransitioning(isRunning ? "stopping" : "starting");
    try {
      if (isRunning) await robotClient.stopVision(id).catch(() => {});
      else await robotClient.startVision(id).catch(() => {});
    } finally {
      setTransitioning(null);
    }
    setIsRunning(!isRunning);
  }

  // ── Tool list: order, tree, drag ───────────────────────────────────────────
  const problems = useMemo(() => orderProblems(program), [program]);
  const layerProblems = useMemo(() => layerOrderProblems(program.layers), [program.layers]);

  type DragState = { id: string; fromIndex: number; toIndex: number };
  const [drag, setDrag] = useState<DragState | null>(null);
  const dragRef    = useRef<DragState | null>(null);
  const rowHeights = useRef<Map<string, number>>(new Map());

  function calcDropIndex(fromIndex: number, dy: number): number {
    const ids = program.tools.map(t => t.id);
    if (fromIndex < 0 || ids.length < 2) return Math.max(0, Math.min(ids.length - 1, fromIndex));
    let target = fromIndex, acc = 0;
    if (dy > 0) {
      for (let i = fromIndex + 1; i < ids.length; i++) {
        const h = rowHeights.current.get(ids[i]) ?? 64;
        if (dy > acc + h / 2) { target = i; acc += h; } else break;
      }
    } else {
      for (let i = fromIndex - 1; i >= 0; i--) {
        const h = rowHeights.current.get(ids[i]) ?? 64;
        if (-dy > acc + h / 2) { target = i; acc += h; } else break;
      }
    }
    return target;
  }
  function onDragStart(id: string) {
    const i = program.tools.findIndex(t => t.id === id);
    const s = { id, fromIndex: i, toIndex: i };
    dragRef.current = s; setDrag(s);
  }
  function onDragMove(id: string, dy: number) {
    const d = dragRef.current;
    if (!d || d.id !== id) return;
    const to = calcDropIndex(d.fromIndex, dy);
    if (to !== d.toIndex) { const u = { ...d, toIndex: to }; dragRef.current = u; setDrag(u); }
  }
  function onDragEnd(id: string) {
    const d = dragRef.current;
    dragRef.current = null; setDrag(null);
    if (!d || d.id !== id || d.toIndex === d.fromIndex) return;
    const tools = [...program.tools];
    const [m] = tools.splice(d.fromIndex, 1);
    tools.splice(d.toIndex, 0, m);
    // A tool may only use tools above it — refuse a drop that would break that.
    const before = new Set(Object.keys(problems));
    const after = orderProblems({ ...program, tools });
    const broken = Object.keys(after).filter(k => !before.has(k));
    if (broken.length) {
      const t = tools.find(x => x.id === broken[0])!;
      appAlert("Can't move there", `"${t.name}": ${after[t.id].toLowerCase()} — a tool can only use tools above it.`);
      return;
    }
    setProgram(p => ({ ...p, tools }));
  }

  // ── Feed overlay + tap to open ─────────────────────────────────────────────
  const overlay = useMemo(
    () => buildOverlay(program, showResults ? visionResult : null, { width: frame.width, height: frame.height }),
    [program, visionResult, showResults, frame.width, frame.height],
  );
  const onFeedTap = useCallback((nx: number, ny: number) => {
    // The smallest region under the tap opens its tool.
    let best: { id: string; area: number } | null = null;
    for (const o of overlay) {
      if (!o.outline || o.outline.length < 3 || o.id.includes(":")) continue;
      const pts = o.outline.map(([x, y]) => (o.space === "norm" ? [x, y] : [x / frame.width, y / frame.height]));
      let hit = false, area = 0;
      for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        const [xi, yi] = pts[i], [xj, yj] = pts[j];
        if ((yi > ny) !== (yj > ny) && nx < ((xj - xi) * (ny - yi)) / (yj - yi) + xi) hit = !hit;
        area += xj * yi - xi * yj;
      }
      area = Math.abs(area) / 2;
      if (hit && (!best || area < best.area)) best = { id: o.id, area };
    }
    if (best) setPage({ kind: "tool", id: best.id });
  }, [overlay, frame.width, frame.height]);

  // ── Render fragments ───────────────────────────────────────────────────────
  const enabledTools = program.tools.filter(t => t.enabled);

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
        {!!program.cameraId && <CameraCalibrationBadge cameraId={program.cameraId} calibrated={selectedCam?.calibrated} />}
        <ChevronDown size={15} color={colors.textFaint} />
      </TouchableOpacity>
    </View>
  );

  const infoSection = (
    <>
      <VisionFeedViewer
        ref={feedWebViewRef}
        feedUrl={feedSourceUrl}
        overlay={overlay}
        isWide={isWide}
        aspect={feedAspect}
        onMessage={onFeedMessage}
        onTapImagePoint={onFeedTap}
        placeholder={program.cameraId ? "Connecting to camera…" : "Select a camera above"}
      />
      <RunVisionButton isRunning={isRunning} transitioning={transitioning} onPress={toggleRunning} />
      {showResults && visionResult && (
        <>
          <View style={styles.sectionLabelRow}>
            <Text style={styles.sectionLabel}>RESULT</Text>
            <View style={{ flex: 1 }} />
            <InfoTip text="The latest result of every enabled tool. A tool whose fixture was not found is not run, and counts as failed. Overall passes when every tool set to count toward it passes." />
          </View>
          <VisionResults result={visionResult} tools={program.tools} />
        </>
      )}
      {showResults && !visionResult && isRunning && (
        <Text style={styles.waiting}>Waiting for the first result…</Text>
      )}
    </>
  );

  const layersSection = (
    <>
      <View style={styles.sectionLabelRow}>
        <Text style={styles.sectionLabel}>IMAGE LAYERS</Text>
        <Text style={styles.sectionCount}>{program.layers.length}</Text>
        <View style={{ flex: 1 }} />
        <InfoTip text="A layer is the camera image run through an ordered stack of filters — blur, threshold, colour mask, contrast and so on. Several tools can share one layer; a layer can also start from another layer." />
      </View>
      {program.layers.length === 0 && (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyText}>No layers — tools read the camera image as it is</Text>
        </View>
      )}
      {program.layers.map((l, i) => {
        const users = program.tools.filter(t => t.input === l.id).length;
        const on = l.filters.filter(f => f.enabled).length;
        const prob = layerProblems[l.id];
        const src = l.input === "camera" ? "Camera" : program.layers.find(x => x.id === l.input)?.name ?? "missing layer";
        return (
          <View key={l.id} style={styles.layerCard}>
            <TouchableOpacity style={styles.rowTap} onPress={() => setPage({ kind: "layer", id: l.id })} activeOpacity={0.75}>
              <View style={[styles.tile, { backgroundColor: accents.orangeSoft }]}><Layers size={18} color={accents.orange} /></View>
              <View style={styles.rowText}>
                <Text style={styles.rowName} numberOfLines={1}>{l.name}</Text>
                <Text style={[styles.rowDetail, !!prob && { color: colors.warning }]} numberOfLines={1}>
                  {prob ?? `${src} → ${on} filter${on !== 1 ? "s" : ""}${users ? ` · ${users} tool${users !== 1 ? "s" : ""}` : ""}`}
                </Text>
              </View>
              <ChevronRight size={16} color={colors.textFaint} />
            </TouchableOpacity>
            {program.layers.length > 1 && (
              <View style={styles.arrows}>
                <TouchableOpacity onPress={() => moveLayer(i, -1)} disabled={i === 0} hitSlop={6} accessibilityLabel="Move layer up">
                  <ArrowUp size={14} color={i === 0 ? colors.border : colors.textMuted} />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => moveLayer(i, 1)} disabled={i === program.layers.length - 1} hitSlop={6} accessibilityLabel="Move layer down">
                  <ArrowDown size={14} color={i === program.layers.length - 1 ? colors.border : colors.textMuted} />
                </TouchableOpacity>
              </View>
            )}
            <DeleteIconButton size={15} style={styles.iconBtn} onPress={() => deleteLayer(l)} />
          </View>
        );
      })}
      <TouchableOpacity style={styles.addBtn} onPress={addLayer} activeOpacity={0.75}>
        <Plus size={15} color={accents.orange} />
        <Text style={[styles.addBtnText, { color: accents.orange }]}>Add Layer</Text>
      </TouchableOpacity>
    </>
  );

  const toolsSection = (
    <>
      <View style={[styles.sectionLabelRow, { marginTop: spacing.sm }]}>
        <Text style={styles.sectionLabel}>TOOLS</Text>
        <Text style={styles.sectionCount}>{program.tools.length}</Text>
        <View style={{ flex: 1 }} />
        <InfoTip text="Tools run top to bottom. A locating tool can be a fixture: tools indented under it follow its found position, so their regions move with the part. If a fixture finds nothing, the tools that follow it are not run. A tool can only use tools above it." />
      </View>
      {program.tools.length === 0 && (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyText}>No tools yet — add one to locate, measure, count or read</Text>
        </View>
      )}
      {program.tools.map((t, index) => {
        const meta = TOOL_META[t.type];
        const depth = fixtureDepth(t, program.tools);
        const r = showResults ? visionResult?.tools?.find(x => x.id === t.id) : undefined;
        const prob = problems[t.id];
        const fixture = t.fixtureId ? program.tools.find(x => x.id === t.fixtureId) : null;
        const inputName = t.input === "camera" ? null : program.layers.find(l => l.id === t.input)?.name ?? "missing layer";
        const detail = [inputName && `on ${inputName}`, fixture && `follows ${fixture.name}`].filter(Boolean).join(" · ");
        const isDragged = drag?.id === t.id;
        const dropAbove = !!(drag && drag.id !== t.id && drag.toIndex === index && drag.toIndex < drag.fromIndex);
        const dropBelow = !!(drag && drag.id !== t.id && drag.toIndex === index && drag.toIndex > drag.fromIndex);
        const tint = CATEGORY_TINT[meta.category];
        return (
          <View
            key={t.id}
            onLayout={e => rowHeights.current.set(t.id, e.nativeEvent.layout.height)}
            style={[styles.noSelect, { paddingLeft: Math.min(depth, 4) * 18 }, isDragged && styles.dragDim, dropAbove && styles.dropAbove, dropBelow && styles.dropBelow]}
          >
            {depth > 0 && <View style={[styles.treeLine, { left: Math.min(depth, 4) * 18 - 10 }]} />}
            <View style={[styles.toolCard, { borderLeftColor: tint.fg }, (!t.enabled || r?.status === "notRun") && { opacity: 0.6 }]}>
              <View style={styles.toolHead}>
                <DragHandle stepId={t.id} onStart={onDragStart} onMove={(id, dy) => onDragMove(id, dy)} onEnd={onDragEnd} />
                <TouchableOpacity style={styles.rowTap} onPress={() => setPage({ kind: "tool", id: t.id })} activeOpacity={0.75}>
                  <ToolTile type={t.type} />
                  <View style={styles.rowText}>
                    <Text style={[styles.toolType, { color: tint.fg }]}>{index + 1} · {meta.label.toUpperCase()}</Text>
                    <Text style={styles.rowName} numberOfLines={1}>{t.name}</Text>
                    {!!prob ? (
                      <View style={styles.probRow}>
                        <AlertTriangle size={11} color={colors.warning} />
                        <Text style={[styles.rowDetail, { color: colors.warning }]} numberOfLines={1}>{prob}</Text>
                      </View>
                    ) : r ? (
                      <Text style={styles.rowDetail} numberOfLines={1}>{summarizeResult(r, t)}</Text>
                    ) : !!detail ? (
                      <Text style={styles.rowDetail} numberOfLines={1}>{detail}</Text>
                    ) : null}
                  </View>
                </TouchableOpacity>
                {r && <StatusChip result={r} />}
                <Switch
                  value={t.enabled}
                  onValueChange={enabled => updateTool({ ...t, enabled })}
                  trackColor={{ true: tint.fg }}
                  style={{ transform: [{ scaleX: 0.8 }, { scaleY: 0.8 }] }}
                />
                {isWide && (
                  <TouchableOpacity onPress={() => duplicateTool(t)} hitSlop={8} style={styles.iconBtn} accessibilityLabel="Duplicate tool">
                    <Copy size={15} color={colors.textMuted} />
                  </TouchableOpacity>
                )}
                <DeleteIconButton size={15} style={styles.iconBtn} onPress={() => deleteTool(t)} />
              </View>
            </View>
          </View>
        );
      })}
      <TouchableOpacity style={styles.addBtn} onPress={() => setTypePicker(true)} activeOpacity={0.75}>
        <Plus size={15} color={accents.cyan} />
        <Text style={styles.addBtnText}>Add Tool</Text>
      </TouchableOpacity>
      <View style={{ height: 40 }} />
    </>
  );

  const pageTool  = page?.kind === "tool"  ? program.tools.find(t => t.id === page.id)  ?? null : null;
  const pageLayer = page?.kind === "layer" ? program.layers.find(l => l.id === page.id) ?? null : null;

  return (
    <View style={styles.root}>
      {!pageTool && !pageLayer && (
        <>
          <PageHeader
            title={name || "Vision Program"}
            subtitle={`${program.layers.length} layer${program.layers.length !== 1 ? "s" : ""} · ${enabledTools.length} tool${enabledTools.length !== 1 ? "s" : ""}${selectedCam ? ` · ${selectedCam.name || selectedCam.id}` : ""}${isRunning ? " · live" : ""}`}
            crumbs={[
              { label: "Program", href: "/program" },
              { label: "Vision", href: "/(tabs)/program/vision" },
              { label: name || "Vision Program" },
            ]}
            backTo="/(tabs)/program/vision"
            right={
              saveStatus === "saving" ? (
                <View style={styles.saveStatusRow}>
                  <ActivityIndicator size="small" color={colors.textMuted} />
                  <Text style={styles.saveStatusText}>Saving…</Text>
                </View>
              ) : saveStatus === "saved" ? (
                <View style={styles.saveStatusRow}>
                  <Check size={14} color={colors.success} />
                  <Text style={[styles.saveStatusText, { color: colors.success }]}>Saved</Text>
                </View>
              ) : (
                <StatusPill label={isRunning ? "Live" : "Stopped"} tone={isRunning ? "success" : "neutral"} dot />
              )
            }
          />

          {isWide ? (
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
                {layersSection}
                {toolsSection}
              </ScrollView>
              <ScrollView
                style={[styles.widePaneLeft, isSplit && wide.paneSplit]}
                contentContainerStyle={styles.widePaneLeftContent}
                keyboardShouldPersistTaps="handled"
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
              {layersSection}
              {toolsSection}
            </ScrollView>
          )}
        </>
      )}

      {pageTool && (
        <ToolConfigPage
          tool={pageTool}
          program={program}
          result={showResults ? visionResult : null}
          frame={frame}
          feedUrl={feedSourceUrl}
          isRunning={isRunning}
          transitioning={transitioning}
          onToggleRunning={toggleRunning}
          snapshotUri={snapshotUri}
          onFetchSnapshot={fetchSnapshot}
          onChange={updateTool}
          onSetReference={() => setReference(pageTool.id)}
          onSetFixtureReference={(fixtureId, pose) => setProgram(p => ({ ...p, tools: p.tools.map(t => (t.id === fixtureId ? { ...t, reference: pose } : t)) }))}
          onTeach={() => teach(pageTool.id)}
          onClose={() => setPage(null)}
        />
      )}

      {pageLayer && (
        <LayerEditorPage
          layer={pageLayer}
          program={program}
          previewUrl={upTo => robotClient.visionLayerPreviewUrl(program.id, pageLayer.id, upTo)}
          aspect={feedAspect}
          onChange={updateLayer}
          onClose={() => setPage(null)}
        />
      )}

      <CameraPickerModal
        visible={camPickerOpen}
        cameras={cameras}
        selected={program.cameraId}
        onSelect={id => setProgram(p => ({ ...p, cameraId: id }))}
        onClose={() => setCamPickerOpen(false)}
      />
      <ToolTypePicker visible={typePicker} onSelect={addTool} onClose={() => setTypePicker(false)} />
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root:    { flex: 1, backgroundColor: colors.background },
  // Keep drag targets from turning into text selections mid-drag on web.
  noSelect: { userSelect: "none" },
  scroll:  { flex: 1 },
  content: { padding: spacing.lg, gap: spacing.sm },

  wideRow: { flex: 1, flexDirection: "row", width: "100%" },
  widePaneLeft: {
    width: "46%", minWidth: 420, maxWidth: 820, flexGrow: 0, flexShrink: 0,
    borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: colors.border,
  },
  widePaneLeftContent: { paddingHorizontal: 20, paddingTop: 18, paddingBottom: spacing.xxl, gap: spacing.sm },
  widePaneRight: { flex: 1 },
  wideEditorContent: { width: "100%", maxWidth: 720, alignSelf: "center" },

  saveStatusRow:  { flexDirection: "row", alignItems: "center", gap: 5 },
  saveStatusText: { fontSize: 13, color: colors.textMuted },

  rowLabel:    { fontSize: 12, fontWeight: "600", color: colors.textMuted, width: 60 },
  nameInput:   { flex: 1, fontSize: 14, color: colors.text },
  cameraValue: { flex: 1, fontSize: 14, color: colors.text },
  dot:         { width: 8, height: 8, borderRadius: 4 },
  waiting:     { fontSize: 12, color: colors.textMuted, textAlign: "center" },

  sectionLabel: { fontSize: 11, fontWeight: "700", color: colors.textMuted, letterSpacing: 0.8, marginBottom: 2 },
  sectionLabelRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: spacing.xs },
  sectionCount: {
    fontSize: 11, fontWeight: "700", color: colors.textFaint,
    backgroundColor: colors.surface, borderRadius: radii.pill,
    paddingHorizontal: spacing.sm, paddingVertical: 1, marginBottom: 2,
  },

  emptyCard: { backgroundColor: colors.surface, borderRadius: radii.md, padding: spacing.lg, alignItems: "center", ...shadows.soft },
  emptyText: { fontSize: 13, color: colors.textFaint, textAlign: "center" },

  detailsCard: { backgroundColor: colors.surface, borderRadius: radii.md, overflow: "hidden", ...shadows.soft },
  detailsRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 14, paddingVertical: spacing.md },
  detailsDivider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border },

  // Drag-to-reorder feedback, on a non-elevated outer wrapper (Android blanks an elevated view with opacity < 1).
  dragDim:   { opacity: 0.35 },
  dropAbove: { borderTopWidth: 2.5, borderTopColor: accents.cyan, borderTopLeftRadius: radii.md, borderTopRightRadius: radii.md },
  dropBelow: { borderBottomWidth: 2.5, borderBottomColor: accents.cyan, borderBottomLeftRadius: radii.md, borderBottomRightRadius: radii.md },

  iconBtn: { padding: spacing.xs },
  addBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
    backgroundColor: colors.surface, borderRadius: radii.md,
    paddingVertical: 13, borderWidth: 1.5, borderColor: colors.border, borderStyle: "dashed",
  },
  addBtnText: { fontSize: 14, fontWeight: "600", color: accents.cyan },

  layerCard: {
    flexDirection: "row", alignItems: "center", gap: spacing.sm,
    backgroundColor: colors.surface, borderRadius: radii.md, paddingHorizontal: 12, paddingVertical: 10, ...shadows.soft,
  },
  arrows: { flexDirection: "column", gap: 6, paddingHorizontal: 2 },
  tile: { width: 36, height: 36, borderRadius: radii.sm, alignItems: "center", justifyContent: "center" },

  toolCard: { backgroundColor: colors.surface, borderRadius: radii.lg, borderLeftWidth: 4, ...shadows.soft, overflow: "hidden" },
  toolHead: { flexDirection: "row", alignItems: "center", paddingLeft: 8, paddingRight: 8, paddingVertical: 12, gap: 8 },
  treeLine: { position: "absolute", top: -6, bottom: "50%", width: 8, borderLeftWidth: 2, borderBottomWidth: 2, borderColor: colors.borderStrong, borderBottomLeftRadius: 6 },
  rowTap:  { flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: 10 },
  rowText: { flex: 1, minWidth: 0, gap: 1 },
  toolType: { fontSize: 10, fontWeight: "700", letterSpacing: 0.5 },
  rowName: { fontSize: 14, fontWeight: "600", color: colors.text },
  rowDetail: { fontSize: 12, color: colors.textMuted },
  probRow: { flexDirection: "row", alignItems: "center", gap: 4 },
});
