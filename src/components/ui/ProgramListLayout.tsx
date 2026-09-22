import { SubPageHeader } from "@/src/components/ui/SubPageHeader";
import { useWideContent } from "@/src/components/ui/responsive";
import { ArrowDown, ArrowUp, ArrowUpDown, Plus, Search } from "lucide-react-native";
import { ReactNode } from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { EmptyState, Input, colors, radii, spacing } from "@/src/components/ui/kit";

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
  const wideContent = useWideContent();

  return (
    <View style={s.root}>
      {topOverlay}

      <SubPageHeader
        title={title}
        right={
          <TouchableOpacity onPress={onAdd} style={[s.addBtn, { backgroundColor: accentColor }]}>
            <Plus size={18} color={colors.onAccent} />
          </TouchableOpacity>
        }
      />

      {/* Search + sort toolbar */}
      <View style={s.toolbar}>
        <Input
          icon={<Search size={15} color={colors.textFaint} />}
          clearable
          placeholder="Search…"
          value={search}
          onChangeText={onSearchChange}
          autoCapitalize="none"
          returnKeyType="search"
          style={s.searchInput}
        />

        <View style={s.sortRow}>
          <ArrowUpDown size={13} color={colors.textFaint} />
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
                <Arrow size={12} strokeWidth={2.5} color={active ? accentColor : colors.borderStrong} />
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      <ScrollView
        style={s.scroll}
        contentContainerStyle={[s.content, wideContent]}
        showsVerticalScrollIndicator={false}
      >
        {isEmpty ? (
          <EmptyState icon={emptyIcon} title={emptyTitle} subtitle={emptySubtitle} />
        ) : !hasResults ? (
          <EmptyState
            icon={<Search size={32} color={colors.textFaint} />}
            title="No Results"
            subtitle={`Nothing matches "${search}".`}
          />
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
  root:    { flex: 1, backgroundColor: colors.background },
  scroll:  { flex: 1 },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md },

  addBtn: {
    width: 32, height: 32, borderRadius: radii.pill,
    justifyContent: "center", alignItems: "center",
  },

  toolbar: {
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm + 2,
    paddingBottom: spacing.sm + 2,
    gap: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.background,
  },
  searchInput: {
    fontSize: 14,
    color: colors.text,
  },
  sortRow:      { flexDirection: "row", alignItems: "center", gap: spacing.sm - 2 },
  sortLabel:    { fontSize: 10, fontWeight: "700", color: colors.textFaint, letterSpacing: 0.5, marginRight: 1 },
  sortChip: {
    flexDirection: "row", alignItems: "center", gap: 4,
    paddingLeft: spacing.md, paddingRight: spacing.sm + 1, paddingVertical: spacing.xs + 1,
    borderRadius: radii.pill, backgroundColor: colors.background,
  },
  sortChipText: { fontSize: 12, fontWeight: "600", color: colors.textMuted },

  addCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    borderWidth: 1.5,
    borderRadius: radii.lg,
    paddingVertical: spacing.md + 2,
    backgroundColor: "transparent",
  },
  addCardText: { fontSize: 14, fontWeight: "600" },
});
