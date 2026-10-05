import React, { useEffect, useMemo, useState } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { ChevronLeft, OctagonX, Search, X } from "lucide-react-native";
import { PluginStepContribution, StepType } from "@/src/models/robotModels";
import {
  BACKGROUND_RESTRICTED,
  PLUGIN_CATEGORY,
  STEP_CATEGORIES,
  STEP_THEME,
  STEP_TYPES,
  STEP_TYPE_MAP,
  StepCategory,
  StepCategoryKey,
  StepIcon,
  categoryForStep,
} from "./stepUtils";
import { ms } from "./builderStyles";
import { usePaneLayout } from "@/src/components/ui/responsive";
import { colors, radii, shadows, spacing } from "@/src/components/ui/kit";
import { usePluginContributions } from "./usePluginContributions";

// ── Step type picker modal ────────────────────────────────────────────────────
//
// A real two-step modal over the ~36 block types, navigated as grids (not
// lists), per user feedback:
//
//   Step 1 — a grid of the 8 category tiles (icon, label, block count).
//   Step 2 — tap a category to swap to a grid of that category's block
//            tiles (icon + label), with a back affordance and the category
//            name as the header title.
//   Search — typing at either step shows every matching block across all
//            categories as a flat grid, each tile tagged with its category.
//
// Picking a tile still calls onPick(type) exactly as before — this is
// navigation and presentation only.
//
// Plugins — a ninth category, present only while some installed plugin
// contributes steps (GetPluginContributions). One tile per (plugin, step);
// picking one calls onPickPlugin. A plugin that is not running still lists its
// steps, greyed with a "not running" hint, so a program can be written before
// the plugin is started.

