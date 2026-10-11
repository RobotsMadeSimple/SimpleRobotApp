import { router, Stack, useFocusEffect } from "expo-router";
import { Check, Minus, Plus } from "lucide-react-native";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppState, AppStateStatus, StyleSheet, Text, View } from "react-native";

import { appAlert } from "@/src/components/ui/AppAlert";
import { JogButton } from "@/src/components/ui/JogButton";
import { Notice } from "@/src/components/ui/calibration/Notice";
import { WizardStepper } from "@/src/components/ui/calibration/WizardStepper";
import {
  Button,
  buttonTextColor,
  Card,
  colors,
  Divider,
  PageHeader,
  Screen,
  spacing,
  type,
} from "@/src/components/ui/kit";
import { NotConnectedOverlay } from "@/src/components/ui/NotConnectedOverlay";
import { useRobotStatus } from "@/src/providers/RobotProvider";
import { robotClient } from "@/src/services/RobotConnectService";

// Jog keep-alive cadence — same contract as JogPad's heartbeat (replicated here so
// this screen doesn't pull in the full jog panels). The controller runs a continuous
// velocity profile with a ~1s watchdog, so each jogJ is a heartbeat, not a discrete move.
const HEARTBEAT_MS = 150;
// A deliberately gentle jog speed (mm/s or °/s) — soft limits are OFF during the wizard.
const JOG_SPEED = 20;

type JogAxis = "x" | "y" | "z" | "rz";

type JointDef = {
  /** Short label for the stepper + jog buttons. */
  short: string;
  /** Full title shown on the step and review. */
  title: string;
  unit: string;
  /** Which jogJ vector component this joint drives. */
  axis: JogAxis;
  /** RobotStatus field whose live value is captured as min/max. */
  captureField: string;
  /** setRobotConfig keys this joint's captured bounds save to. */
  minKey: "joint1Min" | "joint2Min" | "joint3Min" | "joint4Min";
  maxKey: "joint1Max" | "joint2Max" | "joint3Max" | "joint4Max";
};

const ASTRO_JOINTS: JointDef[] = [
  { short: "J1", title: "J1 — Base Rotation", unit: "°",  axis: "x",  captureField: "joint1Angle", minKey: "joint1Min", maxKey: "joint1Max" },
  { short: "J2", title: "J2 — Radial Reach",  unit: "mm", axis: "z",  captureField: "joint2X",     minKey: "joint2Min", maxKey: "joint2Max" },
  { short: "J3", title: "J3 — Vertical",      unit: "mm", axis: "y",  captureField: "joint2Z",     minKey: "joint3Min", maxKey: "joint3Max" },
  { short: "J4", title: "J4 — EOAT Rotation", unit: "°",  axis: "rz", captureField: "joint4Angle", minKey: "joint4Min", maxKey: "joint4Max" },
];

const CNC_JOINTS: JointDef[] = [
  { short: "X",  title: "X — Linear",  unit: "mm", axis: "x",  captureField: "x",  minKey: "joint1Min", maxKey: "joint1Max" },
  { short: "Y",  title: "Y — Linear",  unit: "mm", axis: "y",  captureField: "y",  minKey: "joint2Min", maxKey: "joint2Max" },
  { short: "Z",  title: "Z — Linear",  unit: "mm", axis: "z",  captureField: "z",  minKey: "joint3Min", maxKey: "joint3Max" },
  { short: "RZ", title: "RZ — Rotary", unit: "°",  axis: "rz", captureField: "rz", minKey: "joint4Min", maxKey: "joint4Max" },
];

type Bound = { min: number | null; max: number | null };
const EMPTY: Bound[] = [
  { min: null, max: null },
  { min: null, max: null },
  { min: null, max: null },
  { min: null, max: null },
];

function fmt(v: number | null, unit: string) {
  return v == null ? "—" : `${Math.round(v * 10) / 10} ${unit}`;
}

/**
 * Joint Limits Wizard (app-only). Guides the user through jogging each joint to its
 * mechanical ends and capturing them, then saves all four soft-limit pairs at once.
 *
 * Soft-limit enforcement is disabled on entry so the true limits are reachable, and
 * ALWAYS re-enabled on leave/unmount — so the robot is never left with limits off.
 * Mirrors the camera-calibration wizard (STEPS + reachable gate + leave guard).
 */
