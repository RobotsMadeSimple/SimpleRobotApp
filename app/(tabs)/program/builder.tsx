import { useBuiltPrograms, usePoints, useTools } from "@/src/providers/RobotProvider";
import { robotClient } from "@/src/services/RobotConnectService";
import { BuiltProgram, ProgramStep, StepType } from "@/src/models/robotModels";
import { router, useLocalSearchParams } from "expo-router";
import {
  ArrowRight,
  Camera,
  Check,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Clock,
  Cpu,
  Edit2,
  GripVertical,
  ImagePlus,
  MessageSquare,
  OctagonX,
  Play,
  Plus,
  RefreshCw,
  Trash2,
  Wrench,
  X,
  Zap,
} from "lucide-react-native";
import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  Image,
  KeyboardAvoidingView,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

// ── Helpers ───────────────────────────────────────────────────────────────────

function newId() {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);
}

function stepLabel(step: ProgramStep): string {
  switch (step.type) {
    case "MoveL":
    case "MoveJ": {
      const hasOffset = step.offsetX || step.offsetY || step.offsetZ || step.offsetRX || step.offsetRY || step.offsetRZ;
      const suffix = [
        step.toolName  ? `tool:${step.toolName}` : null,
        hasOffset      ? "offset" : null,
      ].filter(Boolean).join("  ");
      const base = `${step.type}  →  ${step.pointName ?? "—"}`;
      return suffix ? `${base}  (${suffix})` : base;
    }
    case "SetOutput":    return `Output ${step.outputNumber ?? 1}  →  ${step.outputValue ? "ON" : "OFF"}`;
    case "Wait":         return `Wait  ${step.waitMs ?? 0} ms`;
    case "Loop":         return `Loop  ×${step.loopCount === 0 ? "∞" : (step.loopCount ?? 1)}`;
    case "StatusUpdate": return step.statusMessage ? `"${step.statusMessage}"` : "Status update";
    default:             return step.type;
  }
}

function StepIcon({ type, size = 16, color = "#6b7280" }: { type: StepType; size?: number; color?: string }) {
  switch (type) {
    case "MoveL":
    case "MoveJ":        return <ArrowRight    size={size} color={color} />;
    case "SetOutput":    return <Zap           size={size} color={color} />;
    case "Wait":         return <Clock         size={size} color={color} />;
    case "Loop":         return <RefreshCw     size={size} color={color} />;
    case "StatusUpdate": return <MessageSquare size={size} color={color} />;
    default:             return <Cpu           size={size} color={color} />;
  }
}

const STEP_TYPES: { type: StepType; label: string; desc: string }[] = [
  { type: "MoveL",        label: "Move Linear",   desc: "Move to a saved point in a straight line" },
  { type: "MoveJ",        label: "Move Joint",    desc: "Move to a saved point via joint interpolation" },
  { type: "SetOutput",    label: "Set Output",    desc: "Turn a digital output ON or OFF" },
  { type: "Wait",         label: "Wait",          desc: "Pause execution for a set duration" },
  { type: "Loop",         label: "Loop",          desc: "Repeat a block of steps N times" },
  { type: "StatusUpdate", label: "Status Update", desc: "Publish a message, warning, or error to the monitor" },
];

// ── Insert target — tracks where the next step should be placed ───────────────

type InsertTarget =
  | { mode: "append" }
  | { mode: "insert";      afterIndex: number }
  | { mode: "appendLoop";  loopId: string }
  | { mode: "insertLoop";  loopId: string; afterIndex: number };

// ── Drag info ─────────────────────────────────────────────────────────────────

type DragInfo = {
  id: string;
  loopId?: string; // set if dragging an inner loop step
  fromIndex: number;
  toIndex: number;
};

// ── Step type picker modal ────────────────────────────────────────────────────