export function StepTypePicker({
  visible,
  onPick,
  onPickPlugin,
  onClose,
  isBackgroundMode = false,
}: {
  visible: boolean;
  onPick: (type: StepType) => void;
  onPickPlugin?: (contribution: PluginStepContribution) => void;
  onClose: () => void;
  isBackgroundMode?: boolean;
}) {
  const contributions = usePluginContributions();
  const pluginSteps = onPickPlugin ? contributions.data.steps : [];
  const [search, setSearch] = useState("");
  const [activeCat, setActiveCat] = useState<StepCategoryKey | null>(null);
  const [gridWidth, setGridWidth] = useState(360);
  const paneLayout = usePaneLayout();
  const isWide = paneLayout !== "single";
  // 2 columns narrow, 3 columns on split (foldables/tablets), 4 on desktop.
  const cols = paneLayout === "desktop" ? 4 : paneLayout === "split" ? 3 : 2;
  const GAP = spacing.sm;
  const tileWidth = (gridWidth - GAP * (cols - 1)) / cols;

  useEffect(() => {
    if (visible) { setSearch(""); setActiveCat(null); }
    // Pick up plugins installed or started since the builder opened.
    if (visible && onPickPlugin && contributions.status !== "unsupported") contributions.refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const q = search.trim().toLowerCase();
  const searchResults = useMemo(() => {
    if (!q) return null;
    // Category label is searchable too, so typing "vision" or "flow" finds the group.
    return STEP_TYPES.filter(s =>
      s.label.toLowerCase().includes(q) ||
      s.desc.toLowerCase().includes(q) ||
      categoryForStep(s.type).label.toLowerCase().includes(q)
    );
  }, [q]);

  const pluginResults = useMemo(() => {
    if (!q) return [];
    return pluginSteps.filter(c =>
      c.step.label.toLowerCase().includes(q) ||
      (c.step.description ?? "").toLowerCase().includes(q) ||
      c.pluginName.toLowerCase().includes(q) ||
      PLUGIN_CATEGORY.label.toLowerCase().includes(q)
    );
  }, [q, pluginSteps]);

  const activeCategory = activeCat === "plugins"
    ? (pluginSteps.length > 0 ? PLUGIN_CATEGORY : null)
    : activeCat ? STEP_CATEGORIES.find(c => c.key === activeCat) ?? null : null;
  const resultCount = (searchResults?.length ?? 0) + pluginResults.length;

  function renderPluginTile(c: PluginStepContribution, opts?: { showCategory?: boolean }) {
    const theme = STEP_THEME["Plugin"];
    const subtitle = [c.pluginName, c.step.description].filter(Boolean).join(" — ");
    return (
      <TouchableOpacity
        key={`${c.pluginId}/${c.step.id}`}
        style={[pt.tile, { width: tileWidth }, !c.running && pt.tileNotRunning]}
        onPress={() => { onPickPlugin?.(c); onClose(); }}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={`${c.step.label} — ${c.pluginName}${c.running ? "" : " (not running)"}`}
      >
        <View style={[pt.tileIcon, { backgroundColor: theme.iconBg }]}>
          <StepIcon type="Plugin" size={20} color={theme.iconColor} />
        </View>
        <Text style={[pt.tileLabel, { color: theme.accent }]} numberOfLines={2}>{c.step.label}</Text>
        <Text style={pt.tileSub} numberOfLines={2}>{subtitle}</Text>
        {!c.running && <Text style={pt.notRunning}>not running</Text>}
        {opts?.showCategory && (
          <View style={[pt.catTag, { backgroundColor: PLUGIN_CATEGORY.soft }]}>
            <Text style={[pt.catTagText, { color: PLUGIN_CATEGORY.color }]} numberOfLines={1}>{PLUGIN_CATEGORY.label}</Text>
          </View>
        )}
      </TouchableOpacity>
    );
  }

  function renderBlockTile(s: typeof STEP_TYPES[0], opts?: { showCategory?: boolean }) {
    const theme      = STEP_THEME[s.type] ?? STEP_THEME["MoveL"];
    const cat        = categoryForStep(s.type);
    const restricted = isBackgroundMode && BACKGROUND_RESTRICTED.has(s.type);
    return (
      <TouchableOpacity
        key={s.type}
        style={[pt.tile, { width: tileWidth }, restricted && pt.tileRestricted]}
        onPress={() => { if (!restricted) { onPick(s.type); onClose(); } }}
        activeOpacity={restricted ? 1 : 0.7}
        accessibilityRole="button"
        accessibilityLabel={
          restricted
            ? `${s.label} — not allowed in background programs`
            : `${s.label} — ${cat.label}`
        }
      >
        {restricted && (
          <View style={pt.restrictedBadge}>
            <OctagonX size={13} color={colors.danger} />
          </View>
        )}
        <View style={[pt.tileIcon, { backgroundColor: theme.iconBg }]}>
          <StepIcon type={s.type} size={20} color={theme.iconColor} />
        </View>
        <Text style={[pt.tileLabel, { color: theme.accent }]} numberOfLines={2}>{s.label}</Text>
        {opts?.showCategory && (
          <View style={[pt.catTag, { backgroundColor: cat.soft }]}>
            <Text style={[pt.catTagText, { color: cat.color }]} numberOfLines={1}>{cat.label}</Text>
          </View>
        )}
      </TouchableOpacity>
    );
  }

  function renderCategoryTile(cat: StepCategory) {
    const Icon = cat.icon;
    const count = cat.key === "plugins" ? pluginSteps.length : cat.types.length;
    return (
      <TouchableOpacity
        key={cat.key}
        style={[pt.catTile, { width: tileWidth }]}
        onPress={() => setActiveCat(cat.key)}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={`${cat.label} — ${count} block${count !== 1 ? "s" : ""}`}
      >
        <View style={[pt.catTileIcon, { backgroundColor: cat.soft }]}>
          <Icon size={22} color={cat.color} />
        </View>
        <Text style={[pt.catTileLabel, { color: cat.color }]} numberOfLines={2}>{cat.label}</Text>
        <Text style={pt.catTileCount}>{count} block{count !== 1 ? "s" : ""}</Text>
      </TouchableOpacity>
    );
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={pt.overlay} onPress={onClose}>
        <Pressable style={[pt.card, isWide && pt.cardWide]} onPress={() => {}}>
          <View style={ms.header}>
            {activeCategory && !q ? (
              <TouchableOpacity
                style={pt.backRow}
                onPress={() => setActiveCat(null)}
                hitSlop={8}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel="Back to categories"
              >
                <ChevronLeft size={18} color={colors.textMuted} />
                <Text style={ms.title} numberOfLines={1}>{activeCategory.label}</Text>
              </TouchableOpacity>
            ) : (
              <Text style={ms.title}>Add Step</Text>
            )}
            <TouchableOpacity onPress={onClose} hitSlop={12} activeOpacity={0.7} accessibilityLabel="Close">
              <X size={18} color={colors.textFaint} />
            </TouchableOpacity>
          </View>

          {/* Search across every block, whatever category it lives in */}
          <View style={pt.searchBar}>
            <Search size={14} color={colors.textFaint} />
            <TextInput
              style={pt.searchInput}
              value={search}
              onChangeText={setSearch}
              placeholder="Search all blocks…"
              placeholderTextColor={colors.textFaint}
              autoCapitalize="none"
              returnKeyType="search"
            />
            {search.length > 0 && (
              <TouchableOpacity onPress={() => setSearch("")} hitSlop={10} activeOpacity={0.7}>
                <X size={13} color={colors.textFaint} />
              </TouchableOpacity>
            )}
          </View>

          <ScrollView
            showsVerticalScrollIndicator={false}
            bounces={false}
            contentContainerStyle={{ paddingBottom: spacing.xl }}
            keyboardShouldPersistTaps="always"
            onLayout={e => setGridWidth(e.nativeEvent.layout.width)}
          >
            {searchResults ? (
              resultCount === 0 ? (
                <Text style={ms.emptyHint}>No blocks match "{q}".</Text>
              ) : (
                <>
                  <Text style={pt.resultCount}>
                    {resultCount} block{resultCount !== 1 ? "s" : ""} found
                  </Text>
                  <View style={pt.grid}>
                    {searchResults.map(s => renderBlockTile(s, { showCategory: true }))}
                    {pluginResults.map(c => renderPluginTile(c, { showCategory: true }))}
                  </View>
                </>
              )
            ) : activeCategory?.key === "plugins" ? (
              <>
                <CategoryBanner cat={activeCategory} />
                <View style={pt.grid}>
                  {pluginSteps.map(c => renderPluginTile(c))}
                </View>
              </>
            ) : activeCategory ? (
              <>
                <CategoryBanner cat={activeCategory} />
                <View style={pt.grid}>
                  {activeCategory.types
                    .map(t => STEP_TYPE_MAP[t])
                    .filter(Boolean)
                    .map(s => renderBlockTile(s))}
                </View>
              </>
            ) : (
              // Default view: the eight categories as a grid, so the whole
              // vocabulary is visible at a glance and one tap opens a family.
              <View style={pt.grid}>
                {STEP_CATEGORIES.map(cat => renderCategoryTile(cat))}
                {pluginSteps.length > 0 && renderCategoryTile(PLUGIN_CATEGORY)}
              </View>
            )}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function CategoryBanner({ cat }: { cat: StepCategory }) {
  const Icon = cat.icon;
  return (
    <View style={[pt.banner, { backgroundColor: cat.soft }]}>
      <Icon size={16} color={cat.color} />
      <Text style={[pt.bannerText, { color: cat.color }]}>{cat.desc}</Text>
    </View>
  );
}

const pt = StyleSheet.create({
  // Centered overlay + card, matching the app's other modals (AppAlert, the
  // grid base-point picker) rather than a top-anchored dropdown.
  overlay: {
    flex: 1, backgroundColor: colors.overlay,
    justifyContent: "center", alignItems: "center",
    padding: spacing.xl,
  },
  card: {
    width: "100%", maxWidth: 480, maxHeight: "90%",
    backgroundColor: colors.surface, borderRadius: radii.xl,
    paddingTop: 20, paddingHorizontal: 20,
    ...shadows.raised,
    overflow: "hidden",
  },
  // Large centered card on wide screens so the 3–4 column grid breathes.
  cardWide: { maxWidth: 720, maxHeight: "85%" },

  backRow: { flexDirection: "row", alignItems: "center", gap: spacing.xs, flex: 1, minHeight: 44 },

  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.sm,
    paddingHorizontal: spacing.sm + 2,
    backgroundColor: colors.surfaceMuted,
    marginBottom: spacing.md,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: colors.text,
    paddingVertical: 9,
  },

  resultCount: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.5,
    color: colors.textFaint,
    paddingBottom: spacing.xs,
  },

  banner: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    borderRadius: radii.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.md,
  },
  bannerText: { flex: 1, fontSize: 12.5, lineHeight: 17, fontWeight: "500" },

  // ── Grid ─────────────────────────────────────────────────────────────────────
  grid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },

  // Category tiles (step 1)
  catTile: {
    minHeight: 108,
    borderWidth: 1, borderColor: colors.border, borderRadius: radii.md,
    backgroundColor: colors.surfaceMuted,
    paddingVertical: spacing.md, paddingHorizontal: spacing.sm,
    alignItems: "center", justifyContent: "center", gap: spacing.xs,
  },
  catTileIcon: {
    width: 44, height: 44, borderRadius: radii.md,
    justifyContent: "center", alignItems: "center",
  },
  catTileLabel: { fontSize: 13, fontWeight: "700", textAlign: "center" },
  catTileCount: { fontSize: 11, color: colors.textFaint, fontWeight: "600" },

  // Block tiles (step 2 / search results)
  tile: {
    minHeight: 96,
    borderWidth: 1, borderColor: colors.border, borderRadius: radii.md,
    backgroundColor: colors.surface,
    paddingVertical: spacing.md, paddingHorizontal: spacing.sm,
    alignItems: "center", justifyContent: "center", gap: spacing.xs,
    position: "relative",
  },
  tileRestricted: { opacity: 0.35 },
  // Still selectable — only dimmed, unlike a restricted tile.
  tileNotRunning: { opacity: 0.6, borderStyle: "dashed" },
  tileSub: { fontSize: 10.5, color: colors.textMuted, textAlign: "center", lineHeight: 14 },
  notRunning: { fontSize: 10, fontWeight: "700", color: colors.warning, letterSpacing: 0.3 },
  tileIcon: {
    width: 40, height: 40, borderRadius: radii.md,
    justifyContent: "center", alignItems: "center",
  },
  tileLabel: { fontSize: 12.5, fontWeight: "700", textAlign: "center" },
  restrictedBadge: { position: "absolute", top: 6, right: 6 },

  catTag: {
    borderRadius: radii.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 1,
    marginTop: 2,
  },
  catTagText: { fontSize: 9.5, fontWeight: "700", letterSpacing: 0.3 },
});
