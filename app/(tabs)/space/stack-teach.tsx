import { router, useLocalSearchParams } from "expo-router";
import { Crosshair, Save } from "lucide-react-native";
import React, { useMemo, useState } from "react";
import { Text, View } from "react-native";

import { appAlert } from "@/src/components/ui/AppAlert";
import JogPad from "@/src/components/ui/JogPad";
import {
  Button, buttonTextColor, Card, Chip, ChipGroup, colors, FormRow, Input, PageHeader, PositionReadout, RadioRow, Screen,
} from "@/src/components/ui/kit";
import { NotConnectedOverlay } from "@/src/components/ui/NotConnectedOverlay";
import { usePaneLayout } from "@/src/components/ui/responsive";
import { cs } from "@/src/components/ui/calibration/calibrationStyles";
import { Notice } from "@/src/components/ui/calibration/Notice";
import { Attention, Requirement, StepFooter } from "@/src/components/ui/calibration/StepRequirements";
import { useJogSpeeds } from "@/src/components/ui/calibration/useJogSpeeds";
import { WizardStepper } from "@/src/components/ui/calibration/WizardStepper";
import { RobotStack } from "@/src/models/robotModels";
import { usePoints, useRobotStatus, useStacks, useTools } from "@/src/providers/RobotProvider";
import { robotClient } from "@/src/services/RobotConnectService";

type Pose = { x: number; y: number; z: number; rx: number; ry: number; rz: number };
type Method = "next" | "last";
type ItemKey = "first" | "second";

const METHODS: { value: Method; title: string; subtitle: string }[] = [
  { value: "next", title: "First item and the next one",
    subtitle: "Quickest. Teach two neighbouring items; the gap between them is the step." },
  { value: "last", title: "First item and the last one",
    subtitle: "Most accurate over a long stack: teaching error is spread across every step." },
];

// Fine steps for landing on an item, Slow/Normal for getting there (as the grid wizard).
const SPEEDS = ["0.1mm", "1mm", "10mm", "Slow", "Normal"];

const fmt = (n: number, d = 2) => (Number.isFinite(n) ? n.toFixed(d) : "—");
const q = (v: number) => Math.round(v * 1e4) / 1e4;   // 0.1 µm: keeps the saved numbers readable

/**
 * Stack teaching wizard: Setup → teach the first item → teach a second item → Review & save.
 * The first item becomes the base point ("<name> base"); the step offset is the difference to
 * the second item divided by how many steps apart they are (1 for the next item, count − 1 for
 * the last). The robot is never moved by the wizard — each step just reads its current position.
 * Route param `id`: re-teach that existing stack (keeps its id, so Move steps that use it follow).
 * Route param `name`: pre-fills the name of a new stack (from the New Stack page).
 */
export default function StackTeachScreen() {
  const { id, name } = useLocalSearchParams<{ id?: string; name?: string }>();
  const stacks = useStacks();
  const existing = id ? stacks.find(s => s.id === id) ?? null : null;
  // Keyed on the stack so its name/count seed the form even when the stack list arrives late.
  return <StackTeachWizard key={existing?.id ?? "new"} existing={existing} initialName={name} />;
}

