import { appAlert } from "@/src/components/ui/AppAlert";
import { useIoDevices } from "@/src/providers/RobotProvider";
import { robotClient } from "@/src/services/RobotConnectService";
import {
  AuxDeviceState,
  DeviceFirmwareInfo,
  deviceSupports,
  IoPinState,
  PinType,
} from "@/src/models/robotModels";
import { router, useLocalSearchParams } from "expo-router";
import {
  Check,
  ChevronDown,
  CircuitBoard,
  Plus,
} from "lucide-react-native";
import React, { useEffect, useMemo, useState } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import { useIsWide, useWideContent } from "@/src/components/ui/responsive";
import { LOAD_CELL_UNITS } from "@/src/components/ui/loadcell";
import {
  accents,
  Button,
  colors,
  Divider,
  EmptyState,
  FormRow,
  InfoTip,
  Input,
  PageHeader,
  radii,
  SegmentedControl,
  shadows,
  spacing,
  type,
} from "@/src/components/ui/kit";

// ─────────────────────────────────────────────────────────────────────────────
// Arduino Nano pin definitions — D0-D13, A0-A5
// ─────────────────────────────────────────────────────────────────────────────

type PinDef = {
  pin: number;          // firmware pin number
  label: string;        // printed on the board  (D2, A0, …)
  note?: string;        // optional warning shown in grey
};

const NANO_PINS: PinDef[] = [
  { pin:  0, label: "D0",  note: "RX — shared with serial" },
  { pin:  1, label: "D1",  note: "TX — shared with serial" },
  { pin:  2, label: "D2"  },
  { pin:  3, label: "D3",  note: "PWM" },
  { pin:  4, label: "D4"  },
  { pin:  5, label: "D5",  note: "PWM" },
  { pin:  6, label: "D6",  note: "PWM" },
  { pin:  7, label: "D7"  },
  { pin:  8, label: "D8"  },
  { pin:  9, label: "D9",  note: "PWM" },
  { pin: 10, label: "D10", note: "PWM / SS" },
  { pin: 11, label: "D11", note: "PWM / MOSI" },
  { pin: 12, label: "D12", note: "MISO" },
  { pin: 13, label: "D13", note: "LED" },
  { pin: 14, label: "A0",  note: "Analog" },
  { pin: 15, label: "A1",  note: "Analog" },
  { pin: 16, label: "A2",  note: "Analog" },
  { pin: 17, label: "A3",  note: "Analog" },
  { pin: 18, label: "A4",  note: "Analog / SDA" },
  { pin: 19, label: "A5",  note: "Analog / SCL" },
];

// Uno + CNC Shield spare pins free for digital IO — the stepper driver uses the rest
// (D2–D8, D12/D13) and D0/D1 are the serial link. Inputs/outputs only (no HX711/NeoPixel).
const AUX_IO_PINS: PinDef[] = [
  { pin:  9, label: "D9"  },
  { pin: 10, label: "D10" },
  { pin: 11, label: "D11" },
  { pin: 14, label: "A0"  },
  { pin: 15, label: "A1"  },
  { pin: 16, label: "A2"  },
  { pin: 17, label: "A3"  },
  { pin: 18, label: "A4", note: "SDA" },
  { pin: 19, label: "A5", note: "SCL" },
];

// ─────────────────────────────────────────────────────────────────────────────
// Local pin edit state
// ─────────────────────────────────────────────────────────────────────────────

type PinEdit = {
  pin: number;
  type: PinType | "Unconfigured";
  name: string;
  pixelCount: string;   // string so the TextInput stays controlled
  dirty: boolean;       // changed from the server snapshot
};

const TYPE_OPTIONS: Array<PinType | "Unconfigured"> = [
  "Unconfigured", "Input", "Output", "Neopixel",
];

// Aux-stepper spare-pin IO is digital only.
const AUX_TYPE_OPTIONS: Array<PinType | "Unconfigured"> = [
  "Unconfigured", "Input", "Output",
];

// Pin-type colors: Input/Neopixel map onto kit tokens; Output keeps the
// purple device-type tint used for outputs across this section (ioShared).
function typeColor(type: PinType | "Unconfigured") {
  if (type === "Input")    return { fg: colors.accent,  bg: colors.accentSoft };
  if (type === "Output")   return { fg: accents.purple, bg: accents.purpleSoft };
  if (type === "Neopixel") return { fg: colors.warning, bg: colors.warningSoft };
  return { fg: colors.textFaint, bg: colors.background };
}

function typeLabel(type: PinType | "Unconfigured") {
  if (type === "Input")    return "IN";
  if (type === "Output")   return "OUT";
  if (type === "Neopixel") return "NEO";
  return "—";
}

