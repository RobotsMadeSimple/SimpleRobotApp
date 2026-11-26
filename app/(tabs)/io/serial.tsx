import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useFocusEffect, useLocalSearchParams, router } from "expo-router";
import { ArrowUp, Plus, Settings2, Trash2, X } from "lucide-react-native";

import { DeviceStatusBar } from "@/src/components/ui/io/ioShared";
import { DragHandle } from "@/src/components/ui/builder/StepRow";
import { useDragReorder } from "@/src/components/ui/useDragReorder";
import { useSerialDevice } from "@/src/providers/RobotProvider";
import { robotClient } from "@/src/services/RobotConnectService";
import { appAlert } from "@/src/components/ui/AppAlert";
import {
  SerialCommandDef,
  SerialLineEnding,
  SerialParity,
  SerialStopBits,
} from "@/src/models/robotModels";

import {
  Button,
  buttonTextColor,
  Card,
  colors,
  Divider,
  EmptyState,
  Input,
  PageHeader,
  radii,
  Screen,
  SectionHeader,
  SegmentedControl,
  spacing,
} from "@/src/components/ui/kit";

function newCommandId() {
  return "cmd_" + Math.random().toString(36).slice(2, 10);
}

const PARITY_OPTS: { label: string; value: SerialParity }[] = [
  { label: "None", value: "None" },
  { label: "Odd", value: "Odd" },
  { label: "Even", value: "Even" },
  { label: "Mark", value: "Mark" },
  { label: "Space", value: "Space" },
];
const STOP_OPTS: { label: string; value: SerialStopBits }[] = [
  { label: "1", value: "One" },
  { label: "1.5", value: "OnePointFive" },
  { label: "2", value: "Two" },
];
const DATA_OPTS: { label: string; value: string }[] = [
  { label: "7", value: "7" },
  { label: "8", value: "8" },
];
const LINE_OPTS: { label: string; value: SerialLineEnding }[] = [
  { label: "LF", value: "lf" },
  { label: "CRLF", value: "crlf" },
  { label: "CR", value: "cr" },
  { label: "None", value: "none" },
];

// ── Console ───────────────────────────────────────────────────────────────────

function SerialConsole({ lines }: { lines: { dir: "tx" | "rx"; text: string }[] }) {
  const ref = useRef<ScrollView>(null);
  useEffect(() => {
    // Autoscroll to the newest line.
    const t = setTimeout(() => ref.current?.scrollToEnd({ animated: true }), 0);
    return () => clearTimeout(t);
  }, [lines.length]);

  return (
    <View style={styles.console}>
      <ScrollView
        ref={ref}
        style={{ flex: 1 }}
        contentContainerStyle={styles.consoleContent}
        showsVerticalScrollIndicator
      >
        {lines.length === 0 ? (
          <Text style={styles.consoleEmpty}>No traffic yet. Send a command to see it here.</Text>
        ) : (
          lines.map((l, i) => (
            <View key={i} style={styles.lineRow}>
              <Text style={[styles.lineDir, l.dir === "tx" ? styles.lineDirTx : styles.lineDirRx]}>
                {l.dir === "tx" ? "›" : "‹"}
              </Text>
              <Text style={[styles.lineText, l.dir === "tx" ? styles.lineTextTx : styles.lineTextRx]} selectable>
                {l.text}
              </Text>
            </View>
          ))
        )}
      </ScrollView>
    </View>
  );
}

// ── Command editor row ──────────────────────────────────────────────────────────

