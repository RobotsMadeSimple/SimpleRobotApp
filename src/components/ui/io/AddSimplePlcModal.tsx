import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { ChevronLeft, Network, X } from "lucide-react-native";

import { robotClient } from "@/src/services/RobotConnectService";
import { SimplePlcDiscovered, SimplePlcOnTimeout } from "@/src/models/robotModels";
import { useKeyboardStableCard } from "@/src/platform/keyboard";
import {
  Button,
  colors,
  Divider,
  FormRow,
  Input,
  radii,
  SegmentedControl,
  shadows,
  spacing,
  type,
} from "@/src/components/ui/kit";

const DEFAULT_PORT = "502";
const DEFAULT_WATCHDOG = "1000";

const ON_TIMEOUT_OPTS: { label: string; value: SimplePlcOnTimeout }[] = [
  { label: "Hold", value: "hold" },
  { label: "Off", value: "off" },
];

/**
 * Two-step Add-a-SimplePLC flow:
 *   1. Discover heads on the network (or choose "Enter manually" for a host + port).
 *   2. Name it and set the watchdog / fail-safe behaviour.
 * Then calls AddSimplePlcDevice and hands the new id to `onAdded` (which navigates to the detail page).
 */
export function AddSimplePlcModal({
  visible,
  onClose,
  onAdded,
}: {
  visible: boolean;
  onClose: () => void;
  onAdded: (id: string) => void;
}) {
  const [step, setStep] = useState<"discover" | "config">("discover");
  const [heads, setHeads] = useState<SimplePlcDiscovered[] | null>(null);
  // The chosen discovered head, or null when the host was entered manually.
  const [selected, setSelected] = useState<SimplePlcDiscovered | null>(null);
  const [name, setName] = useState("");
  const [host, setHost] = useState("");
  const [port, setPort] = useState(DEFAULT_PORT);
  const [watchdog, setWatchdog] = useState(DEFAULT_WATCHDOG);
  const [onTimeout, setOnTimeout] = useState<SimplePlcOnTimeout>("hold");
  const [busy, setBusy] = useState(false);

  const { scrollRef: kbScrollRef, onScroll: kbOnScroll, onCardLayout: kbOnCardLayout,
          cardStyle: kbCardStyle, contentPaddingBottom: kbPadBottom } = useKeyboardStableCard(visible && step === "config");

  const loadHeads = () => {
    setHeads(null);
    robotClient.discoverSimplePlc()
      .then(setHeads)
      .catch(() => setHeads([]));
  };

  // Scan when the modal opens. Field state resets via the parent's key-remount, so the only work
  // here is the async discovery (its setState lands in the promise callback, not the effect body).
  useEffect(() => {
    if (!visible) return;
    robotClient.discoverSimplePlc()
      .then(setHeads)
      .catch(() => setHeads([]));
  }, [visible]);

  const pickHead = (h: SimplePlcDiscovered) => {
    if (h.added) return;
    setSelected(h);
    setName(h.name?.trim() || h.host);
    setHost(h.host);
    setPort(h.port ? String(h.port) : DEFAULT_PORT);
    setStep("config");
  };

  const enterManually = () => {
    setSelected(null);
    setName("");
    setHost("");
    setPort(DEFAULT_PORT);
    setStep("config");
  };

  const portNum = parseInt(port, 10) || 0;
  const canAdd = name.trim().length > 0 && host.trim().length > 0 && portNum > 0;

  const add = async () => {
    if (!canAdd || busy) return;
    setBusy(true);
    try {
      const id = await robotClient.addSimplePlc({
        name: name.trim(),
        host: host.trim(),
        port: portNum,
        mac: selected?.mac || undefined,
        watchdogMs: parseInt(watchdog, 10) || 0,
        onTimeout,
        autoConnect: true,
      });
      onClose();
      if (id) onAdded(id);
    } finally {
      setBusy(false);
    }
  };

  const headSubtitle = (h: SimplePlcDiscovered) => {
    const bits: string[] = [];
    if (h.host) bits.push(`${h.host}${h.port ? ` : ${h.port}` : ""}`);
    if (h.mac) bits.push(h.mac);
    if (h.modules) bits.push(`${h.modules} module${h.modules === 1 ? "" : "s"}`);
    return bits.join("  ·  ");
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable
          style={[styles.card, kbCardStyle]}
          onPress={() => {}}
          onLayout={kbOnCardLayout}
        >
          <View style={styles.header}>
            {step === "config" ? (
              <TouchableOpacity style={styles.backRow} onPress={() => setStep("discover")} hitSlop={8} activeOpacity={0.7}>
                <ChevronLeft size={18} color={colors.textMuted} />
                <Text style={styles.title} numberOfLines={1}>Configure SimplePLC</Text>
              </TouchableOpacity>
            ) : (
              <Text style={styles.title}>Add a SimplePLC</Text>
            )}
            <TouchableOpacity onPress={onClose} hitSlop={10}>
              <X size={20} color={colors.textMuted} />
            </TouchableOpacity>
          </View>

          <ScrollView
            ref={kbScrollRef}
            onScroll={kbOnScroll}
            scrollEventThrottle={16}
            style={styles.body}
            contentContainerStyle={{ paddingBottom: kbPadBottom }}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {step === "discover" ? (
              <>
                <Text style={styles.subtitle}>
                  Pick a head found on the network. Heads already configured are shown greyed out — or enter a host manually.
                </Text>
                {heads == null ? (
                  <View style={styles.loading}>
                    <ActivityIndicator size="small" color={colors.accent} />
                    <Text style={styles.loadingText}>Scanning the network…</Text>
                  </View>
                ) : heads.length === 0 ? (
                  <Text style={styles.empty}>No heads found. Check the network and tap Refresh, or enter a host manually.</Text>
                ) : (
                  heads.map(h => (
                    <TouchableOpacity
                      key={h.mac || h.host}
                      style={[styles.headRow, h.added && styles.headRowDisabled]}
                      onPress={() => pickHead(h)}
                      disabled={h.added}
                      activeOpacity={0.7}
                    >
                      <View style={styles.headIcon}>
                        <Network size={16} color={h.added ? colors.textFaint : colors.accent} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.headName, h.added && styles.headTextDim]}>{h.name?.trim() || h.host}</Text>
                        {!!headSubtitle(h) && (
                          <Text style={[styles.headSub, h.added && styles.headTextDim]} numberOfLines={1}>{headSubtitle(h)}</Text>
                        )}
                        {h.added && <Text style={styles.addedText} numberOfLines={1}>Already added</Text>}
                      </View>
                    </TouchableOpacity>
                  ))
                )}
                <Button label="Refresh" variant="secondary" style={{ marginTop: spacing.sm }} onPress={loadHeads} />
                <Button label="Enter manually" variant="ghost" style={{ marginTop: spacing.xs }} onPress={enterManually} />
              </>
            ) : (
              <>
                <Text style={styles.subtitle}>
                  {selected ? `${selected.host}${selected.mac ? `  ·  ${selected.mac}` : ""}` : "Enter the head's address and settings."}
                </Text>

                <FormRow label="Name">
                  <Input value={name} onChangeText={setName} placeholder="My SimplePLC" autoFocus returnKeyType="next" />
                </FormRow>

                <View style={styles.hostRow}>
                  <View style={{ flex: 2 }}>
                    <Text style={styles.fieldLabel}>HOST</Text>
                    <Input value={host} onChangeText={setHost} placeholder="192.168.1.50" autoCapitalize="none" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.fieldLabel}>PORT</Text>
                    <Input value={port} onChangeText={setPort} keyboardType="numeric" placeholder={DEFAULT_PORT} />
                  </View>
                </View>

                <Divider />

                <Text style={styles.fieldLabel}>WATCHDOG (ms)</Text>
                <Input value={watchdog} onChangeText={setWatchdog} keyboardType="numeric" placeholder={DEFAULT_WATCHDOG} />

                <Text style={[styles.fieldLabel, { marginTop: spacing.md }]}>ON TIMEOUT</Text>
                <SegmentedControl options={ON_TIMEOUT_OPTS} value={onTimeout} onChange={setOnTimeout} />

                <View style={styles.buttons}>
                  <Button label="Back" variant="secondary" style={{ flex: 1 }} onPress={() => setStep("discover")} />
                  <Button label="Add" style={{ flex: 1 }} loading={busy} disabled={!canAdd} onPress={add} />
                </View>
              </>
            )}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: "center",
    alignItems: "center",
    padding: spacing.xl,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.xl,
    width: "100%",
    maxWidth: 440,
    maxHeight: "85%",
    paddingTop: spacing.lg + 4,
    paddingHorizontal: spacing.lg + 4,
    paddingBottom: spacing.lg,
    ...shadows.raised,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.xs,
  },
  backRow: { flexDirection: "row", alignItems: "center", gap: spacing.xs, flex: 1 },
  title: type.pageTitle,
  body: { flexShrink: 1, minHeight: 0 },
  subtitle: { ...type.subtitle, marginBottom: spacing.md, lineHeight: 18 },

  loading: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: spacing.lg },
  loadingText: { fontSize: 13, color: colors.textMuted },
  empty: { fontSize: 13, color: colors.textFaint, textAlign: "center", paddingVertical: spacing.lg },

  headRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm + 2,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.surfaceMuted,
    marginBottom: spacing.sm,
  },
  headRowDisabled: { opacity: 0.5 },
  headIcon: {
    width: 32, height: 32, borderRadius: radii.sm,
    justifyContent: "center", alignItems: "center",
    backgroundColor: colors.background,
  },
  headName: { ...type.body, fontWeight: "600", color: colors.text },
  headSub: { ...type.caption, marginTop: 1 },
  headTextDim: { color: colors.textFaint },
  addedText: { fontSize: 11, color: colors.textMuted, marginTop: 1, fontWeight: "600" },

  hostRow: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm },
  fieldLabel: { fontSize: 11, fontWeight: "700", letterSpacing: 0.5, color: colors.textMuted, marginBottom: spacing.xs },

  buttons: { flexDirection: "row", gap: spacing.sm + 2, marginTop: spacing.lg },
});
