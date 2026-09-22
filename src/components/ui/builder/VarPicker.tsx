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
import { ChevronDown, X } from "lucide-react-native";
import { ProgramVariable, variableList } from "@/src/models/robotModels";
import { ms } from "./builderStyles";
import { colors, radii } from "@/src/components/ui/kit";

// ── Variable picker modal ─────────────────────────────────────────────────────

export type VarKind = "number" | "boolean" | "list" | "flags" | "points" | "objects" | "string" | "image";

/**
 * The chip a variable wears. Lists are one type now, so the kind comes from the element
 * type — which is also what decides how the variable is indexed in an expression, and so
 * is the distinction worth showing.
 */
export function varKind(v: ProgramVariable): VarKind {
  const list = variableList(v);
  if (list) {
    if (list.elementType === "Point")   return "points";
    if (list.elementType === "Record")  return "objects";
    if (list.elementType === "Boolean") return "flags";
    return "list";
  }
  if (v.isBoolean) return "boolean";
  if (v.isString) return "string";
  if (v.isImage) return "image";
  return "number";
}

// Per-kind tints (purple/green/cyan/teal/orange) — semantically distinguish variable
// kinds at a glance. No kit token maps to this many distinct hues; left as-is.
export const VAR_KIND_META: Record<
  VarKind,
  { label: string; color: string; bg: string; border: string }
> = {
  number:  { label: "NUM",  color: "#7c3aed", bg: "#ede9fe", border: "#c4b5fd" },
  boolean: { label: "BOOL", color: "#16a34a", bg: "#f0fdf4", border: "#bbf7d0" },
  list:    { label: "LIST", color: "#7c3aed", bg: "#ede9fe", border: "#c4b5fd" },
  // Distinct from BOOL so a list of flags is not mistaken for a single one — the two
  // differ by needing an index, which is exactly the mistake the chip should prevent.
  flags:   { label: "FLAGS", color: "#16a34a", bg: "#f0fdf4", border: "#bbf7d0" },
  points:  { label: "PTS",  color: "#0891b2", bg: "#ecfeff", border: "#a5f3fc" },
  objects: { label: "OBJ",  color: "#0d9488", bg: "#f0fdfa", border: "#99f6e4" },
  string:  { label: "STR",  color: "#ea580c", bg: "#fff7ed", border: "#fed7aa" },
  image:   { label: "IMG",  color: "#0891b2", bg: "#e0f2fe", border: "#7dd3fc" },
};

/**
 * `$name` plus its type chip — the standard presentation for a variable inside a
 * selectable row. Shared so every variable list highlights identically.
 */
export function VarRowLabel({ variable, active }: { variable: ProgramVariable; active?: boolean }) {
  const meta = VAR_KIND_META[varKind(variable)];
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 7 }}>
      <Text style={[ms.rowLabel, active && ms.rowLabelActive]}>${variable.name}</Text>
      <View style={{ backgroundColor: meta.bg, borderRadius: 4,
        paddingHorizontal: 5, paddingVertical: 1,
        borderWidth: 1, borderColor: meta.border }}>
        <Text style={{ fontSize: 9, fontWeight: "700", color: meta.color, letterSpacing: 0.3 }}>
          {meta.label}
        </Text>
      </View>
    </View>
  );
}

