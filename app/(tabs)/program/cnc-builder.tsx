import { wide } from "@/src/components/ui/responsive";
import {
  SubPageHeader } from "@/src/components/ui/SubPageHeader";
import { DeleteIconButton } from "@/src/components/ui/DeleteIconButton";
import { useBuiltPrograms,
  useConnected } from "@/src/providers/RobotProvider";
import { robotClient } from "@/src/services/RobotConnectService";
import { ProgramStep,
  THREAD_PRESETS } from "@/src/models/robotModels";
import { router,
  useLocalSearchParams } from "expo-router";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import {
  Check,
  ChevronDown,
  FileText,
  Plus,
  RefreshCw,
  Trash2,
  Upload,
  } from "lucide-react-native";
import React,
  { useCallback,
  useEffect,
  useMemo,
  useRef,
  useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { appAlert } from "@/src/components/ui/AppAlert";
import Svg, { Circle, G, Line, Rect, Text as SvgText } from "react-native-svg";
import DxfParser from "dxf-parser";

// ── Types ─────────────────────────────────────────────────────────────────────

type DxfHole = {
  x: number;
  y: number;
  radius: number;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function newId() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function parseDxf(content: string): DxfHole[] {
  try {
    const parser = new DxfParser();
    const dxf = parser.parseSync(content);
    if (!dxf || !dxf.entities) return [];
    return (dxf.entities as any[])
      .filter((e: any) => e.type === "CIRCLE")
      .map((e: any) => ({
        x: e.center?.x ?? 0,
        y: e.center?.y ?? 0,
        radius: e.radius ?? 1,
      }));
  } catch {
    return [];
  }
}

function computeBounds(holes: DxfHole[]): { minX: number; minY: number; maxX: number; maxY: number } | null {
  if (holes.length === 0) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const h of holes) {
    minX = Math.min(minX, h.x - h.radius);
    minY = Math.min(minY, h.y - h.radius);
    maxX = Math.max(maxX, h.x + h.radius);
    maxY = Math.max(maxY, h.y + h.radius);
  }
  return { minX, minY, maxX, maxY };
}

// ── Numeric input ─────────────────────────────────────────────────────────────

function NumericInput({
  value,
  onChange,
  placeholder,
  style,
}: {
  value: number | undefined;
  onChange: (n: number) => void;
  placeholder?: string;
  style?: any;
}) {
  const [text, setText] = useState(value !== undefined ? String(value) : "");
  const lastValid = useRef<number | undefined>(value);

  useEffect(() => {
    if (value !== undefined && value !== lastValid.current) {
      setText(String(value));
      lastValid.current = value;
    }
  }, [value]);

  return (
    <TextInput
      style={[s.input, style]}
      value={text}
      onChangeText={v => {
        if (v === "" || v === "-" || /^-?\d*\.?\d*$/.test(v)) setText(v);
      }}
      onBlur={() => {
        const n = parseFloat(text);
        if (!isNaN(n)) {
          lastValid.current = n;
          onChange(n);
        } else {
          setText(lastValid.current !== undefined ? String(lastValid.current) : "");
        }
      }}
      keyboardType="numbers-and-punctuation"
      selectTextOnFocus
      placeholder={placeholder}
    />
  );
}

// ── DXF Viewport ──────────────────────────────────────────────────────────────

const VIEWPORT_SIZE = 320;
const VIEWPORT_PADDING = 16;

function DxfViewport({
  holes,
  selected,
  onToggle,
}: {
  holes: DxfHole[];
  selected: Set<number>;
  onToggle: (idx: number) => void;
}) {
  const bounds = useMemo(() => computeBounds(holes), [holes]);

  if (!bounds || holes.length === 0) {
    return (
      <View style={s.emptyViewport}>
        <Text style={s.emptyViewportText}>No holes found in DXF</Text>
      </View>
    );
  }

  const padded = VIEWPORT_SIZE - VIEWPORT_PADDING * 2;
  const dxfW = bounds.maxX - bounds.minX || 1;
  const dxfH = bounds.maxY - bounds.minY || 1;
  const scale = Math.min(padded / dxfW, padded / dxfH);

  function toSvgX(x: number) {
    return VIEWPORT_PADDING + (x - bounds!.minX) * scale;
  }
  function toSvgY(y: number) {
    // DXF Y increases upward; SVG Y increases downward
    return VIEWPORT_SIZE - VIEWPORT_PADDING - (y - bounds!.minY) * scale;
  }

  return (
    <View style={s.viewport}>
      <Svg width={VIEWPORT_SIZE} height={VIEWPORT_SIZE}>
        {/* Background */}
        <Rect x={0} y={0} width={VIEWPORT_SIZE} height={VIEWPORT_SIZE} fill="#f8fafc" />

        {/* Holes */}
        {holes.map((h, i) => {
          const isSelected = selected.has(i);
          const cx = toSvgX(h.x);
          const cy = toSvgY(h.y);
          const r = Math.max(h.radius * scale, 4);
          return (
            <G key={i} onPress={() => onToggle(i)}>
              <Circle
                cx={cx} cy={cy} r={r}
                fill={isSelected ? "#7c3aed33" : "#e0e7ff"}
                stroke={isSelected ? "#7c3aed" : "#6366f1"}
                strokeWidth={isSelected ? 2 : 1}
              />
              {isSelected && (
                <Circle cx={cx} cy={cy} r={3} fill="#7c3aed" />
              )}
            </G>
          );
        })}
      </Svg>
    </View>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────

export default function CncBuilderScreen() {
  const { programName, stepId } = useLocalSearchParams<{ programName?: string; stepId?: string }>();
  const builtPrograms = useBuiltPrograms();
  const connected = useConnected();

  // ── State ─────────────────────────────────────────────────────────────────

  const [dxfFiles, setDxfFiles] = useState<string[]>([]);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [uploading, setUploading] = useState(false);

  const [selectedDxf, setSelectedDxf] = useState<string | undefined>(undefined);
  const [dxfContent, setDxfContent] = useState<string | undefined>(undefined);
  const [loadingDxf, setLoadingDxf] = useState(false);

  const holes = useMemo(() => (dxfContent ? parseDxf(dxfContent) : []), [dxfContent]);
  const [selectedHoles, setSelectedHoles] = useState<Set<number>>(new Set());

  // Threading params
  const [safeZ, setSafeZ] = useState<number>(5);
  const [threadDepth, setThreadDepth] = useState<number>(-15);
  const [threadPitch, setThreadPitch] = useState<number>(1.5);
  const [threadPeck, setThreadPeck] = useState(false);
  const [threadPeckDepth, setThreadPeckDepth] = useState<number>(5);
  const [threadReverseOut, setThreadReverseOut] = useState(true);

  const [presetOpen, setPresetOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  // ── Load initial state from existing step ────────────────────────────────

  useEffect(() => {
    if (!programName || !stepId) return;
    const prog = builtPrograms.find(p => p.name === programName);
    if (!prog) return;
    const step = findStep(prog.steps, stepId);
    if (!step) return;
    if (step.cncDxfFile) setSelectedDxf(step.cncDxfFile);
    if (step.cncSafeZ != null) setSafeZ(step.cncSafeZ);
  }, [programName, stepId, builtPrograms]);

  // ── DXF file list ────────────────────────────────────────────────────────

  const refreshFiles = useCallback(async () => {
    if (!connected) return;
    setLoadingFiles(true);
    try {
      const files = await robotClient.listDxfFiles();
      setDxfFiles(files);
    } catch {
      // silent
    } finally {
      setLoadingFiles(false);
    }
  }, [connected]);

  useEffect(() => { refreshFiles(); }, [refreshFiles]);

  // ── Load DXF content when selectedDxf changes ────────────────────────────

  useEffect(() => {
    if (!selectedDxf) { setDxfContent(undefined); return; }
    setLoadingDxf(true);
    robotClient.getDxfFile(selectedDxf)
      .then(txt => { setDxfContent(txt); setSelectedHoles(new Set()); })
      .catch(() => setDxfContent(undefined))
      .finally(() => setLoadingDxf(false));
  }, [selectedDxf]);

  // ── Upload DXF ────────────────────────────────────────────────────────────

  async function handleUpload() {
    const result = await DocumentPicker.getDocumentAsync({
      type: ["application/octet-stream", "*/*"],
      copyToCacheDirectory: true,
    });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    const name = asset.name.endsWith(".dxf") ? asset.name : asset.name + ".dxf";
    setUploading(true);
    try {
      const content = await FileSystem.readAsStringAsync(asset.uri, { encoding: 'utf8' });
      await robotClient.uploadDxfFile(name, content);
      await refreshFiles();
      setSelectedDxf(name);
    } catch (e: any) {
      appAlert("Upload Failed", e?.message ?? "Unknown error");
    } finally {
      setUploading(false);
    }
  }

  // ── Delete DXF ────────────────────────────────────────────────────────────

  function handleDeleteDxf(name: string) {
    appAlert("Delete DXF", `Delete "${name}" from the controller?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete", style: "destructive", onPress: async () => {
          try {
            await robotClient.deleteDxfFile(name);
            if (selectedDxf === name) setSelectedDxf(undefined);
            refreshFiles();
          } catch (e: any) {
            appAlert("Error", e?.message ?? "Delete failed");
          }
        }
      },
    ]);
  }

  // ── Toggle hole selection ─────────────────────────────────────────────────

  function toggleHole(idx: number) {
    setSelectedHoles(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  }

  function selectAll() {
    setSelectedHoles(new Set(holes.map((_, i) => i)));
  }

  function clearSelection() {
    setSelectedHoles(new Set());
  }

  // ── Generate and save toolpath ────────────────────────────────────────────

  async function handleSave() {
    if (!programName || !stepId) return;
    const prog = builtPrograms.find(p => p.name === programName);
    if (!prog) { appAlert("Error", "Program not found"); return; }

    const orderedHoles = Array.from(selectedHoles)
      .sort((a, b) => a - b)
      .map(i => holes[i]);

    // Two steps per hole: MoveL approach + ThreadMove
    const cncSteps: ProgramStep[] = [];
    for (const hole of orderedHoles) {
      cncSteps.push({
        id: newId(),
        type: "MoveL",
        name: `Approach (${hole.x.toFixed(1)}, ${hole.y.toFixed(1)})`,
        overrideX: hole.x,
        overrideY: hole.y,
        overrideZ: safeZ,
      });
      cncSteps.push({
        id: newId(),
        type: "ThreadMove",
        name: undefined,
        threadDistance: threadDepth,
        threadPitch,
        threadPeck,
        threadPeckDepth: threadPeck ? threadPeckDepth : undefined,
        threadReverseOut,
      });
    }

    const updatedSteps = updateStepInList(prog.steps, stepId, step => ({
      ...step,
      cncDxfFile: selectedDxf,
      cncSafeZ: safeZ,
      cncProgramSteps: cncSteps,
    }));

    setSaving(true);
    try {
      await robotClient.saveBuiltProgram({
        ...prog,
        steps: updatedSteps,
        id: prog.id ?? "",
        variables: prog.variables ?? [],
      });
      router.back();
    } catch (e: any) {
      appAlert("Save Failed", e?.message ?? "Unknown error");
    } finally {
      setSaving(false);
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  const holeCount = holes.length;
  const selectedCount = selectedHoles.size;

  return (
    <View style={s.root}>
      <SubPageHeader
        title="CNC Builder"
        subtitle={programName}
        right={
          <TouchableOpacity
            style={[s.saveBtn, (saving || selectedCount === 0) && s.saveBtnDisabled]}
            onPress={handleSave}
            disabled={saving || selectedCount === 0}
            activeOpacity={0.75}
          >
            {saving ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={s.saveBtnText}>Save  ({selectedCount})</Text>
            )}
          </TouchableOpacity>
        }
      />

      <ScrollView style={{ flex: 1 }} contentContainerStyle={[s.scroll, wide.content]}>

        {/* DXF file selector */}
        <Text style={s.sectionLabel}>DXF FILE</Text>
        <View style={s.card}>
          {/* Upload button */}
          <TouchableOpacity style={s.uploadRow} onPress={handleUpload} disabled={uploading || !connected} activeOpacity={0.7}>
            {uploading ? (
              <ActivityIndicator size="small" color="#7c3aed" />
            ) : (
              <Upload size={16} color="#7c3aed" />
            )}
            <Text style={s.uploadText}>{uploading ? "Uploading…" : "Upload DXF from device"}</Text>
          </TouchableOpacity>

          {/* File list */}
          {loadingFiles ? (
            <ActivityIndicator style={{ margin: 12 }} color="#7c3aed" />
          ) : dxfFiles.length === 0 ? (
            <Text style={s.emptyHint}>No DXF files on controller. Upload one above.</Text>
          ) : (
            dxfFiles.map(name => (
              <TouchableOpacity
                key={name}
                style={[s.fileRow, selectedDxf === name && s.fileRowSelected]}
                onPress={() => setSelectedDxf(name)}
                activeOpacity={0.7}
              >
                <FileText size={15} color={selectedDxf === name ? "#7c3aed" : "#6b7280"} />
                <Text style={[s.fileName, selectedDxf === name && s.fileNameSelected]} numberOfLines={1}>{name}</Text>
                {selectedDxf === name && <Check size={14} color="#7c3aed" />}
                <DeleteIconButton size={14} onPress={() => handleDeleteDxf(name)} style={{ marginLeft: "auto" }} />
              </TouchableOpacity>
            ))
          )}

          <TouchableOpacity style={s.refreshRow} onPress={refreshFiles} activeOpacity={0.7}>
            <RefreshCw size={13} color="#9ca3af" />
            <Text style={s.refreshText}>Refresh</Text>
          </TouchableOpacity>
        </View>

        {/* DXF viewport — only shown when a DXF is loaded */}
        {selectedDxf && (
          <>
            <Text style={s.sectionLabel}>HOLES  ({selectedCount} / {holeCount} selected)</Text>
            <View style={s.card}>
              {loadingDxf ? (
                <ActivityIndicator style={{ margin: 24 }} color="#7c3aed" />
              ) : (
                <>
                  <DxfViewport holes={holes} selected={selectedHoles} onToggle={toggleHole} />
                  <View style={s.selectionBtns}>
                    <TouchableOpacity style={s.selBtn} onPress={selectAll} activeOpacity={0.7}>
                      <Text style={s.selBtnText}>Select All</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={s.selBtn} onPress={clearSelection} activeOpacity={0.7}>
                      <Text style={s.selBtnText}>Clear</Text>
                    </TouchableOpacity>
                  </View>
                  {holeCount > 0 && (
                    <Text style={s.hintText}>Tap a circle to select/deselect it as a threading target.</Text>
                  )}
                </>
              )}
            </View>
          </>
        )}

        {/* Threading parameters */}
        <Text style={s.sectionLabel}>THREADING PARAMETERS</Text>
        <View style={s.card}>
          <Text style={s.fieldLabel}>SAFE Z (mm)</Text>
          <NumericInput value={safeZ} onChange={setSafeZ} placeholder="5" />
          <Text style={s.hintText}>Z height to move to before approaching each hole.</Text>

          <Text style={[s.fieldLabel, { marginTop: 14 }]}>THREAD DEPTH (mm)</Text>
          <NumericInput value={threadDepth} onChange={setThreadDepth} placeholder="-15" />
          <Text style={s.hintText}>Negative = down. Distance the tap travels into the hole.</Text>

          <Text style={[s.fieldLabel, { marginTop: 14 }]}>THREAD PITCH (mm/rev)</Text>
          {/* Preset picker */}
          <TouchableOpacity
            style={s.presetBtn}
            onPress={() => setPresetOpen(v => !v)}
            activeOpacity={0.7}
          >
            <Text style={s.presetBtnText}>
              {THREAD_PRESETS.find(p => Math.abs(p.pitch - threadPitch) < 0.001)?.label ?? `${threadPitch} mm/rev`}
            </Text>
            <ChevronDown size={15} color="#7c3aed" style={{ transform: [{ rotate: presetOpen ? "180deg" : "0deg" }] }} />
          </TouchableOpacity>
          {presetOpen && (
            <View style={s.presetList}>
              {THREAD_PRESETS.map((p, i) => (
                <TouchableOpacity
                  key={i}
                  style={[s.presetItem, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "#f3f4f6" }]}
                  onPress={() => { setThreadPitch(p.pitch); setPresetOpen(false); }}
                  activeOpacity={0.7}
                >
                  <Text style={[s.presetItemText, Math.abs(p.pitch - threadPitch) < 0.001 && { color: "#7c3aed", fontWeight: "700" }]}>
                    {p.label}  <Text style={{ color: "#9ca3af" }}>{p.pitch} mm/rev</Text>
                  </Text>
                  {Math.abs(p.pitch - threadPitch) < 0.001 && <Check size={14} color="#7c3aed" />}
                </TouchableOpacity>
              ))}
            </View>
          )}
          <NumericInput value={threadPitch} onChange={setThreadPitch} placeholder="1.5" style={{ marginTop: 8 }} />

          {/* Peck drilling */}
          <View style={[s.toggleRow, { marginTop: 14 }]}>
            <View>
              <Text style={s.fieldLabel}>PECK DRILLING</Text>
              <Text style={s.hintText}>Break chips by retracting between passes.</Text>
            </View>
            <TouchableOpacity
              style={[s.toggleBtn, threadPeck && s.toggleBtnOn]}
              onPress={() => setThreadPeck(v => !v)}
              activeOpacity={0.7}
            >
              <Text style={[s.toggleBtnText, threadPeck && s.toggleBtnTextOn]}>{threadPeck ? "ON" : "OFF"}</Text>
            </TouchableOpacity>
          </View>

          {threadPeck && (
            <>
              <Text style={[s.fieldLabel, { marginTop: 10 }]}>PECK DEPTH (mm)</Text>
              <NumericInput value={threadPeckDepth} onChange={setThreadPeckDepth} placeholder="5" />
            </>
          )}

          {/* Reverse out */}
          <View style={[s.toggleRow, { marginTop: 14 }]}>
            <View>
              <Text style={s.fieldLabel}>REVERSE OUT</Text>
              <Text style={s.hintText}>Reverse RZ back to start after threading.</Text>
            </View>
            <TouchableOpacity
              style={[s.toggleBtn, threadReverseOut && s.toggleBtnOn]}
              onPress={() => setThreadReverseOut(v => !v)}
              activeOpacity={0.7}
            >
              <Text style={[s.toggleBtnText, threadReverseOut && s.toggleBtnTextOn]}>{threadReverseOut ? "ON" : "OFF"}</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

// ── Step tree helpers ─────────────────────────────────────────────────────────

function findStep(steps: ProgramStep[], id: string): ProgramStep | null {
  for (const s of steps) {
    if (s.id === id) return s;
    const nested = [
      ...(s.loopSteps ?? []),
      ...(s.ifSteps ?? []),
      ...(s.elseSteps ?? []),
      ...(s.cncProgramSteps ?? []),
      ...((s.elseIfBranches ?? []).flatMap(b => b.steps ?? [])),
    ];
    const found = findStep(nested, id);
    if (found) return found;
  }
  return null;
}

function updateStepInList(steps: ProgramStep[], id: string, updater: (s: ProgramStep) => ProgramStep): ProgramStep[] {
  return steps.map(s => {
    if (s.id === id) return updater(s);
    return {
      ...s,
      loopSteps:       s.loopSteps       ? updateStepInList(s.loopSteps, id, updater) : undefined,
      ifSteps:         s.ifSteps         ? updateStepInList(s.ifSteps, id, updater) : undefined,
      elseSteps:       s.elseSteps       ? updateStepInList(s.elseSteps, id, updater) : undefined,
      cncProgramSteps: s.cncProgramSteps ? updateStepInList(s.cncProgramSteps, id, updater) : undefined,
      elseIfBranches:  s.elseIfBranches  ? s.elseIfBranches.map(b => ({
        ...b,
        steps: updateStepInList(b.steps ?? [], id, updater),
      })) : undefined,
    };
  });
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#f9fafb" },
  scroll: { padding: 16 },
  sectionLabel: {
    fontSize: 11, fontWeight: "700", color: "#9ca3af",
    letterSpacing: 0.8, marginBottom: 6, marginTop: 4,
  },
  card: {
    backgroundColor: "#fff", borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth, borderColor: "#e5e7eb",
    marginBottom: 18, overflow: "hidden",
    shadowColor: "#000", shadowOpacity: 0.04, shadowRadius: 6, elevation: 2,
  },
  uploadRow: {
    flexDirection: "row", alignItems: "center", gap: 8,
    paddingHorizontal: 14, paddingVertical: 13,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "#f3f4f6",
  },
  uploadText: { fontSize: 14, color: "#7c3aed", fontWeight: "600" },
  emptyHint: { fontSize: 13, color: "#9ca3af", padding: 14 },
  fileRow: {
    flexDirection: "row", alignItems: "center", gap: 10,
    paddingHorizontal: 14, paddingVertical: 11,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "#f3f4f6",
  },
  fileRowSelected: { backgroundColor: "#faf5ff" },
  fileName: { flex: 1, fontSize: 14, color: "#374151" },
  fileNameSelected: { color: "#7c3aed", fontWeight: "600" },
  refreshRow: {
    flexDirection: "row", alignItems: "center", gap: 6,
    padding: 12, justifyContent: "center",
  },
  refreshText: { fontSize: 12, color: "#9ca3af" },
  viewport: {
    alignSelf: "center",
    borderRadius: 10, overflow: "hidden",
    marginVertical: 8,
    borderWidth: 1, borderColor: "#e5e7eb",
  },
  emptyViewport: {
    height: VIEWPORT_SIZE, justifyContent: "center", alignItems: "center",
    margin: 8,
  },
  emptyViewportText: { fontSize: 13, color: "#9ca3af" },
  selectionBtns: {
    flexDirection: "row", gap: 8, padding: 12, paddingTop: 4,
  },
  selBtn: {
    flex: 1, paddingVertical: 8, alignItems: "center",
    borderRadius: 8, borderWidth: 1, borderColor: "#e5e7eb",
    backgroundColor: "#f9fafb",
  },
  selBtnText: { fontSize: 13, color: "#7c3aed", fontWeight: "600" },
  fieldLabel: {
    fontSize: 11, fontWeight: "700", color: "#9ca3af",
    letterSpacing: 0.6, marginBottom: 4, paddingHorizontal: 14,
    marginTop: 2,
  },
  hintText: {
    fontSize: 12, color: "#9ca3af", paddingHorizontal: 14, marginTop: 2, marginBottom: 4,
  },
  input: {
    marginHorizontal: 14, borderWidth: 1, borderColor: "#e5e7eb",
    borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10,
    fontSize: 15, color: "#111827", backgroundColor: "#f9fafb",
  },
  presetBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    marginHorizontal: 14, borderWidth: 1, borderColor: "#ddd6fe",
    borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10,
    backgroundColor: "#faf5ff",
  },
  presetBtnText: { fontSize: 14, color: "#7c3aed", fontWeight: "600" },
  presetList: {
    marginHorizontal: 14, marginTop: 4,
    borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 8,
    backgroundColor: "#fff", overflow: "hidden",
  },
  presetItem: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 12, paddingVertical: 10,
  },
  presetItemText: { fontSize: 14, color: "#374151" },
  toggleRow: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 14,
  },
  toggleBtn: {
    paddingHorizontal: 14, paddingVertical: 7,
    borderRadius: 8, borderWidth: 1, borderColor: "#e5e7eb",
    backgroundColor: "#f9fafb",
  },
  toggleBtnOn: { borderColor: "#7c3aed", backgroundColor: "#faf5ff" },
  toggleBtnText: { fontSize: 13, fontWeight: "700", color: "#9ca3af" },
  toggleBtnTextOn: { color: "#7c3aed" },
  saveBtn: {
    backgroundColor: "#7c3aed", borderRadius: 10,
    paddingHorizontal: 16, paddingVertical: 8,
  },
  saveBtnDisabled: { backgroundColor: "#9ca3af" },
  saveBtnText: { fontSize: 14, fontWeight: "700", color: "#fff" },
});
