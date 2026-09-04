import { SubPageHeader } from "@/src/components/ui/SubPageHeader";
import { wide } from "@/src/components/ui/responsive";
import { Plus, Search, X } from "lucide-react-native";
import { ReactNode } from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

// ── Shared types & helpers ────────────────────────────────────────────────────

export type SortKey = "name" | "modified";

export function relativeTime(ms: number): string {
  const d    = new Date(ms);
  const time = d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  const diff = Date.now() - ms;
  if (diff < 60_000) return "just now";
  if (diff < 86_400_000)
    return `${Math.floor(diff / 3_600_000) > 0
      ? `${Math.floor(diff / 3_600_000)}h ago`
      : `${Math.floor(diff / 60_000)}m ago`} · ${time}`;
  const date = d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  return `${date} at ${time}`;
}

// ── Layout component ──────────────────────────────────────────────────────────

interface Props {
  title: string;
  accentColor: string;
  addLabel: string;
  onAdd: () => void;
  search: string;
  onSearchChange: (q: string) => void;
  sort: SortKey;
  onSortChange: (s: SortKey) => void;
  /** True when there is no data at all (before filtering) — shows the empty state. */
  isEmpty: boolean;
  /** True when filtered results exist — shows children. False shows the "no results" state. */
  hasResults: boolean;
  emptyIcon: ReactNode;
  emptyTitle: string;
  emptySubtitle: string;
  /** Optional overlay rendered before the header (e.g. NotConnectedOverlay). */
  topOverlay?: ReactNode;
  children?: ReactNode;
}

export function ProgramListLayout({
  title, accentColor, addLabel, onAdd,
  search, onSearchChange, sort, onSortChange,
  isEmpty, hasResults, emptyIcon, emptyTitle, emptySubtitle,
  topOverlay, children,
}: Props) {
  const activeChipBg = accentColor + "22"; // ~13 % opacity tint

  return (
    <View style={s.root}>
      {topOverlay}

      <SubPageHeader
        title={title}
        right={
          <TouchableOpacity onPress={onAdd} style={[s.addBtn, { backgroundColor: accentColor }]}>
            <Plus size={18} color="#fff" />
          </TouchableOpacity>
        }
      />

      {/* Search + sort toolbar */}
      <View style={s.toolbar}>
        <View style={s.searchBox}>
          <Search size={15} color="#9ca3af" />
          <TextInput
            style={s.searchInput}
            placeholder="Search…"
            placeholderTextColor="#9ca3af"
            value={search}
            onChangeText={onSearchChange}
            autoCapitalize="none"
            returnKeyType="search"
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => onSearchChange("")} hitSlop={8}>
              <X size={14} color="#9ca3af" />
            </TouchableOpacity>
          )}
        </View>

        <View style={s.sortRow}>
          {(["name", "modified"] as SortKey[]).map(key => (
            <TouchableOpacity
              key={key}
              style={[s.sortChip, sort === key && { backgroundColor: activeChipBg }]}
              onPress={() => onSortChange(key)}
              activeOpacity={0.7}
            >
              <Text style={[s.sortChipText, sort === key && { color: accentColor }]}>
                {key === "name" ? "Name" : "Modified"}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <ScrollView
        style={s.scroll}
        contentContainerStyle={[s.content, wide.content]}
        showsVerticalScrollIndicator={false}
      >
        {isEmpty ? (
          <View style={s.empty}>
            {emptyIcon}
            <Text style={s.emptyTitle}>{emptyTitle}</Text>
            <Text style={s.emptySubtitle}>{emptySubtitle}</Text>
          </View>
        ) : !hasResults ? (
          <View style={s.empty}>
            <Search size={36} color="#d1d5db" />
            <Text style={s.emptyTitle}>No Results</Text>
            <Text style={s.emptySubtitle}>Nothing matches "{search}".</Text>
          </View>
        ) : children}

        <TouchableOpacity
          style={[s.addCard, { borderColor: accentColor }]}
          onPress={onAdd}
          activeOpacity={0.7}
        >
          <Plus size={16} color={accentColor} />
          <Text style={[s.addCardText, { color: accentColor }]}>{addLabel}</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root:    { flex: 1, backgroundColor: "#f3f4f6" },
  scroll:  { flex: 1 },
  content: { padding: 16, paddingBottom: 32, gap: 12 },

  addBtn: {
    width: 32, height: 32, borderRadius: 16,
    justifyContent: "center", alignItems: "center",
  },

  toolbar: {
    backgroundColor: "#fff",
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 10,
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#f3f4f6",
  },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f3f4f6",
    borderRadius: 10,
    paddingHorizontal: 10,
    gap: 8,
    height: 38,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: "#111827",
    paddingVertical: 0,
  },
  sortRow:      { flexDirection: "row", gap: 6 },
  sortChip:     { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20, backgroundColor: "#f3f4f6" },
  sortChipText: { fontSize: 12, fontWeight: "600", color: "#6b7280" },

  addCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderWidth: 1.5,
    borderRadius: 14,
    paddingVertical: 14,
    backgroundColor: "transparent",
  },
  addCardText: { fontSize: 14, fontWeight: "600" },

  empty: {
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 60,
    paddingBottom: 24,
    gap: 12,
  },
  emptyTitle:    { fontSize: 18, fontWeight: "700", color: "#374151" },
  emptySubtitle: { fontSize: 13, color: "#9ca3af", textAlign: "center", paddingHorizontal: 40, lineHeight: 20 },
});
