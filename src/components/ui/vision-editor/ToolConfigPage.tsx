import React, { useEffect, useMemo, useRef, useState } from "react";
import { BackHandler, ScrollView, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from "react-native";
import { AlertTriangle, Check, Crosshair, Pencil, Plus, Sparkles, X } from "lucide-react-native";
import { Button, FormRow, PageHeader, SegmentedControl, accents, colors, radii, spacing } from "@/src/components/ui/kit";
import { usePaneLayout, wide } from "@/src/components/ui/responsive";
import { DeleteIconButton } from "@/src/components/ui/DeleteIconButton";
import { VisionFeedViewer } from "@/src/components/vision/VisionFeedViewer";
import { StatusChip, fmtVisionValue, summarizeResult } from "@/src/components/ui/VisionResults";
import { ColorEntry, defaultColorEntry } from "@/src/models/robotModels";
import {
  DISTANCE_MODES, FIXTURE_MODES, TOOL_META, canFeed, mainValueKey, orderProblems, regionOwner, regionSources, sourceSlots,
  type Pose, type Region, type ToolGrid, type ToolLimit, type VisionProgram, type VisionResult, type VisionTool,
} from "@/src/models/visionTools";
import { buildOverlay } from "@/src/vision/feedOverlay";
import {
  fixtureTransform, invertTransform, looksNormalized, regionToDraw, transformRegion,
} from "@/src/vision/regionMath";
import type { DrawContextRegion } from "@/src/vision/visionHtml";
import { ves } from "./visionEditorStyles";
import { GroupCard, PickerRow, RefreshingImage, RunVisionButton } from "./EditorBits";
import { ParamFields, NumberStepper } from "./ParamFields";
import { RegionDrawModal } from "./RegionDrawModal";
import { ChoiceSheet, FormatPickerSheet, ToolTile } from "./ToolPickers";
import { ColorEditModal } from "./ColorEditModal";
import { robotClient } from "@/src/services/RobotConnectService";

type Frame = { width: number; height: number };

const shapeLabel = (r: Region | null | undefined) =>
  !r ? "None" : r.shape === "rect" ? (r.rotation ? `Rectangle · ${r.rotation}°` : "Rectangle")
    : r.shape === "circle" ? "Circle" : r.shape === "quad" ? "Skewed (4 corners)" : `Polygon · ${r.points?.length ?? 0} points`;

/**
 * Full-page settings for one vision tool, shown in place of the editor (not a Modal). Every change
 * goes straight to the program through onChange, so the editor's debounced autosave keeps the
 * running vision in step and the live result reflects the edit.
 */
export function ToolConfigPage({
  tool, program, result, frame, feedUrl, isRunning, transitioning, onToggleRunning,
  snapshotUri, onFetchSnapshot, onChange, onChangeTool, onSetReference, onSetFixtureReference, onTeach, onClose,
}: {
  tool: VisionTool;
  program: VisionProgram;
  result: VisionResult | null;
  frame: Frame;
  feedUrl: string | null;
  isRunning: boolean;
  transitioning: "starting" | "stopping" | null;
  onToggleRunning: () => void;
  snapshotUri: string | null;
  onFetchSnapshot: () => Promise<string | null>;
  onChange: (next: VisionTool) => void;
  /** Changes another tool (the one whose area this tool shares, when its corners are moved here). */
  onChangeTool: (next: VisionTool) => void;
  onSetReference: () => void;
  /** Gives a fixture its reference (when a dependent region is drawn before it had one). */
  onSetFixtureReference: (fixtureId: string, pose: Pose) => void;
  onTeach: () => void;
  onClose: () => void;
}) {
  const paneLayout = usePaneLayout();
  const isWide  = paneLayout !== "single";
  const isSplit = paneLayout === "split";
  const meta = TOOL_META[tool.type];
  const index = program.tools.findIndex(t => t.id === tool.id);
  const earlier = program.tools.slice(0, Math.max(0, index));
  const res = result?.tools?.find(r => r.id === tool.id);
  const problem = orderProblems(program)[tool.id];
  const W = frame.width || 640, H = frame.height || 480;

  const [sheet, setSheet] = useState<null | "input" | "fixture" | "regionFrom" | "mode" | { slot: number } | "addLimit">(null);
  const [formatsOpen, setFormatsOpen] = useState(false);
  const [colorEdit, setColorEdit] = useState<ColorEntry | null>(null);
  const [draw, setDraw] = useState<null | { which: "region" | "regionB"; initial: Region | null }>(null);
  // "tool": this tool's result drawn over its own input image (the controller's debug view).
  const [view, setView] = useState<"live" | "tool">("live");

  // Android back closes the page instead of leaving the editor route.
  const closeRef = useRef(onClose);
  useEffect(() => { closeRef.current = onClose; }, [onClose]);
  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => { closeRef.current(); return true; });
    return () => sub.remove();
  }, []);

  const set = (patch: Partial<VisionTool>) => onChange({ ...tool, ...patch });
  const setParam = (key: string, value: unknown) => onChange({ ...tool, params: { ...tool.params, [key]: value as never } });

  // ── Shared area ────────────────────────────────────────────────────────
  // With regionFrom set, the area (and the fixture it follows) belong to the owner tool; drawing
  // here moves the owner's area, so every tool sharing it moves together.
  const owner = regionOwner(tool, program.tools);
  const linked = owner.id !== tool.id;
  const regionSource = tool.regionFrom ? program.tools.find(t => t.id === tool.regionFrom) ?? null : null;
  const sharers = program.tools.filter(t => t.id !== owner.id && regionOwner(t, program.tools).id === owner.id);

  // ── Fixture ────────────────────────────────────────────────────────────
  const fixture = owner.fixtureId ? program.tools.find(t => t.id === owner.fixtureId) ?? null : null;
  const fixRes = fixture ? result?.tools?.find(r => r.id === fixture.id) : undefined;
  const fixPose = fixRes?.status === "ok" && fixRes.pose ? fixRes.pose : null;
  // Reference space → where the fixture is now. Null when the fixture has no reference or no pose now.
  const fwd = fixture?.reference && fixPose ? fixtureTransform(fixture.reference, fixPose) : null;

  const fixtureNote = !fixture ? null
    : !fixRes ? "Start vision to see where the fixture is — the region is drawn as stored"
    : !fixPose ? `"${fixture.name}" is not found on this image — regions are stored as drawn`
    : !fixture.reference ? `Drawing here also sets "${fixture.name}"'s reference to where it is now`
    : null;

  async function openDraw(which: "region" | "regionB") {
    await onFetchSnapshot();
    const stored = which === "region" ? owner.region ?? null : (tool.params.regionB as Region | null) ?? null;
    setDraw({ which, initial: stored && fwd ? transformRegion(stored, fwd, W, H) : stored });
  }

  function onDrawDone(region: Region, grid: ToolGrid | null) {
    let store = region;
    if (fixture) {
      const inv = fwd ? invertTransform(fwd) : null;
      if (inv) store = transformRegion(region, inv, W, H);
      else if (!fixture.reference && fixPose) onSetFixtureReference(fixture.id, fixPose);
    }
    if (draw?.which === "regionB") onChange({ ...tool, params: { ...tool.params, regionB: store } });
    else if (linked) {
      onChangeTool({ ...owner, region: store });
      if (meta.grid) onChange({ ...tool, grid });
    }
    else onChange({ ...tool, region: store, ...(meta.grid ? { grid } : {}) });
    setDraw(null);
  }

  // Other tools' regions, drawn faintly behind the one being edited — where they ran last, if known.
  const context: DrawContextRegion[] = useMemo(() => program.tools.filter(t => t.id !== tool.id && t.id !== owner.id && t.enabled).flatMap(t => {
    const r = result?.tools?.find(x => x.id === t.id);
    if (r?.region && r.region.length >= 3) {
      const norm = looksNormalized(r.region);
      return [{ id: t.id, name: t.name, grid: null, geometry: regionToDraw({ shape: "polygon", points: r.region.map(p => norm ? p : { x: p.x / W, y: p.y / H }) }) }];
    }
    const own = regionOwner(t, program.tools).region;
    return own ? [{ id: t.id, name: t.name, grid: null, geometry: regionToDraw(own) }] : [];
  }), [program.tools, result, tool.id, owner.id, W, H]);

  const overlay = useMemo(
    () => buildOverlay(program, isRunning ? result : null, { width: W, height: H, selectedId: tool.id }),
    [program, result, isRunning, tool.id, W, H],
  );

  // ── Pickers ────────────────────────────────────────────────────────────
  const inputName = (id: string) => id === "camera" ? "Camera" : program.layers.find(l => l.id === id)?.name ?? "Missing layer";
  const poseTools = earlier.filter(t => TOOL_META[t.type].makesPose);
  const sources = Array.isArray(tool.params.sources) ? (tool.params.sources as string[]) : [];
  const slots = sourceSlots(tool);

  function setSource(slot: number, id: string | null) {
    const next = [...sources];
    while (next.length < slot) next.push("");
    next[slot] = id ?? "";
    // Trailing empty slots are dropped so an optional second line reads as "not set".
    while (next.length && !next[next.length - 1]) next.pop();
    setParam("sources", next);
  }

  // ── Limits ─────────────────────────────────────────────────────────────
  const limits = tool.limits ?? {};
  const numericKeys = meta.values.filter(k => k.kind === "number");
  const mainKey = mainValueKey(tool);
  function setLimit(key: string, l: ToolLimit | null) {
    const next = { ...limits };
    if (l) next[key] = l; else delete next[key];
    set({ limits: next });
  }

  const gridOn = !!tool.grid && tool.grid.rows * tool.grid.cols > 1;
  const regionB = tool.type === "findCorner" ? (tool.params.regionB as Region | null) ?? null : null;
  const colors_ = Array.isArray(tool.params.colors) ? (tool.params.colors as ColorEntry[]) : [];
  const formats = Array.isArray(tool.params.formats) ? (tool.params.formats as string[]) : [];
  const hasTemplate = !!tool.params.template;

  const feedSection = (
    <View style={{ gap: 10 }}>
      {meta.region !== "none" && (
        <SegmentedControl
          size="sm"
          options={[{ value: "live", label: "Live feed" }, { value: "tool", label: "Tool on its image" }]}
          value={view}
          onChange={setView}
        />
      )}
      {view === "tool" && meta.region !== "none" ? (
        <RefreshingImage
          key={`${program.id}:${tool.id}`}
          url={robotClient.visionToolDebugUrl(program.id, tool.id)}
          aspect={W / H}
          placeholder={program.id ? "Loading…" : "Saving the program…"}
        />
      ) : (
        <VisionFeedViewer
          feedUrl={feedUrl}
          overlay={overlay}
          isWide={isWide}
          aspect={W / H}
          placeholder="No camera feed"
        />
      )}
      <RunVisionButton isRunning={isRunning} transitioning={transitioning} onPress={onToggleRunning} />
      {isRunning && (
        <View style={st.liveCard}>
          <View style={st.liveHead}>
            <Text style={[ves.groupTitle, { flex: 1 }]}>LIVE RESULT</Text>
            <StatusChip result={res} />
          </View>
          {res ? (
            <>
              <Text style={st.liveSummary}>{summarizeResult(res, tool)}</Text>
              <View style={st.valueGrid}>
                {Object.entries(res.values ?? {}).map(([k, val]) => (
                  <View key={k} style={st.valueCell}>
                    <Text style={st.valueKey}>{meta.values.find(x => x.key === k)?.label ?? k}</Text>
                    <Text style={st.valueVal}>
                      {meta.values.find(x => x.key === k)?.kind === "bool" ? (val ? "Yes" : "No") : fmtVisionValue(val)}
                    </Text>
                  </View>
                ))}
                {res.timeMs != null && (
                  <View style={st.valueCell}>
                    <Text style={st.valueKey}>Time</Text>
                    <Text style={st.valueVal}>{fmtVisionValue(res.timeMs)} ms</Text>
                  </View>
                )}
              </View>
              {(res.items?.length ?? 0) > 0 && <Text style={st.liveSub}>{res.items!.length} item{res.items!.length !== 1 ? "s" : ""} found</Text>}
            </>
          ) : (
            <Text style={st.liveSub}>Waiting for a result…</Text>
          )}
        </View>
      )}
    </View>
  );

  const settings = (
    <>
      {!!problem && (
        <View style={st.problem}>
          <AlertTriangle size={14} color={colors.warning} />
          <Text style={st.problemText}>{problem}. Move this tool below the tools it uses.</Text>
        </View>
      )}

      <GroupCard title="DETAILS">
        <View style={ves.groupRow}>
          <ToolTile type={tool.type} size={32} />
          <TextInput
            style={ves.configNameInput}
            value={tool.name}
            onChangeText={name => set({ name })}
            placeholder="Tool name"
            placeholderTextColor={colors.textFaint}
          />
        </View>
        <Text style={ves.paramDesc}>{meta.description}</Text>
        <FormRow label="Enabled" inline style={ves.groupRowBorder}>
          <Switch value={tool.enabled} onValueChange={enabled => set({ enabled })} trackColor={{ true: accents.cyan }} />
        </FormRow>
        <FormRow label="Counts toward overall pass" inline style={ves.groupRowBorder}>
          <Switch value={tool.includeInPass} onValueChange={includeInPass => set({ includeInPass })} trackColor={{ true: accents.cyan }} />
        </FormRow>
        {meta.region !== "none" && (
          <PickerRow label="Image" value={inputName(tool.input)} onPress={() => setSheet("input")} />
        )}
        {meta.region !== "none" && (
          <PickerRow
            label="Follows"
            value={linked ? `${fixture ? fixture.name : "Nothing"} · set on ${owner.name}` : fixture ? fixture.name : "Nothing — fixed in the image"}
            // A shared area follows what its owner follows: change it there, or stop sharing.
            onPress={() => setSheet(linked ? "regionFrom" : "fixture")}
            warn={!linked && tool.fixtureId && !fixture ? "Its fixture no longer exists" : null}
          />
        )}
      </GroupCard>

      {meta.region !== "none" && (
        <GroupCard title={tool.type === "findCorner" ? "REGIONS" : "REGION"}>
          {!!fixtureNote && <Text style={st.note}>{fixtureNote}</Text>}
          {tool.type !== "findCorner" && (
            <PickerRow
              label="Shared"
              value={regionSource ? `Same area as ${regionSource.name}` : "No — its own area"}
              onPress={() => setSheet("regionFrom")}
              border={false}
              warn={tool.regionFrom && !regionSource ? "That tool no longer exists" : null}
              accessibilityLabel="Share an area"
            />
          )}
          <RegionRow
            label={tool.type === "findCorner" ? "Side A" : tool.type === "findLine" ? "Search box" : "Area"}
            value={shapeLabel(owner.region)}
            onPress={() => openDraw("region")}
          />
          {(linked || sharers.length > 0) && (
            <Text style={ves.paramDesc}>
              {linked
                ? `Shared with "${owner.name}" — moving it here moves it there too.`
                : `Shared with ${sharers.map(t => `"${t.name}"`).join(", ")} — they move with it.`}
            </Text>
          )}
          {tool.type === "findCorner" && (
            <RegionRow label="Side B" value={shapeLabel(regionB)} onPress={() => openDraw("regionB")} />
          )}
          {(tool.type === "findLine" || tool.type === "caliper") && (
            <Text style={ves.paramDesc}>The edge runs along the box&apos;s width; probes search across its height.</Text>
          )}
          {meta.grid && (
            <>
              <FormRow label="Grid of cells" inline style={ves.groupRowBorder}>
                <Switch
                  value={gridOn}
                  onValueChange={on => set({ grid: on ? { rows: 2, cols: 2, inset: 0 } : null })}
                  trackColor={{ true: accents.cyan }}
                />
              </FormRow>
              {gridOn && tool.grid && (
                <>
                  <View style={ves.paramRow}>
                    <Text style={ves.paramLabel}>Rows</Text>
                    <NumberStepper value={tool.grid.rows} min={1} max={32} onChange={rows => set({ grid: { ...tool.grid!, rows } })} accessibilityLabel="Grid rows" width={56} />
                  </View>
                  <View style={ves.paramRow}>
                    <Text style={ves.paramLabel}>Columns</Text>
                    <NumberStepper value={tool.grid.cols} min={1} max={32} onChange={cols => set({ grid: { ...tool.grid!, cols } })} accessibilityLabel="Grid columns" width={56} />
                  </View>
                  <View style={ves.paramRow}>
                    <Text style={ves.paramLabel}>Cell inset (%)</Text>
                    <NumberStepper value={Math.round((tool.grid.inset ?? 0) * 100)} min={0} max={45} step={5}
                      onChange={pct => set({ grid: { ...tool.grid!, inset: pct / 100 } })} accessibilityLabel="Cell inset" width={56} />
                  </View>
                  <Text style={ves.paramDesc}>Each cell is judged on its own with the {mainKey ?? "main"} limit below. Inset trims each cell&apos;s edges so neighbours don&apos;t bleed in.</Text>
                </>
              )}
            </>
          )}
        </GroupCard>
      )}

      {(tool.type === "makeFixture" || tool.type === "distance" || tool.type === "angle") && (
        <GroupCard title="SOURCES">
          {tool.type === "makeFixture" && (
            <PickerRow
              label="Build from"
              value={FIXTURE_MODES.find(m => m.value === tool.params.mode)?.label ?? "Choose…"}
              warn={null}
              border={false}
              onPress={() => setSheet("mode")}
            />
          )}
          {tool.type === "makeFixture" && (
            <Text style={ves.paramDesc}>{FIXTURE_MODES.find(m => m.value === tool.params.mode)?.desc}</Text>
          )}
          {tool.type === "distance" && (
            <SegmentedControl
              size="sm"
              options={DISTANCE_MODES.map(m => ({ value: m.value, label: m.label }))}
              value={String(tool.params.mode ?? "pointPoint")}
              onChange={mode => onChange({ ...tool, params: { ...tool.params, mode, sources: [] } })}
            />
          )}
          {slots.map((slot, i) => {
            const id = sources[i];
            const src = id ? program.tools.find(t => t.id === id) : null;
            return (
              <PickerRow
                key={i}
                label={slot.label}
                value={src ? src.name : "Choose a tool…"}
                onPress={() => setSheet({ slot: i })}
                warn={id && !src ? "That tool no longer exists" : null}
                border={i > 0 || tool.type !== "angle"}
              />
            );
          })}
          <Text style={ves.paramDesc}>Only tools above this one can be used.</Text>
        </GroupCard>
      )}

      {meta.fields.length > 0 && (
        <GroupCard title="SETTINGS">
          <ParamFields fields={meta.fields} values={tool.params} onChange={setParam} />
        </GroupCard>
      )}

      {tool.type === "pixelCount" && tool.params.mode === "color" && (
        <GroupCard title="COLOURS TO COUNT">
          {colors_.length === 0 && <Text style={ves.emptyText}>No colours yet — add at least one</Text>}
          {colors_.map((ce, i) => (
            <TouchableOpacity key={ce.id ?? i} style={ves.colorEntryRow} onPress={() => setColorEdit(ce)} activeOpacity={0.75}>
              <View style={[st.swatch, { backgroundColor: `rgb(${ce.r},${ce.g},${ce.b})` }]} />
              <Text style={{ flex: 1, fontSize: 12, color: colors.textSecondary }}>rgb({ce.r}, {ce.g}, {ce.b})</Text>
              <Text style={st.tol}>±{ce.tolerance}</Text>
              <DeleteIconButton size={13} style={ves.iconBtn} onPress={() => setParam("colors", colors_.filter(c => c !== ce))} />
            </TouchableOpacity>
          ))}
          <Button label="Add colour" variant="dashed" size="sm" icon={<Plus size={14} color={colors.accent} />} onPress={() => setColorEdit(defaultColorEntry())} />
        </GroupCard>
      )}

      {tool.type === "barcode" && (
        <GroupCard title="FORMATS">
          <PickerRow
            label="Read"
            value={formats.length === 0 ? "All formats" : `${formats.length} format${formats.length !== 1 ? "s" : ""}`}
            onPress={() => setFormatsOpen(true)}
            border={false}
          />
        </GroupCard>
      )}

      {(tool.type === "contourMatch" || tool.type === "patternMatch") && (
        <GroupCard title="TEMPLATE" right={<StatusPillLite ok={hasTemplate} okText="Taught" noText="Not taught" />}>
          <Text style={ves.paramDesc}>
            {tool.type === "contourMatch"
              ? "Place a good part inside the area and teach — its outline becomes what the tool looks for."
              : "Place a good part inside the area and teach — the image patch becomes what the tool looks for."}
          </Text>
          <Button label={hasTemplate ? "Teach again from this image" : "Teach from this image"} variant="secondary" size="sm"
            icon={<Sparkles size={14} color={colors.textSecondary} />} onPress={onTeach} />
        </GroupCard>
      )}

      {meta.makesPose && (
        <GroupCard title="REFERENCE POSITION" right={<StatusPillLite ok={!!tool.reference} okText="Set" noText="Not set" />}>
          <Text style={ves.paramDesc}>
            Where this tool found the part when you taught it. Tools that follow it keep their regions relative to it,
            so they move with the part. Set automatically on the first good run when empty.
          </Text>
          {tool.reference && (
            <Text style={st.mono}>
              x {fmtVisionValue(tool.reference.x)} · y {fmtVisionValue(tool.reference.y)} · {fmtVisionValue(tool.reference.angle)}°
              {tool.reference.quad ? " · 4 corners" : ""}
            </Text>
          )}
          <Button label="Set reference to where it is now" variant="secondary" size="sm"
            icon={<Crosshair size={14} color={colors.textSecondary} />} onPress={onSetReference} />
        </GroupCard>
      )}

      {numericKeys.length > 0 && (
        <GroupCard
          title="LIMITS"
          right={numericKeys.some(k => !limits[k.key]) ? (
            <TouchableOpacity onPress={() => setSheet("addLimit")} hitSlop={8} style={st.addLimit} accessibilityLabel="Add limit">
              <Plus size={13} color={colors.accent} />
              <Text style={st.addLimitText}>Add</Text>
            </TouchableOpacity>
          ) : undefined}
        >
          {Object.keys(limits).length === 0 && (
            <Text style={ves.paramDesc}>No limits — the tool passes whenever it runs successfully. Add one to judge a value.</Text>
          )}
          {Object.entries(limits).map(([key, l]) => (
            <LimitRow
              key={key}
              label={meta.values.find(k => k.key === key)?.label ?? key}
              isMain={gridOn && key === mainKey}
              live={res?.values?.[key]}
              limit={l}
              onChange={next => setLimit(key, next)}
              onRemove={() => setLimit(key, null)}
            />
          ))}
        </GroupCard>
      )}

      <View style={{ height: 40 }} />
    </>
  );

  // ── Sheets ─────────────────────────────────────────────────────────────
  const slotIndex = typeof sheet === "object" && sheet ? sheet.slot : -1;
  const slotNeed = slotIndex >= 0 ? slots[slotIndex]?.need : undefined;

  return (
    <View style={ves.configRoot}>
      <PageHeader
        title={tool.name || meta.label}
        subtitle={meta.label}
        crumbs={[{ label: "Vision Editor" }, { label: tool.name || meta.label }]}
        onBack={onClose}
        right={
          <TouchableOpacity onPress={onClose} style={ves.configDoneBtn}>
            <Check size={15} color={colors.onAccent} />
            <Text style={ves.configDoneBtnText}>Done</Text>
          </TouchableOpacity>
        }
      />
      <View style={isWide ? st.wideRow : { flex: 1 }}>
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={[{ padding: spacing.lg, gap: spacing.sm }, isWide && st.rightPaneContent]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {!isWide && feedSection}
          {settings}
        </ScrollView>
        {isWide && (
          <ScrollView style={[st.feedPane, isSplit && wide.paneSplit]} contentContainerStyle={st.feedPaneContent} showsVerticalScrollIndicator={false}>
            {feedSection}
          </ScrollView>
        )}
      </View>

      <ChoiceSheet
        visible={sheet === "input"}
        title="Image"
        hint="The camera image, or a filtered layer from Image Layers."
        rows={[{ id: "camera", title: "Camera", subtitle: "The raw camera frame" },
          ...program.layers.map(l => ({ id: l.id, title: l.name, subtitle: `${l.filters.filter(f => f.enabled).length} filter${l.filters.filter(f => f.enabled).length !== 1 ? "s" : ""}` }))]}
        selected={tool.input}
        onSelect={id => set({ input: id ?? "camera" })}
        onClose={() => setSheet(null)}
      />
      <ChoiceSheet
        visible={sheet === "fixture"}
        title="Follows (fixture)"
        hint="The region moves with the chosen tool's found position. If that tool finds nothing, this one is not run. Only locating tools above this one are listed."
        noneLabel="Nothing — fixed in the image"
        rows={poseTools.map(t => ({ id: t.id, title: t.name, subtitle: `${TOOL_META[t.type].label}${t.reference ? "" : " · no reference yet"}${t.enabled ? "" : " · disabled"}` }))}
        selected={tool.fixtureId}
        onSelect={id => set({ fixtureId: id })}
        onClose={() => setSheet(null)}
      />
      <ChoiceSheet
        visible={sheet === "regionFrom"}
        title="Share an area"
        hint="Use another tool's area (and what it follows) instead of drawing one here: draw it once, and every tool that shares it moves with it. This tool keeps its own grid. Only tools above this one are listed."
        noneLabel="No — its own area"
        rows={regionSources(tool, program.tools).map(t => ({ id: t.id, title: t.name, subtitle: `${TOOL_META[t.type].label} · ${shapeLabel(regionOwner(t, program.tools).region)}` }))}
        selected={tool.regionFrom ?? null}
        onSelect={id => {
          if (id) set({ regionFrom: id, fixtureId: null });
          // Unsharing keeps the area where it is now, as this tool's own (and what it followed).
          else set({ regionFrom: null, region: owner.region ?? tool.region ?? null, fixtureId: owner.fixtureId });
        }}
        onClose={() => setSheet(null)}
      />
      <ChoiceSheet
        visible={slotIndex >= 0}
        title={slots[slotIndex]?.label ?? "Source"}
        hint={slotNeed === "line" ? "A tool that finds a line." : slotNeed === "pose" ? "A locating tool." : "A tool that finds a point or position."}
        noneLabel={tool.type === "angle" && slotIndex === 1 ? "None — angle against the image x-axis" : undefined}
        rows={earlier.filter(t => slotNeed && canFeed(t.type, slotNeed)).map(t => ({ id: t.id, title: t.name, subtitle: TOOL_META[t.type].label }))}
        selected={sources[slotIndex] || null}
        onSelect={id => setSource(slotIndex, id)}
        onClose={() => setSheet(null)}
      />
      <ChoiceSheet
        visible={sheet === "mode"}
        title="Build the fixture from"
        rows={FIXTURE_MODES.map(m => ({ id: m.value, title: m.label, subtitle: m.desc }))}
        selected={String(tool.params.mode ?? "twoPoints")}
        onSelect={mode => { if (mode && mode !== tool.params.mode) onChange({ ...tool, params: { ...tool.params, mode, sources: [] } }); }}
        onClose={() => setSheet(null)}
      />
      <ChoiceSheet
        visible={sheet === "addLimit"}
        title="Add limit"
        rows={numericKeys.filter(k => !limits[k.key]).map(k => ({ id: k.key, title: k.label, subtitle: k.key === mainKey && gridOn ? "Judges each cell" : undefined }))}
        selected={null}
        onSelect={key => { if (key) setLimit(key, { min: null, max: null }); }}
        onClose={() => setSheet(null)}
      />
      <FormatPickerSheet
        visible={formatsOpen}
        selected={formats}
        onToggle={id => setParam("formats", formats.includes(id) ? formats.filter(f => f !== id) : [...formats, id])}
        onClose={() => setFormatsOpen(false)}
      />
      <ColorEditModal
        visible={colorEdit !== null}
        entry={colorEdit}
        onSave={entry => {
          const i = colors_.findIndex(c => c.id === entry.id);
          setParam("colors", i >= 0 ? colors_.map((c, j) => (j === i ? entry : c)) : [...colors_, entry]);
        }}
        onClose={() => setColorEdit(null)}
        snapshotUri={snapshotUri}
        onFetchSnapshot={async () => { await onFetchSnapshot(); }}
      />
      <RegionDrawModal
        visible={draw !== null}
        title={tool.type === "findCorner" ? (draw?.which === "regionB" ? "Side B" : "Side A") : undefined}
        snapshotUri={snapshotUri}
        context={context}
        initialRegion={draw?.initial ?? null}
        initialGrid={draw?.which === "region" ? tool.grid ?? null : null}
        shapes={meta.region === "none" ? "any" : meta.region}
        allowGrid={meta.grid && draw?.which === "region"}
        onDone={onDrawDone}
        onCancel={() => setDraw(null)}
      />
    </View>
  );
}