function TypeDropdown({
  value,
  onChange,
  options = TYPE_OPTIONS,
}: {
  value: PinType | "Unconfigured";
  onChange: (v: PinType | "Unconfigured") => void;
  options?: Array<PinType | "Unconfigured">;
}) {
  const [open, setOpen] = useState(false);
  const { fg, bg } = typeColor(value);

  return (
    <>
      <Pressable
        style={[styles.typeChip, { backgroundColor: bg, borderColor: fg }]}
        onPress={() => setOpen(true)}
        hitSlop={4}
      >
        <Text style={[styles.typeChipText, { color: fg }]}>{typeLabel(value)}</Text>
        <ChevronDown size={9} color={fg} />
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.typeModalOverlay} onPress={() => setOpen(false)}>
          <View style={styles.typeMenuCard}>
            {options.map(opt => {
              const { fg: ofg, bg: obg } = typeColor(opt);
              const selected = opt === value;
              return (
                <TouchableOpacity
                  key={opt}
                  style={[styles.typeMenuItem, selected && { backgroundColor: obg }]}
                  onPress={() => { onChange(opt); setOpen(false); }}
                  activeOpacity={0.7}
                >
                  <View style={[styles.typeMenuChip, { backgroundColor: obg, borderColor: ofg }]}>
                    <Text style={[styles.typeMenuChipText, { color: ofg }]}>{typeLabel(opt)}</Text>
                  </View>
                  <Text style={[styles.typeMenuLabel, selected && { color: ofg, fontWeight: "700" }]}>
                    {opt === "Unconfigured" ? "Unconfigured" : opt}
                  </Text>
                  {selected && <View style={[styles.typeMenuDot, { backgroundColor: ofg }]} />}
                </TouchableOpacity>
              );
            })}
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Single pin row
// ─────────────────────────────────────────────────────────────────────────────

function PinRow({
  def,
  edit,
  onChange,
  options,
}: {
  def: PinDef;
  edit: PinEdit;
  onChange: (updated: Partial<PinEdit>) => void;
  options?: Array<PinType | "Unconfigured">;
}) {
  const isConfigured = edit.type !== "Unconfigured";

  return (
    <View style={[styles.pinRow, edit.dirty && styles.pinRowDirty]}>
      {/* Pin label */}
      <View style={styles.pinLabelWrap}>
        <Text style={styles.pinLabel}>{def.label}</Text>
        {def.note && <Text style={styles.pinNote}>{def.note}</Text>}
      </View>

      {/* Type dropdown */}
      <TypeDropdown
        value={edit.type}
        onChange={v => onChange({ type: v, dirty: true })}
        options={options}
      />

      {/* Name input — only shown when configured */}
      {isConfigured ? (
        <Input
          style={styles.nameInput}
          value={edit.name}
          onChangeText={v => onChange({ name: v, dirty: true })}
          placeholder="Label…"
        />
      ) : (
        <View style={styles.nameInputPlaceholder} />
      )}

      {/* Pixel count — Neopixel only */}
      {edit.type === "Neopixel" && (
        <Input
          style={styles.pixelInput}
          value={edit.pixelCount}
          onChangeText={v => onChange({ pixelCount: v, dirty: true })}
          keyboardType="numeric"
          placeholder="px"
        />
      )}
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────

function ColumnHeaders({ style }: { style?: any }) {
  return (
    <View style={[styles.colHeaders, style]}>
      <Text style={[styles.colHeader, { width: 44 }]}>PIN</Text>
      <Text style={[styles.colHeader, { width: 52 }]}>TYPE</Text>
      <Text style={[styles.colHeader, { flex: 1 }]}>LABEL</Text>
      <InfoTip
        size={12}
        text="Input reads a sensor or switch. Output can be toggled on/off from the IO pages. Neopixel drives an addressable LED strip and needs a pixel count. Unconfigured pins are left alone."
      />
    </View>
  );
}

/** Modal to add an HX711 load cell: pick the DT + SCK pins and a display unit. */
function AddLoadCellModal({ deviceId, onClose }: { deviceId: string; onClose: () => void }) {
  const [dt, setDt] = useState("");
  const [sck, setSck] = useState("");
  const [unit, setUnit] = useState("g");
  const [busy, setBusy] = useState(false);

  const dtN = Number(dt), sckN = Number(sck);
  const valid = Number.isInteger(dtN) && Number.isInteger(sckN) && dtN >= 0 && dtN <= 19 && sckN >= 0 && sckN <= 19 && dtN !== sckN;

  const add = async () => {
    if (!valid) return;
    setBusy(true);
    try {
      await robotClient.configureLoadCell(deviceId, dtN, sckN, unit);
      onClose();
      router.push({ pathname: "/(tabs)/io/loadcell-calibrate", params: { deviceId, pin: String(dtN) } });
    } finally { setBusy(false); }
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.modalOverlay} onPress={onClose}>
        <Pressable style={styles.modalCard} onPress={() => {}}>
          <Text style={type.pageTitle}>Add Load Cell</Text>
          <Text style={[type.subtitle, { marginBottom: spacing.sm }]}>
            Wire the HX711 to two Nano pins. DT (data) and SCK (clock) must be different pins.
          </Text>
          <FormRow label="DT pin (data)" hint="e.g. 4">
            <Input value={dt} onChangeText={setDt} keyboardType="numeric" placeholder="D?" style={styles.pinField} />
          </FormRow>
          <Divider />
          <FormRow label="SCK pin (clock)" hint="e.g. 5">
            <Input value={sck} onChangeText={setSck} keyboardType="numeric" placeholder="D?" style={styles.pinField} />
          </FormRow>
          <Divider />
          <FormRow label="Unit">
            <SegmentedControl options={LOAD_CELL_UNITS.map(u => ({ label: u, value: u }))} value={unit} onChange={setUnit} />
          </FormRow>
          <View style={styles.modalButtons}>
            <Button label="Cancel" variant="secondary" style={{ flex: 1 }} onPress={onClose} />
            <Button label="Add" style={{ flex: 1 }} loading={busy} disabled={!valid} onPress={add} />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/** What the page edits: a Nano IO device, or an aux-stepper board's spare-pin IO. */
type ConfigDevice = DeviceFirmwareInfo & {
  id: string;
  name: string;
  pins: IoPinState[];
};

export default function ConfigurePage() {
  const { deviceId, kind } = useLocalSearchParams<{ deviceId: string; kind?: string }>();
  const ioDevices   = useIoDevices();
  const wideContent = useWideContent();
  const isWide      = useIsWide();

  // Aux-stepper device: only its spare pins are free, and only digital in/out (no HX711/NeoPixel).
  const isAux       = kind === "aux";
  const pinDefs     = isAux ? AUX_IO_PINS : NANO_PINS;

  // An aux board only appears in the IO-device list once it has at least one pin
  // configured, so look it up in the aux state too: a fresh Uno with no IO pins
  // must still get the pin grid, not a "not found" page.
  const [auxDevices, setAuxDevices] = useState<AuxDeviceState[]>([]);
  useEffect(() => {
    if (!isAux) return;
    robotClient.getAuxState().catch(() => {});
    return robotClient.onAuxAxis(setAuxDevices);
  }, [isAux]);

  const ioEntry = ioDevices.find(n => n.id === deviceId);
  const auxEntry = isAux ? auxDevices.find(d => d.deviceId === deviceId) : undefined;

  const device = useMemo<ConfigDevice | null>(() => {
    if (isAux) {
      if (!auxEntry && !ioEntry) return null;
      return {
        id:              deviceId,
        name:            auxEntry?.deviceName ?? ioEntry?.name ?? deviceId,
        pins:            ioEntry?.pins ?? [],
        firmwareVersion: auxEntry?.firmwareVersion ?? ioEntry?.firmwareVersion,
        capabilities:    auxEntry?.capabilities    ?? ioEntry?.capabilities,
      };
    }
    return ioEntry ?? null;
  }, [isAux, auxEntry, ioEntry, deviceId]);

  // Capability gating: a board that reports its capabilities and lacks one hides
  // that feature; legacy firmware (unknown capabilities) keeps everything visible.
  const canNeopixel = !isAux && deviceSupports(device, "neopixel");
  const canLoadCell = !isAux && deviceSupports(device, "loadcell");
  const typeOptions = isAux
    ? AUX_TYPE_OPTIONS
    : canNeopixel ? TYPE_OPTIONS : TYPE_OPTIONS.filter(t => t !== "Neopixel");

  // Build initial edit state from the current ioDevices snapshot
  const initialEdits = useMemo<PinEdit[]>(() => {
    const configuredMap = new Map<number, IoPinState>();
    device?.pins.forEach(p => configuredMap.set(p.pin, p));

    return pinDefs.map(def => {
      const existing = configuredMap.get(def.pin);
      return {
        pin:        def.pin,
        type:       existing?.type ?? "Unconfigured",
        name:       existing?.name ?? "",
        pixelCount: String(existing?.pixelCount ?? 8),
        dirty:      false,
      };
    });
  }, [device?.id, pinDefs]); // recomputes on device change (pinDefs is stable per device kind)

  const [edits, setEdits] = useState<PinEdit[]>(initialEdits);
  const [saving, setSaving] = useState(false);
  const [addLc, setAddLc] = useState(false);

  // Reset when navigating to a different nano
  useEffect(() => { setEdits(initialEdits); }, [initialEdits]);

  function updatePin(pin: number, partial: Partial<PinEdit>) {
    setEdits(prev => prev.map(e => e.pin === pin ? { ...e, ...partial } : e));
  }

  const dirtyCount = edits.filter(e => e.dirty).length;

  async function saveAll() {
    setSaving(true);
    try {
      // Snapshot of what was configured before this save
      const previousPins = new Set(device?.pins.map(p => p.pin) ?? []);

      for (const edit of edits) {
        if (!edit.dirty) continue;

        const wasCfg = previousPins.has(edit.pin);
        const nowCfg = edit.type !== "Unconfigured";

        if (nowCfg) {
          // Add or update type/pixelCount
          await robotClient.configureIoPin(
            deviceId,
            edit.pin,
            edit.type as PinType,
            Number(edit.pixelCount) || 8,
          );
          // Set name (pin now exists in state)
          if (edit.name.trim() !== "") {
            await robotClient.renameIoPin(deviceId, edit.pin, edit.name.trim());
          }
        } else if (wasCfg) {
          // Was configured, now unconfigured → remove
          await robotClient.configureIoPin(deviceId, edit.pin, "Unconfigured" as any);
        }
      }

      // Refresh IO state then go back
      await robotClient.getIO().catch(() => {});
      router.back();
    } catch (err) {
      // Stay on page so the user can retry — and SAY why it failed (a
      // disconnected Nano used to fail here completely silently).
      appAlert(
        "Save Failed",
        typeof err === "string"
          ? err
          : "The pin configuration could not be saved. Check that the Nano is connected.",
      );
    } finally {
      setSaving(false);
    }
  }

  const pageTitle = isAux ? "Configure IO" : "Configure Pins";
  const parentHref = isAux
    ? `/(tabs)/io/auxiliary?deviceId=${encodeURIComponent(deviceId)}`
    : `/(tabs)/io/nanos?deviceId=${encodeURIComponent(deviceId)}`;

  if (!device) {
    const kindLabel = isAux ? "aux stepper device" : "IO device";
    return (
      <View style={styles.container}>
        <PageHeader
          title={pageTitle}
          subtitle={deviceId}
          crumbs={[{ label: "I/O", href: "/io" }, { label: pageTitle }]}
          backTo="/io"
        />
        <EmptyState
          icon={<CircuitBoard size={28} color={colors.textFaint} />}
          title="Device not found"
          subtitle={`The ${kindLabel} ${deviceId} isn't connected to the controller.`}
          action={
            <Button
              label="Back"
              variant="secondary"
              onPress={() => (router.canGoBack() ? router.back() : router.navigate("/io" as never))}
            />
          }
        />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={styles.container}>
        <PageHeader
          title={pageTitle}
          subtitle={device.name}
          crumbs={[
            { label: "I/O", href: "/io" },
            { label: device.name, href: parentHref },
            { label: pageTitle },
          ]}
          right={
            <Button
              variant="primary"
              size="sm"
              label={dirtyCount > 0 ? `Save (${dirtyCount})` : "Save"}
              icon={<Check size={16} color={colors.onAccent} />}
              loading={saving}
              disabled={dirtyCount === 0}
              onPress={saveAll}
              style={{ backgroundColor: "#4f46e5" }}
            />
          }
        />

        {/* ── Column headers (narrow: one shared header; wide: one per column) ── */}
        {!isWide && <ColumnHeaders style={wideContent} />}

        {/* ── Pin list ── */}
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={[styles.listContent, wideContent]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {isWide ? (
            <View style={styles.pinColumnsRow}>
              {[pinDefs.slice(0, Math.ceil(pinDefs.length / 2)), pinDefs.slice(Math.ceil(pinDefs.length / 2))].map(
                (colPins, ci) => (
                  <View key={ci} style={styles.pinColumn}>
                    <ColumnHeaders />
                    {colPins.map(def => (
                      <PinRow
                        key={def.pin}
                        def={def}
                        edit={edits.find(e => e.pin === def.pin)!}
                        onChange={partial => updatePin(def.pin, partial)}
                        options={typeOptions}
                      />
                    ))}
                  </View>
                )
              )}
            </View>
          ) : (
            pinDefs.map(def => (
              <PinRow
                key={def.pin}
                def={def}
                edit={edits.find(e => e.pin === def.pin)!}
                onChange={partial => updatePin(def.pin, partial)}
                options={typeOptions}
              />
            ))
          )}

          {/* Load cells use the HX711's own 2-pin (DT/SCK) serial protocol rather than
              a simple pin type, so they're added here instead of via the pin dropdown.
              Aux-stepper IO is digital-only, and a Nano whose firmware reports no
              `loadcell` capability can't drive one, so the option isn't offered there. */}
          {canLoadCell && (
            <Button
              variant="dashed"
              label="Add Load Cell"
              icon={<Plus size={15} color={colors.accent} />}
              onPress={() => setAddLc(true)}
              style={styles.addLcBtn}
            />
          )}
        </ScrollView>

        {addLc && <AddLoadCellModal deviceId={device.id} onClose={() => setAddLc(false)} />}
      </View>
    </KeyboardAvoidingView>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },

  // ── Column headers ─────────────────────────────────────────────────────────
  colHeaders: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
    backgroundColor: colors.background,
  },
  colHeader: {
    fontSize: 10,
    fontWeight: "700",
    color: colors.textFaint,
    letterSpacing: 0.6,
  },

  // ── Pin list ───────────────────────────────────────────────────────────────
  listContent: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.xxl,
    gap: spacing.xs + 2,
  },

  // Wide: two side-by-side pin columns instead of one long list.
  pinColumnsRow: { flexDirection: "row", gap: spacing.lg, alignItems: "flex-start" },
  pinColumn:     { flex: 1, minWidth: 0, gap: spacing.xs + 2 },

  // ── Pin row ────────────────────────────────────────────────────────────────
  pinRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radii.sm + 1,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.sm + 1,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pinRowDirty: {
    borderColor: "#a5b4fc",
    backgroundColor: "#fafafe",
  },

  // ── Pin label ──────────────────────────────────────────────────────────────
  pinLabelWrap: { width: 44 },
  pinLabel: { fontSize: 13, fontWeight: "700", color: colors.text },
  pinNote:  { fontSize: 9, color: colors.textFaint, marginTop: 1 },

  // ── Type chip + dropdown ───────────────────────────────────────────────────
  typeChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    width: 52,
    height: 28,
    borderRadius: 6,
    borderWidth: 1.5,
    justifyContent: "center",
  },
  typeChipText: { fontSize: 10, fontWeight: "800", letterSpacing: 0.4 },

  typeModalOverlay: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: "center",
    alignItems: "center",
  },
  typeMenuCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    width: 200,
    paddingVertical: spacing.xs + 2,
    ...shadows.raised,
  },
  typeMenuItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm + 2,
    paddingHorizontal: spacing.md + 2,
    paddingVertical: spacing.sm + 2,
    borderRadius: radii.sm,
    marginHorizontal: spacing.xs,
  },
  typeMenuChip: {
    width: 36,
    height: 22,
    borderRadius: radii.sm - 4,
    borderWidth: 1.5,
    justifyContent: "center",
    alignItems: "center",
  },
  typeMenuChipText: { fontSize: 9, fontWeight: "800", letterSpacing: 0.4 },
  typeMenuLabel: { flex: 1, fontSize: 14, color: colors.textSecondary },
  typeMenuDot: { width: 7, height: 7, borderRadius: 4 },

  // ── Name input ─────────────────────────────────────────────────────────────
  nameInput: {
    flex: 1,
    minWidth: 0,
    minHeight: 0,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs + 2,
    fontSize: 13,
  },
  nameInputPlaceholder: { flex: 1, minWidth: 0 },

  // ── Pixel count ────────────────────────────────────────────────────────────
  pixelInput: {
    width: 42,
    minHeight: 0,
    paddingHorizontal: spacing.xs + 2,
    paddingVertical: spacing.xs + 2,
    borderColor: colors.warningBorder,
    fontSize: 13,
    color: "#92400e",
    backgroundColor: colors.warningSoft,
    textAlign: "center",
  },

  // ── Add Load Cell ──────────────────────────────────────────────────────────
  addLcBtn:      { marginTop: spacing.sm },
  modalOverlay:  { flex: 1, backgroundColor: colors.overlay, justifyContent: "center", alignItems: "center", padding: spacing.xl },
  modalCard:     { backgroundColor: colors.surface, borderRadius: radii.xl, width: "100%", maxWidth: 400, padding: spacing.lg + 4, gap: spacing.xs, ...shadows.raised },
  modalButtons:  { flexDirection: "row", gap: spacing.sm + 2, marginTop: spacing.md },
  pinField:      { minWidth: 70, textAlign: "center" },
});