function CommandEditRow({
  cmd,
  drag,
  onRowLayout,
  dragged,
  onChange,
  onDelete,
}: {
  cmd: SerialCommandDef;
  drag: { onStart: (id: string) => void; onMove: (id: string, dy: number, absY: number) => void; onEnd: (id: string) => void };
  onRowLayout: (e: { nativeEvent: { layout: { height: number } } }) => void;
  dragged: boolean;
  onChange: (patch: Partial<SerialCommandDef>) => void;
  onDelete: () => void;
}) {
  return (
    <View onLayout={onRowLayout} style={[styles.cmdRow, dragged && styles.cmdRowDragged]}>
      <View style={styles.cmdHeader}>
        <DragHandle stepId={cmd.id} onStart={drag.onStart} onMove={drag.onMove} onEnd={drag.onEnd} />
        <Input
          style={{ flex: 1 }}
          value={cmd.name}
          onChangeText={t => onChange({ name: t })}
          placeholder="Command name"
        />
        <TouchableOpacity onPress={onDelete} hitSlop={8} style={styles.cmdDelete}>
          <Trash2 size={16} color={colors.danger} />
        </TouchableOpacity>
      </View>
      <Input
        style={{ marginTop: spacing.xs }}
        value={cmd.payload}
        onChangeText={t => onChange({ payload: t })}
        placeholder="Payload sent to the device (supports {{expr}})"
        autoCapitalize="none"
      />
      <View style={styles.cmdFooter}>
        <TouchableOpacity
          style={[styles.replyToggle, cmd.expectReply && styles.replyToggleOn]}
          onPress={() => onChange({ expectReply: !cmd.expectReply })}
          activeOpacity={0.8}
        >
          <Text style={[styles.replyToggleText, cmd.expectReply && styles.replyToggleTextOn]}>
            {cmd.expectReply ? "Waits for reply" : "No reply"}
          </Text>
        </TouchableOpacity>
        {cmd.expectReply && (
          <View style={styles.timeoutWrap}>
            <Text style={styles.timeoutLabel}>timeout</Text>
            <Input
              style={styles.timeoutInput}
              value={cmd.replyTimeoutMs != null ? String(cmd.replyTimeoutMs) : ""}
              onChangeText={t => onChange({ replyTimeoutMs: t ? (parseInt(t, 10) || undefined) : undefined })}
              keyboardType="numeric"
              placeholder="1000"
            />
            <Text style={styles.timeoutLabel}>ms</Text>
          </View>
        )}
      </View>
    </View>
  );
}

// ── Page ────────────────────────────────────────────────────────────────────────

