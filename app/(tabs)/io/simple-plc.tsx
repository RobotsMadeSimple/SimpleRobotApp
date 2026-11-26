import React, { useCallback, useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { AlertTriangle, RefreshCw, Settings2, X, Zap } from "lucide-react-native";

import { DeviceStatusBar, IORow } from "@/src/components/ui/io/ioShared";
import { useIsWide } from "@/src/components/ui/responsive";
import { useIoDevices, useSimplePlc } from "@/src/providers/RobotProvider";
import { robotClient } from "@/src/services/RobotConnectService";
import { appAlert } from "@/src/components/ui/AppAlert";
import { SimplePlcOnTimeout, SimplePlcFault, SimplePlcSlotState } from "@/src/models/robotModels";

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
  StatusPill,
  type,
} from "@/src/components/ui/kit";

const ON_TIMEOUT_OPTS: { label: string; value: SimplePlcOnTimeout }[] = [
  { label: "Hold", value: "hold" },
  { label: "Off", value: "off" },
];
const AUTO_OPTS: { label: string; value: "on" | "off" }[] = [
  { label: "On", value: "on" },
  { label: "Off", value: "off" },
];

const IDENTIFY_SECONDS = 3;

// How long a fault (or its clearing) must hold before the UI reacts. Swallows brief watchdog /
// field-power flaps — a trip-then-clear within this window, e.g. from a momentary network hiccup —
// so the fault banner doesn't flash and shove the page content up and down. A genuine, sustained
// fault still surfaces after this short settle, and a real recovery clears just as quickly.
const FAULT_SETTLE_MS = 900;

/** A stable signature of a fault set (code + slot + mv), for debounce change-detection. */
function faultSig(faults: SimplePlcFault[]): string {
  return faults.map(f => `${f.code}:${f.slot ?? ""}:${f.mv ?? ""}`).join("|");
}

/**
 * Hold a value steady until its signature has stopped changing for `settleMs`. While the signature
 * keeps flapping (faster than the settle window) the last settled value is returned unchanged, so
 * transient churn never reaches the render. Pure debounce — no change is lost, only delayed.
 */
function useDebounced<T>(value: T, sig: string, settleMs: number): T {
  const [settled, setSettled] = useState<{ v: T; sig: string }>({ v: value, sig });
  useEffect(() => {
    if (sig === settled.sig) return;
    const id = setTimeout(() => setSettled({ v: value, sig }), settleMs);
    return () => clearTimeout(id);
  }, [sig, settled.sig, value, settleMs]);
  return settled.v;
}

// ── Fault / telemetry formatting ─────────────────────────────────────────────────

/** Format a millivolt reading as volts, e.g. 24010 → "24.0 V". Null when not reported. */
function formatVolts(mv?: number | null): string | null {
  if (mv == null || mv <= 0) return null;
  return `${(mv / 1000).toFixed(1)} V`;
}

/** Sub-label noting a module's output wiring, where it matters. "" when there's nothing to add. */
function moduleKindLabel(type: string): string {
  switch (type) {
    case "DO8":  return "Sourcing (PNP)";
    case "DO8N": return "Sinking (NPN)";
    default:     return "";
  }
}

/** A plain-language, generic label for one head fault. */
function faultLabel(f: SimplePlcFault): string {
  switch (f.code) {
    case "supply_low": {
      const v = formatVolts(f.mv);
      return v ? `Supply voltage low (${v})` : "Supply voltage low";
    }
    case "field_power":
      return f.slot != null ? `Field power lost on slot ${f.slot}` : "Field power lost";
    case "watchdog":
      return "Host watchdog tripped — outputs went to their timeout state";
    case "module_restart":
      return f.slot != null ? `Module on slot ${f.slot} restarted` : "A module restarted";
    case "lost":
      return f.slot != null ? `Module on slot ${f.slot} stopped responding` : "A module stopped responding";
    default:
      return f.slot != null ? `${f.code} (slot ${f.slot})` : f.code;
  }
}

// ── Modules (one card per physical IO module) ───────────────────────────────────
//   Each slot renders as a self-contained card: the module header (type, OK/Lost, field power)
//   on top, then that module's own live pins. Live values ride the ioDevices path — the controller
//   surfaces each PLC bit as an IoPinState under an IoDeviceState whose id === the PLC id, with a
//   stable pin number that encodes slot + bit (pin = slot*BITS_PER_SLOT + bit). Outputs are written
//   with setIoOutput. We bucket pins back to their module by that same encoding.