function StackTeachWizard({ existing, initialName }: { existing: RobotStack | null; initialName?: string }) {
  const stacks = useStacks();
  const points = usePoints();
  const tools  = useTools();
  const status = useRobotStatus();

  const [step, setStep]     = useState(0);
  const [name, setName]     = useState(existing?.name ?? initialName ?? "");
  const [method, setMethod] = useState<Method>("next");
  const [count, setCount]   = useState(existing?.maxCount != null ? String(existing.maxCount) : "");
  const [taught, setTaught] = useState<Partial<Record<ItemKey, Pose>>>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved]   = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const STEPS = ["Setup", "First item", method === "next" ? "Next item" : "Last item", "Review"];
  const trimmed = name.trim();
  const nameTaken = stacks.some(s => s.name.trim().toLowerCase() === trimmed.toLowerCase() && s.id !== existing?.id);
  const baseName = `${trimmed} base`;
  const overwritesPoint = points.some(p => p.name === baseName) && existing?.basePointName !== baseName;

  const n = count === "" ? undefined : Number(count);
  const countProblem =
    method === "last"
      ? (n == null || !Number.isInteger(n) || n < 2 ? "Enter how many items (at least 2)" : null)
      : (n != null && (!Number.isInteger(n) || n < 1) ? "Item count must be 1 or more, or blank" : null);
  const stepsApart = method === "next" ? 1 : (n ?? 2) - 1;

  // Step offset per index and the derived numbers shown on Review.
  const fit = useMemo(() => {
    const a = taught.first, b = taught.second;
    if (!a || !b) return null;
    const off = { x: (b.x - a.x) / stepsApart, y: (b.y - a.y) / stepsApart, z: (b.z - a.z) / stepsApart };
    const pitch = Math.hypot(off.x, off.y, off.z);
    return { off, pitch, span: pitch * stepsApart };
  }, [taught, stepsApart]);

  const setupOk = trimmed.length > 0 && !nameTaken && !countProblem;
  let reachable = 0;
  if (setupOk) {
    reachable = 1;
    if (taught.first) reachable = 2;
    if (taught.first && taught.second) reachable = 3;
  }
  const goto = (k: number) => setStep(Math.min(Math.max(k, 0), reachable));

  // The second item means a different item once the method or count changes — re-teach it.
  const changeMethod = (m: Method) => { setMethod(m); setTaught(t => (t.first ? { first: t.first } : {})); setSaved(false); };
  const changeCount = (v: string) => {
    setCount(v.replace(/[^0-9]/g, ""));
    if (method === "last") setTaught(t => (t.first ? { first: t.first } : {}));
    setSaved(false);
  };
  const teach = (k: ItemKey) => {
    setTaught(t => ({ ...t, [k]: { x: status.x, y: status.y, z: status.z, rx: status.rx, ry: status.ry, rz: status.rz } }));
    setSaved(false);
  };

  const save = async () => {
    if (!fit || !taught.first) return;
    setSaving(true);
    setSaveError(null);
    try {
      // The base point is the first item, with its orientation. TeachPoint creates it (or keeps its
      // id when re-teaching), then EditPoint writes the exact taught coordinates.
      const A = taught.first;
      if (!points.some(p => p.name === baseName)) await robotClient.sendCommand("TeachPoint", { name: baseName });
      await robotClient.editPoint(baseName, { x: q(A.x), y: q(A.y), z: q(A.z), rx: A.rx, ry: A.ry, rz: A.rz });
      await robotClient.saveStack({
        id: existing?.id ?? "",
        name: trimmed,
        basePointName: baseName,
        offsetX: q(fit.off.x), offsetY: q(fit.off.y), offsetZ: q(fit.off.z),
        maxCount: n,
        lastUpdatedUnixMs: 0,
      });
      setSaved(true);
    } catch (e: any) {
      setSaveError(e?.message ?? String(e));
    } finally {
      setSaving(false);
    }
  };

  const leave = (navigate: () => void) => {
    const unsaved = !saved && Object.keys(taught).length > 0;
    if (!unsaved) { navigate(); return; }
    appAlert("Leave stack teaching?", "The taught items will be discarded and nothing is saved.", [
      { text: "Stay", style: "cancel" },
      { text: "Leave", style: "destructive", onPress: navigate },
    ]);
  };
  const done = () => (router.canGoBack() ? router.back() : router.replace("/space/stacks"));
  const exit = () => leave(done);

  const tool = status.activeTool || "None";
  let body: React.ReactNode;

  if (step === 0) {
    const requirements: Requirement[] = [
      { key: "name", label: "Name the stack", met: trimmed.length > 0 },
      { key: "unique", label: "Name not used by another stack", met: !nameTaken,
        hint: "Pick another name, or open that stack and re-teach it from there." },
      { key: "count", label: countProblem ?? (n != null ? `${n} items` : "No item limit"), met: !countProblem },
      { key: "tool", label: "A tool is active", met: tool !== "None", optional: true,
        hint: "Without a tool the flange is taught, not the tip that works the stack." },
    ];
    body = (
      <View style={cs.step}>
        <Card style={cs.cardGap}>
          <FormRow label="Stack name" hint={`Its base point is saved as "${trimmed || "<name>"} base".`}>
            <Input value={name} onChangeText={v => { setName(v); setSaved(false); }} placeholder="e.g. Tray Stack" autoCapitalize="words" returnKeyType="next" />
          </FormRow>
        </Card>

        <Card style={cs.cardGap}>
          <Text style={cs.label}>How to teach it</Text>
          {METHODS.map(m => (
            <RadioRow key={m.value} title={m.title} subtitle={m.subtitle} selected={method === m.value} onPress={() => changeMethod(m.value)} />
          ))}
          <FormRow
            label={method === "last" ? "Number of items" : "Number of items (optional)"}
            hint={method === "last"
              ? "Counting the first and last. Also saved as the stack's max count, so indices wrap round."
              : "Saved as the stack's max count, so indices wrap round. Leave blank for no limit."}
          >
            <Input value={count} onChangeText={changeCount} placeholder={method === "last" ? "e.g. 10" : "unlimited"} keyboardType="number-pad" returnKeyType="done" />
          </FormRow>
          <Text style={cs.caption}>
            You’ll jog to each item, at the height the tool works it, and press Teach.
          </Text>
        </Card>

        <Attention show={tool === "None"} tag="Recommended">
          <Card style={cs.cardGap}>
            <Text style={cs.label}>Active tool</Text>
            <ChipGroup>
              {["None", ...tools.map(t => t.name)].map(t => (
                <Chip key={t} label={t} selected={tool === t} onPress={() => { robotClient.setActiveTool(t); }} />
              ))}
            </ChipGroup>
            {tool === "None" && (
              <Notice tone="warning" title="No tool selected">
                The flange position will be taught, not the tool tip. Pick the tool that works this stack.
              </Notice>
            )}
          </Card>
        </Attention>

        <StepFooter requirements={requirements} nextLabel="Next: Teach the first item" onNext={() => goto(1)} />
      </View>
    );
  } else if (step <= 2) {
    const key: ItemKey = step === 1 ? "first" : "second";
    const title = step === 1
      ? "First item (index 0)"
      : method === "next" ? "Next item (index 1)" : `Last item (index ${stepsApart})`;
    body = (
      <TeachItemStep
        key={key}
        index={step - 1}
        title={title}
        pose={taught[key]}
        onTeach={() => teach(key)}
        onBack={() => goto(step - 1)}
        onNext={() => goto(step + 1)}
        nextLabel={step === 1 ? `Next: ${STEPS[2]}` : "Next: Review"}
      />
    );
  } else if (saved) {
    body = (
      <View style={cs.step}>
        <Notice tone="info" title={`Saved "${trimmed}"`}>
          Base point “{baseName}”, step {fmt(fit?.pitch ?? NaN)} mm{n != null ? `, ${n} items` : ""}. Pick it in a Move step’s Stack target, by index.
        </Notice>
        <Button label="Done" onPress={done} />
      </View>
    );
  } else {
    const requirements: Requirement[] = [
      { key: "pitch", label: fit && fit.pitch >= 0.1 ? `Items ${fmt(fit.pitch)} mm apart` : "The two items are at different positions",
        met: !!fit && fit.pitch >= 0.1,
        hint: "Both items were taught at the same spot — go back and re-teach the second one." },
    ];
    body = (
      <View style={cs.step}>
        {fit && (
          <Card style={cs.cardGap}>
            <Text style={cs.label}>Step per index</Text>
            <Stat label="X" value={`${fmt(fit.off.x)} mm`} />
            <Stat label="Y" value={`${fmt(fit.off.y)} mm`} />
            <Stat label="Z" value={`${fmt(fit.off.z)} mm`} />
            <Stat label="Distance between items" value={`${fmt(fit.pitch)} mm`} />
            {method === "last" && <Stat label="First to last item" value={`${fmt(fit.span)} mm`} />}
            <Stat label="Item count" value={n != null ? String(n) : "No limit"} />
            <Text style={cs.caption}>
              Saved as base point “{baseName}” (index 0) plus one step in robot X/Y/Z, so a Move to index i
              lands at base + i·step.
            </Text>
          </Card>
        )}
        {overwritesPoint && (
          <Notice tone="warning" title={`Replaces the point "${baseName}"`}>
            A point with that name already exists; saving moves it to this stack’s first item.
          </Notice>
        )}
        {saveError && <Notice tone="danger" title="Couldn’t save">{saveError}</Notice>}
        <StepFooter
          requirements={requirements}
          nextLabel={saving ? "Saving…" : "Save stack"}
          nextIcon={<Save size={16} color={buttonTextColor("primary")} />}
          busy={saving}
          onBack={() => goto(2)}
          onNext={save}
        />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <NotConnectedOverlay />
      <PageHeader
        title={existing ? `Teach ${existing.name}` : "Teach a stack"}
        subtitle="Jog to its items; the step between them is worked out"
        crumbs={[
          { label: "Space", href: "/space" },
          { label: "Stacks", href: "/space/stacks" },
          { label: "Teach" },
        ]}
        onBack={exit}
        onNavigate={href => leave(() => router.navigate(href as never))}
      />
      <Screen>
        <WizardStepper steps={STEPS} current={step} reachable={reachable} onStep={goto} />
        {body}
      </Screen>
    </View>
  );
}