export default function SerialDevicePage() {
  const { deviceId } = useLocalSearchParams<{ deviceId: string }>();
  const device = useSerialDevice(deviceId);

  const [sendText, setSendText] = useState("");
  const [editing, setEditing] = useState(false);

  // Edit draft — populated from the live device when the editor opens.
  const [name, setName] = useState("");
  const [baud, setBaud] = useState("9600");
  const [dataBits, setDataBits] = useState("8");
  const [parity, setParity] = useState<SerialParity>("None");
  const [stopBits, setStopBits] = useState<SerialStopBits>("One");
  const [lineEnding, setLineEnding] = useState<SerialLineEnding>("lf");
  const [commands, setCommands] = useState<SerialCommandDef[]>([]);
  const [saving, setSaving] = useState(false);

  // Keep serial devices fresh on entry (status poll also updates the live console).
  useFocusEffect(
    useCallback(() => {
      robotClient.getSerialDevices().catch(() => {});
    }, [])
  );

  const beginEdit = () => {
    if (!device) return;
    setName(device.name);
    setBaud(String(device.baudRate));
    setDataBits(String(device.dataBits ?? 8));
    setParity(device.parity ?? "None");
    setStopBits(device.stopBits ?? "One");
    setLineEnding(device.writeLineEnding ?? "lf");
    setCommands(device.commands.map(c => ({ ...c })));
    setEditing(true);
  };

  const cmdReorder = useDragReorder(commands, setCommands);

  const updateCmd = (id: string, patch: Partial<SerialCommandDef>) =>
    setCommands(prev => prev.map(c => (c.id === id ? { ...c, ...patch } : c)));
  const deleteCmd = (id: string) => setCommands(prev => prev.filter(c => c.id !== id));
  const addCmd = () =>
    setCommands(prev => [...prev, { id: newCommandId(), name: "New command", payload: "", expectReply: false, replyTimeoutMs: 1000 }]);

  const saveConfig = async () => {
    if (!device || saving) return;
    setSaving(true);
    try {
      await robotClient.setSerialDeviceConfig({
        id: device.id,
        name: name.trim() || device.name,
        baudRate: parseInt(baud, 10) || device.baudRate,
        dataBits: parseInt(dataBits, 10) || 8,
        parity,
        stopBits,
        writeLineEnding: lineEnding,
        commands: commands.map(c => ({
          id: c.id,
          name: c.name.trim() || c.id,
          payload: c.payload,
          expectReply: !!c.expectReply,
          replyTimeoutMs: c.replyTimeoutMs ?? 1000,
        })),
      });
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  const sendRaw = () => {
    const text = sendText;
    if (!device || !text.trim()) return;
    robotClient.sendSerialCommand(device.id, { text }).catch(() => {});
    setSendText("");
  };

  const sendNamed = (cmd: SerialCommandDef) => {
    if (!device) return;
    robotClient.sendSerialCommand(device.id, { commandId: cmd.id }).catch(() => {});
  };

  const toggleConnected = () => {
    if (!device) return;
    robotClient.setSerialDeviceConnected(device.id, !device.connected).catch(() => {});
  };

  const removeDevice = () => {
    if (!device) return;
    appAlert("Remove Serial Device", `Remove "${device.name}"?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: () => {
          robotClient.removeSerialDevice(device.id).catch(() => {});
          router.back();
        },
      },
    ]);
  };

  if (!device) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <PageHeader title="Serial Device" subtitle="" />
        <Screen>
          <EmptyState title="Device not found" subtitle="This serial device is no longer configured." />
        </Screen>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <PageHeader title={device.name} subtitle={`${device.portName} · ${device.baudRate} baud`} />
      <Screen>
        <DeviceStatusBar
          connected={device.connected}
          actions={
            <>
              <Button
                variant={device.connected ? "dangerSoft" : "secondary"}
                size="sm"
                label={device.connected ? "Disconnect" : "Connect"}
                onPress={toggleConnected}
              />
              <Button
                variant="secondary"
                size="sm"
                label={editing ? "Close" : "Edit"}
                icon={editing ? <X size={15} color={buttonTextColor("secondary")} /> : <Settings2 size={15} color={buttonTextColor("secondary")} />}
                onPress={() => (editing ? setEditing(false) : beginEdit())}
              />
            </>
          }
        />

        {!editing ? (
          <>
            {/* Console */}
            <SectionHeader title="Console" />
            <SerialConsole lines={device.recentLines ?? []} />

            {/* Send box */}
            <View style={styles.sendRow}>
              <TextInput
                style={styles.sendInput}
                value={sendText}
                onChangeText={setSendText}
                placeholder="Type a command…"
                placeholderTextColor={colors.textFaint}
                autoCapitalize="none"
                returnKeyType="send"
                onSubmitEditing={sendRaw}
              />
              <TouchableOpacity
                style={[styles.sendBtn, !sendText.trim() && styles.sendBtnDisabled]}
                onPress={sendRaw}
                disabled={!sendText.trim()}
                activeOpacity={0.8}
              >
                <ArrowUp size={18} color={colors.onAccent} />
              </TouchableOpacity>
            </View>

            {/* Named command buttons */}
            {device.commands.length > 0 && (
              <>
                <SectionHeader title="Commands" />
                <View style={styles.cmdBtnWrap}>
                  {device.commands.map(c => (
                    <TouchableOpacity key={c.id} style={styles.cmdBtn} onPress={() => sendNamed(c)} activeOpacity={0.8}>
                      <Text style={styles.cmdBtnText} numberOfLines={1}>{c.name || c.id}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </>
            )}
          </>
        ) : (
          <>
            {/* Config editor */}
            <SectionHeader title="Configuration" />
            <Card>
              <Text style={styles.fieldLabel}>NAME</Text>
              <Input value={name} onChangeText={setName} placeholder="My serial device" />

              <Text style={[styles.fieldLabel, { marginTop: spacing.md }]}>BAUD RATE</Text>
              <Input value={baud} onChangeText={setBaud} keyboardType="numeric" placeholder="9600" />

              <Text style={[styles.fieldLabel, { marginTop: spacing.md }]}>DATA BITS</Text>
              <SegmentedControl options={DATA_OPTS} value={dataBits} onChange={setDataBits} />

              <Text style={[styles.fieldLabel, { marginTop: spacing.md }]}>PARITY</Text>
              <SegmentedControl options={PARITY_OPTS} value={parity} onChange={setParity} />

              <Text style={[styles.fieldLabel, { marginTop: spacing.md }]}>STOP BITS</Text>
              <SegmentedControl options={STOP_OPTS} value={stopBits} onChange={setStopBits} />

              <Text style={[styles.fieldLabel, { marginTop: spacing.md }]}>LINE ENDING</Text>
              <SegmentedControl options={LINE_OPTS} value={lineEnding} onChange={setLineEnding} />
            </Card>

            {/* Named commands editor — drag bars reorder */}
            <SectionHeader
              title="Named Commands"
              right={
                <TouchableOpacity onPress={addCmd} hitSlop={8} style={styles.addCmdBtn} activeOpacity={0.8}>
                  <Plus size={14} color={colors.accent} />
                  <Text style={styles.addCmdText}>Add</Text>
                </TouchableOpacity>
              }
            />
            {commands.length === 0 ? (
              <Text style={styles.emptyCmds}>No commands yet. Tap Add to define one.</Text>
            ) : (
              commands.map(c => (
                <CommandEditRow
                  key={c.id}
                  cmd={c}
                  drag={cmdReorder.handle}
                  onRowLayout={cmdReorder.onRowLayout(c.id)}
                  dragged={cmdReorder.isDragged(c.id)}
                  onChange={patch => updateCmd(c.id, patch)}
                  onDelete={() => deleteCmd(c.id)}
                />
              ))
            )}

            <View style={styles.editButtons}>
              <Button label="Cancel" variant="secondary" style={{ flex: 1 }} onPress={() => setEditing(false)} />
              <Button label="Save" style={{ flex: 1 }} loading={saving} onPress={saveConfig} />
            </View>

            <Divider />
            <Button label="Remove Device" variant="dangerSoft" onPress={removeDevice} />
          </>
        )}
      </Screen>
    </View>
  );
}

const styles = StyleSheet.create({
  // ── Console ──────────────────────────────────────────────────────────────────
  console: {
    height: 260,
    backgroundColor: "#0b1220",
    borderRadius: radii.md,
    overflow: "hidden",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderStrong,
  },
  consoleContent: { padding: spacing.sm, gap: 2 },
  consoleEmpty: { color: "#64748b", fontSize: 12, fontStyle: "italic", padding: spacing.sm },
  lineRow: { flexDirection: "row", gap: spacing.xs, alignItems: "flex-start" },
  lineDir: { fontFamily: "monospace", fontSize: 12, fontWeight: "700" },
  lineDirTx: { color: "#38bdf8" },
  lineDirRx: { color: "#4ade80" },
  lineText: { flex: 1, fontFamily: "monospace", fontSize: 12.5, lineHeight: 17 },
  lineTextTx: { color: "#bae6fd" },
  lineTextRx: { color: "#bbf7d0" },

  // ── Send box ─────────────────────────────────────────────────────────────────
  sendRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  sendInput: {
    flex: 1,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    fontSize: 14,
    fontFamily: "monospace",
    color: colors.text,
  },
  sendBtn: {
    width: 44, height: 44, borderRadius: radii.md,
    backgroundColor: colors.accent,
    justifyContent: "center", alignItems: "center",
  },
  sendBtnDisabled: { opacity: 0.4 },

  // ── Named command buttons ────────────────────────────────────────────────────
  cmdBtnWrap: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  cmdBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.pill,
    backgroundColor: "#ccfbf1",
    borderWidth: 1,
    borderColor: "#5eead4",
  },
  cmdBtnText: { color: "#0f766e", fontWeight: "700", fontSize: 13 },

  // ── Config editor ────────────────────────────────────────────────────────────
  fieldLabel: { fontSize: 11, fontWeight: "700", letterSpacing: 0.5, color: colors.textMuted, marginBottom: spacing.xs },

  // ── Command edit rows ────────────────────────────────────────────────────────
  addCmdBtn: { flexDirection: "row", alignItems: "center", gap: 2 },
  addCmdText: { color: colors.accent, fontWeight: "700", fontSize: 13 },
  emptyCmds: { fontSize: 13, color: colors.textFaint, textAlign: "center", paddingVertical: spacing.md },
  cmdRow: {
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: spacing.sm + 2,
    marginBottom: spacing.sm,
  },
  cmdRowDragged: { opacity: 0.85, borderColor: colors.accent },
  cmdHeader: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  cmdDelete: { padding: spacing.xs },
  cmdFooter: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: spacing.sm },
  replyToggle: {
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.xs + 1,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceMuted,
  },
  replyToggleOn: { borderColor: colors.accent, backgroundColor: colors.accentSoft },
  replyToggleText: { fontSize: 12, color: colors.textMuted, fontWeight: "600" },
  replyToggleTextOn: { color: colors.accent },
  timeoutWrap: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  timeoutLabel: { fontSize: 11, color: colors.textFaint },
  timeoutInput: { width: 72 },

  editButtons: { flexDirection: "row", gap: spacing.sm + 2, marginTop: spacing.sm },
});
