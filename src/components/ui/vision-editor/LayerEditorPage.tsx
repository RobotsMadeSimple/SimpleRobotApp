import React, { useEffect, useRef, useState } from "react";
import { BackHandler, ScrollView, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from "react-native";
import { AlertTriangle, Check, ChevronDown, ChevronRight, Plus } from "lucide-react-native";
import { Button, PageHeader, accents, colors, radii, spacing } from "@/src/components/ui/kit";
import { usePaneLayout, wide } from "@/src/components/ui/responsive";
import { DeleteIconButton } from "@/src/components/ui/DeleteIconButton";
import { DragHandle } from "@/src/components/ui/builder/StepRow";
import { useDragReorder } from "@/src/components/ui/useDragReorder";
import {
  FILTER_META, layerOrderProblems, newFilter,
  type FilterType, type ImageLayer, type VisionFilter, type VisionProgram,
} from "@/src/models/visionTools";
import { ves } from "./visionEditorStyles";
import { GroupCard, PickerRow, RefreshingImage } from "./EditorBits";
import { ParamFields } from "./ParamFields";
import { ChoiceSheet, FilterTypePicker } from "./ToolPickers";

/**
 * Full-page editor for one image layer: name, input, the ordered filter stack and a live preview of
 * the layer after the selected filter. Changes go straight to the program (autosaved by the editor).
 */
export function LayerEditorPage({ layer, program, previewUrl, aspect, onChange, onClose }: {
  layer: ImageLayer;
  program: VisionProgram;
  /** Builds the preview URL for the layer after filter `upTo` (null = no saved program yet). */
  previewUrl: (upTo: number | undefined) => string | null;
  aspect: number;
  onChange: (next: ImageLayer) => void;
  onClose: () => void;
}) {
  const paneLayout = usePaneLayout();
  const isWide  = paneLayout !== "single";
  const isSplit = paneLayout === "split";
  const [selected, setSelected] = useState<string | null>(layer.filters[layer.filters.length - 1]?.id ?? null);
  const [adding, setAdding] = useState(false);
  const [inputOpen, setInputOpen] = useState(false);

  const closeRef = useRef(onClose);
  useEffect(() => { closeRef.current = onClose; }, [onClose]);
  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => { closeRef.current(); return true; });
    return () => sub.remove();
  }, []);

  const index = program.layers.findIndex(l => l.id === layer.id);
  const earlier = program.layers.slice(0, Math.max(0, index));
  const problem = layerOrderProblems(program.layers)[layer.id];
  const usedBy = program.tools.filter(t => t.input === layer.id).length;
  const selIndex = layer.filters.findIndex(f => f.id === selected);
  const url = previewUrl(selIndex >= 0 ? selIndex : layer.filters.length ? layer.filters.length - 1 : undefined);

  const setFilters = (filters: VisionFilter[]) => onChange({ ...layer, filters });
  const updateFilter = (id: string, patch: Partial<VisionFilter>) =>
    setFilters(layer.filters.map(f => (f.id === id ? ({ ...f, ...patch } as VisionFilter) : f)));
  const filterDrag = useDragReorder(layer.filters, setFilters);
  function add(type: FilterType) {
    const f = newFilter(type);
    setFilters([...layer.filters, f]);
    setSelected(f.id);
  }

  const inputName = layer.input === "camera" ? "Camera" : program.layers.find(l => l.id === layer.input)?.name ?? "Missing layer";
  const selectedFilter = layer.filters[selIndex];

  const preview = (
    <View style={{ gap: spacing.xs }}>
      <RefreshingImage
        key={url ?? "none"}
        url={url}
        aspect={aspect}
        placeholder={program.id ? "Loading preview…" : "Saving the program…"}
        title={layer.name || "Image layer"}
      />
      <Text style={st.previewCaption}>
        {selectedFilter
          ? `After ${selIndex + 1}. ${FILTER_META[selectedFilter.type].label}${selectedFilter.enabled ? "" : " (off)"} — tap a filter to preview the stack up to it`
          : layer.filters.length ? "The full stack" : `${inputName} — add a filter to start`}
      </Text>
    </View>
  );

  const editor = (
    <>
      {!!problem && (
        <View style={st.problem}>
          <AlertTriangle size={14} color={colors.warning} />
          <Text style={st.problemText}>{problem}.</Text>
        </View>
      )}
      <GroupCard title="LAYER">
        <View style={ves.groupRow}>
          <Text style={ves.configFieldLabel}>Name</Text>
          <TextInput
            style={ves.configNameInput}
            value={layer.name}
            onChangeText={name => onChange({ ...layer, name })}
            placeholder="Layer name"
            placeholderTextColor={colors.textFaint}
          />
        </View>
        <PickerRow label="Input" value={inputName} onPress={() => setInputOpen(true)} />
        <Text style={ves.paramDesc}>
          {usedBy > 0 ? `Used by ${usedBy} tool${usedBy !== 1 ? "s" : ""}. ` : ""}
          Filters run top to bottom; each one works on the result of the one above.
        </Text>
      </GroupCard>

      <Text style={[ves.sectionLabel, { marginTop: spacing.xs }]}>FILTERS</Text>
      {layer.filters.length === 0 && (
        <View style={ves.emptyCard}><Text style={ves.emptyText}>No filters — the layer is the plain input image</Text></View>
      )}
      {layer.filters.map((f, i) => {
        const meta = FILTER_META[f.type];
        const open = f.id === selected;
        const drop = filterDrag.dropAt(f.id, i);
        return (
          <View
            key={f.id}
            onLayout={filterDrag.onRowLayout(f.id)}
            style={[st.noSelect, filterDrag.isDragged(f.id) && st.dragDim, drop === "above" && st.dropAbove, drop === "below" && st.dropBelow]}
          >
          <View style={[st.filterCard, open && st.filterCardOpen, !f.enabled && { opacity: 0.7 }]}>
            <View style={st.filterHead}>
              {layer.filters.length > 1 && <DragHandle stepId={f.id} {...filterDrag.handle} />}
              <TouchableOpacity style={st.filterTap} onPress={() => setSelected(open ? null : f.id)} activeOpacity={0.75}
                accessibilityLabel={`${meta.label} filter`}>
                <View style={[st.num, open && { backgroundColor: accents.cyan }]}>
                  <Text style={[st.numText, open && { color: colors.onAccent }]}>{i + 1}</Text>
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={st.filterName}>{meta.label}</Text>
                  {!open && <Text style={st.filterSub} numberOfLines={1}>{filterSummary(f)}</Text>}
                </View>
                {open ? <ChevronDown size={15} color={colors.textFaint} /> : <ChevronRight size={15} color={colors.textFaint} />}
              </TouchableOpacity>
              <Switch value={f.enabled} onValueChange={enabled => updateFilter(f.id, { enabled })} trackColor={{ true: accents.cyan }}
                style={{ transform: [{ scaleX: 0.8 }, { scaleY: 0.8 }] }} />
            </View>
            {open && (
              <View style={st.filterBody}>
                <Text style={ves.paramDesc}>{meta.description}</Text>
                <ParamFields fields={meta.fields} values={f} onChange={(key, value) => updateFilter(f.id, { [key]: value })} />
                <View style={st.filterActions}>
                  <View style={{ flex: 1 }} />
                  <DeleteIconButton size={15} style={st.iconBtn} onPress={() => {
                    setFilters(layer.filters.filter(x => x.id !== f.id));
                    setSelected(layer.filters[i - 1]?.id ?? null);
                  }} />
                </View>
              </View>
            )}
          </View>
          </View>
        );
      })}
      <Button label="Add filter" variant="dashed" icon={<Plus size={15} color={colors.accent} />} onPress={() => setAdding(true)} />
      <View style={{ height: 40 }} />
    </>
  );

  return (
    <View style={ves.configRoot}>
      <PageHeader
        title={layer.name || "Image layer"}
        subtitle="Image layer"
        crumbs={[{ label: "Vision Editor" }, { label: layer.name || "Image layer" }]}
        onBack={onClose}
        right={
          <TouchableOpacity onPress={onClose} style={ves.configDoneBtn}>
            <Check size={15} color={colors.onAccent} />
            <Text style={ves.configDoneBtnText}>Done</Text>
          </TouchableOpacity>
        }
      />
      <View style={isWide ? st.wideRow : { flex: 1 }}>
        <ScrollView style={{ flex: 1 }} contentContainerStyle={[{ padding: spacing.lg, gap: spacing.sm }, isWide && st.rightPaneContent]}
          keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} scrollEnabled={!filterDrag.dragging}>
          {!isWide && preview}
          {editor}
        </ScrollView>
        {isWide && (
          <ScrollView style={[st.feedPane, isSplit && wide.paneSplit]} contentContainerStyle={st.feedPaneContent} showsVerticalScrollIndicator={false}>
            {preview}
          </ScrollView>
        )}
      </View>
      <FilterTypePicker visible={adding} onSelect={add} onClose={() => setAdding(false)} />
      <ChoiceSheet
        visible={inputOpen}
        title="Layer input"
        hint="The camera image, or a layer above this one."
        rows={[{ id: "camera", title: "Camera" }, ...earlier.map(l => ({ id: l.id, title: l.name, subtitle: `${l.filters.length} filter${l.filters.length !== 1 ? "s" : ""}` }))]}
        selected={layer.input}
        onSelect={id => onChange({ ...layer, input: id ?? "camera" })}
        onClose={() => setInputOpen(false)}
      />
    </View>
  );
}

