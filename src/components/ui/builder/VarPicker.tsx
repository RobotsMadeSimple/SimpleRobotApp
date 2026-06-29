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
import { ProgramVariable } from "@/src/models/robotModels";
import { ms } from "./builderStyles";

// ── Variable picker modal ─────────────────────────────────────────────────────

export type VarKind = "number" | "boolean" | "list" | "points" | "string";

export function varKind(v: ProgramVariable): VarKind {
  if (v.points != null) return "points";
  if (v.values != null && v.values.length > 0) return "list";
  if (v.isBoolean) return "boolean";
  if (v.isString) return "string";
  return "number";
}

export const VAR_KIND_META: Record<
  VarKind,
  { label: string; color: string; bg: string; border: string }
> = {
  number:  { label: "NUM",  color: "#7c3aed", bg: "#ede9fe", border: "#c4b5fd" },
  boolean: { label: "BOOL", color: "#16a34a", bg: "#f0fdf4", border: "#bbf7d0" },
  list:    { label: "LIST", color: "#7c3aed", bg: "#ede9fe", border: "#c4b5fd" },
  points:  { label: "PTS",  color: "#0891b2", bg: "#ecfeff", border: "#a5f3fc" },
  string:  { label: "STR",  color: "#ea580c", bg: "#fff7ed", border: "#fed7aa" },
};

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
              <X size={18} color="#9ca3af" />
            </TouchableOpacity>
          </View>

          {/* Search input */}
          <View style={{ flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: "#e5e7eb",
            borderRadius: 9, paddingHorizontal: 10, backgroundColor: "#f9fafb", marginBottom: 8 }}>
            <TextInput
              style={{ flex: 1, fontSize: 14, color: "#111827", paddingVertical: 9 }}
              value={search}
              onChangeText={setSearch}
              placeholder="Search by name…"
              placeholderTextColor="#9ca3af"
              autoFocus
              autoCapitalize="none"
              returnKeyType="search"
            />
            {search.length > 0 && (
              <TouchableOpacity onPress={() => setSearch("")} hitSlop={8} activeOpacity={0.7}>
                <X size={13} color="#9ca3af" />
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
                               : { backgroundColor: "#374151", borderColor: "#374151" }
                        : { backgroundColor: "#f3f4f6", borderColor: "#e5e7eb" }]}
                    onPress={() => setKindFilter(active && k !== "all" ? "all" : k as VarKind | "all")}
                    activeOpacity={0.7}
                  >
                    <Text style={{ fontSize: 12, fontWeight: "600",
                      color: active ? (meta ? meta.color : "#fff") : "#6b7280" }}>
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
              const kind   = varKind(v);
              const meta   = VAR_KIND_META[kind];
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
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 7 }}>
                      <Text style={[ms.rowLabel, active && ms.rowLabelActive]}>${v.name}</Text>
                      <View style={{ backgroundColor: meta.bg, borderRadius: 4,
                        paddingHorizontal: 5, paddingVertical: 1,
                        borderWidth: 1, borderColor: meta.border }}>
                        <Text style={{ fontSize: 9, fontWeight: "700", color: meta.color, letterSpacing: 0.3 }}>
                          {meta.label}
                        </Text>
                      </View>
                    </View>
                    {v.description ? <Text style={ms.rowDesc} numberOfLines={1}>{v.description}</Text> : null}
                  </View>
                </TouchableOpacity>
              );
            })}

            {filteredContext.length > 0 && (
              <>
                <View style={{ paddingHorizontal: 4, paddingTop: 10, paddingBottom: 4, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "#e5e7eb", marginTop: filtered.length > 0 ? 6 : 0 }}>
                  <Text style={{ fontSize: 10, fontWeight: "700", color: "#9ca3af", letterSpacing: 0.5 }}>
                    FROM {(contextLabel ?? "CALLER PROGRAM").toUpperCase()}
                  </Text>
                </View>
                {filteredContext.map((v, i) => {
                  const active = selected === v.name;
                  const kind   = varKind(v);
                  const meta   = VAR_KIND_META[kind];
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
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 7 }}>
                          <Text style={[ms.rowLabel, active && ms.rowLabelActive]}>${v.name}</Text>
                          <View style={{ backgroundColor: meta.bg, borderRadius: 4,
                            paddingHorizontal: 5, paddingVertical: 1,
                            borderWidth: 1, borderColor: meta.border }}>
                            <Text style={{ fontSize: 9, fontWeight: "700", color: meta.color, letterSpacing: 0.3 }}>
                              {meta.label}
                            </Text>
                          </View>
                        </View>
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
          borderWidth: 1, borderColor: value ? accent : "#e5e7eb",
          borderRadius: 10, backgroundColor: "#f9fafb",
          paddingHorizontal: 12, paddingVertical: 10 }}
        onPress={onPress}
        activeOpacity={0.75}
      >
        <Text style={{ flex: 1, fontSize: 14,
          fontWeight: value ? "700" : "400",
          color: value ? accent : "#9ca3af" }}>
          {value ? `$${value}` : (placeholder ?? "None — tap to select")}
        </Text>
        <ChevronDown size={14} color={value ? accent : "#9ca3af"} />
      </TouchableOpacity>
    </>
  );
}
