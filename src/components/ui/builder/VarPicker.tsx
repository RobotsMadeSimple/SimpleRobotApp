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
import { ChevronDown, Plus, X } from "lucide-react-native";
import { ListElementType, ProgramVariable, variableList } from "@/src/models/robotModels";
import { ms } from "./builderStyles";
import { colors, radii } from "@/src/components/ui/kit";
import { SymbolSections } from "./expressions/SymbolSections";
import { VariableEditModal, type VarType } from "./VariableEditModal";

// ── Create-from-the-field ─────────────────────────────────────────────────────

/**
 * What a field needs, so the picker's "+ New … variable" row opens the editor preset
 * to the right type. Step fields reference variables by name, so "linked" means the
 * picker creates the variable, hands it to the program (onCreateVariable) and selects
 * it into the field in one step.
 */
export type VarCreateSpec = {
  /** "computed" is never offered: a formula cannot be an assignment target. */
  type: VarType;
  /** Lists only: the element type the editor starts on. */
  elementType?: ListElementType;
  /** The noun in "+ New <label> variable"; derived from type/elementType when absent. */
  label?: string;
};

/** The noun for the "+ New … variable" row: "number", "Points list", "image", … */
export function createLabel(spec: VarCreateSpec): string {
  if (spec.label) return spec.label;
  if (spec.type === "list") {
    switch (spec.elementType) {
      case "Point":   return "Points list";
      case "Record":  return "Objects list";
      case "Boolean": return "Booleans list";
      default:        return "list";
    }
  }
  return spec.type;
}

// ── Variable picker modal ─────────────────────────────────────────────────────

export type VarKind = "number" | "boolean" | "list" | "flags" | "points" | "objects" | "string" | "image" | "computed";

/**
 * The chip a variable wears. Lists are one type now, so the kind comes from the element
 * type — which is also what decides how the variable is indexed in an expression, and so
 * is the distinction worth showing.
 */
export function varKind(v: ProgramVariable): VarKind {
  // Checked first: a computed variable carries no stored-kind flags except isBoolean,
  // and "this is a formula, not a slot" is the distinction that matters in a picker.
  if (v.isComputed) return "computed";
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
  computed:{ label: "ƒ COMPUTED", color: "#be185d", bg: "#fdf2f8", border: "#fbcfe8" },
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
  onPickSymbol,
  filter,
  create,
  onCreateVariable,
  allVariables,
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
  /**
   * Set when the pick is inserted into an expression (not assigned to): adds the
   * read-only Properties and the IO names below the variables. Receives the name
   * without its `$`.
   */
  onPickSymbol?: (name: string) => void;
  /**
   * Narrows both `variables` and `contextVariables`. Assignment targets pass
   * `isAssignableVariable` so computed variables — which cannot be written — are not
   * offered.
   */
  filter?: (v: ProgramVariable) => boolean;
  /**
   * The type a new variable should have for this field. With `onCreateVariable` it
   * adds a "+ New <label> variable" row at the top of the list; a save appends the
   * variable to the program and selects it into the field in one step.
   */
  create?: VarCreateSpec;
  /** Appends the new variable to the program (the builder's saveVar). */
  onCreateVariable?: (v: ProgramVariable) => void;
  /**
   * Every variable of the program, for the new-variable editor's duplicate-name check.
   * Needed when `variables` is a pre-filtered list (only the Points lists, say): a name
   * taken by a variable of another kind must still be refused.
   */
  allVariables?: ProgramVariable[];
}) {
  const [search,     setSearch]     = useState("");
  const [kindFilter, setKindFilter] = useState<VarKind | "all">("all");
  const [createOpen, setCreateOpen] = useState(false);

  useEffect(() => {
    if (visible) { setSearch(""); setKindFilter("all"); setCreateOpen(false); }
  }, [visible]);

  const canCreate = !!create && !!onCreateVariable;

  const pickable = useMemo(
    () => filter ? variables.filter(filter) : variables, [variables, filter]);
  const pickableContext = useMemo(
    () => filter ? (contextVariables ?? []).filter(filter) : (contextVariables ?? []),
    [contextVariables, filter]);

  const kinds = useMemo(() => {
    const seen = new Set<VarKind>();
    [...pickable, ...pickableContext].forEach(v => seen.add(varKind(v)));
    return [...seen];
  }, [pickable, pickableContext]);

  const filtered = useMemo(() =>
    pickable.filter(v => {
      if (kindFilter !== "all" && varKind(v) !== kindFilter) return false;
      const q = search.trim().toLowerCase();
      return !q || v.name.toLowerCase().includes(q);
    }), [pickable, kindFilter, search]);

  const filteredContext = useMemo(() =>
    pickableContext.filter(v => {
      if (kindFilter !== "all" && varKind(v) !== kindFilter) return false;
      const q = search.trim().toLowerCase();
      return !q || v.name.toLowerCase().includes(q);
    }), [pickableContext, kindFilter, search]);

  return (
    <>
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

          {/* Search input. While the editor is open on top, this field must not take
              the focus back from the editor's name field, so it is not auto-focused
              (and not editable) until the editor goes away. */}
          <View style={{ flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: colors.border,
            borderRadius: radii.sm, paddingHorizontal: 10, backgroundColor: colors.surfaceMuted, marginBottom: 8 }}>
            <TextInput
              style={{ flex: 1, fontSize: 14, color: colors.text, paddingVertical: 9 }}
              value={search}
              onChangeText={setSearch}
              placeholder="Search by name…"
              placeholderTextColor={colors.textFaint}
              autoFocus={!createOpen}
              editable={!createOpen}
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
            {/* Above "None" and the list: creating the variable the field needs is the
                first thing on offer when the right one does not exist yet. Styled like
                the step modal's dashed "Add …" rows. */}
            {canCreate && (
              <TouchableOpacity
                style={ms.modRowAdd}
                onPress={() => setCreateOpen(true)}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel={`New ${createLabel(create!)} variable`}
              >
                <Plus size={15} color={colors.textFaint} />
                <Text style={ms.modAddText}>New {createLabel(create!)} variable</Text>
              </TouchableOpacity>
            )}

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

            {onPickSymbol && kindFilter === "all" && (
              <SymbolSections search={search} onPick={name => { onPickSymbol(name); onClose(); }} />
            )}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>

    {/* The editor for "+ New … variable". A sibling of the picker's Modal, not a
        child — a Modal nested inside a Modal is unreliable, and VariableEditModal
        hangs its own sheets off the end the same way. It sees every variable the
        picker does, so its duplicate-name check covers both lists. A save appends
        the variable, selects it and closes the picker, all in one tap. */}
    {canCreate && (
      <VariableEditModal
        visible={visible && createOpen}
        variable={null}
        defaultType={create!.type}
        defaultElementType={create!.elementType}
        variables={[...(allVariables ?? variables), ...(contextVariables ?? [])]}
        onSave={v => { onCreateVariable!(v); onSelect(v); onClose(); }}
        onClose={() => setCreateOpen(false)}
      />
    )}
    </>
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