/** A filter's settings in a few words, for the collapsed row. */
export function filterSummary(f: VisionFilter): string {
  const meta = FILTER_META[f.type];
  const parts: string[] = [];
  for (const field of meta.fields) {
    if (field.showIf && !field.showIf(f)) continue;
    const val = f[field.key];
    if (val === undefined || val === null) continue;
    if (field.kind === "segment") parts.push(field.options.find(o => o.value === val)?.label ?? String(val));
    else if (field.kind === "bool") { if (val) parts.push(field.label); }
    else parts.push(`${field.label.replace(/ \(.*\)$/, "").toLowerCase()} ${val}`);
  }
  return parts.join(" · ") || meta.description;
}

const st = StyleSheet.create({
  wideRow: { flex: 1, flexDirection: "row", width: "100%" },
  feedPane: {
    width: "46%", minWidth: 420, maxWidth: 820, flexGrow: 0, flexShrink: 0,
    borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: colors.border,
  },
  feedPaneContent: { paddingHorizontal: 20, paddingTop: 18, paddingBottom: spacing.xl },
  rightPaneContent: { width: "100%", maxWidth: 720, alignSelf: "center" },
  previewCaption: { fontSize: 12, color: colors.textMuted },
  problem: {
    flexDirection: "row", alignItems: "center", gap: spacing.sm, padding: spacing.md,
    backgroundColor: colors.warningSoft, borderRadius: radii.md, borderWidth: 1, borderColor: colors.warningBorder,
  },
  problemText: { flex: 1, fontSize: 13, color: colors.textSecondary },
  // Keep drag targets from turning into text selections mid-drag on web; drop feedback goes on the outer wrapper.
  noSelect:  { userSelect: "none" },
  dragDim:   { opacity: 0.35 },
  dropAbove: { borderTopWidth: 2.5, borderTopColor: accents.cyan, borderTopLeftRadius: radii.md, borderTopRightRadius: radii.md },
  dropBelow: { borderBottomWidth: 2.5, borderBottomColor: accents.cyan, borderBottomLeftRadius: radii.md, borderBottomRightRadius: radii.md },
  filterCard: { backgroundColor: colors.surface, borderRadius: radii.md, borderWidth: 1, borderColor: colors.border },
  filterCardOpen: { borderColor: accents.cyanBorder },
  filterHead: { flexDirection: "row", alignItems: "center", paddingLeft: spacing.sm, paddingRight: spacing.sm, paddingVertical: 10, gap: spacing.sm },
  filterTap: { flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: 10 },
  num: { width: 24, height: 24, borderRadius: 12, backgroundColor: colors.surfaceMuted, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.border },
  numText: { fontSize: 12, fontWeight: "700", color: colors.textSecondary },
  filterName: { fontSize: 14, fontWeight: "600", color: colors.text },
  filterSub: { fontSize: 12, color: colors.textMuted },
  filterBody: { paddingHorizontal: spacing.md, paddingBottom: spacing.md, gap: spacing.md },
  filterActions: { flexDirection: "row", alignItems: "center", gap: spacing.xs, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, paddingTop: spacing.sm },
  iconBtn: { padding: 6 },
});