const BITS_PER_SLOT = 32; // mirrors firmware SimplePlcDevice.BitsPerSlot — keep in lock-step.

function PlcModuleCards({
  plcId,
  slots,
  faults,
  isWide,
}: {
  plcId: string;
  slots: SimplePlcSlotState[];
  faults: SimplePlcFault[];
  isWide: boolean;
}) {
  const ioDevice = useIoDevices().find(d => d.id === plcId) ?? null;
  const pins = ioDevice?.pins ?? [];

  if (slots.length === 0) {
    return (
      <EmptyState
        title="No modules yet"
        subtitle="Connect the head and rescan to enumerate its IO modules, or wait for the next status poll."
      />
    );
  }

  const cards = slots.map(s => {
    // Live field-power truth: an active field_power fault for this slot beats the module's
    // last-reported flag (the head pushes the fault, not a fresh module list).
    const fpFault = faults.some(f => f.code === "field_power" && f.slot === s.slot);
    const fpKnown = fpFault || s.fieldPower != null;
    const fpOk = !fpFault && s.fieldPower !== false;

    // This module's live pins, bucketed by the slot the pin number encodes. Inputs first, then
    // outputs, each in channel order.
    const mine = pins.filter(p => Math.floor(p.pin / BITS_PER_SLOT) === s.slot);
    const rows = [
      ...mine.filter(p => p.type === "Input").sort((a, b) => a.pin - b.pin),
      ...mine.filter(p => p.type === "Output").sort((a, b) => a.pin - b.pin),
    ];

    return (
      <View key={s.slot} style={isWide ? styles.moduleColWide : styles.moduleColFull}>
        <Card padded={false}>
          <View style={styles.slotRow}>
            <View style={styles.slotBadge}>
              <Text style={styles.slotBadgeText}>{s.slot}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.slotType} numberOfLines={1}>{s.type || `Type ${s.typeId}`}</Text>
              <Text style={styles.slotSub} numberOfLines={1}>
                {moduleKindLabel(s.type) ? `${moduleKindLabel(s.type)} · ` : ""}{s.inBits} in · {s.outBits} out
              </Text>
            </View>
            <View style={styles.slotPills}>
              <StatusPill
                label={s.state === "ok" ? "OK" : "Lost"}
                tone={s.state === "ok" ? "success" : "danger"}
                dot
              />
              {fpKnown && (
                <StatusPill
                  label={fpOk ? "Field power" : "No field power"}
                  tone={fpOk ? "neutral" : "danger"}
                  dot
                />
              )}
            </View>
          </View>

          {rows.length > 0 ? (
            <>
              <Divider inset />
              {rows.map((pin, i) => {
                const bit = pin.pin % BITS_PER_SLOT;
                const chan = `${pin.type === "Input" ? "IN" : "OUT"}${bit}`;
                // Show a custom name if the pin was renamed; else the bare channel (the module
                // identity already lives in this card's header, so the default "S0 IN0" is noise).
                const label = pin.name && pin.name !== `S${s.slot} ${chan}` ? pin.name : chan;
                return (
                  <React.Fragment key={pin.pin}>
                    <IORow
                      label={label}
                      sublabel={`#${pin.pin}`}
                      type={pin.type}
                      value={pin.value}
                      onToggle={
                        pin.type === "Output"
                          ? () => robotClient.setIoOutput(plcId, pin.pin, !pin.value)
                          : undefined
                      }
                    />
                    {i < rows.length - 1 && <Divider inset />}
                  </React.Fragment>
                );
              })}
            </>
          ) : (
            <>
              <Divider inset />
              <Text style={styles.noLive}>No live values yet — connect the head to read this module.</Text>
            </>
          )}
        </Card>
      </View>
    );
  });

  return <View style={styles.moduleGrid}>{cards}</View>;
}

// ── Read-only info row ──────────────────────────────────────────────────────────

function InfoRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={[styles.infoValue, mono && styles.infoValueMono]} numberOfLines={1}>{value}</Text>
    </View>
  );
}