function StepTypePicker({
  visible,
  onPick,
  onClose,
}: {
  visible: boolean;
  onPick: (type: StepType) => void;
  onClose: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={ms.overlay} onPress={onClose}>
        <Pressable style={ms.card} onPress={() => {}}>
          <View style={ms.header}>
            <Text style={ms.title}>Add Step</Text>
            <TouchableOpacity onPress={onClose} hitSlop={12} activeOpacity={0.7}>
              <X size={18} color="#9ca3af" />
            </TouchableOpacity>
          </View>
          {STEP_TYPES.map((s, i) => (
            <TouchableOpacity
              key={s.type}
              style={[ms.row, i < STEP_TYPES.length - 1 && ms.rowBorder]}
              onPress={() => { onPick(s.type); onClose(); }}
              activeOpacity={0.7}
            >
              <View style={ms.iconTile}>
                <StepIcon type={s.type} size={18} color="#2563eb" />
              </View>
              <View style={ms.rowText}>
                <Text style={ms.rowLabel}>{s.label}</Text>
                <Text style={ms.rowDesc}>{s.desc}</Text>
              </View>
              <ChevronRight size={16} color="#d1d5db" />
            </TouchableOpacity>
          ))}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ── Step config modal ─────────────────────────────────────────────────────────

function StepConfigModal({
  visible,
  step,
  onSave,
  onClose,
}: {
  visible: boolean;
  step: ProgramStep | null;
  onSave: (updated: ProgramStep) => void;
  onClose: () => void;
}) {
  const points = usePoints();
  const tools  = useTools();
  const [draft, setDraft] = useState<ProgramStep | null>(null);
  const [showOptStatus, setShowOptStatus] = useState(false);
  const [showOffset,    setShowOffset]    = useState(false);
  const [showToolOff,   setShowToolOff]   = useState(false);
  // Raw string for the Wait duration — allows the field to be fully cleared
  const [waitMsText, setWaitMsText] = useState("");

  useEffect(() => {
    if (step) {
      setDraft({ ...step });
      setWaitMsText(step.waitMs !== undefined ? String(step.waitMs) : "");
      setShowOptStatus(!!(step.statusMessage || step.statusWarning || step.statusError));
      setShowOffset(!!(step.offsetX || step.offsetY || step.offsetZ || step.offsetRX || step.offsetRY || step.offsetRZ));
      setShowToolOff(!!step.toolName);
    } else {
      setDraft(null);
      setWaitMsText("");
      setShowOptStatus(false);
      setShowOffset(false);
      setShowToolOff(false);
    }
  }, [step]);

  if (!draft) return null;

  const set = (fields: Partial<ProgramStep>) => setDraft(d => d ? { ...d, ...fields } : d);
  const isStatusStep = draft.type === "StatusUpdate";

  function renderBody() {
    switch (draft!.type) {
      case "MoveL":
      case "MoveJ":
        return (
          <>
            <Text style={ms.fieldLabel}>POINT</Text>
            <ScrollView style={{ maxHeight: 160 }} showsVerticalScrollIndicator={false}>
              {points.length === 0 && (
                <Text style={ms.emptyHint}>No points saved yet.</Text>
              )}
              {points.map((p, i) => {
                const active = draft!.pointName === p.name;
                return (
                  <TouchableOpacity
                    key={p.name}
                    style={[ms.row, i < points.length - 1 && ms.rowBorder, active && ms.rowActive]}
                    onPress={() => set({ pointName: p.name })}
                    activeOpacity={0.7}
                  >
                    <View style={[ms.radioRing, active && ms.radioRingActive]}>
                      {active && <View style={ms.radioDot} />}
                    </View>
                    <View style={ms.rowText}>
                      <Text style={[ms.rowLabel, active && ms.rowLabelActive]}>{p.name}</Text>
                      <Text style={ms.rowDesc}>
                        {p.x.toFixed(1)}, {p.y.toFixed(1)}, {p.z.toFixed(1)}
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            <Text style={[ms.fieldLabel, { marginTop: 14 }]}>SPEED  (mm/s)</Text>
            <TextInput
              style={ms.input}
              value={String(draft!.speed ?? 100)}
              onChangeText={v => set({ speed: parseFloat(v) || 100 })}
              keyboardType="numeric"
              selectTextOnFocus
            />

            <View style={ms.twoCol}>
              <View style={ms.twoColItem}>
                <Text style={[ms.fieldLabel, { marginTop: 10 }]}>ACCEL  (mm/s²)</Text>
                <TextInput
                  style={ms.input}
                  value={String(draft!.accel ?? 100)}
                  onChangeText={v => set({ accel: parseFloat(v) || 100 })}
                  keyboardType="numeric"
                  selectTextOnFocus
                />
              </View>
              <View style={ms.twoColItem}>
                <Text style={[ms.fieldLabel, { marginTop: 10 }]}>DECEL  (mm/s²)</Text>
                <TextInput
                  style={ms.input}
                  value={String(draft!.decel ?? 100)}
                  onChangeText={v => set({ decel: parseFloat(v) || 100 })}
                  keyboardType="numeric"
                  selectTextOnFocus
                />
              </View>
            </View>

            {/* ── Position Offset ── */}
            <View style={ms.optStatusWrap}>
              <TouchableOpacity
                style={ms.optStatusToggle}
                onPress={() => setShowOffset(v => !v)}
                activeOpacity={0.7}
              >
                <ArrowRight size={14} color="#6b7280" />
                <Text style={ms.optStatusToggleText}>Position offset</Text>
                {showOffset ? <ChevronUp size={14} color="#9ca3af" /> : <ChevronDown size={14} color="#9ca3af" />}
              </TouchableOpacity>
              {showOffset && (
                <View style={ms.optStatusBody}>
                  <View style={ms.twoCol}>
                    {(["offsetX","offsetY","offsetZ"] as const).map(k => (
                      <View key={k} style={ms.twoColItem}>
                        <Text style={ms.fieldLabel}>{k.replace("offset","").toUpperCase()}  (mm)</Text>
                        <TextInput
                          style={ms.input}
                          value={String(draft![k] ?? 0)}
                          onChangeText={v => set({ [k]: parseFloat(v) || 0 })}
                          keyboardType="numeric"
                          selectTextOnFocus
                        />
                      </View>
                    ))}
                  </View>
                  <View style={[ms.twoCol, { marginTop: 8 }]}>
                    {(["offsetRX","offsetRY","offsetRZ"] as const).map(k => (
                      <View key={k} style={ms.twoColItem}>
                        <Text style={ms.fieldLabel}>{k.replace("offset","").toUpperCase()}  (°)</Text>
                        <TextInput
                          style={ms.input}
                          value={String(draft![k] ?? 0)}
                          onChangeText={v => set({ [k]: parseFloat(v) || 0 })}
                          keyboardType="numeric"
                          selectTextOnFocus
                        />
                      </View>
                    ))}
                  </View>
                  <TouchableOpacity
                    onPress={() => set({ offsetX:undefined,offsetY:undefined,offsetZ:undefined,offsetRX:undefined,offsetRY:undefined,offsetRZ:undefined })}
                    style={{ marginTop: 8 }} activeOpacity={0.7}
                  >
                    <Text style={{ fontSize: 12, color: "#9ca3af" }}>Clear offset</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>

            {/* ── Tool Offset ── */}
            <View style={ms.optStatusWrap}>
              <TouchableOpacity
                style={ms.optStatusToggle}
                onPress={() => setShowToolOff(v => !v)}
                activeOpacity={0.7}
              >
                <Wrench size={14} color="#6b7280" />
                <Text style={ms.optStatusToggleText}>
                  Tool offset{draft!.toolName ? `:  ${draft!.toolName}` : ""}
                </Text>
                {showToolOff ? <ChevronUp size={14} color="#9ca3af" /> : <ChevronDown size={14} color="#9ca3af" />}
              </TouchableOpacity>
              {showToolOff && (
                <View style={ms.optStatusBody}>
                  {tools.length === 0 && (
                    <Text style={ms.emptyHint}>No tools saved yet.</Text>
                  )}
                  {/* None option */}
                  <TouchableOpacity
                    style={[ms.row, tools.length > 0 && ms.rowBorder, !draft!.toolName && ms.rowActive]}
                    onPress={() => set({ toolName: undefined })}
                    activeOpacity={0.7}
                  >
                    <View style={[ms.radioRing, !draft!.toolName && ms.radioRingActive]}>
                      {!draft!.toolName && <View style={ms.radioDot} />}
                    </View>
                    <Text style={[ms.rowLabel, !draft!.toolName && ms.rowLabelActive]}>None</Text>
                  </TouchableOpacity>
                  {tools.map((t, i) => {
                    const active = draft!.toolName === t.name;
                    return (
                      <TouchableOpacity
                        key={t.name}
                        style={[ms.row, i < tools.length - 1 && ms.rowBorder, active && ms.rowActive]}
                        onPress={() => set({ toolName: t.name })}
                        activeOpacity={0.7}
                      >
                        <View style={[ms.radioRing, active && ms.radioRingActive]}>
                          {active && <View style={ms.radioDot} />}
                        </View>
                        <View style={ms.rowText}>
                          <Text style={[ms.rowLabel, active && ms.rowLabelActive]}>{t.name}</Text>
                          <Text style={ms.rowDesc}>
                            {t.x.toFixed(1)}, {t.y.toFixed(1)}, {t.z.toFixed(1)}
                          </Text>
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}
            </View>
          </>
        );

      case "SetOutput":
        return (
          <>
            <Text style={ms.fieldLabel}>OUTPUT NUMBER</Text>
            <View style={ms.segRow}>
              {[1, 2, 3, 4].map(n => {
                const active = (draft!.outputNumber ?? 1) === n;
                return (
                  <TouchableOpacity
                    key={n}
                    style={[ms.seg, active && ms.segActive]}
                    onPress={() => set({ outputNumber: n })}
                    activeOpacity={0.8}
                  >
                    <Text style={[ms.segText, active && ms.segTextActive]}>{n}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <Text style={[ms.fieldLabel, { marginTop: 12 }]}>VALUE</Text>
            <View style={ms.switchRow}>
              <Text style={ms.switchLabel}>{draft!.outputValue ? "ON" : "OFF"}</Text>
              <Switch
                value={draft!.outputValue ?? false}
                onValueChange={v => set({ outputValue: v })}
                trackColor={{ false: "#e5e7eb", true: "#2563eb" }}
              />
            </View>
          </>
        );

      case "Wait":
        return (
          <>
            <Text style={ms.fieldLabel}>DURATION  (ms)</Text>
            <TextInput
              style={ms.input}
              value={waitMsText}
              onChangeText={v => {
                // Allow digits only; keep empty string so the user can clear and retype
                if (v === "" || /^\d+$/.test(v)) setWaitMsText(v);
              }}
              keyboardType="numeric"
              selectTextOnFocus
              autoFocus
            />
            {waitMsText === "" && (
              <Text style={ms.fieldError}>Enter a duration to save this step.</Text>
            )}
          </>
        );

      case "Loop":
        return (
          <>
            <Text style={ms.fieldLabel}>REPEAT COUNT  (0 = infinite)</Text>
            <TextInput
              style={ms.input}
              value={String(draft!.loopCount ?? 1)}
              onChangeText={v => set({ loopCount: parseInt(v) || 0 })}
              keyboardType="numeric"
              selectTextOnFocus
              autoFocus
            />
            <Text style={ms.hintText}>
              Add steps inside this loop from the builder after saving.
            </Text>
          </>
        );

      case "StatusUpdate":
        return (
          <>
            <Text style={ms.fieldLabel}>STEP MESSAGE</Text>
            <TextInput
              style={ms.input}
              value={draft!.statusMessage ?? ""}
              onChangeText={v => set({ statusMessage: v })}
              placeholder="e.g. Picking part from tray…"
              placeholderTextColor="#c4c4c4"
              returnKeyType="next"
              autoFocus
            />
            <Text style={[ms.fieldLabel, { marginTop: 12 }]}>WARNING  (optional)</Text>
            <TextInput
              style={ms.input}
              value={draft!.statusWarning ?? ""}
              onChangeText={v => set({ statusWarning: v || undefined })}
              placeholder="Leave blank for none"
              placeholderTextColor="#c4c4c4"
              returnKeyType="next"
            />
            <Text style={[ms.fieldLabel, { marginTop: 12 }]}>ERROR  (optional)</Text>
            <TextInput
              style={ms.input}
              value={draft!.statusError ?? ""}
              onChangeText={v => set({ statusError: v || undefined })}
              placeholder="Leave blank for none"
              placeholderTextColor="#c4c4c4"
              returnKeyType="done"
            />
            <Text style={ms.hintText}>
              The message appears as the current step description in the monitor.
              Setting an error will turn the program status to Error.
            </Text>
          </>
        );

      default:
        return null;
    }
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <Pressable style={ms.overlay} onPress={onClose}>
          <Pressable style={ms.card} onPress={() => {}}>
            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              <View style={ms.header}>
                <Text style={ms.title}>Configure Step</Text>
                <TouchableOpacity onPress={onClose} hitSlop={12} activeOpacity={0.7}>
                  <X size={18} color="#9ca3af" />
                </TouchableOpacity>
              </View>

              {/* Step name — available on every step type */}
              <Text style={ms.fieldLabel}>STEP NAME  (optional)</Text>
              <TextInput
                style={[ms.input, { marginBottom: 14 }]}
                value={draft!.name ?? ""}
                onChangeText={v => set({ name: v || undefined })}
                placeholder="e.g. Pick part, Place on conveyor…"
                placeholderTextColor="#c4c4c4"
                returnKeyType="next"
              />

              {renderBody()}

              {/* ── Optional status update (not shown for StatusUpdate steps) ── */}
              {!isStatusStep && (
                <View style={ms.optStatusWrap}>
                  <TouchableOpacity
                    style={ms.optStatusToggle}
                    onPress={() => setShowOptStatus(v => !v)}
                    activeOpacity={0.7}
                  >
                    <MessageSquare size={14} color="#6b7280" />
                    <Text style={ms.optStatusToggleText}>Update status</Text>
                    {showOptStatus
                      ? <ChevronUp size={14} color="#9ca3af" />
                      : <ChevronDown size={14} color="#9ca3af" />}
                  </TouchableOpacity>

                  {showOptStatus && (
                    <View style={ms.optStatusBody}>
                      <Text style={ms.fieldLabel}>STEP MESSAGE</Text>
                      <TextInput
                        style={ms.input}
                        value={draft!.statusMessage ?? ""}
                        onChangeText={v => set({ statusMessage: v || undefined })}
                        placeholder="Shown in monitor while this step runs"
                        placeholderTextColor="#c4c4c4"
                        returnKeyType="next"
                      />
                      <Text style={[ms.fieldLabel, { marginTop: 10 }]}>WARNING  (optional)</Text>
                      <TextInput
                        style={ms.input}
                        value={draft!.statusWarning ?? ""}
                        onChangeText={v => set({ statusWarning: v || undefined })}
                        placeholder="Leave blank for none"
                        placeholderTextColor="#c4c4c4"
                        returnKeyType="next"
                      />
                      <Text style={[ms.fieldLabel, { marginTop: 10 }]}>ERROR  (optional)</Text>
                      <TextInput
                        style={ms.input}
                        value={draft!.statusError ?? ""}
                        onChangeText={v => set({ statusError: v || undefined })}
                        placeholder="Leave blank for none"
                        placeholderTextColor="#c4c4c4"
                        returnKeyType="done"
                      />
                    </View>
                  )}
                </View>
              )}
            </ScrollView>

            <View style={ms.actions}>
              <TouchableOpacity style={ms.cancelBtn} onPress={onClose} activeOpacity={0.7}>
                <Text style={ms.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={ms.saveBtn}
                onPress={() => {
                  if (draft!.type === "Wait") {
                    const ms = parseInt(waitMsText);
                    if (!waitMsText || isNaN(ms) || ms <= 0) return; // blocked — error hint shown
                    onSave({ ...draft!, waitMs: ms });
                  } else {
                    onSave(draft!);
                  }
                  onClose();
                }}
                activeOpacity={0.7}
              >
                <Check size={15} color="white" />
                <Text style={ms.saveText}>Save</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ── Insert divider ────────────────────────────────────────────────────────────

function InsertDivider({ onPress, inner }: { onPress: () => void; inner?: boolean }) {
  return (
    <TouchableOpacity
      style={[styles.insertDivider, inner && styles.insertDividerInner]}
      onPress={onPress}
      activeOpacity={0.6}
      hitSlop={4}
    >
      <View style={styles.insertLine} />
      <View style={styles.insertBtn}>
        <Plus size={10} color="#2563eb" />
      </View>
      <View style={styles.insertLine} />
    </TouchableOpacity>
  );
}

// ── Drag handle ───────────────────────────────────────────────────────────────

function DragHandle({
  stepId,
  loopId,
  onStart,
  onMove,
  onEnd,
}: {
  stepId: string;
  loopId?: string;
  onStart: (id: string, loopId?: string) => void;
  onMove: (id: string, dy: number, loopId?: string) => void;
  onEnd: (id: string, loopId?: string) => void;
}) {
  // Keep latest callbacks in refs so the PanResponder (created once) always calls current versions
  const sidRef  = useRef(stepId);
  const lidRef  = useRef(loopId);
  const startRef = useRef(onStart);
  const moveRef  = useRef(onMove);
  const endRef   = useRef(onEnd);
  sidRef.current  = stepId;
  lidRef.current  = loopId;
  startRef.current = onStart;
  moveRef.current  = onMove;
  endRef.current   = onEnd;

  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder:  () => true,
      onPanResponderGrant:     ()       => startRef.current(sidRef.current, lidRef.current),
      onPanResponderMove:      (_, gs)  => moveRef.current(sidRef.current, gs.dy, lidRef.current),
      onPanResponderRelease:   ()       => endRef.current(sidRef.current, lidRef.current),
      onPanResponderTerminate: ()       => endRef.current(sidRef.current, lidRef.current),
    })
  ).current;

  return (
    <View {...responder.panHandlers} style={styles.dragHandle} hitSlop={6}>
      <GripVertical size={16} color="#d1d5db" />
    </View>
  );
}

// ── Loop inner row ─────────────────────────────────────────────────────────────

function LoopInnerRow({
  step,
  index,
  loopId,
  isBeingDragged,
  isDropTarget,
  onEdit,
  onDelete,
  onDragStart,
  onDragMove,
  onDragEnd,
  onItemLayout,
}: {
  step: ProgramStep;
  index: number;
  loopId: string;
  isBeingDragged: boolean;
  isDropTarget: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onDragStart: (id: string, loopId?: string) => void;
  onDragMove: (id: string, dy: number, loopId?: string) => void;
  onDragEnd: (id: string, loopId?: string) => void;
  onItemLayout: (id: string, height: number) => void;
}) {
  return (
    <View
      onLayout={e => onItemLayout(step.id, e.nativeEvent.layout.height)}
      style={[
        isBeingDragged && styles.draggingItem,
        isDropTarget   && styles.dropTargetItem,
      ]}
    >
      <TouchableOpacity
        style={[styles.stepRow, styles.stepRowIndentDeep]}
        onPress={onEdit}
        activeOpacity={0.75}
      >
        <DragHandle
          stepId={step.id}
          loopId={loopId}
          onStart={onDragStart}
          onMove={onDragMove}
          onEnd={onDragEnd}
        />
        <View style={[styles.stepIndexBadge, styles.stepIndexBadgeInner]}>
          <Text style={styles.stepIndexText}>{index + 1}</Text>
        </View>
        <View style={[styles.stepIconTile, styles.stepIconTileInner]}>
          <StepIcon type={step.type} size={14} color="#7c3aed" />
        </View>
        <View style={styles.stepLabelCol}>
          <Text style={styles.stepLabel} numberOfLines={1}>
            {step.name || stepLabel(step)}
          </Text>
          {step.name && (
            <Text style={styles.stepSubLabel} numberOfLines={1}>{stepLabel(step)}</Text>
          )}
          {step.statusMessage && (
            <Text style={styles.stepStatusHint} numberOfLines={1}>{step.statusMessage}</Text>
          )}
        </View>

        <TouchableOpacity onPress={onDelete} hitSlop={6} style={styles.stepAction} activeOpacity={0.7}>
          <Trash2 size={14} color="#ef4444" />
        </TouchableOpacity>
      </TouchableOpacity>
    </View>
  );
}

// ── Top-level step row ─────────────────────────────────────────────────────────

function StepRow({
  step,
  index,
  isLast,
  isBeingDragged,
  isDropTarget,
  isDragging,
  collapsed,
  innerDrag,
  onToggleCollapse,
  onEdit,
  onDelete,
  onDragStart,
  onDragMove,
  onDragEnd,
  onInsertAfter,
  onInsertInner,
  onEditInner,
  onDeleteInner,
  onInsertAfterInner,
  onItemLayout,
}: {
  step: ProgramStep;
  index: number;
  isLast: boolean;
  isBeingDragged: boolean;
  isDropTarget: boolean;
  isDragging: boolean;
  collapsed: boolean;
  innerDrag: DragInfo | null;
  onToggleCollapse: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onDragStart: (id: string, loopId?: string) => void;
  onDragMove: (id: string, dy: number, loopId?: string) => void;
  onDragEnd: (id: string, loopId?: string) => void;
  onInsertAfter: () => void;
  onInsertInner: () => void;
  onEditInner: (inner: ProgramStep) => void;
  onDeleteInner: (id: string) => void;
  onInsertAfterInner: (afterIndex: number) => void;
  onItemLayout: (id: string, height: number) => void;
}) {
  const isLoop     = step.type === "Loop";
  const innerSteps = step.loopSteps ?? [];
  const isExpanded = isLoop && !collapsed;

  return (
    <View
      onLayout={e => onItemLayout(step.id, e.nativeEvent.layout.height)}
      style={[
        isBeingDragged && styles.draggingItem,
        isDropTarget   && styles.dropTargetItem,
      ]}
    >
      {/* Main row */}
      <TouchableOpacity style={styles.stepRow} onPress={onEdit} activeOpacity={0.75}>
        <DragHandle stepId={step.id} onStart={onDragStart} onMove={onDragMove} onEnd={onDragEnd} />

        <View style={styles.stepIndexBadge}>
          <Text style={styles.stepIndexText}>{index + 1}</Text>
        </View>
        <View style={styles.stepIconTile}>
          <StepIcon type={step.type} size={16} color="#2563eb" />
        </View>
        <View style={styles.stepLabelCol}>
          <Text style={styles.stepLabel} numberOfLines={1}>
            {step.name || stepLabel(step)}
          </Text>
          {step.name && (
            <Text style={styles.stepSubLabel} numberOfLines={1}>{stepLabel(step)}</Text>
          )}
          {step.statusMessage && (
            <Text style={styles.stepStatusHint} numberOfLines={1}>{step.statusMessage}</Text>
          )}
        </View>

        {/* Loop collapse toggle */}
        {isLoop && (
          <TouchableOpacity onPress={onToggleCollapse} hitSlop={8} style={styles.stepAction} activeOpacity={0.7}>
            {collapsed
              ? <ChevronDown size={15} color="#9ca3af" />
              : <ChevronUp   size={15} color="#9ca3af" />}
          </TouchableOpacity>
        )}

        <TouchableOpacity onPress={onEdit}   hitSlop={6} style={styles.stepAction} activeOpacity={0.7}>
          <Edit2  size={15} color="#9ca3af" />
        </TouchableOpacity>
        <TouchableOpacity onPress={onDelete} hitSlop={6} style={styles.stepAction} activeOpacity={0.7}>
          <Trash2 size={15} color="#ef4444" />
        </TouchableOpacity>
      </TouchableOpacity>

      {/* Loop body */}
      {isExpanded && (
        <View style={styles.loopBody}>
          <View style={styles.loopSidebar} />
          <View style={styles.loopContent}>
            {innerSteps.length === 0 && (
              <Text style={styles.loopEmptyText}>No inner steps</Text>
            )}
            {innerSteps.map((inner, j) => (
              <React.Fragment key={inner.id}>
                <LoopInnerRow
                  step={inner}
                  index={j}
                  loopId={step.id}
                  isBeingDragged={innerDrag?.id === inner.id}
                  isDropTarget={!!(innerDrag && innerDrag.toIndex === j && innerDrag.id !== inner.id)}
                  onEdit={() => onEditInner(inner)}
                  onDelete={() => onDeleteInner(inner.id)}
                  onDragStart={onDragStart}
                  onDragMove={onDragMove}
                  onDragEnd={onDragEnd}
                  onItemLayout={onItemLayout}
                />
                {j < innerSteps.length - 1 && !isDragging && (
                  <InsertDivider inner onPress={() => onInsertAfterInner(j)} />
                )}
              </React.Fragment>
            ))}

            <TouchableOpacity style={styles.addInnerBtn} onPress={onInsertInner} activeOpacity={0.7}>
              <Plus size={13} color="#2563eb" />
              <Text style={styles.addInnerText}>Add step inside loop</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Insert divider between top-level steps */}
      {!isLast && !isDragging && <InsertDivider onPress={onInsertAfter} />}
    </View>
  );
}

// ── Builder screen ────────────────────────────────────────────────────────────

export default function BuilderScreen() {
  const { name: editName } = useLocalSearchParams<{ name?: string }>();
  const builtPrograms = useBuiltPrograms();

  const existing = editName
    ? builtPrograms.find(p => p.name === editName) ?? null
    : null;

  const [programName, setProgramName] = useState(existing?.name ?? "");
  const [description, setDescription] = useState(existing?.description ?? "");
  const [steps, setSteps]             = useState<ProgramStep[]>(existing?.steps ?? []);
  const [coverImage, setCoverImage]   = useState<string | null>(null);

  // Load existing cover image when editing
  useEffect(() => {
    if (!editName) return;
    robotClient.getProgramImages()
      .then(imgs => { if (imgs[editName]) setCoverImage(imgs[editName]!); })
      .catch(() => {});
  }, [editName]);

  // Assign fresh IDs to any steps that lost theirs during server round-trip
  function rehydrateIds(src: ProgramStep[]): ProgramStep[] {
    return src.map(s => ({
      ...s,
      id: s.id || newId(),
      loopSteps: s.loopSteps ? rehydrateIds(s.loopSteps) : s.loopSteps,
    }));
  }

  useEffect(() => {
    if (existing) {
      setProgramName(existing.name);
      setDescription(existing.description);
      setSteps(rehydrateIds(existing.steps));
    }
  }, [existing?.name]);

  // ── Cover image helpers ────────────────────────────────────────────────────

  async function processImage(uri: string): Promise<string> {
    // Get image dimensions so we can square-crop from the centre
    const info = await ImageManipulator.manipulateAsync(uri, [], { base64: false });
    const { width, height } = info;
    const side = Math.min(width, height);
    const cropActions: ImageManipulator.Action[] = [
      {
        crop: {
          originX: Math.floor((width  - side) / 2),
          originY: Math.floor((height - side) / 2),
          width:  side,
          height: side,
        },
      },
      { resize: { width: 400, height: 400 } },
    ];
    const result = await ImageManipulator.manipulateAsync(uri, cropActions, {
      compress: 0.72,
      format: ImageManipulator.SaveFormat.JPEG,
      base64: true,
    });
    return result.base64!;
  }

  async function pickFromCamera() {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("Permission needed", "Camera access is required to take a photo.");
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      aspect: [1, 1],
      quality: 1,
    });
    if (result.canceled) return;
    const b64 = await processImage(result.assets[0].uri);
    setCoverImage(b64);
  }

  async function pickFromLibrary() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("Permission needed", "Photo library access is required.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      allowsEditing: true,
      aspect: [1, 1],
      quality: 1,
      mediaTypes: "images",
    });
    if (result.canceled) return;
    const b64 = await processImage(result.assets[0].uri);
    setCoverImage(b64);
  }

  // Sync steps to a ref so drag callbacks always see the latest array
  const stepsRef = useRef(steps);
  useEffect(() => { stepsRef.current = steps; }, [steps]);

  // ── UI state ──────────────────────────────────────────────────────────────

  const [typePickerOpen, setTypePickerOpen] = useState(false);
  const [configOpen, setConfigOpen]         = useState(false);
  const [editingStep, setEditingStep]       = useState<ProgramStep | null>(null);
  const [insertTarget, setInsertTarget]     = useState<InsertTarget>({ mode: "append" });
  // Ref mirrors state so addStep always reads the latest value regardless of closure age
  const insertTargetRef = useRef<InsertTarget>({ mode: "append" });

  // Loop collapse — keys in set are EXPANDED; by default everything is collapsed
  const [expandedLoops, setExpandedLoops] = useState<Set<string>>(new Set());
  function toggleLoop(id: string) {
    setExpandedLoops(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  // ── Drag state ────────────────────────────────────────────────────────────

  const [drag, setDrag] = useState<DragInfo | null>(null);
  const dragRef = useRef<DragInfo | null>(null);

  // Heights of every row (step.id → px) — measured via onLayout
  const itemHeightsRef = useRef<Map<string, number>>(new Map());

  const handleItemLayout = useCallback((id: string, height: number) => {
    itemHeightsRef.current.set(id, height);
  }, []);

  function calcDropIndex(fromIndex: number, dy: number, arr: ProgramStep[]): number {
    if (fromIndex < 0 || arr.length < 2) return Math.max(0, Math.min(arr.length - 1, fromIndex));
    const DEFAULT_H = 52;
    let target = fromIndex;
    let accumulated = 0;

    if (dy > 0) {
      for (let i = fromIndex + 1; i < arr.length; i++) {
        const h = itemHeightsRef.current.get(arr[i].id) ?? DEFAULT_H;
        if (dy > accumulated + h / 2) { target = i; accumulated += h; }
        else break;
      }
    } else {
      for (let i = fromIndex - 1; i >= 0; i--) {
        const h = itemHeightsRef.current.get(arr[i].id) ?? DEFAULT_H;
        if (-dy > accumulated + h / 2) { target = i; accumulated += h; }
        else break;
      }
    }
    return target;
  }

  function handleDragStart(stepId: string, loopId?: string) {
    if (loopId) {
      const loop = stepsRef.current.find(s => s.id === loopId);
      const idx  = loop?.loopSteps?.findIndex(s => s.id === stepId) ?? -1;
      const info: DragInfo = { id: stepId, loopId, fromIndex: idx, toIndex: idx };
      dragRef.current = info;
      setDrag(info);
    } else {
      const idx  = stepsRef.current.findIndex(s => s.id === stepId);
      const info: DragInfo = { id: stepId, fromIndex: idx, toIndex: idx };
      dragRef.current = info;
      setDrag(info);
    }
  }

  function handleDragMove(stepId: string, dy: number, loopId?: string) {
    const d = dragRef.current;
    if (!d || d.id !== stepId) return;

    const arr = loopId
      ? (stepsRef.current.find(s => s.id === loopId)?.loopSteps ?? [])
      : stepsRef.current;

    const newTo = calcDropIndex(d.fromIndex, dy, arr);
    if (newTo !== d.toIndex) {
      const updated = { ...d, toIndex: newTo };
      dragRef.current = updated;
      setDrag(updated);
    }
  }

  function handleDragEnd(stepId: string, loopId?: string) {
    const d = dragRef.current;
    if (d && d.id === stepId && d.toIndex !== d.fromIndex) {
      if (loopId) {
        moveLoopStepTo(loopId, d.fromIndex, d.toIndex);
      } else {
        moveStepTo(d.fromIndex, d.toIndex);
      }
    }
    dragRef.current = null;
    setDrag(null);
  }

  // ── Step helpers ──────────────────────────────────────────────────────────

  function defaultStep(type: StepType): ProgramStep {
    return {
      id: newId(), type,
      name: undefined,
      pointName: undefined,
      speed: 100, accel: 100, decel: 100,
      offsetX: undefined, offsetY: undefined, offsetZ: undefined,
      offsetRX: undefined, offsetRY: undefined, offsetRZ: undefined,
      toolName: undefined,
      outputNumber: 1, outputValue: false,
      waitMs: 500,
      loopCount: 1, loopSteps: type === "Loop" ? [] : undefined,
      statusMessage: undefined, statusWarning: undefined, statusError: undefined,
    };
  }

  function openTypePicker(target: InsertTarget) {
    insertTargetRef.current = target; // sync update so addStep always sees latest
    setInsertTarget(target);
    setTypePickerOpen(true);
  }

  function addStep(type: StepType) {
    const target = insertTargetRef.current; // read from ref, never stale
    const step = defaultStep(type);

    setSteps(prev => {
      const arr = [...prev];
      switch (target.mode) {
        case "append":
          return [...arr, step];
        case "insert":
          arr.splice(target.afterIndex + 1, 0, step);
          return arr;
        case "appendLoop":
          return arr.map(s =>
            s.id === target.loopId
              ? { ...s, loopSteps: [...(s.loopSteps ?? []), step] }
              : s
          );
        case "insertLoop":
          return arr.map(s => {
            if (s.id !== target.loopId) return s;
            const inner = [...(s.loopSteps ?? [])];
            inner.splice(target.afterIndex + 1, 0, step);
            return { ...s, loopSteps: inner };
          });
      }
    });

    // If adding to a loop, make sure it's expanded
    if (target.mode === "appendLoop" || target.mode === "insertLoop") {
      setExpandedLoops(prev => new Set([...prev, target.loopId]));
    }

    setEditingStep(step);
    setConfigOpen(true);
  }

  function updateStep(updated: ProgramStep) {
    setSteps(prev => {
      if (prev.some(s => s.id === updated.id))
        return prev.map(s => s.id === updated.id ? updated : s);
      return prev.map(s =>
        s.loopSteps
          ? { ...s, loopSteps: s.loopSteps.map(ls => ls.id === updated.id ? updated : ls) }
          : s
      );
    });
  }

  function deleteStep(id: string) {
    setSteps(prev => {
      if (prev.some(s => s.id === id)) return prev.filter(s => s.id !== id);
      return prev.map(s =>
        s.loopSteps
          ? { ...s, loopSteps: s.loopSteps.filter(ls => ls.id !== id) }
          : s
      );
    });
  }

  function moveStepTo(from: number, to: number) {
    setSteps(prev => {
      const arr = [...prev];
      const [removed] = arr.splice(from, 1);
      arr.splice(to, 0, removed);
      return arr;
    });
  }

  function moveLoopStepTo(loopId: string, from: number, to: number) {
    setSteps(prev => prev.map(s => {
      if (s.id !== loopId || !s.loopSteps) return s;
      const arr = [...s.loopSteps];
      const [removed] = arr.splice(from, 1);
      arr.splice(to, 0, removed);
      return { ...s, loopSteps: arr };
    }));
  }

  // ── Save / Run ────────────────────────────────────────────────────────────

  async function save(): Promise<boolean> {
    const name = programName.trim();
    if (!name) {
      Alert.alert("Name required", "Please give the program a name.");
      return false;
    }
    const prog: BuiltProgram = {
      name, description: description.trim(), steps, lastUpdatedUnixMs: 0,
    };
    await robotClient.saveBuiltProgram(prog).catch(() => {});
    if (coverImage) {
      await robotClient.saveProgramImage(name, coverImage).catch(() => {});
    }
    return true;
  }

  async function handleSave() { if (await save()) router.back(); }

  async function handleRun() {
    if (!(await save())) return;
    const name = programName.trim();
    await robotClient.executeBuiltProgram(name).catch(() => {});
    router.push(`/(tabs)/program/monitor-program?name=${encodeURIComponent(name)}`);
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        scrollEnabled={drag === null}
      >
        {/* Name + description */}
        <View style={styles.metaCard}>
          <TextInput
            style={styles.nameInput}
            value={programName}
            onChangeText={setProgramName}
            placeholder="Program name…"
            placeholderTextColor="#9ca3af"
            returnKeyType="next"
          />
          <View style={styles.metaSep} />
          <TextInput
            style={styles.descInput}
            value={description}
            onChangeText={setDescription}
            placeholder="Description (optional)"
            placeholderTextColor="#c4c4c4"
            returnKeyType="done"
          />
          <View style={styles.metaSep} />

          {/* Cover image row */}
          <View style={styles.imageRow}>
            {/* Preview */}
            <View style={styles.imagePreviewWrap}>
              {coverImage ? (
                <Image
                  source={{ uri: `data:image/jpeg;base64,${coverImage}` }}
                  style={styles.imagePreview}
                />
              ) : (
                <View style={styles.imagePreviewPlaceholder}>
                  <ImagePlus size={22} color="#d1d5db" />
                </View>
              )}
            </View>

            {/* Picker buttons */}
            <View style={styles.imageActions}>
              <TouchableOpacity style={styles.imageBtn} onPress={pickFromCamera} activeOpacity={0.75}>
                <Camera size={15} color="#2563eb" />
                <Text style={styles.imageBtnText}>Camera</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.imageBtn} onPress={pickFromLibrary} activeOpacity={0.75}>
                <ImagePlus size={15} color="#2563eb" />
                <Text style={styles.imageBtnText}>Photo Library</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* Steps */}
        <Text style={styles.sectionLabel}>STEPS</Text>

        {steps.length === 0 ? (
          <View style={styles.emptySteps}>
            <Cpu size={32} color="#d1d5db" />
            <Text style={styles.emptyStepsText}>No steps yet</Text>
          </View>
        ) : (
          <View style={styles.stepsCard}>
            {steps.map((step, i) => (
              <StepRow
                key={step.id}
                step={step}
                index={i}
                isLast={i === steps.length - 1}
                isBeingDragged={drag?.id === step.id && !drag.loopId}
                isDropTarget={!!(drag && !drag.loopId && drag.toIndex === i && drag.id !== step.id)}
                isDragging={!!(drag && !drag.loopId)}
                collapsed={!expandedLoops.has(step.id)}
                innerDrag={drag?.loopId === step.id ? drag : null}
                onToggleCollapse={() => toggleLoop(step.id)}
                onEdit={() => { setEditingStep(step); setConfigOpen(true); }}
                onDelete={() => Alert.alert("Delete Step", "Remove this step?", [
                  { text: "Cancel", style: "cancel" },
                  { text: "Delete", style: "destructive", onPress: () => deleteStep(step.id) },
                ])}
                onDragStart={handleDragStart}
                onDragMove={handleDragMove}
                onDragEnd={handleDragEnd}
                onInsertAfter={() => openTypePicker({ mode: "insert", afterIndex: i })}
                onInsertInner={() => openTypePicker({ mode: "appendLoop", loopId: step.id })}
                onEditInner={inner => { setEditingStep(inner); setConfigOpen(true); }}
                onDeleteInner={id => Alert.alert("Delete Step", "Remove this inner step?", [
                  { text: "Cancel", style: "cancel" },
                  { text: "Delete", style: "destructive", onPress: () => deleteStep(id) },
                ])}
                onInsertAfterInner={j => openTypePicker({ mode: "insertLoop", loopId: step.id, afterIndex: j })}
                onItemLayout={handleItemLayout}
              />
            ))}
          </View>
        )}

        {/* Add step */}
        <TouchableOpacity
          style={styles.addCard}
          onPress={() => openTypePicker({ mode: "append" })}
          activeOpacity={0.7}
        >
          <Plus size={16} color="#2563eb" />
          <Text style={styles.addCardText}>Add Step</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Bottom bar */}
      <View style={styles.bottomBar}>
        <TouchableOpacity style={styles.stopBtn} onPress={() => robotClient.stopBuiltProgram(programName.trim())} activeOpacity={0.8}>
          <OctagonX size={18} color="#dc2626" />
        </TouchableOpacity>
        <TouchableOpacity style={styles.saveBtn} onPress={handleSave} activeOpacity={0.8}>
          <Wrench size={16} color="#2563eb" />
          <Text style={styles.saveBtnText}>Save</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.runBtn} onPress={handleRun} activeOpacity={0.8}>
          <Play size={16} color="white" />
          <Text style={styles.runBtnText}>Run</Text>
        </TouchableOpacity>
      </View>

      <StepTypePicker
        visible={typePickerOpen}
        onPick={addStep}
        onClose={() => setTypePickerOpen(false)}
      />
      <StepConfigModal
        visible={configOpen}
        step={editingStep}
        onSave={updateStep}
        onClose={() => setConfigOpen(false)}
      />
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f3f4f6" },
  content:   { padding: 16, paddingBottom: 32, gap: 12 },

  metaCard: {
    backgroundColor: "#fff",
    borderRadius: 14,
    overflow: "hidden",
    shadowColor: "#000", shadowOpacity: 0.07, shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 }, elevation: 3,
  },
  nameInput: {
    fontSize: 17, fontWeight: "700", color: "#111827",
    paddingHorizontal: 16, paddingVertical: 14,
  },
  metaSep:  { height: StyleSheet.hairlineWidth, backgroundColor: "#e5e7eb" },
  descInput: {
    fontSize: 14, color: "#6b7280",
    paddingHorizontal: 16, paddingVertical: 12,
  },

  // Cover image row
  imageRow: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 16, paddingVertical: 12, gap: 14,
  },
  imagePreviewWrap: {
    width: 72, height: 72, borderRadius: 10, overflow: "hidden",
  },
  imagePreview: { width: 72, height: 72 },
  imagePreviewPlaceholder: {
    width: 72, height: 72, borderRadius: 10,
    backgroundColor: "#f3f4f6", borderWidth: 1.5,
    borderColor: "#e5e7eb", borderStyle: "dashed",
    justifyContent: "center", alignItems: "center",
  },
  imageActions: { flex: 1, gap: 8 },
  imageBtn: {
    flexDirection: "row", alignItems: "center", gap: 7,
    borderWidth: 1.5, borderColor: "#bfdbfe", borderRadius: 8,
    paddingVertical: 8, paddingHorizontal: 12,
    backgroundColor: "#eff6ff",
  },
  imageBtnText: { fontSize: 13, fontWeight: "600", color: "#2563eb" },

  sectionLabel: {
    fontSize: 11, fontWeight: "700", color: "#6b7280", letterSpacing: 0.8,
  },

  emptySteps: {
    backgroundColor: "#fff", borderRadius: 14, paddingVertical: 32,
    alignItems: "center", gap: 8,
    shadowColor: "#000", shadowOpacity: 0.07, shadowRadius: 8, elevation: 3,
  },
  emptyStepsText: { fontSize: 14, color: "#9ca3af" },

  stepsCard: {
    backgroundColor: "#fff", borderRadius: 14, overflow: "hidden",
    shadowColor: "#000", shadowOpacity: 0.07, shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 }, elevation: 3,
  },

  // Step row
  stepRow: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 10, paddingVertical: 11, gap: 8,
  },
  stepRowIndentDeep: { paddingLeft: 8 },

  dragHandle: {
    paddingHorizontal: 4,
    justifyContent: "center", alignItems: "center",
  },

  stepIndexBadge: {
    width: 22, height: 22, borderRadius: 6,
    backgroundColor: "#f3f4f6", justifyContent: "center", alignItems: "center",
  },
  stepIndexBadgeInner: { backgroundColor: "#f5f3ff" },
  stepIndexText: { fontSize: 11, fontWeight: "700", color: "#6b7280" },

  stepIconTile: {
    width: 30, height: 30, borderRadius: 8,
    backgroundColor: "#eff6ff", justifyContent: "center", alignItems: "center",
  },
  stepIconTileInner: { backgroundColor: "#f5f3ff" },

  stepLabelCol:   { flex: 1, gap: 1, minWidth: 0 },
  stepLabel:      { fontSize: 14, fontWeight: "500", color: "#111827" },
  stepSubLabel:   { fontSize: 11, color: "#9ca3af" },
  stepStatusHint: { fontSize: 11, color: "#93c5fd", fontStyle: "italic" },
  stepAction: { padding: 3 },

  // Drag visual feedback
  draggingItem: { opacity: 0.35 },
  dropTargetItem: {
    borderTopWidth: 2,
    borderTopColor: "#2563eb",
  },

  // Loop body
  loopBody: {
    flexDirection: "row",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#e5e7eb",
  },
  loopSidebar: {
    width: 3, backgroundColor: "#ddd6fe", marginLeft: 24, marginVertical: 6, borderRadius: 2,
  },
  loopContent: { flex: 1, paddingLeft: 8, paddingBottom: 6 },
  loopEmptyText: {
    fontSize: 12, color: "#c4b5fd", fontStyle: "italic",
    paddingVertical: 8, paddingLeft: 8,
  },

  addInnerBtn: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingVertical: 9, paddingLeft: 8,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "#ede9fe",
  },
  addInnerText: { fontSize: 13, color: "#2563eb", fontWeight: "600" },

  // Insert divider
  insertDivider: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 14, paddingVertical: 2, gap: 6,
  },
  insertDividerInner: { paddingHorizontal: 8, paddingVertical: 1 },
  insertLine: { flex: 1, height: 1, backgroundColor: "#e5e7eb" },
  insertBtn: {
    width: 18, height: 18, borderRadius: 9,
    backgroundColor: "#eff6ff", borderWidth: 1, borderColor: "#bfdbfe",
    justifyContent: "center", alignItems: "center",
  },

  addCard: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 8, borderWidth: 1.5, borderColor: "#2563eb", borderRadius: 14,
    paddingVertical: 14, backgroundColor: "transparent",
  },
  addCardText: { fontSize: 14, fontWeight: "600", color: "#2563eb" },

  bottomBar: {
    flexDirection: "row", gap: 10, paddingHorizontal: 16,
    paddingTop: 10, paddingBottom: 14,
    backgroundColor: "#f3f4f6",
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "#e5e7eb",
  },
  stopBtn: {
    width: 48, height: 48, borderRadius: 12, backgroundColor: "#fee2e2",
    justifyContent: "center", alignItems: "center",
  },
  saveBtn: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 7, borderWidth: 1.5, borderColor: "#2563eb", borderRadius: 12,
    paddingVertical: 13, backgroundColor: "#eff6ff",
  },
  saveBtnText: { fontSize: 15, fontWeight: "600", color: "#2563eb" },
  runBtn: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 7, backgroundColor: "#2563eb", borderRadius: 12, paddingVertical: 13,
  },
  runBtnText: { fontSize: 15, fontWeight: "700", color: "#fff" },
});

// ── Modal styles ──────────────────────────────────────────────────────────────

const ms = StyleSheet.create({
  overlay: {
    flex: 1, backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "center", alignItems: "center", padding: 24,
  },
  card: {
    width: "100%", maxWidth: 360, maxHeight: "88%",
    backgroundColor: "#fff", borderRadius: 18, padding: 20,
    shadowColor: "#000", shadowOpacity: 0.2, shadowRadius: 16, elevation: 10,
  },
  header: {
    flexDirection: "row", justifyContent: "space-between",
    alignItems: "center", marginBottom: 16,
  },
  title: { fontSize: 17, fontWeight: "700", color: "#111" },

  row: { flexDirection: "row", alignItems: "center", paddingVertical: 12, gap: 12 },
  rowBorder: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "#e5e7eb" },
  rowActive: { backgroundColor: "#f0f9ff" },
  iconTile: {
    width: 38, height: 38, borderRadius: 10,
    backgroundColor: "#eff6ff", justifyContent: "center", alignItems: "center",
  },
  rowText:        { flex: 1 },
  rowLabel:       { fontSize: 15, fontWeight: "600", color: "#111827" },
  rowLabelActive: { color: "#2563eb" },
  rowDesc:        { fontSize: 12, color: "#9ca3af", marginTop: 1 },

  radioRing: {
    width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: "#d1d5db",
    justifyContent: "center", alignItems: "center",
  },
  radioRingActive: { borderColor: "#2563eb" },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: "#2563eb" },

  fieldLabel: { fontSize: 11, fontWeight: "700", color: "#6b7280", letterSpacing: 0.6 },
  input: {
    borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 10,
    fontSize: 15, color: "#111827", marginTop: 6,
  },
  emptyHint: { fontSize: 13, color: "#9ca3af", paddingVertical: 8, textAlign: "center" },
  hintText:   { fontSize: 12, color: "#9ca3af", marginTop: 8, lineHeight: 16 },
  fieldError: { fontSize: 12, color: "#dc2626", marginTop: 6 },

  // Two-column layout for accel/decel
  twoCol:     { flexDirection: "row", gap: 10 },
  twoColItem: { flex: 1 },

  segRow: { flexDirection: "row", gap: 8, marginTop: 6 },
  seg: {
    flex: 1, paddingVertical: 10, borderRadius: 10,
    borderWidth: 1, borderColor: "#e5e7eb", alignItems: "center",
  },
  segActive:     { borderColor: "#2563eb", backgroundColor: "#eff6ff" },
  segText:       { fontSize: 15, fontWeight: "600", color: "#6b7280" },
  segTextActive: { color: "#2563eb" },

  switchRow:  { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 6 },
  switchLabel: { fontSize: 15, fontWeight: "600", color: "#111827" },

  actions: {
    flexDirection: "row", gap: 10, marginTop: 16,
    paddingTop: 14, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "#e5e7eb",
  },
  cancelBtn: {
    flex: 1, paddingVertical: 13, borderRadius: 12,
    borderWidth: 1, borderColor: "#e5e7eb", alignItems: "center",
  },
  cancelText: { fontSize: 15, color: "#6b7280", fontWeight: "600" },
  saveBtn: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 7, backgroundColor: "#2563eb", borderRadius: 12, paddingVertical: 13,
  },
  saveText: { fontSize: 15, fontWeight: "700", color: "#fff" },

  // Optional status section
  optStatusWrap: {
    marginTop: 16, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "#e5e7eb",
  },
  optStatusToggle: {
    flexDirection: "row", alignItems: "center", gap: 7, paddingVertical: 12,
  },
  optStatusToggleText: { flex: 1, fontSize: 13, color: "#6b7280", fontWeight: "600" },
  optStatusBody: { paddingBottom: 4 },
});
