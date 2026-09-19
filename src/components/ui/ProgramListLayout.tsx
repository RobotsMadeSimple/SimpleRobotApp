import { SubPageHeader } from "@/src/components/ui/SubPageHeader";
import { wide } from "@/src/components/ui/responsive";
import { ArrowDown, ArrowUp, ArrowUpDown, Plus, Search, X } from "lucide-react-native";
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
export type SortDir = "asc" | "desc";
export type SortState = { key: SortKey; dir: SortDir };

/**
 * The direction a key starts in when you first pick it. Names read best A→Z, while
 * "modified" is nearly always asking "what did I touch last", so it opens newest-first.
 * These are also the directions the old fixed-direction chips used, so the default view
 * of every list is unchanged.
 */
const DEFAULT_DIR: Record<SortKey, SortDir> = { name: "asc", modified: "desc" };

export const defaultSort = (key: SortKey = "name"): SortState => ({ key, dir: DEFAULT_DIR[key] });

/**
 * Tapping a sort option: a different key switches to it in its natural direction, the
 * key already in use flips instead. Exported so the chips and any keyboard path agree.
 */
export function nextSort(current: SortState, key: SortKey): SortState {
  return current.key === key
    ? { key, dir: current.dir === "asc" ? "desc" : "asc" }
    : { key, dir: DEFAULT_DIR[key] };
}

/**
 * The comparator every program list sorts with. Direction is applied here, once, rather
 * than being baked into each screen's comparator — that is what let the old chips drift
 * into hardcoding "modified" as descending with no way to say otherwise.
 *
 * Accessors are passed in because the lists hold different card shapes.
 */
export function bySort<T>(
  sort: SortState,
  name: (item: T) => string,
  modified: (item: T) => number,
): (a: T, b: T) => number {
  return (a, b) => {
    const base = sort.key === "name"
      ? name(a).localeCompare(name(b))
      : modified(a) - modified(b);
    return sort.dir === "asc" ? base : -base;
  };
}

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
  sort: SortState;
  onSortChange: (s: SortState) => void;
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
          <ArrowUpDown size={13} color="#9ca3af" />
          <Text style={s.sortLabel}>SORT</Text>
          {(["name", "modified"] as SortKey[]).map(key => {
            const active = sort.key === key;
            // An inactive chip previews the direction it would land in, so the arrow is
            // always there. That keeps the chip from resizing as the selection moves and
            // makes the second tap — the one that flips it — discoverable.
            const dir   = active ? sort.dir : DEFAULT_DIR[key];
            const Arrow = dir === "asc" ? ArrowUp : ArrowDown;
            return (
              <TouchableOpacity
                key={key}
                style={[s.sortChip, active && { backgroundColor: activeChipBg }]}
                onPress={() => onSortChange(nextSort(sort, key))}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                accessibilityLabel={`Sort by ${key === "name" ? "name" : "last modified"}, ${
                  dir === "asc" ? "ascending" : "descending"}${active ? "" : " — currently off"}`}
              >
                <Text style={[s.sortChipText, active && { color: accentColor }]}>
                  {key === "name" ? "Name" : "Modified"}
                </Text>
                <Arrow size={12} strokeWidth={2.5} color={active ? accentColor : "#d1d5db"} />
              </TouchableOpacity>
            );
          })}
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
  sortRow:      { flexDirection: "row", alignItems: "center", gap: 6 },
  sortLabel:    { fontSize: 10, fontWeight: "700", color: "#9ca3af", letterSpacing: 0.5, marginRight: 1 },
  sortChip: {
    flexDirection: "row", alignItems: "center", gap: 4,
    paddingLeft: 12, paddingRight: 9, paddingVertical: 5,
    borderRadius: 20, backgroundColor: "#f3f4f6",
  },
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
