import { SubPageHeader } from "@/src/components/ui/SubPageHeader";
import { BuiltProgram, Grid, Tool } from "@/src/models/robotModels";
import { useBuiltPrograms, useGrids, useSelectedRobot, useTools } from "@/src/providers/RobotProvider";
import { robotClient } from "@/src/services/RobotConnectService";
import { RobotSnapshot, RobotSnapshotService, SyncChoice, SyncDiff, SyncItem, SyncStatus } from "@/src/services/RobotSnapshotService";
import { router } from "expo-router";
import { CheckCircle2, Cpu, Clock, RefreshCw, Smartphone } from "lucide-react-native";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

// ── Status badge ──────────────────────────────────────────────────────────────

const STATUS_LABEL: Record<SyncStatus, string> = {
  phone_newer:  "Phone newer",
  robot_newer:  "Robot newer",
  phone_only:   "Phone only",
  robot_only:   "Robot only",
  same:         "In Sync",
};

const STATUS_COLOR: Record<SyncStatus, string> = {
  phone_newer:  "#7c3aed",
  robot_newer:  "#2563eb",
  phone_only:   "#7c3aed",
  robot_only:   "#2563eb",
  same:         "#16a34a",
};

function StatusBadge({ status }: { status: SyncStatus }) {
  const color = STATUS_COLOR[status];
  const bg = status === 'same' ? "#dcfce7" : status.startsWith('phone') ? "#ede9fe" : "#dbeafe";
  return (
    <View style={[s.badge, { backgroundColor: bg }]}>
      {status === 'same'
        ? <CheckCircle2 size={10} color={color} />
        : status.startsWith('phone') ? <Smartphone size={10} color={color} /> : <Cpu size={10} color={color} />}
      <Text style={[s.badgeText, { color }]}>{STATUS_LABEL[status]}</Text>
    </View>
  );
}

// ── Sync row ──────────────────────────────────────────────────────────────────