function RegionRow({ label, value, onPress }: { label: string; value: string; onPress: () => void }) {
  return (
    <View style={ves.groupRow}>
      <Text style={st.regionLabel}>{label}</Text>
      <Text style={{ flex: 1, fontSize: 14, color: colors.text }} numberOfLines={1}>{value}</Text>
      <Button label="Draw" size="sm" variant="secondary" icon={<Pencil size={13} color={colors.textSecondary} />} onPress={onPress} />
    </View>
  );
}

function StatusPillLite({ ok, okText, noText }: { ok: boolean; okText: string; noText: string }) {
  return (
    <View style={[st.pill, { backgroundColor: ok ? colors.successSoft : colors.surfaceMuted }]}>
      {ok ? <Check size={11} color={colors.success} strokeWidth={3} /> : <X size={11} color={colors.textMuted} strokeWidth={3} />}
      <Text style={[st.pillText, { color: ok ? colors.success : colors.textMuted }]}>{ok ? okText : noText}</Text>
    </View>
  );
}

function LimitRow({ label, isMain, live, limit, onChange, onRemove }: {
  label: string; isMain: boolean; live: number | string | undefined; limit: ToolLimit;
  onChange: (l: ToolLimit) => void; onRemove: () => void;
}) {
  // The typed text is held only while a field is being edited; otherwise it shows the limit.
  const [minEdit, setMinEdit] = useState<string | null>(null);
  const [maxEdit, setMaxEdit] = useState<string | null>(null);
  const minText = minEdit ?? (limit.min == null ? "" : String(limit.min));
  const maxText = maxEdit ?? (limit.max == null ? "" : String(limit.max));
  const parse = (t: string) => { const n = parseFloat(t); return t.trim() === "" || isNaN(n) ? null : n; };
  const liveNum = typeof live === "number" ? live : undefined;
  const inBand = liveNum === undefined ? null
    : (limit.min == null || liveNum >= limit.min) && (limit.max == null || liveNum <= limit.max);
  return (
    <View style={[ves.groupRowBorder, { gap: 6 }]}>
      <View style={ves.groupRow}>
        <Text style={[ves.paramLabel, { fontWeight: "600" }]}>{label}{isMain ? "  · each cell" : ""}</Text>
        {liveNum !== undefined && (
          <Text style={[st.liveVal, { color: inBand ? colors.success : colors.danger }]}>now {fmtVisionValue(liveNum)}</Text>
        )}
        <DeleteIconButton size={13} style={ves.iconBtn} onPress={onRemove} />
      </View>
      <View style={ves.groupRow}>
        <Text style={st.bound}>Min</Text>
        <TextInput
          style={[ves.paramInput, { flex: 1, width: undefined }]}
          keyboardType="numeric"
          value={minText}
          placeholder={`${label} min (none)`}
          placeholderTextColor={colors.textFaint}
          onFocus={() => setMinEdit(minText)}
          onBlur={() => setMinEdit(null)}
          onChangeText={t => { setMinEdit(t); onChange({ ...limit, min: parse(t) }); }}
        />
        <Text style={st.bound}>Max</Text>
        <TextInput
          style={[ves.paramInput, { flex: 1, width: undefined }]}
          keyboardType="numeric"
          value={maxText}
          placeholder={`${label} max (none)`}
          placeholderTextColor={colors.textFaint}
          onFocus={() => setMaxEdit(maxText)}
          onBlur={() => setMaxEdit(null)}
          onChangeText={t => { setMaxEdit(t); onChange({ ...limit, max: parse(t) }); }}
        />
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  wideRow: { flex: 1, flexDirection: "row", width: "100%" },
  feedPane: {
    width: "46%", minWidth: 420, maxWidth: 820, flexGrow: 0, flexShrink: 0,
    borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: colors.border,
  },
  feedPaneContent: { paddingHorizontal: 20, paddingTop: 18, paddingBottom: spacing.xl },
  rightPaneContent: { width: "100%", maxWidth: 720, alignSelf: "center" },
  problem: {
    flexDirection: "row", alignItems: "center", gap: spacing.sm, padding: spacing.md,
    backgroundColor: colors.warningSoft, borderRadius: radii.md, borderWidth: 1, borderColor: colors.warningBorder,
  },
  problemText: { flex: 1, fontSize: 13, color: colors.textSecondary },
  note: { fontSize: 12, color: colors.textMuted, backgroundColor: colors.surfaceMuted, borderRadius: radii.sm, padding: spacing.sm },
  regionLabel: { fontSize: 12, fontWeight: "600", color: colors.textMuted, width: 76 },
  swatch: { width: 28, height: 28, borderRadius: 6, borderWidth: 1, borderColor: colors.borderStrong },
  tol: { fontSize: 11, fontWeight: "700", color: accents.cyan },
  mono: { fontSize: 12, color: colors.textSecondary, fontVariant: ["tabular-nums"] },
  addLimit: { flexDirection: "row", alignItems: "center", gap: 3 },
  addLimitText: { fontSize: 12, fontWeight: "700", color: colors.accent },
  bound: { fontSize: 12, color: colors.textMuted },
  liveVal: { fontSize: 12, fontWeight: "700" },
  liveCard: { backgroundColor: colors.surface, borderRadius: radii.md, padding: spacing.md, gap: spacing.sm },
  liveHead: { flexDirection: "row", alignItems: "center" },
  liveSummary: { fontSize: 13, color: colors.textSecondary },
  liveSub: { fontSize: 12, color: colors.textMuted },
  valueGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  valueCell: { minWidth: 88, backgroundColor: colors.surfaceMuted, borderRadius: radii.sm, paddingHorizontal: spacing.sm, paddingVertical: 6 },
  valueKey: { fontSize: 10, fontWeight: "700", color: colors.textFaint, textTransform: "uppercase" },
  valueVal: { fontSize: 14, fontWeight: "700", color: colors.text, fontVariant: ["tabular-nums"] },
  pill: { flexDirection: "row", alignItems: "center", gap: 3, borderRadius: radii.pill, paddingHorizontal: 7, paddingVertical: 2 },
  pillText: { fontSize: 11, fontWeight: "700" },
});
