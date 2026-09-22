import React, { useEffect, useState } from "react";
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
import { ChevronRight, OctagonX, Search, X } from "lucide-react-native";
import { StepType } from "@/src/models/robotModels";
import {
  BACKGROUND_RESTRICTED,
  STEP_CATEGORIES,
  STEP_THEME,
  STEP_TYPES,
  STEP_TYPE_MAP,
  StepIcon,
} from "./stepUtils";
import { ms } from "./builderStyles";
import { colors, radii } from "@/src/components/ui/kit";

// ── Step type picker modal ────────────────────────────────────────────────────

export function StepTypePicker({
  visible,
  onPick,
  onClose,
  isBackgroundMode = false,
}: {
  visible: boolean;
  onPick: (type: StepType) => void;
  onClose: () => void;
  isBackgroundMode?: boolean;
}) {
  const [search, setSearch] = useState("");

  useEffect(() => { if (visible) setSearch(""); }, [visible]);

  const q = search.trim().toLowerCase();
  const searchResults = q
    ? STEP_TYPES.filter(s =>
        s.label.toLowerCase().includes(q) || s.desc.toLowerCase().includes(q)
      )
    : null;

  function renderRow(s: typeof STEP_TYPES[0], i: number, arr: typeof STEP_TYPES) {
    const theme      = STEP_THEME[s.type] ?? STEP_THEME["MoveL"];
    const restricted = isBackgroundMode && BACKGROUND_RESTRICTED.has(s.type);
    return (
      <TouchableOpacity
        key={s.type}
        style={[ms.row, i < arr.length - 1 && ms.rowBorder, restricted && { opacity: 0.35 }]}
        onPress={() => { if (!restricted) { onPick(s.type); onClose(); } }}
        activeOpacity={restricted ? 1 : 0.7}
      >
        <View style={[ms.iconTile, { backgroundColor: theme.iconBg }]}>
          <StepIcon type={s.type} size={18} color={theme.iconColor} />
        </View>
        <View style={ms.rowText}>
          <Text style={[ms.rowLabel, { color: theme.accent }]}>{s.label}</Text>
          <Text style={ms.rowDesc}>{restricted ? "Not allowed in background programs" : s.desc}</Text>
        </View>
        {restricted ? <OctagonX size={14} color={colors.danger} /> : <ChevronRight size={16} color={colors.borderStrong} />}
      </TouchableOpacity>
    );
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={ms.overlay} onPress={onClose}>
        <Pressable style={ms.card} onPress={() => {}}>
          <View style={ms.header}>
            <Text style={ms.title}>Add Step</Text>
            <TouchableOpacity onPress={onClose} hitSlop={12} activeOpacity={0.7}>
              <X size={18} color={colors.textFaint} />
            </TouchableOpacity>
          </View>

          {/* Search bar */}
          <View style={ptStyles.searchBar}>
            <Search size={14} color={colors.textFaint} />
            <TextInput
              style={ptStyles.searchInput}
              value={search}
              onChangeText={setSearch}
              placeholder="Search steps…"
              placeholderTextColor={colors.textFaint}
              autoCapitalize="none"
              returnKeyType="search"
            />
            {search.length > 0 && (
              <TouchableOpacity onPress={() => setSearch("")} hitSlop={8} activeOpacity={0.7}>
                <X size={13} color={colors.textFaint} />
              </TouchableOpacity>
            )}
          </View>

          <ScrollView
            showsVerticalScrollIndicator={false}
            bounces={false}
            contentContainerStyle={{ paddingBottom: 20 }}
            keyboardShouldPersistTaps="always"
          >
            {searchResults ? (
              searchResults.length === 0
                ? <Text style={ms.emptyHint}>No steps match "{q}".</Text>
                : searchResults.map((s, i) => renderRow(s, i, searchResults))
            ) : (
              STEP_CATEGORIES.map(cat => {
                const items = cat.types.map(t => STEP_TYPE_MAP[t]).filter(Boolean);
                return (
                  <View key={cat.label}>
                    <View style={ptStyles.catHeader}>
                      <Text style={[ptStyles.catLabel, { color: cat.color }]}>
                        {cat.label.toUpperCase()}
                      </Text>
                    </View>
                    {items.map((s, i) => renderRow(s, i, items))}
                  </View>
                );
              })
            )}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const ptStyles = StyleSheet.create({
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.sm,
    paddingHorizontal: 10,
    backgroundColor: colors.surfaceMuted,
    marginBottom: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: colors.text,
    paddingVertical: 9,
  },
  catHeader: {
    paddingTop: 14,
    paddingBottom: 6,
    paddingHorizontal: 2,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    marginBottom: 2,
  },
  catLabel: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.8,
  },
});