export default function JointLimitsScreen() {
  const status = useRobotStatus();
  const JOINTS = useMemo(
    () => (status.robotType === "CNC4Axis" ? CNC_JOINTS : ASTRO_JOINTS),
    [status.robotType],
  );

  const STEPS = useMemo(() => [...JOINTS.map(j => j.short), "Review"] as const, [JOINTS]);
  const REVIEW = JOINTS.length; // review step index

  const [step, setStep] = useState(0);
  const [captures, setCaptures] = useState<Bound[]>(EMPTY);
  const [saving, setSaving] = useState(false);
  const savedRef = useRef(false);
  // Set true the moment we disable enforcement so the leave/unmount cleanup always re-enables.
  const needsReenableRef = useRef(false);

  // ── Jog heartbeat (single joint, replicated from JogPad) ──────────────────────
  const dirRef  = useRef<1 | -1 | 0>(0);
  const axisRef = useRef<JogAxis>("x");
  const beatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  axisRef.current = JOINTS[Math.min(step, JOINTS.length - 1)].axis;

  const tick = useCallback(() => {
    const d = dirRef.current;
    if (!d) return;
    const a = axisRef.current;
    robotClient.jogJ({
      x:  a === "x"  ? d : 0,
      y:  a === "y"  ? d : 0,
      z:  a === "z"  ? d : 0,
      rz: a === "rz" ? d : 0,
      speed: JOG_SPEED, accel: 200, decel: 1000,
    });
  }, []);

  const startJog = useCallback((d: 1 | -1) => {
    dirRef.current = d;
    if (beatRef.current) return;
    tick(); // fire immediately so motion starts on press
    beatRef.current = setInterval(tick, HEARTBEAT_MS);
  }, [tick]);

  const stopJog = useCallback(() => {
    dirRef.current = 0;
    if (beatRef.current) { clearInterval(beatRef.current); beatRef.current = null; }
    robotClient.stopJog();
  }, []);

  // Stop jogging on blur and when the app backgrounds (see JogPad).
  useFocusEffect(useCallback(() => () => stopJog(), [stopJog]));
  useEffect(() => {
    const sub = AppState.addEventListener("change", (s: AppStateStatus) => {
      if (s !== "active") stopJog();
    });
    return () => { sub.remove(); stopJog(); };
  }, [stopJog]);

  // ── Entry: disable enforcement; prefill from existing limits. ─────────────────
  // Cleanup (unmount) re-enables enforcement so limits are never left off.
  useEffect(() => {
    needsReenableRef.current = true; // optimistic: ensure cleanup re-enables even if the call is slow
    robotClient.setRobotConfig({ jointLimitsEnabled: false }).catch(() => {});
    robotClient.getRobotConfig()
      .then(cfg => {
        setCaptures([
          { min: cfg.joint1Min, max: cfg.joint1Max },
          { min: cfg.joint2Min, max: cfg.joint2Max },
          { min: cfg.joint3Min, max: cfg.joint3Max },
          { min: cfg.joint4Min, max: cfg.joint4Max },
        ]);
      })
      .catch(() => {});
    return () => {
      stopJog();
      if (needsReenableRef.current) {
        robotClient.setRobotConfig({ jointLimitsEnabled: true }).catch(() => {});
        needsReenableRef.current = false;
      }
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Reachability gate (mirror camera-calibrate): advance only once a joint has both bounds.
  const jointDone = (k: number) => captures[k]?.min != null && captures[k]?.max != null;
  let reachable = 0;
  for (let k = 0; k < JOINTS.length; k++) { if (jointDone(k)) reachable = k + 1; else break; }

  const goto = (k: number) => { stopJog(); setStep(Math.min(k, reachable)); };

  const captured = captures.some(c => c.min != null || c.max != null);

  const leave = (navigate: () => void) => {
    if (savedRef.current || !captured) { navigate(); return; }
    appAlert(
      "Leave the wizard?",
      "Captured limits haven't been saved and will be discarded. Soft limits will be re-enabled.",
      [
        { text: "Stay", style: "cancel" },
        { text: "Leave", style: "destructive", onPress: navigate },
      ],
    );
  };
  const goBack = () => (router.canGoBack() ? router.back() : router.replace("/(tabs)/robot/config"));
  const exit = () => leave(goBack);

  const capture = (which: "min" | "max") => {
    const val = Number((status as unknown as Record<string, number>)[JOINTS[step].captureField]);
    setCaptures(c => c.map((b, i) => (i === step ? { ...b, [which]: val } : b)));
  };

  const save = async () => {
    setSaving(true);
    try {
      const patch: Record<string, number | null | boolean> = { jointLimitsEnabled: true };
      JOINTS.forEach((j, i) => {
        patch[j.minKey] = captures[i].min;
        patch[j.maxKey] = captures[i].max;
      });
      await robotClient.setRobotConfig(patch as Parameters<typeof robotClient.setRobotConfig>[0]);
      savedRef.current = true;
      needsReenableRef.current = false; // save already re-enabled enforcement
      goBack();
    } catch (e) {
      appAlert("Couldn't save limits", String(e ?? "Save failed"), [{ text: "OK" }]);
    } finally {
      setSaving(false);
    }
  };

  // ── Body ──────────────────────────────────────────────────────────────────────
  let body: React.ReactNode;
  if (step < JOINTS.length) {
    const joint = JOINTS[step];
    const live = Number((status as unknown as Record<string, number>)[joint.captureField]);
    const bound = captures[step];
    body = (
      <>
        <Notice tone="warning" title="Soft limits are off">
          Jog carefully — the controller will not stop you at the limits while this wizard is open.
          They are re-enabled automatically when you save or leave.
        </Notice>

        <Card style={styles.card}>
          <Text style={styles.jointTitle}>{joint.title}</Text>
          <Text style={styles.live}>
            {Number.isFinite(live) ? `${Math.round(live * 10) / 10}` : "—"}
            <Text style={styles.liveUnit}> {joint.unit}</Text>
          </Text>
          <Text style={styles.hint}>Jog to a mechanical end, then capture it.</Text>

          <View style={styles.jogRow}>
            <JogButton
              label={`−${joint.short}`}
              icon={<Minus size={22} color={colors.textMuted} />}
              iconPosition="above"
              onStart={() => startJog(-1)}
              onStop={stopJog}
              size={84}
            />
            <JogButton
              label={`+${joint.short}`}
              icon={<Plus size={22} color={colors.textMuted} />}
              iconPosition="above"
              onStart={() => startJog(1)}
              onStop={stopJog}
              size={84}
            />
          </View>

          <Divider />

          <View style={styles.captureRow}>
            <View style={styles.captureCell}>
              <Text style={styles.captureLabel}>MIN</Text>
              <Text style={styles.captureValue}>{fmt(bound.min, joint.unit)}</Text>
              <Button label="Set as Min" variant="secondary" size="sm" onPress={() => capture("min")} />
            </View>
            <View style={styles.captureCell}>
              <Text style={styles.captureLabel}>MAX</Text>
              <Text style={styles.captureValue}>{fmt(bound.max, joint.unit)}</Text>
              <Button label="Set as Max" variant="secondary" size="sm" onPress={() => capture("max")} />
            </View>
          </View>
        </Card>

        <View style={styles.navRow}>
          {step > 0 && (
            <Button label="Back" variant="secondary" onPress={() => goto(step - 1)} style={styles.navBtn} />
          )}
          <Button
            label={step === JOINTS.length - 1 ? "Review" : "Next"}
            variant="primary"
            onPress={() => goto(step + 1)}
            disabled={!jointDone(step)}
            style={styles.navBtn}
          />
        </View>
      </>
    );
  } else {
    body = (
      <>
        <Notice tone="info" title="Review captured limits">
          Saving writes all four joint limits and turns soft limits back on.
        </Notice>
        <Card style={styles.card}>
          {JOINTS.map((j, i) => (
            <React.Fragment key={j.minKey}>
              <View style={styles.reviewRow}>
                <Text style={styles.reviewLabel}>{j.title}</Text>
                <Text style={styles.reviewValue}>
                  {fmt(captures[i].min, j.unit)} … {fmt(captures[i].max, j.unit)}
                </Text>
              </View>
              {i < JOINTS.length - 1 && <Divider inset />}
            </React.Fragment>
          ))}
        </Card>
        <View style={styles.navRow}>
          <Button label="Back" variant="secondary" onPress={() => goto(JOINTS.length - 1)} style={styles.navBtn} />
          <Button
            label={saving ? "Saving…" : "Save Limits"}
            variant="primary"
            icon={<Check size={16} color={buttonTextColor("primary")} />}
            onPress={save}
            loading={saving}
            disabled={saving}
            style={styles.navBtn}
          />
        </View>
      </>
    );
  }

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <NotConnectedOverlay />
        <PageHeader
          title="Joint Limits Wizard"
          subtitle="Jog each joint to its limits and capture them"
          crumbs={[
            { label: "Robot", href: "/(tabs)/robot" },
            { label: "Configure", href: "/(tabs)/robot/config" },
            { label: "Joint Limits" },
          ]}
          onBack={exit}
          onNavigate={href => leave(() => router.navigate(href as never))}
        />
        <Screen>
          <WizardStepper steps={STEPS} current={step} reachable={reachable} onStep={goto} />
          <View style={styles.bodyGap}>{body}</View>
        </Screen>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  bodyGap: { gap: spacing.md, marginTop: spacing.md },
  card: { gap: spacing.md, alignItems: "stretch" },
  jointTitle: { ...type.sectionLabel },
  live: { fontSize: 40, fontWeight: "800", color: colors.text, textAlign: "center" },
  liveUnit: { fontSize: 18, fontWeight: "700", color: colors.textMuted },
  hint: { ...type.caption, textAlign: "center" },
  jogRow: { flexDirection: "row", justifyContent: "center", gap: spacing.xl },
  captureRow: { flexDirection: "row", gap: spacing.md },
  captureCell: { flex: 1, alignItems: "center", gap: spacing.xs },
  captureLabel: { ...type.sectionLabel },
  captureValue: { fontSize: 18, fontWeight: "700", color: colors.text },
  navRow: { flexDirection: "row", gap: spacing.sm + 2 },
  navBtn: { flex: 1 },
  reviewRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: spacing.sm,
    gap: spacing.md,
  },
  reviewLabel: { ...type.body, color: colors.text, flexShrink: 1 },
  reviewValue: { ...type.body, color: colors.textMuted, fontWeight: "700" },
});
