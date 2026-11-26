import { AnimatedPressable } from "@/src/components/ui/AnimatedPressable";
import {
  Button,
  Card,
  colors,
  Divider,
  FormRow,
  Input,
  PageHeader,
  radii,
  RadioRow,
  Screen,
  shadows,
  spacing,
  type,
} from "@/src/components/ui/kit";
import {
  EditorCard,
  FieldGroup,
  FieldHint,
  FieldLabel,
  SectionHeading,
  TeachButton,
} from "@/src/components/space/EditorCard";
import { gridSet, pointIdsByName, SpacePreview3D, UNLIMITED_GRID_PREVIEW } from "@/src/components/space/space3d";
import type { Cell3DPreview, Cell3DSet } from "@/src/components/ui/cell3d/bridge";
import { Grid } from "@/src/models/robotModels";
import type { Point } from "@/src/models/robotModels";
import { useGrids, usePoints } from "@/src/providers/RobotProvider";
import { robotClient } from "@/src/services/RobotConnectService";
import { ArrayCellSheet } from "@/src/components/space/ArrayCellSheet";
import { PointActionSheet, usePointPick, type SheetAction } from "@/src/components/space/PointActionSheet";
import { teachHandoff } from "@/src/services/teachHandoff";
import { refitGrid, type CornerKey, type GridCornerRef, type Pose } from "@/src/components/ui/grid/gridFit";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { ChevronRight, Crosshair, Pencil, X } from "lucide-react-native";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

// ── Input helpers ─────────────────────────────────────────────────────────────

function SignedNumberInput({
  value,
  onChange,
  placeholder,
}: {
  value: number;
  onChange: (n: number) => void;
  placeholder?: string;
}) {
  const [text, setText] = useState(String(value));

  useEffect(() => { setText(String(value)); }, [value]);

  return (
    <Input
      style={s.input}
      value={text}
      onChangeText={raw => {
        const cleaned = raw.replace(/[^0-9.\-]/g, "").replace(/(?!^)-/g, "");
        setText(cleaned);
        const n = parseFloat(cleaned);
        if (!isNaN(n)) onChange(n);
        else if (cleaned === "" || cleaned === "-") onChange(0);
      }}
      keyboardType="numbers-and-punctuation"
      placeholder={placeholder ?? "0"}
      selectTextOnFocus
    />
  );
}

function OptionalCountInput({
  value,
  onChange,
}: {
  value?: number;
  onChange: (n: number | undefined) => void;
}) {
  const [text, setText] = useState(value !== undefined ? String(value) : "");

  useEffect(() => { setText(value !== undefined ? String(value) : ""); }, [value]);

  return (
    <Input
      value={text}
      onChangeText={raw => {
        const cleaned = raw.replace(/[^0-9]/g, "");
        setText(cleaned);
        if (cleaned === "") onChange(undefined);
        else {
          const n = parseInt(cleaned, 10);
          if (!isNaN(n)) onChange(n);
        }
      }}
      keyboardType="numeric"
      placeholder="unlimited"
      selectTextOnFocus
    />
  );
}

// ── Screen ────────────────────────────────────────────────────────────────────

/** The fields that place the cells (a rename alone keeps the saved cells movable). */
const GEOMETRY: (keyof Grid)[] = ["basePointName", "rowOffsetX", "rowOffsetY", "rowOffsetZ", "colOffsetX", "colOffsetY", "colOffsetZ", "rowCount", "colCount", "rotation"];