export function VarPickerModal({
  visible,
  onClose,
  variables,
  selected,
  onSelect,
  title,
  showNone = false,
  contextVariables,
  contextLabel,
}: {
  visible: boolean;
  onClose: () => void;
  variables: ProgramVariable[];
  selected: string | undefined;
  onSelect: (variable: ProgramVariable | undefined) => void;
  title: string;
  showNone?: boolean;
  contextVariables?: ProgramVariable[];
  contextLabel?: string;
}) {
  const [search,     setSearch]     = useState("");
  const [kindFilter, setKindFilter] = useState<VarKind | "all">("all");

  useEffect(() => {
    if (visible) { setSearch(""); setKindFilter("all"); }
  }, [visible]);

  const kinds = useMemo(() => {
    const seen = new Set<VarKind>();
    [...variables, ...(contextVariables ?? [])].forEach(v => seen.add(varKind(v)));
    return [...seen];
  }, [variables, contextVariables]);

  const filtered = useMemo(() =>
    variables.filter(v => {
      if (kindFilter !== "all" && varKind(v) !== kindFilter) return false;
      const q = search.trim().toLowerCase();
      return !q || v.name.toLowerCase().includes(q);
    }), [variables, kindFilter, search]);

  const filteredContext = useMemo(() =>
    (contextVariables ?? []).filter(v => {
      if (kindFilter !== "all" && varKind(v) !== kindFilter) return false;
      const q = search.trim().toLowerCase();
      return !q || v.name.toLowerCase().includes(q);
    }), [contextVariables, kindFilter, search]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={ms.overlay} onPress={onClose}>
        <Pressable style={[ms.card, { maxHeight: "80%" }]} onPress={() => {}}>
          <View style={ms.header}>
            <View style={{ width: 18 }} />
            <Text style={ms.title}>{title}</Text>
            <TouchableOpacity onPress={onClose} hitSlop={12} activeOpacity={0.7}>
              <X size={18} color={colors.textFaint} />
            </TouchableOpacity>
          </View>

          {/* Search input */}
          <View style={{ flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: colors.border,
            borderRadius: radii.sm, paddingHorizontal: 10, backgroundColor: colors.surfaceMuted, marginBottom: 8 }}>
            <TextInput
              style={{ flex: 1, fontSize: 14, color: colors.text, paddingVertical: 9 }}
              value={search}
              onChangeText={setSearch}
              placeholder="Search by name…"
              placeholderTextColor={colors.textFaint}
              autoFocus
              autoCapitalize="none"
              returnKeyType="search"
            />
            {search.length > 0 && (
              <TouchableOpacity onPress={() => setSearch("")} hitSlop={8} activeOpacity={0.7}>
                <X size={13} color={colors.textFaint} />
              </TouchableOpacity>
            )}
          </View>

          {/* Type filter chips — only shown when multiple kinds exist */}
          {kinds.length > 1 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false}
              style={{ marginBottom: 8 }} contentContainerStyle={{ gap: 6, paddingHorizontal: 2 }}
              keyboardShouldPersistTaps="always"
            >
              {(["all", ...kinds] as const).map(k => {
                const active = kindFilter === k;
                const meta   = k !== "all" ? VAR_KIND_META[k as VarKind] : null;
                return (
                  <TouchableOpacity key={k}
                    style={[{ paddingHorizontal: 12, paddingVertical: 5, borderRadius: 8, borderWidth: 1 },
                      active
                        ? meta ? { backgroundColor: meta.bg, borderColor: meta.border }
                               : { backgroundColor: colors.textSecondary, borderColor: colors.textSecondary }
                        : { backgroundColor: colors.background, borderColor: colors.border }]}
                    onPress={() => setKindFilter(active && k !== "all" ? "all" : k as VarKind | "all")}
                    activeOpacity={0.7}
                  >
                    <Text style={{ fontSize: 12, fontWeight: "600",
                      color: active ? (meta ? meta.color : colors.onAccent) : colors.textMuted }}>
                      {k === "all" ? "All" : VAR_KIND_META[k as VarKind].label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          )}

          <ScrollView showsVerticalScrollIndicator={false} bounces={false} keyboardShouldPersistTaps="always">
            {showNone && (
              <TouchableOpacity
                style={[ms.row, ms.rowBorder, !selected && ms.rowActive]}
                onPress={() => { onSelect(undefined); onClose(); }}
                activeOpacity={0.7}
              >
                <View style={[ms.radioRing, !selected && ms.radioRingActive]}>
                  {!selected && <View style={ms.radioDot} />}
                </View>
                <View style={ms.rowText}>
                  <Text style={[ms.rowLabel, !selected && ms.rowLabelActive]}>None</Text>
                  <Text style={ms.rowDesc}>Clear this output</Text>
                </View>
              </TouchableOpacity>
            )}

            {filtered.length === 0 && (
              <Text style={ms.emptyHint}>
                {search.trim() ? `No variables match "${search.trim()}".` : "No variables available."}
              </Text>
            )}

            {filtered.map((v, i) => {
              const active = selected === v.name;
              return (
                <TouchableOpacity
                  key={v.id}
                  style={[ms.row, i < filtered.length - 1 && ms.rowBorder, active && ms.rowActive]}
                  onPress={() => { onSelect(v); onClose(); }}
                  activeOpacity={0.7}
                >
                  <View style={[ms.radioRing, active && ms.radioRingActive]}>
                    {active && <View style={ms.radioDot} />}
                  </View>
                  <View style={ms.rowText}>
                    <VarRowLabel variable={v} active={active} />
                    {v.description ? <Text style={ms.rowDesc} numberOfLines={1}>{v.description}</Text> : null}
                  </View>
                </TouchableOpacity>
              );
            })}

            {filteredContext.length > 0 && (
              <>
                <View style={{ paddingHorizontal: 4, paddingTop: 10, paddingBottom: 4, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, marginTop: filtered.length > 0 ? 6 : 0 }}>
                  <Text style={{ fontSize: 10, fontWeight: "700", color: colors.textFaint, letterSpacing: 0.5 }}>
                    FROM {(contextLabel ?? "CALLER PROGRAM").toUpperCase()}
                  </Text>
                </View>
                {filteredContext.map((v, i) => {
                  const active = selected === v.name;
                  return (
                    <TouchableOpacity
                      key={v.id}
                      style={[ms.row, i < filteredContext.length - 1 && ms.rowBorder, active && ms.rowActive]}
                      onPress={() => { onSelect(v); onClose(); }}
                      activeOpacity={0.7}
                    >
                      <View style={[ms.radioRing, active && ms.radioRingActive]}>
                        {active && <View style={ms.radioDot} />}
                      </View>
                      <View style={ms.rowText}>
                        <VarRowLabel variable={v} active={active} />
                        {v.description ? <Text style={ms.rowDesc} numberOfLines={1}>{v.description}</Text> : null}
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </>
            )}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

export function VarSelectorButton({
  label,
  value,
  accent,
  placeholder,
  onPress,
  marginTop = true,
}: {
  label: string;
  value: string | undefined;
  accent: string;
  placeholder?: string;
  onPress: () => void;
  marginTop?: boolean;
}) {
  return (
    <>
      <Text style={[ms.fieldLabel, marginTop && { marginTop: 10 }]}>{label}</Text>
      <TouchableOpacity
        style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 4,
          borderWidth: 1, borderColor: value ? accent : colors.border,
          borderRadius: radii.sm, backgroundColor: colors.surfaceMuted,
          paddingHorizontal: 12, paddingVertical: 10 }}
        onPress={onPress}
        activeOpacity={0.75}
      >
        <Text style={{ flex: 1, fontSize: 14,
          fontWeight: value ? "700" : "400",
          color: value ? accent : colors.textFaint }}>
          {value ? `$${value}` : (placeholder ?? "None — tap to select")}
        </Text>
        <ChevronDown size={14} color={value ? accent : colors.textFaint} />
      </TouchableOpacity>
    </>
  );
}
