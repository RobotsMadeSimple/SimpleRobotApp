import { NotConnectedOverlay } from "@/src/components/ui/NotConnectedOverlay";
import { useRobotStatus } from "@/src/providers/RobotProvider";
import { ArrowLeftRight, ArrowRightLeft } from "lucide-react-native";
import React from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";

// ── Single I/O row ─────────────────────────────────────────────────────────────

function IORow({
  index,
  label,
  value,
  last = false,
}: {
  index: number;
  label: string;
  value: boolean;
  last?: boolean;
}) {
  return (
    <View style={[styles.row, !last && styles.rowBorder]}>
      {/* Index tile */}
      <View style={styles.indexTile}>
        <Text style={styles.indexText}>{index}</Text>
      </View>

      {/* Label */}
      <Text style={styles.rowLabel}>{label}</Text>

      {/* Pulse dot */}
      <View style={[styles.dot, value ? styles.dotOn : styles.dotOff]} />

      {/* ON / OFF badge */}
      <View style={[styles.badge, value ? styles.badgeOn : styles.badgeOff]}>
        <Text style={[styles.badgeText, value ? styles.badgeTextOn : styles.badgeTextOff]}>
          {value ? "ON" : "OFF"}
        </Text>
      </View>
    </View>
  );
}

// ── Section card wrapper ───────────────────────────────────────────────────────

function IOCard({
  title,
  icon,
  iconColor,
  tileBg,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  iconColor: string;
  tileBg: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.section}>
      {/* Section header */}
      <View style={styles.sectionHeader}>
        <View style={[styles.sectionIconTile, { backgroundColor: tileBg }]}>
          {icon}
        </View>
        <Text style={styles.sectionLabel}>{title}</Text>
      </View>

      {/* Card */}
      <View style={styles.card}>{children}</View>
    </View>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

const INPUTS = ["Input 1", "Input 2", "Input 3", "Input 4"] as const;
const OUTPUT_PLACEHOLDERS = ["Output 1", "Output 2", "Output 3", "Output 4"] as const;

export default function IoPage() {
  const status = useRobotStatus();
  const inputValues = [status.input1, status.input2, status.input3, status.input4];

  return (
    <View style={styles.container}>
      <NotConnectedOverlay />

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Digital Inputs ── */}
        <IOCard
          title="DIGITAL INPUTS"
          icon={<ArrowLeftRight size={16} color="#2563eb" />}
          iconColor="#2563eb"
          tileBg="#eff6ff"
        >
          {INPUTS.map((label, i) => (
            <IORow
              key={label}
              index={i + 1}
              label={label}
              value={inputValues[i]}
              last={i === INPUTS.length - 1}
            />
          ))}
        </IOCard>

        {/* ── Digital Outputs (placeholder) ── */}
        <IOCard
          title="DIGITAL OUTPUTS"
          icon={<ArrowRightLeft size={16} color="#7c3aed" />}
          iconColor="#7c3aed"
          tileBg="#f5f3ff"
        >
          {OUTPUT_PLACEHOLDERS.map((label, i) => (
            <View
              key={label}
              style={[styles.row, styles.rowDisabled, i < OUTPUT_PLACEHOLDERS.length - 1 && styles.rowBorder]}
            >
              <View style={[styles.indexTile, styles.indexTileDisabled]}>
                <Text style={[styles.indexText, styles.indexTextDisabled]}>{i + 1}</Text>
              </View>
              <Text style={[styles.rowLabel, styles.rowLabelDisabled]}>{label}</Text>
              <View style={styles.soonBadge}>
                <Text style={styles.soonText}>Soon</Text>
              </View>
            </View>
          ))}
        </IOCard>
      </ScrollView>
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f3f4f6",
  },
  content: {
    padding: 16,
    paddingBottom: 32,
    gap: 20,
  },

  // ── Section ───────────────────────────────
  section: {
    gap: 8,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  sectionIconTile: {
    width: 28,
    height: 28,
    borderRadius: 7,
    justifyContent: "center",
    alignItems: "center",
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: "#6b7280",
    letterSpacing: 0.8,
  },

  // ── Card ──────────────────────────────────
  card: {
    backgroundColor: "#ffffff",
    borderRadius: 14,
    shadowColor: "#000",
    shadowOpacity: 0.07,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
    overflow: "hidden",
  },

  // ── Row ───────────────────────────────────
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
  },
  rowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#e5e7eb",
  },
  rowDisabled: {
    opacity: 0.45,
  },

  // ── Index tile ────────────────────────────
  indexTile: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: "#eff6ff",
    justifyContent: "center",
    alignItems: "center",
  },
  indexTileDisabled: {
    backgroundColor: "#f3f4f6",
  },
  indexText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#2563eb",
  },
  indexTextDisabled: {
    color: "#9ca3af",
  },

  // ── Row label ─────────────────────────────
  rowLabel: {
    flex: 1,
    fontSize: 15,
    fontWeight: "500",
    color: "#111827",
  },
  rowLabelDisabled: {
    color: "#9ca3af",
  },

  // ── Pulse dot ─────────────────────────────
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  dotOn: {
    backgroundColor: "#22c55e",
    shadowColor: "#22c55e",
    shadowOpacity: 0.6,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 0 },
    elevation: 2,
  },
  dotOff: {
    backgroundColor: "#d1d5db",
  },

  // ── ON / OFF badge ────────────────────────
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    minWidth: 44,
    alignItems: "center",
  },
  badgeOn: {
    backgroundColor: "#f0fdf4",
  },
  badgeOff: {
    backgroundColor: "#f3f4f6",
  },
  badgeText: {
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.4,
  },
  badgeTextOn: {
    color: "#16a34a",
  },
  badgeTextOff: {
    color: "#9ca3af",
  },

  // ── Soon badge ────────────────────────────
  soonBadge: {
    backgroundColor: "#f3f4f6",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  soonText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#9ca3af",
    letterSpacing: 0.3,
  },
});