// ── Teach one item ────────────────────────────────────────────────────────────

function TeachItemStep({
  index, title, pose, onTeach, onBack, onNext, nextLabel,
}: {
  index: number; title: string; pose?: Pose;
  onTeach: () => void; onBack: () => void; onNext: () => void; nextLabel: string;
}) {
  const isWide = usePaneLayout() === "desktop";
  const status = useRobotStatus();
  const jogSpeeds = useJogSpeeds();
  const [speed, setSpeed] = useState("1mm");
  const tool = status.activeTool || "None";

  const requirements: Requirement[] = [
    { key: "taught", label: `Teach the ${index === 0 ? "first" : "second"} item`, met: !!pose,
      hint: "Jog the tool tip onto the item, then press Teach." },
  ];

  return (
    <View style={cs.step}>
      <View style={[cs.panes, isWide && cs.panesWide]}>
        <View style={[cs.pane, isWide && cs.paneWide]}>
          <Card style={cs.cardGap}>
            <Text style={cs.label}>Item {index + 1} of 2</Text>
            <Text style={cs.strong}>{title}</Text>
            <Attention show={!pose} tag="Jog there, then Teach">
              <View style={cs.buttons}>
                <Button
                  label={pose ? "Re-teach" : "Teach"}
                  icon={<Crosshair size={16} color={buttonTextColor("primary")} />}
                  onPress={onTeach}
                  style={cs.grow}
                />
              </View>
            </Attention>
            {pose && (
              <Text style={[cs.mono, { textAlign: "center" }]}>
                Taught  X {fmt(pose.x)}  Y {fmt(pose.y)}  Z {fmt(pose.z)}
              </Text>
            )}
          </Card>
        </View>
        <View style={[cs.pane, isWide && cs.paneWide]}>
          <Card style={cs.cardGap}>
            <View style={cs.rowBetween}>
              <Text style={cs.label}>Tool</Text>
              <Text style={cs.strong}>{tool}</Text>
            </View>
            <PositionReadout
              card={false}
              axes={[
                { label: "X", value: status.x, unit: "mm" },
                { label: "Y", value: status.y, unit: "mm" },
                { label: "Z", value: status.z, unit: "mm" },
              ]}
            />
          </Card>
          <Card style={[cs.cardGap, { alignItems: "center" }]}>
            <ChipGroup>
              {SPEEDS.map(s => <Chip key={s} label={s} selected={speed === s} onPress={() => setSpeed(s)} />)}
            </ChipGroup>
            <JogPad jogMode="XYZ" selectedSpeed={speed} speedOverrides={jogSpeeds} />
            <Text style={cs.caption}>Steps move once per tap; Slow/Normal jog while held.</Text>
          </Card>
        </View>
      </View>
      <StepFooter requirements={requirements} nextLabel={nextLabel} onBack={onBack} onNext={onNext} />
    </View>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={cs.rowBetween}>
      <Text style={cs.body}>{label}</Text>
      <Text style={cs.mono}>{value}</Text>
    </View>
  );
}