function SyncRow<T>({
  item,
  choice,
  onChoiceChange,
}: {
  item: SyncItem<T>;
  choice: SyncChoice;
  onChoiceChange: (name: string, choice: SyncChoice) => void;
}) {
  const canPickPhone      = item.phoneItem !== null;
  const canPickController = item.robotItem !== null;

  return (
    <View style={s.syncRow}>
      <View style={s.syncRowLeft}>
        <Text style={s.syncRowName} numberOfLines={1}>{item.name}</Text>
        <StatusBadge status={item.status} />
      </View>
      {item.status !== 'same' && (
        <View style={s.toggle}>
          <TouchableOpacity
            style={[s.toggleBtn, choice === 'controller' && s.toggleBtnActive, !canPickController && s.toggleBtnDisabled]}
            onPress={() => canPickController && onChoiceChange(item.name, 'controller')}
            activeOpacity={canPickController ? 0.75 : 1}
          >
            <Cpu size={11} color={choice === 'controller' ? '#fff' : canPickController ? '#2563eb' : '#d1d5db'} />
            <Text style={[s.toggleText, choice === 'controller' && s.toggleTextActive, !canPickController && s.toggleTextDisabled]}>
              Controller
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.toggleBtn, choice === 'phone' && s.toggleBtnPhoneActive, !canPickPhone && s.toggleBtnDisabled]}
            onPress={() => canPickPhone && onChoiceChange(item.name, 'phone')}
            activeOpacity={canPickPhone ? 0.75 : 1}
          >
            <Smartphone size={11} color={choice === 'phone' ? '#fff' : canPickPhone ? '#7c3aed' : '#d1d5db'} />
            <Text style={[s.toggleText, choice === 'phone' && s.toggleTextPhoneActive, !canPickPhone && s.toggleTextDisabled]}>
              Phone
            </Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

// ── Section ───────────────────────────────────────────────────────────────────

function SyncSection<T>({
  label,
  items,
  choices,
  onChoiceChange,
}: {
  label: string;
  items: SyncItem<T>[];
  choices: Record<string, SyncChoice>;
  onChoiceChange: (name: string, choice: SyncChoice) => void;
}) {
  const allSame = items.every(i => i.status === 'same');
  return (
    <View style={s.section}>
      <View style={s.sectionHeader}>
        <Text style={s.sectionLabel}>{label}</Text>
        {allSame && items.length > 0 && (
          <View style={s.allSamePill}>
            <CheckCircle2 size={10} color="#16a34a" />
            <Text style={s.allSameText}>All in sync</Text>
          </View>
        )}
      </View>
      {items.length === 0 ? (
        <Text style={s.emptyText}>Nothing here yet</Text>
      ) : (
        <View style={s.card}>
          {items.map((item, i) => (
            <View key={item.name}>
              {i > 0 && <View style={s.divider} />}
              <SyncRow
                item={item}
                choice={choices[item.name] ?? item.choice}
                onChoiceChange={onChoiceChange}
              />
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function SyncScreen() {
  const robot        = useSelectedRobot();
  const livePrograms = useBuiltPrograms();
  const liveTools    = useTools();
  const liveGrids    = useGrids();

  const [snapshot,  setSnapshot]  = useState<RobotSnapshot | null>(null);
  const [loading,   setLoading]   = useState(true);
  const [applying,  setApplying]  = useState(false);
  const [choices,   setChoices]   = useState<Record<string, SyncChoice>>({});

  useEffect(() => {
    const serial = robot?.serialNumber;
    if (!serial) { setLoading(false); return; }
    RobotSnapshotService.load(serial).then(snap => {
      setSnapshot(snap);
      setLoading(false);
    });
  }, [robot?.serialNumber]);

  const diff = useMemo<SyncDiff | null>(() => {
    if (!snapshot) return null;
    return RobotSnapshotService.computeDiff(snapshot, {
      programs: livePrograms,
      tools:    liveTools,
      grids:    liveGrids,
    });
  }, [snapshot, livePrograms, liveTools, liveGrids]);

  // Pre-populate choices with defaults when diff is first computed
  useEffect(() => {
    if (!diff) return;
    const defaults: Record<string, SyncChoice> = {};
    for (const item of [...diff.programs, ...diff.routines, ...diff.tools, ...diff.grids]) {
      if (item.status !== 'same') defaults[item.name] = item.choice;
    }
    setChoices(defaults);
  }, [diff]);

  function handleChoiceChange(name: string, choice: SyncChoice) {
    setChoices(prev => ({ ...prev, [name]: choice }));
  }

  const pendingCount = useMemo(() => {
    if (!diff) return 0;
    return [...diff.programs, ...diff.routines, ...diff.tools, ...diff.grids]
      .filter(item => item.status !== 'same' && (choices[item.name] ?? item.choice) === 'phone' && item.phoneItem !== null)
      .length;
  }, [diff, choices]);

  async function applySync() {
    if (!diff) return;
    setApplying(true);
    try {
      for (const item of [...diff.programs, ...diff.routines]) {
        if ((choices[item.name] ?? item.choice) === 'phone' && item.phoneItem) {
          await robotClient.saveBuiltProgram(item.phoneItem as BuiltProgram);
        }
      }
      for (const item of diff.tools) {
        if ((choices[item.name] ?? item.choice) === 'phone' && item.phoneItem) {
          const t = item.phoneItem as Tool;
          if (item.status === 'phone_only') {
            await robotClient.createTool(t);
          } else {
            await robotClient.editTool(t.name, { description: t.description, x: t.x, y: t.y, z: t.z, rx: t.rx, ry: t.ry, rz: t.rz });
          }
        }
      }
      for (const item of diff.grids) {
        if ((choices[item.name] ?? item.choice) === 'phone' && item.phoneItem) {
          await robotClient.saveGrid(item.phoneItem as Grid);
        }
      }
      router.back();
    } catch {
      Alert.alert("Sync Failed", "Some items could not be sent to the robot. Check your connection and try again.");
    } finally {
      setApplying(false);
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <View style={s.container}>
        <SubPageHeader title="Sync with Robot" />
        <View style={s.center}>
          <ActivityIndicator size="large" color="#2563eb" />
        </View>
      </View>
    );
  }

  if (!snapshot) {
    return (
      <View style={s.container}>
        <SubPageHeader title="Sync with Robot" />
        <View style={s.center}>
          <RefreshCw size={44} color="#d1d5db" />
          <Text style={s.emptyTitle}>No Snapshot Yet</Text>
          <Text style={s.emptySubtitle}>
            A snapshot is saved automatically each time you connect.{"\n"}
            Connect to the robot at least once to enable offline sync.
          </Text>
        </View>
      </View>
    );
  }

  const savedAgo = formatAgo(snapshot.savedAt);
  const hasDiffs = diff ? RobotSnapshotService.hasDifferences(diff) : false;

  return (
    <View style={s.container}>
      <SubPageHeader title="Sync with Robot" />

      <ScrollView style={s.scroll} contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>

        {/* Snapshot info */}
        <View style={s.infoCard}>
          <Clock size={14} color="#6b7280" />
          <Text style={s.infoText}>
            Snapshot saved {savedAgo} · {snapshot.programs.length + snapshot.routines.length} programs · {snapshot.tools.length} tools · {snapshot.grids.length} grids
          </Text>
        </View>

        {!hasDiffs && (
          <View style={s.allGoodCard}>
            <CheckCircle2 size={28} color="#16a34a" />
            <Text style={s.allGoodTitle}>Everything in Sync</Text>
            <Text style={s.allGoodSubtitle}>Phone and robot are on the same versions.</Text>
          </View>
        )}

        {diff && (
          <>
            <SyncSection label="PROGRAMS" items={diff.programs} choices={choices} onChoiceChange={handleChoiceChange} />
            <SyncSection label="ROUTINES" items={diff.routines} choices={choices} onChoiceChange={handleChoiceChange} />
            <SyncSection label="TOOLS"    items={diff.tools}    choices={choices} onChoiceChange={handleChoiceChange} />
            <SyncSection label="GRIDS"    items={diff.grids}    choices={choices} onChoiceChange={handleChoiceChange} />
          </>
        )}
      </ScrollView>

      {hasDiffs && (
        <View style={s.bottomBar}>
          <TouchableOpacity
            style={[s.applyBtn, (applying || pendingCount === 0) && s.applyBtnDisabled]}
            onPress={applySync}
            disabled={applying || pendingCount === 0}
            activeOpacity={0.8}
          >
            {applying
              ? <ActivityIndicator size="small" color="#fff" />
              : <RefreshCw size={16} color="#fff" />}
            <Text style={s.applyBtnText}>
              {applying
                ? "Syncing…"
                : pendingCount > 0
                  ? `Apply Sync  ·  ${pendingCount} change${pendingCount !== 1 ? "s" : ""} to push`
                  : "Nothing to Push"}
            </Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

function formatAgo(ts: number): string {
  const diffMs = Date.now() - ts;
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1)  return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)  return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f3f4f6" },
  scroll:    { flex: 1 },
  content:   { padding: 16, paddingBottom: 100, gap: 16 },
  center:    { flex: 1, justifyContent: "center", alignItems: "center", gap: 12, padding: 32 },

  infoCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#fff",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  infoText: { flex: 1, fontSize: 13, color: "#6b7280" },

  allGoodCard: {
    backgroundColor: "#f0fdf4",
    borderRadius: 14,
    padding: 24,
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderColor: "#bbf7d0",
  },
  allGoodTitle:    { fontSize: 17, fontWeight: "700", color: "#15803d" },
  allGoodSubtitle: { fontSize: 13, color: "#16a34a", textAlign: "center" },

  section: { gap: 6 },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 2,
  },
  sectionLabel: { flex: 1, fontSize: 11, fontWeight: "700", color: "#6b7280", letterSpacing: 0.8 },
  allSamePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#dcfce7",
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  allSameText: { fontSize: 11, fontWeight: "600", color: "#16a34a" },
  emptyText: { fontSize: 13, color: "#9ca3af", paddingLeft: 4 },

  card: {
    backgroundColor: "#fff",
    borderRadius: 14,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: "#e5e7eb", marginHorizontal: 14 },

  syncRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 10,
  },
  syncRowLeft: { flex: 1, gap: 4 },
  syncRowName: { fontSize: 14, fontWeight: "600", color: "#111827" },

  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    alignSelf: "flex-start",
  },
  badgeText: { fontSize: 10, fontWeight: "700" },

  toggle: { flexDirection: "row", gap: 4 },
  toggleBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#2563eb",
    backgroundColor: "#fff",
  },
  toggleBtnActive:      { backgroundColor: "#2563eb", borderColor: "#2563eb" },
  toggleBtnPhoneActive: { backgroundColor: "#7c3aed", borderColor: "#7c3aed" },
  toggleBtnDisabled:    { borderColor: "#e5e7eb" },
  toggleText:           { fontSize: 11, fontWeight: "600", color: "#2563eb" },
  toggleTextActive:     { color: "#fff" },
  toggleTextPhoneActive:{ color: "#fff" },
  toggleTextDisabled:   { color: "#d1d5db" },

  bottomBar: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 24,
    backgroundColor: "#f3f4f6",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#e5e7eb",
  },
  applyBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#2563eb",
    borderRadius: 14,
    paddingVertical: 14,
  },
  applyBtnDisabled: { backgroundColor: "#9ca3af" },
  applyBtnText: { fontSize: 15, fontWeight: "700", color: "#fff" },

  emptyTitle:    { fontSize: 18, fontWeight: "700", color: "#374151" },
  emptySubtitle: { fontSize: 13, color: "#9ca3af", textAlign: "center", lineHeight: 20 },
});