// ── Page ────────────────────────────────────────────────────────────────────────

export default function SimplePlcPage() {
  const { deviceId } = useLocalSearchParams<{ deviceId: string }>();
  const device = useSimplePlc(deviceId);
  const isWide = useIsWide();

  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);

  // Edit draft — populated from the live device when the editor opens.
  const [name, setName] = useState("");
  const [headName, setHeadName] = useState("");
  const [host, setHost] = useState("");
  const [port, setPort] = useState("");
  const [watchdog, setWatchdog] = useState("");
  const [filter, setFilter] = useState("");
  const [onTimeout, setOnTimeout] = useState<SimplePlcOnTimeout>("hold");
  const [autoConnect, setAutoConnect] = useState<"on" | "off">("off");
  const [saving, setSaving] = useState(false);

  // Keep SimplePLC heads fresh on entry (the status poll also updates live IO + fault).
  useFocusEffect(
    useCallback(() => {
      robotClient.getSimplePlcs().catch(() => {});
    }, [])
  );

  // Debounced fault view. All fault-driven UI below (the banner, the supply-low colour, the
  // per-module field-power pills) reads from these so a brief flap can't flash the banner and
  // reflow the page. Computed here — above the early return — to satisfy the rules of hooks.
  const liveFaults: SimplePlcFault[] = device?.faults ?? [];
  const faults = useDebounced(liveFaults, faultSig(liveFaults), FAULT_SETTLE_MS);
  // Banner lines: active faults → human text, else the legacy single code, else the last
  // connection error. Debounced as a unit so the legacy/last-error paths are steady too.
  const faultLinesLive =
    liveFaults.length > 0
      ? liveFaults.map(faultLabel)
      : device?.fault?.trim()
        ? [device.fault.trim()]
        : [];
  const errorLineLive =
    faultLinesLive.length === 0 && device?.lastError?.trim() ? device.lastError.trim() : "";
  const bannerLinesLive = errorLineLive ? [errorLineLive] : faultLinesLive;
  const bannerLines = useDebounced(bannerLinesLive, bannerLinesLive.join("\u0001"), FAULT_SETTLE_MS);

  const beginEdit = () => {
    if (!device) return;
    setName(device.name);
    setHeadName(device.headName ?? "");
    setHost(device.host ?? "");
    setPort(device.port != null ? String(device.port) : "");
    setWatchdog(device.watchdogMs != null ? String(device.watchdogMs) : "");
    setFilter(device.filterMs != null ? String(device.filterMs) : "");
    setOnTimeout(device.onTimeout ?? "hold");
    setAutoConnect(device.autoConnect ? "on" : "off");
    setEditing(true);
  };

  const saveConfig = async () => {
    if (!device || saving) return;
    setSaving(true);
    try {
      await robotClient.setSimplePlcConfig({
        id: device.id,
        name: name.trim() || device.name,
        host: host.trim() || device.host,
        port: parseInt(port, 10) || device.port,
        watchdogMs: parseInt(watchdog, 10) || device.watchdogMs,
        filterMs: Number.isNaN(parseInt(filter, 10)) ? device.filterMs : parseInt(filter, 10),
        onTimeout,
        autoConnect: autoConnect === "on",
      });
      // The head name is stored on the device itself (its own command), so apply it only when changed.
      const nextHead = headName.trim();
      if (nextHead && nextHead !== (device.headName ?? "")) {
        await robotClient.setSimplePlcHeadName(device.id, nextHead).catch(() => {});
      }
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  const toggleConnected = () => {
    if (!device) return;
    robotClient.setSimplePlcConnected(device.id, !device.connected).catch(() => {});
  };

  const identify = () => {
    if (!device || busy) return;
    setBusy(true);
    // slot 0 blinks the head's own LED.
    robotClient.identifySimplePlc(device.id, 0, IDENTIFY_SECONDS)
      .catch(() => {})
      .finally(() => setBusy(false));
  };

  const rescan = () => {
    if (!device || busy) return;
    setBusy(true);
    robotClient.rescanSimplePlc(device.id)
      .catch(() => {})
      .finally(() => setBusy(false));
  };

  const removeDevice = () => {
    if (!device) return;
    appAlert("Remove SimplePLC", `Remove "${device.name}"?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: () => {
          robotClient.removeSimplePlc(device.id).catch(() => {});
          router.back();
        },
      },
    ]);
  };

  if (!device) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <PageHeader title="SimplePLC" subtitle="" />
        <Screen>
          <EmptyState title="Device not found" subtitle="This SimplePLC head is no longer configured." />
        </Screen>
      </View>
    );
  }

  const portText = device.port != null ? String(device.port) : "—";

  // `faults` and `bannerLines` are the debounced views computed above (with the other hooks).
  const macDefault = device.macSource === "default";
  const supplyLow = faults.some(f => f.code === "supply_low");
  const supplyText = formatVolts(device.supplyMv);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <PageHeader title={device.name} subtitle={`${device.host || "—"}${device.port ? ` : ${device.port}` : ""}`} />
      <Screen>
        <DeviceStatusBar
          connected={device.connected}
          chips={
            <>
              <StatusPill label={device.owned ? "Owned" : "Not owned"} tone={device.owned ? "accent" : "neutral"} dot />
              {!!device.firmware && <StatusPill label={`fw ${device.firmware}`} tone="neutral" />}
            </>
          }
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

        {bannerLines.length > 0 && (
          <View style={styles.faultBanner}>
            <AlertTriangle size={16} color={colors.danger} />
            <View style={{ flex: 1, gap: 2 }}>
              {bannerLines.map((line, i) => (
                <Text key={i} style={styles.faultText} numberOfLines={3}>{line}</Text>
              ))}
            </View>
          </View>
        )}

        {macDefault && (
          <View style={styles.warnBanner}>
            <AlertTriangle size={16} color={colors.warning} />
            <Text style={styles.warnText} numberOfLines={4}>
              This head is using a default MAC address, which is shared by all un-programmed heads. If you
              have more than one on the network they will collide — program a unique address on the head.
            </Text>
          </View>
        )}

        {!editing ? (
          <>
            {/* Head details */}
            <SectionHeader title="Head" />
            <Card>
              <InfoRow label="Host" value={device.host || "—"} mono />
              <Divider inset />
              <InfoRow label="Port" value={portText} mono />
              <Divider inset />
              <InfoRow label="MAC" value={device.mac || "—"} mono />
              <Divider inset />
              <InfoRow label="Head name" value={device.headName || "—"} />
              {supplyText && (
                <>
                  <Divider inset />
                  <View style={styles.infoRow}>
                    <Text style={styles.infoLabel}>Supply</Text>
                    <Text style={[styles.infoValue, styles.infoValueMono, supplyLow && { color: colors.danger }]} numberOfLines={1}>
                      {supplyText}
                    </Text>
                  </View>
                </>
              )}
              <Divider inset />
              <InfoRow label="Watchdog" value={device.watchdogMs != null ? `${device.watchdogMs} ms` : "—"} />
              <Divider inset />
              <InfoRow label="Input filter" value={device.filterMs != null ? `${device.filterMs} ms` : "—"} />
              <Divider inset />
              <InfoRow label="On timeout" value={device.onTimeout === "off" ? "Outputs off" : "Hold outputs"} />
              <Divider inset />
              <InfoRow label="Auto-connect" value={device.autoConnect ? "On" : "Off"} />
            </Card>

            {/* Actions */}
            <View style={styles.actionRow}>
              <Button
                variant="secondary"
                label="Identify"
                icon={<Zap size={15} color={buttonTextColor("secondary")} />}
                style={{ flex: 1 }}
                disabled={busy}
                onPress={identify}
              />
              <Button
                variant="secondary"
                label="Rescan"
                icon={<RefreshCw size={15} color={buttonTextColor("secondary")} />}
                style={{ flex: 1 }}
                disabled={busy}
                onPress={rescan}
              />
            </View>

            {/* Modules — one card per physical IO module, with its own live pins */}
            <SectionHeader title="Modules" />
            <PlcModuleCards plcId={device.id} slots={device.slots} faults={faults} isWide={isWide} />
          </>
        ) : (
          <>
            {/* Config editor */}
            <SectionHeader title="Configuration" />
            <Card>
              <Text style={styles.fieldLabel}>NAME</Text>
              <Input value={name} onChangeText={setName} placeholder="My SimplePLC" />

              <Text style={[styles.fieldLabel, { marginTop: spacing.md }]}>HEAD NAME</Text>
              <Input value={headName} onChangeText={setHeadName} placeholder="Name stored on the head" />

              <Text style={[styles.fieldLabel, { marginTop: spacing.md }]}>HOST</Text>
              <Input value={host} onChangeText={setHost} placeholder="192.168.1.50" autoCapitalize="none" />

              <Text style={[styles.fieldLabel, { marginTop: spacing.md }]}>PORT</Text>
              <Input value={port} onChangeText={setPort} keyboardType="numeric" placeholder="47811" />

              <Text style={[styles.fieldLabel, { marginTop: spacing.md }]}>WATCHDOG (ms)</Text>
              <Input value={watchdog} onChangeText={setWatchdog} keyboardType="numeric" placeholder="1000" />

              <Text style={[styles.fieldLabel, { marginTop: spacing.md }]}>INPUT FILTER (ms)</Text>
              <Input value={filter} onChangeText={setFilter} keyboardType="numeric" placeholder="0" />

              <Text style={[styles.fieldLabel, { marginTop: spacing.md }]}>ON TIMEOUT</Text>
              <SegmentedControl options={ON_TIMEOUT_OPTS} value={onTimeout} onChange={setOnTimeout} />

              <Text style={[styles.fieldLabel, { marginTop: spacing.md }]}>AUTO-CONNECT</Text>
              <SegmentedControl options={AUTO_OPTS} value={autoConnect} onChange={setAutoConnect} />
            </Card>

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
  // ── Fault banner ─────────────────────────────────────────────────────────────
  faultBanner: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
    backgroundColor: colors.dangerSoft,
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.danger,
    padding: spacing.sm + 2,
  },
  faultText: { ...type.caption, color: colors.danger, fontWeight: "600" },

  // ── Warning banner (default MAC, etc.) ───────────────────────────────────────
  warnBanner: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
    backgroundColor: colors.warningSoft,
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.warning,
    padding: spacing.sm + 2,
  },
  warnText: { flex: 1, ...type.caption, color: colors.warning, fontWeight: "600" },

  // ── Info rows ────────────────────────────────────────────────────────────────
  infoRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.md, paddingVertical: spacing.xs + 1 },
  infoLabel: { ...type.caption, color: colors.textMuted },
  infoValue: { ...type.body, fontSize: 14, color: colors.text, fontWeight: "600", flexShrink: 1, textAlign: "right" },
  infoValueMono: { fontFamily: "monospace", fontVariant: ["tabular-nums"] },

  // ── Actions ──────────────────────────────────────────────────────────────────
  actionRow: { flexDirection: "row", gap: spacing.sm + 2 },

  // ── Modules ──────────────────────────────────────────────────────────────────
  slotRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm + 2, paddingHorizontal: spacing.md, paddingVertical: spacing.sm + 3 },
  slotBadge: {
    width: 28, height: 28, borderRadius: radii.sm,
    backgroundColor: colors.accentSoft,
    justifyContent: "center", alignItems: "center",
  },
  slotBadgeText: { fontSize: 12, fontWeight: "800", color: colors.accent, fontVariant: ["tabular-nums"] },
  slotType: { ...type.body, fontSize: 14, fontWeight: "600", color: colors.text },
  slotSub: { ...type.caption, marginTop: 1 },
  slotPills: { alignItems: "flex-end", gap: spacing.xs },
  noLive: { ...type.caption, color: colors.textMuted, paddingHorizontal: spacing.md, paddingVertical: spacing.sm + 2 },

  // ── Module cards grid ────────────────────────────────────────────────────────
  // Stacked on phones; a wrapping multi-column grid on wide screens (flexBasis sets the breakpoint).
  moduleGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md },
  moduleColWide: { flexBasis: 320, flexGrow: 1, minWidth: 0 },
  moduleColFull: { width: "100%" },

  // ── Config editor ────────────────────────────────────────────────────────────
  fieldLabel: { fontSize: 11, fontWeight: "700", letterSpacing: 0.5, color: colors.textMuted, marginBottom: spacing.xs },

  editButtons: { flexDirection: "row", gap: spacing.sm + 2, marginTop: spacing.sm },
});