export default function GridEditPage() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const grids  = useGrids();
  const points = usePoints();

  const isNew    = !id || id === "new";
  const existing = isNew ? null : (grids.find(g => g.id === id) ?? null);

  const [draft, setDraft] = useState<Grid>(() => existing ?? {
    id: "",
    name: "",
    basePointName: "",
    basePointId: "",
    rowOffsetX: 0, rowOffsetY: 0, rowOffsetZ: 0,
    colOffsetX: 0, colOffsetY: 0, colOffsetZ: 0,
    rowCount: undefined,
    colCount: undefined,
    rotation: 0,
    method: "manual",
    lastUpdatedUnixMs: 0,
  });

  const [pointPickerOpen, setPointPickerOpen] = useState(false);

  // Sync draft if the grid loads after navigation (grids from context may lag), and again
  // when the saved grid itself changes — e.g. after re-teaching it in the wizard.
  const existingKey = existing ? JSON.stringify(existing) : "";
  useEffect(() => {
    if (existing) setDraft({ ...existing });
  }, [existingKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (fields: Partial<Grid>) => setDraft(d => ({ ...d, ...fields }));

  function handleSave() {
    if (!draft.name.trim()) return;
    robotClient.saveGrid(draft).catch(() => {});
    router.back();
  }

  const canSave = draft.name.trim().length > 0;

  // 3D preview: ONLY this grid from the unsaved fields — no other grids, stacks or loose points.
  const draftSet = useMemo(() => gridSet({ ...draft, name: draft.name.trim() || "New grid" }, points), [draft, points]);
  const preview = useMemo<Cell3DPreview | null>(() => (draftSet ? { kind: "set", set: draftSet } : null), [draftSet]);
  // Tap a cell in the 3D preview to move to it: the other arrays' cells and this grid's saved cells
  // move; while this grid is new or has unsaved changes its own cells show without moves.
  const pick = usePointPick();
  const changed = !existing || GEOMETRY.some(f => (draft[f] ?? null) !== (existing[f] ?? null));
  const cellDraft = useMemo(() => (changed && draftSet ? {
    kind: "grid" as const, id: draftSet.id, item: draft,
    note: existing ? "Save your changes to move to this cell." : "Save the grid to move to its cells.",
  } : null), [changed, draftSet, draft, existing]);
  // Show only this grid's own points — its base point and its taught corners; every other saved
  // point stays hidden. Other grids / stacks are not drawn at all (empty sets).
  const gridPointIds = useMemo(() => {
    const names = [draft.basePointName, ...(draft.corners?.map(c => c.pointName) ?? [])].filter(Boolean) as string[];
    const cornerIds = (draft.corners?.map(c => c.pointId).filter(Boolean) ?? []) as string[];
    return Array.from(new Set([...pointIdsByName(names, points), ...cornerIds]));
  }, [draft.basePointName, draft.corners, points]);
  const noSets = useMemo<Cell3DSet[]>(() => [], []);
  const unlimited = [!draft.rowCount && "rows", !draft.colCount && "columns"].filter(Boolean).join(" and ");
  const previewHint = !draft.basePointName
    ? "Pick a base point to see the grid"
    : !draftSet
      ? "Base point not found"
      : unlimited ? `Unlimited ${unlimited}: first ${UNLIMITED_GRID_PREVIEW} shown` : undefined;

  // Teach opens the corner wizard. A saved grid is re-taught in place (same id); a new one is
  // created by the wizard, so it replaces this blank page and Done returns to the grid list.
  function openTeach() {
    if (isNew) {
      const name = draft.name.trim();
      router.replace(name ? `/space/grid-teach?name=${encodeURIComponent(name)}` : "/space/grid-teach");
    } else {
      router.push(`/space/grid-teach?id=${encodeURIComponent(draft.id)}`);
    }
  }

  // ── Reference points (the taught corners) ──
  // A taught grid owns its corner points; a manual grid just references a single base point.
  const isTaught = !!draft.method && draft.method !== "manual" && (draft.corners?.length ?? 0) > 0;
  const findPoint = (ref: { pointId?: string; pointName: string }) =>
    (ref.pointId ? points.find(p => p.id === ref.pointId) : undefined) ?? points.find(p => p.name === ref.pointName) ?? null;
  const cornerRows = useMemo(
    () => (draft.corners ?? []).map(c => ({ corner: c, point: findPoint(c) })),
    [draft.corners, points], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const [sheetPoint, setSheetPoint] = useState<Point | null>(null);
  const [editCorner, setEditCorner] = useState<Point | null>(null);
  const [editCornerDraft, setEditCornerDraft] = useState({ name: "", description: "", x: "", y: "", z: "", rz: "" });

  // Re-fit the grid from its corners' current poses and save. `change` carries the just-edited /
  // re-taught corner (its new name + pose) since the live points list hasn't caught up yet; corners
  // resolve id-first, so a rename keeps every link. Only the row/column steps change — the base point
  // IS corner A, so its own (possibly moved) pose is already the origin.
  const refitAndSave = useCallback(async (change: { role: CornerKey; name: string; pose: Pose } | null) => {
    const cornersNext: GridCornerRef[] = (draft.corners ?? []).map(c => {
      const name = change && c.role === change.role ? change.name : c.pointName;
      const byId = c.pointId ? points.find(p => p.id === c.pointId) : undefined;
      return { role: c.role, pointName: name, pointId: byId?.id ?? c.pointId };
    });
    const resolve = (ref: GridCornerRef): Pose | null => {
      if (change && ref.role === change.role) return change.pose;
      const p = (ref.pointId ? points.find(q => q.id === ref.pointId) : undefined) ?? points.find(q => q.name === ref.pointName);
      return p ? { x: p.x, y: p.y, z: p.z, rx: p.rx, ry: p.ry, rz: p.rz } : null;
    };
    const fit = refitGrid({ method: draft.method, corners: cornersNext, rowCount: draft.rowCount, colCount: draft.colCount, rowSide: draft.rowSide }, resolve);
    const q = (v: number) => Math.round(v * 1e4) / 1e4;
    const baseCorner = cornersNext.find(c => c.role === "A");
    const next: Grid = {
      ...draft,
      corners: cornersNext,
      basePointName: baseCorner?.pointName ?? draft.basePointName,
      basePointId: baseCorner?.pointId ?? draft.basePointId,
      ...(fit ? {
        rowOffsetX: q(fit.rowStep.x), rowOffsetY: q(fit.rowStep.y), rowOffsetZ: q(fit.rowStep.z),
        colOffsetX: q(fit.colStep.x), colOffsetY: q(fit.colStep.y), colOffsetZ: q(fit.colStep.z),
      } : {}),
    };
    setDraft(next);
    await robotClient.saveGrid(next).catch(() => {});
  }, [draft, points]);

  // Re-teach: jog opens in "Teaching [name]" mode; on return it hands the captured pose back here.
  function reteachCorner(p: Point) {
    setSheetPoint(null);
    router.push({
      pathname: "/control/jog",
      params: { teachPointId: p.id, teachPointName: p.name, returnTo: `/space/grid-edit?id=${encodeURIComponent(draft.id)}` },
    });
  }
  useFocusEffect(useCallback(() => {
    const h = teachHandoff.take();
    if (!h) return;
    const corner = (draft.corners ?? []).find(c => c.pointId === h.pointId || c.pointName === h.pointName);
    if (!corner) return;
    (async () => {
      await robotClient.editPoint(corner.pointName, { x: h.pose.x, y: h.pose.y, z: h.pose.z, rx: h.pose.rx, ry: h.pose.ry, rz: h.pose.rz }).catch(() => {});
      await refitAndSave({ role: corner.role, name: corner.pointName, pose: h.pose });
    })();
  }, [draft.corners, refitAndSave]));

  function openCornerEdit(p: Point) {
    setSheetPoint(null);
    setEditCornerDraft({ name: p.name, description: p.description ?? "", x: String(p.x), y: String(p.y), z: String(p.z), rz: String(p.rz) });
    setEditCorner(p);
  }
  async function saveCornerEdit() {
    if (!editCorner) return;
    const corner = (draft.corners ?? []).find(c => c.pointId === editCorner.id || c.pointName === editCorner.name);
    const oldName = editCorner.name;
    const newName = editCornerDraft.name.trim();
    const nx = parseFloat(editCornerDraft.x), ny = parseFloat(editCornerDraft.y), nz = parseFloat(editCornerDraft.z), nrz = parseFloat(editCornerDraft.rz);
    const fields: Record<string, any> = { description: editCornerDraft.description.trim() };
    if (newName && newName !== oldName) fields.newName = newName;
    if (!isNaN(nx)) fields.x = nx;
    if (!isNaN(ny)) fields.y = ny;
    if (!isNaN(nz)) fields.z = nz;
    if (!isNaN(nrz)) fields.rz = nrz;
    await robotClient.editPoint(oldName, fields).catch(() => {});
    if (corner) {
      const pose: Pose = {
        x: isNaN(nx) ? editCorner.x : nx, y: isNaN(ny) ? editCorner.y : ny, z: isNaN(nz) ? editCorner.z : nz,
        rx: editCorner.rx, ry: editCorner.ry, rz: isNaN(nrz) ? editCorner.rz : nrz,
      };
      await refitAndSave({ role: corner.role, name: newName && newName !== oldName ? newName : oldName, pose });
    }
    setEditCorner(null);
  }

  // Backfill stable corner/base ids from the live points once they load (points are keyed by name on
  // the controller, so a freshly-taught corner's id arrives after the grid is saved). Idempotent.
  useEffect(() => {
    if (!existing || !(existing.method && existing.method !== "manual") || !existing.corners?.length || points.length === 0) return;
    const corrected = existing.corners.map(c => {
      const p = points.find(q => q.name === c.pointName) ?? (c.pointId ? points.find(q => q.id === c.pointId) : undefined);
      return { ...c, pointId: p?.id ?? c.pointId };
    });
    const baseId = corrected.find(c => c.role === "A")?.pointId ?? existing.basePointId ?? "";
    const changedIds = baseId !== (existing.basePointId ?? "")
      || corrected.some((c, i) => c.pointId !== (existing.corners?.[i]?.pointId ?? ""));
    if (changedIds) robotClient.saveGrid({ ...existing, corners: corrected, basePointId: baseId }).catch(() => {});
  }, [existingKey, points]); // eslint-disable-line react-hooks/exhaustive-deps

  const cornerExtraActions = useCallback((p: Point): SheetAction[] => [
    { key: "reteach", label: "Re-teach (jog to it)", icon: <Crosshair size={18} color={colors.accent} />, onPress: () => reteachCorner(p) },
  ], []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <KeyboardAvoidingView
      style={s.page}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <PageHeader
        title={isNew ? "New Grid" : "Edit Grid"}
        subtitle="A 2D array of positions stepped from a base point"
        crumbs={[
          { label: "Space", href: "/space" },
          { label: "Grids", href: "/space/grids" },
          { label: isNew ? "New Grid" : "Edit Grid" },
        ]}
        backTo="/space/grids"
        right={<Button label="Save" size="sm" onPress={handleSave} disabled={!canSave} />}
      />

      <Screen>
        {(() => {
          // The whole grid setup lives in one card: plain field labels and hairline
          // dividers instead of a section header + card per field.
          const identity = (
            <FieldGroup>
              <View>
                <FieldLabel text="Name" />
                <Input
                  value={draft.name}
                  onChangeText={v => set({ name: v })}
                  placeholder="e.g. Pallet A"
                  autoCapitalize="words"
                  returnKeyType="next"
                />
              </View>
              <View>
                <FieldLabel text="Description" />
                <Input
                  value={draft.description ?? ""}
                  onChangeText={v => set({ description: v })}
                  placeholder="What is this grid, and where/how to teach it? (optional)"
                  autoCapitalize="sentences"
                  multiline
                />
              </View>
              {/* Manual grids pick a base point here; a taught grid's base is corner A, managed in
                  Reference points below. */}
              {!isTaught && (
                <View>
                  <FieldLabel text="Base point" />
                  <AnimatedPressable style={s.pickerWell} onPress={() => setPointPickerOpen(true)}>
                    <Text
                      style={[s.pickerWellText, !draft.basePointName && s.pickerWellPlaceholder]}
                      numberOfLines={1}
                    >
                      {draft.basePointName || "Select point…"}
                    </Text>
                    <ChevronRight size={16} color={colors.textFaint} />
                  </AnimatedPressable>
                </View>
              )}
            </FieldGroup>
          );

          // Row/column step offsets, with the teach wizard right beside them since
          // teaching is what fills them in (it replaces the base point and offsets).
          const offsets = (
            <FieldGroup>
              <SectionHeading title="Step offsets" unit="mm per step" action={<TeachButton onPress={openTeach} />} />
              <View>
                <View style={s.axisRow}>
                  <View style={s.axisRowLabel} />
                  {(["X", "Y", "Z"] as const).map(axis => (
                    <Text key={axis} style={[s.axisCol, s.axisLabel]}>{axis}</Text>
                  ))}
                </View>
                {([["Row", "rowOffset"], ["Column", "colOffset"]] as const).map(([label, key]) => (
                  <View key={key} style={[s.axisRow, s.axisRowGap]}>
                    <Text style={[s.axisRowLabel, s.axisRowLabelText]}>{label}</Text>
                    {(["X", "Y", "Z"] as const).map(axis => (
                      <View key={axis} style={s.axisCol}>
                        <SignedNumberInput
                          value={draft[`${key}${axis}`]}
                          onChange={v => set({ [`${key}${axis}`]: v } as Partial<Grid>)}
                        />
                      </View>
                    ))}
                  </View>
                ))}
                {/* Rotation: one value (degrees around Z at the base point), spanning the X/Y/Z columns. */}
                <View style={[s.axisRow, s.axisRowGap]}>
                  <Text style={[s.axisRowLabel, s.axisRowLabelText]}>Rotation °</Text>
                  <View style={s.axisCol}>
                    <SignedNumberInput
                      value={draft.rotation}
                      onChange={v => set({ rotation: v })}
                      placeholder="0"
                    />
                  </View>
                </View>
              </View>
              <FieldHint>
                {isNew
                  ? "Teach jogs the robot to the grid's corners and works these out for you, or enter them by hand."
                  : "Teach re-jogs the robot to the grid's corners and replaces the base point and offsets."}
              </FieldHint>
            </FieldGroup>
          );

          const size = (
            <View style={s.pairRow}>
              <View style={s.sizeCol}>
                <FieldLabel
                  text="Rows"
                  tip="Row and column count only cap the grid for display — leave either blank for an unlimited grid in that direction."
                />
                <OptionalCountInput value={draft.rowCount} onChange={v => set({ rowCount: v })} />
              </View>
              <View style={s.sizeCol}>
                <FieldLabel text="Columns" />
                <OptionalCountInput value={draft.colCount} onChange={v => set({ colCount: v })} />
              </View>
            </View>
          );

          // Desktop: identity + size on the left, step geometry on the right, still one card.
          return (
            <EditorCard
              left={[identity, size]}
              right={[offsets]}
              stacked={[identity, offsets, size]}
            />
          );
        })()}

        {/* Reference points: the taught corners, each a saved point you can move to, edit and re-teach. */}
        {isTaught && (
          <Card padded={false} style={s.refCard}>
            <View style={s.refHead}>
              <SectionHeading title="Reference points" />
              <Text style={s.refHeadHint}>Tap a corner to move to it, rename, edit or re-teach it. Re-teaching or editing one re-fits the grid.</Text>
            </View>
            {cornerRows.map(({ corner, point }, i) => (
              <View key={corner.role}>
                <AnimatedPressable style={s.refRow} onPress={() => point && setSheetPoint(point)} disabled={!point}>
                  <View style={s.refBadge}><Text style={s.refBadgeText}>{corner.role}</Text></View>
                  <View style={s.refBody}>
                    <Text style={s.refName} numberOfLines={1}>{point?.name ?? corner.pointName}</Text>
                    {!!point?.description && <Text style={s.refDesc} numberOfLines={1}>{point.description}</Text>}
                    <Text style={s.refCoords} numberOfLines={1}>
                      {point
                        ? `X ${point.x.toFixed(1)}   Y ${point.y.toFixed(1)}   Z ${point.z.toFixed(1)}   RZ ${point.rz.toFixed(1)}`
                        : "Point not found — re-teach it from the wizard"}
                    </Text>
                  </View>
                  {!!point && <ChevronRight size={16} color={colors.textFaint} />}
                </AnimatedPressable>
                {i < cornerRows.length - 1 && <Divider inset />}
              </View>
            ))}
          </Card>
        )}

        {/* The cells this grid steps through, live as the fields change. */}
        <SpacePreview3D preview={preview} sets={noSets} hint={previewHint} pointIds={gridPointIds} highlight={pick.highlight} onPick={pick.onPick} />
        <ArrayCellSheet cell={pick.cell} onClose={pick.close} draft={cellDraft} />
      </Screen>

      {/* Corner actions: move (line / joint), edit, re-teach. Corners aren't deletable — they define the grid. */}
      <PointActionSheet
        point={sheetPoint}
        onClose={() => setSheetPoint(null)}
        onEdit={openCornerEdit}
        extraActions={cornerExtraActions}
      />

      {/* ── Edit corner point ── */}
      <Modal visible={!!editCorner} transparent animationType="slide" onRequestClose={() => setEditCorner(null)}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
          <Pressable style={s.overlay} onPress={() => setEditCorner(null)}>
            <Pressable style={s.editCard} onPress={() => {}}>
              <View style={s.editHeader}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
                  <Pencil size={16} color={colors.textMuted} />
                  <Text style={s.editTitle}>Edit Point</Text>
                </View>
                <Pressable onPress={() => setEditCorner(null)} hitSlop={10}>
                  <X size={18} color={colors.textFaint} />
                </Pressable>
              </View>
              <FormRow label="Name" style={s.editRow}>
                <Input value={editCornerDraft.name} onChangeText={v => setEditCornerDraft(d => ({ ...d, name: v }))} autoCapitalize="words" returnKeyType="next" />
              </FormRow>
              <FormRow label="Description" style={s.editRow}>
                <Input value={editCornerDraft.description} onChangeText={v => setEditCornerDraft(d => ({ ...d, description: v }))} placeholder="What is this point for? (optional)" multiline />
              </FormRow>
              {(["x", "y", "z", "rz"] as const).map(field => (
                <FormRow key={field} label={field.toUpperCase()} style={s.editRow}>
                  <Input style={s.input} value={editCornerDraft[field]} onChangeText={v => setEditCornerDraft(d => ({ ...d, [field]: v }))} keyboardType="numbers-and-punctuation" returnKeyType="done" />
                </FormRow>
              ))}
              <View style={s.editActions}>
                <Button label="Cancel" variant="secondary" style={s.editBtn} onPress={() => setEditCorner(null)} />
                <Button label="Save" variant="primary" style={s.editBtn} onPress={saveCornerEdit} />
              </View>
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Base point picker ── */}
      <Modal
        visible={pointPickerOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setPointPickerOpen(false)}
      >
        <Pressable style={s.overlay} onPress={() => setPointPickerOpen(false)}>
          <Pressable style={s.pickerCard} onPress={() => {}}>
            <View style={s.pickerHeader}>
              <Text style={s.pickerTitle}>Select Base Point</Text>
              <Pressable onPress={() => setPointPickerOpen(false)} hitSlop={12}>
                <X size={18} color={colors.textFaint} />
              </Pressable>
            </View>
            <ScrollView showsVerticalScrollIndicator={false} bounces={false}>
              {points.length === 0 && (
                <Text style={s.pickerEmpty}>No points saved yet.</Text>
              )}
              {points.map((p, i) => {
                const active = draft.basePointName === p.name;
                return (
                  <View key={p.name}>
                    <RadioRow
                      title={p.name}
                      subtitleNode={
                        <Text style={s.pickerItemDesc}>{p.x.toFixed(1)}, {p.y.toFixed(1)}, {p.z.toFixed(1)}</Text>
                      }
                      selected={active}
                      onPress={() => { set({ basePointName: p.name }); setPointPickerOpen(false); }}
                      style={s.pickerItem}
                    />
                    {i < points.length - 1 && <Divider inset />}
                  </View>
                );
              })}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </KeyboardAvoidingView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background },

  pickerWell: {
    minHeight: 40,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.sm,
    paddingHorizontal: spacing.md - 2,
    backgroundColor: colors.surfaceMuted,
  },
  pickerWellText:        { flex: 1, fontSize: 14, color: colors.text },
  pickerWellPlaceholder: { color: colors.textFaint },

  // Coordinate/position values use the mono type preset.
  input: { ...type.mono },

  axisRow:          { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  axisRowGap:       { marginTop: spacing.sm },
  axisRowLabel:     { width: 74 },
  axisRowLabelText: { fontSize: 13, fontWeight: "500", color: colors.textMuted },
  axisCol:          { flex: 1, minWidth: 0 },
  axisLabel: {
    fontSize: 11, fontWeight: "600", color: colors.textFaint, textAlign: "center",
  },

  // Rows + Columns share one row.
  pairRow: { flexDirection: "row", gap: spacing.sm + 2 },
  sizeCol: { flex: 1, minWidth: 0 },

  // ── Point picker modal ────────────────────────────────────────────────────
  overlay: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: "center",
    alignItems: "center",
  },
  pickerCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.xl,
    width: 300,
    maxHeight: "70%",
    overflow: "hidden",
    ...shadows.raised,
  },
  pickerHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md + 2,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  pickerTitle: { fontSize: 15, fontWeight: "700", color: colors.text },
  pickerEmpty: {
    fontSize: 13, color: colors.textFaint,
    textAlign: "center", padding: spacing.xl - 4,
  },
  pickerItem: { paddingHorizontal: spacing.lg },
  pickerItemDesc: { ...type.mono, fontSize: 11, color: colors.textFaint, marginTop: 1 },

  // ── Reference points section ──────────────────────────────────────────────
  refCard: { marginTop: spacing.md },
  refHead: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.sm },
  refHeadHint: { ...type.caption, fontSize: 11, marginTop: spacing.xs },
  refRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.sm + 2, paddingHorizontal: spacing.lg },
  refBadge: {
    width: 26, height: 26, borderRadius: 13, backgroundColor: colors.warningSoft,
    alignItems: "center", justifyContent: "center",
  },
  refBadgeText: { fontSize: 13, fontWeight: "700", color: colors.warning },
  refBody: { flex: 1, minWidth: 0, gap: 1 },
  refName: { fontSize: 15, fontWeight: "600", color: colors.text },
  refDesc: { fontSize: 12, color: colors.textMuted },
  refCoords: { ...type.mono, fontSize: 11, color: colors.textFaint },

  // ── Edit corner modal ─────────────────────────────────────────────────────
  editCard: {
    width: 320, maxWidth: "92%", backgroundColor: colors.surface, borderRadius: radii.xl,
    padding: spacing.lg, ...shadows.raised,
  },
  editHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.lg },
  editTitle: { fontSize: 16, fontWeight: "700", color: colors.text },
  editRow: { marginBottom: spacing.sm + 2 },
  editActions: { flexDirection: "row", gap: spacing.sm + 2, marginTop: spacing.sm },
  editBtn: { flex: 1 },
});
