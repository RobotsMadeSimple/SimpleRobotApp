import { useRelayIO } from "@/src/providers/RobotProvider";
import { robotClient } from "@/src/services/RobotConnectService";
import { router } from "expo-router";
import { Check } from "lucide-react-native";
import React, { useEffect, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  View,
} from "react-native";

import {
  accents,
  Button,
  colors,
  InfoTip,
  Input,
  PageHeader,
  radii,
  Screen,
  SectionHeader,
  spacing,
} from "@/src/components/ui/kit";

const RELAY_COUNT = 4;

// Relay board device-type tint (cyan) — matches its icon tile on the IO index
// page, via the kit's cyan accent family.
const RELAY_TINT      = accents.cyan;
const RELAY_TINT_SOFT = accents.cyanSoft;
const RELAY_TINT_DIRTY_BORDER = "#67e8f9";
const RELAY_TINT_DIRTY_BG     = "#f0fdff";

export default function ConfigureRelayPage() {
  const relay   = useRelayIO();
  const names   = relay?.names ?? ["Relay 1", "Relay 2", "Relay 3", "Relay 4"];

  // Local edit state — string per channel
  const [edits,  setEdits]  = useState<string[]>(names);
  const [saving, setSaving] = useState(false);

  // Re-sync when relay state arrives (e.g. first load after navigation)
  useEffect(() => {
    setEdits(names);
  }, [JSON.stringify(names)]);

  const dirty = edits.some((e, i) => e !== names[i]);

  function updateName(index: number, value: string) {
    setEdits(prev => prev.map((n, i) => (i === index ? value : n)));
  }

  async function saveAll() {
    setSaving(true);
    try {
      for (let i = 0; i < RELAY_COUNT; i++) {
        const trimmed = edits[i]?.trim() ?? "";
        if (trimmed !== names[i]) {
          await robotClient.renameRelay(i + 1, trimmed || `Relay ${i + 1}`);
        }
      }
      router.back();
    } catch {
      // Stay on page so user can retry
    } finally {
      setSaving(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <PageHeader
          title="Configure Relay Board"
          subtitle="DCTTECH 4-Channel USB HID"
          crumbs={[
            { label: "I/O", href: "/io" },
            { label: "USB Relay Board", href: "/(tabs)/io/relay" },
            { label: "Configure Relay" },
          ]}
          right={
            <Button
              variant="primary"
              size="sm"
              label="Save"
              icon={<Check size={16} color={colors.onAccent} />}
              loading={saving}
              disabled={!dirty}
              onPress={saveAll}
              style={{ backgroundColor: RELAY_TINT }}
            />
          }
        />

        <Screen>
          <SectionHeader
            title="Channels"
            right={<InfoTip text="Names appear throughout the app wherever this relay is used, so rename each channel to match what it switches (e.g. “Conveyor” or “Cabinet Light”)." />}
          />
          {Array.from({ length: RELAY_COUNT }, (_, i) => {
            const isDirty = edits[i] !== names[i];
            return (
              <View key={i} style={[styles.row, isDirty && styles.rowDirty]}>
                <View style={styles.channelWrap}>
                  <View style={[styles.channelBadge, isDirty && styles.channelBadgeDirty]}>
                    <Text style={[styles.channelNum, isDirty && styles.channelNumDirty]}>
                      {i + 1}
                    </Text>
                  </View>
                  <Text style={styles.channelSub}>CH{i + 1}</Text>
                </View>

                <Input
                  style={[styles.nameInput, isDirty && styles.nameInputDirty]}
                  value={edits[i] ?? ""}
                  onChangeText={v => updateName(i, v)}
                  placeholder={`Relay ${i + 1}`}
                  returnKeyType="next"
                  maxLength={32}
                />
              </View>
            );
          })}
        </Screen>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm + 2,
    backgroundColor: colors.surface,
    borderRadius: radii.sm + 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    borderWidth: 1,
    borderColor: colors.border,
  },
  rowDirty: {
    borderColor: RELAY_TINT_DIRTY_BORDER,
    backgroundColor: RELAY_TINT_DIRTY_BG,
  },

  channelWrap: {
    width: 48,
    alignItems: "center",
    gap: 2,
  },
  channelBadge: {
    width: 30,
    height: 30,
    borderRadius: radii.sm - 1,
    backgroundColor: RELAY_TINT_SOFT,
    borderWidth: 1.5,
    borderColor: accents.cyanBorder,
    justifyContent: "center",
    alignItems: "center",
  },
  channelBadgeDirty: {
    backgroundColor: "#cffafe",
    borderColor: RELAY_TINT,
  },
  channelNum: {
    fontSize: 14,
    fontWeight: "800",
    color: RELAY_TINT,
  },
  channelNumDirty: {
    color: "#0e7490",
  },
  channelSub: {
    fontSize: 9,
    color: colors.textFaint,
    fontWeight: "600",
    letterSpacing: 0.4,
  },

  nameInput: {
    flex: 1,
  },
  nameInputDirty: {
    borderColor: RELAY_TINT,
    backgroundColor: RELAY_TINT_SOFT,
    color: "#0e7490",
  },
});
