import { router, Stack, useFocusEffect } from "expo-router";
import { Check, Crosshair, Minus, Plus, RotateCcw, RotateCw } from "lucide-react-native";
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
  Input,
  PageHeader,
  Screen,
  spacing,
  type,
} from "@/src/components/ui/kit";
import { NotConnectedOverlay } from "@/src/components/ui/NotConnectedOverlay";
import { useRobotStatus, useSelectedRobot, useTools } from "@/src/providers/RobotProvider";
import { robotClient } from "@/src/services/RobotConnectService";

// Jog keep-alive cadence — same contract as JogPad's heartbeat (replicated here so this
// screen stays self-contained). The controller runs a continuous velocity profile with a
// ~1s watchdog, so each jog command is a heartbeat refreshing it, not a discrete move.
const HEARTBEAT_MS = 150;
const TRANS_SPEED = 15; // mm/s — gentle world X/Y jog for fine re-touching
const ROT_SPEED   = 15; // °/s  — gentle J4 (EOAT) rotation

const TOUCHES = 3; // captures required before solving (over-determines the 2 unknowns)
const MIN_ANGLE_SPREAD = 20; // ° — warn if the captures weren't rotated enough to solve well

type Touch = { x: number; y: number; rz: number };

// ── TCP solve (pivot / N-point method) ──────────────────────────────────────────
// With the tool cleared the controller reports the J4 rotation-axis centre as (x, y) and
// the tool angle as rz. A tool offset t=(tx,ty) is driven to a point P fixed in the world:
//     P = C_i + R(phi_i)·t   for every touch i
// where C_i is the reported centre and phi_i the tool angle. Rotating the wrist and
// re-touching the SAME physical point at different angles over-determines t and P.
//
// Frame note: the reported pose is Y-flipped and rz-negated relative to the math frame the
// tool offset is stored/applied in (see ASTROKinematics.ForwardKinematics). So we rebuild
// the math-frame centre as (x, -y) and angle as -rz — the solved (tx,ty) is then exactly
// what CreateTool/EditTool store.
function solveTcp(samples: Touch[]): { tx: number; ty: number; err: number } | null {
  const rows: number[][] = [];
  const rhs: number[] = [];
  for (const s of samples) {
    const cx = s.x;
    const cy = -s.y;
    const phi = (-s.rz * Math.PI) / 180;
    const c = Math.cos(phi);
    const sn = Math.sin(phi);
    // [cos, -sin, -1, 0]·[tx,ty,Px,Py] = -cx ;  [sin, cos, 0, -1]·[...] = -cy
    rows.push([c, -sn, -1, 0]); rhs.push(-cx);
    rows.push([sn, c, 0, -1]);  rhs.push(-cy);
  }

  // Normal equations: (AᵀA) u = Aᵀb  (4×4).
  const n = 4;
  const ata = Array.from({ length: n }, () => new Array(n).fill(0));
  const atb = new Array(n).fill(0);
  for (let r = 0; r < rows.length; r++) {
    for (let i = 0; i < n; i++) {
      atb[i] += rows[r][i] * rhs[r];
      for (let j = 0; j < n; j++) ata[i][j] += rows[r][i] * rows[r][j];
    }
  }
  const u = solveLinear(ata, atb);
  if (!u) return null;
  const [tx, ty, Px, Py] = u;

  // Fit quality: how far each inferred touch point lands from their common solution.
  let maxErr = 0;
  for (const s of samples) {
    const cx = s.x;
    const cy = -s.y;
    const phi = (-s.rz * Math.PI) / 180;
    const c = Math.cos(phi);
    const sn = Math.sin(phi);
    const px = cx + c * tx - sn * ty;
    const py = cy + sn * tx + c * ty;
    maxErr = Math.max(maxErr, Math.hypot(px - Px, py - Py));
  }
  return { tx, ty, err: maxErr };
}

/** Solve a small linear system by Gaussian elimination with partial pivoting; null if singular. */
function solveLinear(A: number[][], b: number[]): number[] | null {
  const n = b.length;
  const m = A.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < n; col++) {
    let piv = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(m[r][col]) > Math.abs(m[piv][col])) piv = r;
    if (Math.abs(m[piv][col]) < 1e-9) return null; // under-constrained (not enough rotation)
    [m[col], m[piv]] = [m[piv], m[col]];
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = m[r][col] / m[col][col];
      for (let c = col; c <= n; c++) m[r][c] -= f * m[col][c];
    }
  }
  return m.map((row, i) => row[n] / row[i]);
}

/** Smallest absolute difference between two angles (degrees), 0..180. */
function angleGap(a: number, b: number): number {
  let d = Math.abs(((a - b) % 360 + 360) % 360);
  if (d > 180) d = 360 - d;
  return d;
}

function round(v: number, dp = 3) {
  const f = 10 ** dp;
  return Math.round(v * f) / f;
}

/**
 * Teach TCP Wizard (ASTRO, app-only). Teaches a tool's X/Y offset by the pivot method:
 * touch one fixed reference point from several wrist rotations, then solve for the offset.
 * Height (Z) and rotation offsets are left at 0 — this teaches the planar TCP only.
 *
 * The active tool is cleared on entry so the reported pose is the bare J4 centre, and
 * restored on leave unless the newly taught tool was saved + activated.
 */
export default function TeachTcpScreen() {
  const status = useRobotStatus();
  const robot = useSelectedRobot();
  const tools = useTools();
  const isAstro = (robot?.robotType ?? status.robotType) === "ASTRO";

  const STEPS = useMemo(
    () => ["Setup", ...Array.from({ length: TOUCHES }, (_, i) => `Touch ${i + 1}`), "Save"] as const,
    [],
  );
  const SAVE = TOUCHES + 1; // save step index

  const [step, setStep] = useState(0);
  const [touches, setTouches] = useState<(Touch | null)[]>(Array(TOUCHES).fill(null));
  const [name, setName] = useState("TCP Tool");
  const [saving, setSaving] = useState(false);
  const savedRef = useRef(false);

  // Remember the tool that was active on entry so we can restore it if the user bails.
  const prevToolRef = useRef<string | null>(null);
  const toolCleared = status.activeTool === "";

  // ── Jog heartbeat (single held control) ───────────────────────────────────────
  const sendRef = useRef<(() => void) | null>(null);
  const beatRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const startJog = useCallback((fn: () => void) => {
    sendRef.current = fn;
    if (beatRef.current) return;
    fn(); // fire immediately so motion starts on press
    beatRef.current = setInterval(() => sendRef.current?.(), HEARTBEAT_MS);
  }, []);

  const stopJog = useCallback(() => {
    sendRef.current = null;
    if (beatRef.current) { clearInterval(beatRef.current); beatRef.current = null; }
    robotClient.stopJog();
  }, []);

  const jogL = (x: number, y: number) => () =>
    robotClient.jogL({ x, y, z: 0, rz: 0, speed: TRANS_SPEED, accel: 200, decel: 1000 });
  const jogRot = (dir: 1 | -1) => () =>
    robotClient.jogJ({ x: 0, y: 0, z: 0, rz: dir, speed: ROT_SPEED, accel: 100, decel: 200 });

  // Stop jogging on blur and when the app backgrounds (see JogPad).
  useFocusEffect(useCallback(() => () => stopJog(), [stopJog]));
  useEffect(() => {
    const sub = AppState.addEventListener("change", (s: AppStateStatus) => {
      if (s !== "active") stopJog();
    });
    return () => { sub.remove(); stopJog(); };
  }, [stopJog]);

  // ── Entry: clear the active tool so the pose is the bare flange/J4 centre. ──────
  // Cleanup restores the previous tool unless we saved + activated the taught one.
  useEffect(() => {
    prevToolRef.current = status.activeTool || "";
    if (status.activeTool) robotClient.setActiveTool("None");
    return () => {
      stopJog();
      if (!savedRef.current && prevToolRef.current) {
        robotClient.setActiveTool(prevToolRef.current).catch?.(() => {});
      }
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Reachability gate: Setup → Touch 1 → … → Save, each unlocked by the prior capture.
  let reachable = 1; // Setup can always advance to the first touch
  for (let k = 0; k < TOUCHES; k++) { if (touches[k]) reachable = k + 2; else break; }

  const goto = (k: number) => { stopJog(); setStep(Math.min(Math.max(k, 0), reachable)); };

  const captured = touches.some(Boolean);
  const leave = (navigate: () => void) => {
    if (savedRef.current || !captured) { navigate(); return; }
    appAlert(
      "Leave the wizard?",
      "The captured touches haven't been saved and will be discarded.",
      [
        { text: "Stay", style: "cancel" },
        { text: "Leave", style: "destructive", onPress: navigate },
      ],
    );
  };
  const goBack = () => (router.canGoBack() ? router.back() : router.replace("/(tabs)/space/tools"));
  const exit = () => leave(goBack);

  const captureTouch = () => {
    const t: Touch = { x: status.x, y: status.y, rz: status.rz };
    setTouches(prev => prev.map((p, i) => (i === step - 1 ? t : p)));
  };

  const solution = useMemo(() => {
    const got = touches.filter((t): t is Touch => !!t);
    if (got.length < TOUCHES) return null;
    return solveTcp(got);
  }, [touches]);

  const angleSpread = useMemo(() => {
    const got = touches.filter((t): t is Touch => !!t);
    let max = 0;
    for (let i = 0; i < got.length; i++)
      for (let j = i + 1; j < got.length; j++) max = Math.max(max, angleGap(got[i].rz, got[j].rz));
    return max;
  }, [touches]);

  const save = async () => {
    if (!solution) return;
    const nm = name.trim();
    if (!nm) return;
    setSaving(true);
    try {
      // Only X/Y are taught — height (Z) and rotation are left untouched so editing an
      // existing tool preserves whatever Z/rotation offset it already had.
      const fields = { x: round(solution.tx), y: round(solution.ty) };
      if (tools.some(t => t.name === nm)) {
        await robotClient.editTool(nm, { ...fields });
      } else {
        await robotClient.createTool({ name: nm, ...fields });
      }
      await robotClient.setActiveTool(nm);
      savedRef.current = true; // keep the taught tool active; skip the restore-previous cleanup
      goBack();
    } catch (e) {
      appAlert("Couldn't save tool", String(e ?? "Save failed"), [{ text: "OK" }]);
    } finally {
      setSaving(false);
    }
  };

  // ── Not applicable on CNC (tool offset is a fixed translation, not rotation-coupled) ──
  if (!isAstro) {
    return (
      <>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={{ flex: 1, backgroundColor: colors.background }}>
          <PageHeader
            title="Teach TCP"
            subtitle="Teach a tool's planar offset"
            crumbs={[
              { label: "Space", href: "/(tabs)/space" },
              { label: "Tools", href: "/(tabs)/space/tools" },
              { label: "Teach TCP" },
            ]}
            onBack={goBack}
          />
          <Screen>
            <Notice tone="info" title="Not available for this robot">
              TCP teaching by rotation only applies to ASTRO. On a CNC machine the tool offset
              is a fixed translation — enter X/Y/Z directly on the Tools page instead.
            </Notice>
            <Button label="Back to Tools" variant="primary" onPress={goBack} style={{ marginTop: spacing.md }} />
          </Screen>
        </View>
      </>
    );
  }

  // ── Body ────────────────────────────────────────────────────────────────────────
  let body: React.ReactNode;

  if (step === 0) {
    body = (
      <>
        <Notice tone="info" title="How this works">
          Fix a sharp reference point in the workspace (a pointer tip, a marked hole). You'll
          touch the exact same point {TOUCHES} times, rotating the tool to a different angle each
          time. The wizard then solves the tool's X/Y offset. Height is ignored — Z stays 0.
        </Notice>
        <Card style={styles.card}>
          <View style={styles.toolStateRow}>
            <Crosshair size={18} color={toolCleared ? colors.success : colors.warning} />
            <Text style={styles.toolStateText}>
              {toolCleared
                ? "Active tool cleared — pose now reads the bare flange."
                : "Clearing the active tool…"}
            </Text>
          </View>
          <Text style={styles.hint}>
            Tip: the bigger the angle change between touches, the more accurate the result.
          </Text>
        </Card>
        <View style={styles.navRow}>
          <Button label="Start" variant="primary" onPress={() => goto(1)} style={styles.navBtn} />
        </View>
      </>
    );
  } else if (step <= TOUCHES) {
    const idx = step - 1;
    const t = touches[idx];
    body = (
      <>
        <Notice tone="warning" title={`Touch the reference point — rotation ${step} of ${TOUCHES}`}>
          Jog the tool tip onto the fixed reference point, then capture. Change the tool angle
          between touches (use Rotate) and re-touch the same point.
        </Notice>

        <Card style={styles.card}>
          <View style={styles.droRow}>
            <Dro label="X" value={status.x} unit="mm" />
            <Dro label="Y" value={status.y} unit="mm" />
            <Dro label="Angle" value={status.rz} unit="°" />
          </View>

          <Divider />

          <Text style={styles.sectionLabel}>MOVE (X / Y)</Text>
          <View style={styles.jogRow}>
            <JogButton label="−X" icon={<Minus size={18} color={colors.textMuted} />} iconPosition="above" onStart={() => startJog(jogL(-1, 0))} onStop={stopJog} size={64} />
            <JogButton label="+X" icon={<Plus size={18} color={colors.textMuted} />} iconPosition="above" onStart={() => startJog(jogL(1, 0))} onStop={stopJog} size={64} />
            <JogButton label="−Y" icon={<Minus size={18} color={colors.textMuted} />} iconPosition="above" onStart={() => startJog(jogL(0, -1))} onStop={stopJog} size={64} />
            <JogButton label="+Y" icon={<Plus size={18} color={colors.textMuted} />} iconPosition="above" onStart={() => startJog(jogL(0, 1))} onStop={stopJog} size={64} />
          </View>

          <Text style={styles.sectionLabel}>ROTATE (J4)</Text>
          <View style={styles.jogRow}>
            <JogButton label="CCW" icon={<RotateCcw size={18} color={colors.textMuted} />} iconPosition="above" onStart={() => startJog(jogRot(-1))} onStop={stopJog} size={64} />
            <JogButton label="CW" icon={<RotateCw size={18} color={colors.textMuted} />} iconPosition="above" onStart={() => startJog(jogRot(1))} onStop={stopJog} size={64} />
          </View>

          <Divider />

          <View style={styles.captureRow}>
            <View style={styles.captureInfo}>
              <Text style={styles.captureLabel}>CAPTURED</Text>
              <Text style={styles.captureValue}>
                {t ? `${t.x.toFixed(1)}, ${t.y.toFixed(1)} mm  @ ${t.rz.toFixed(1)}°` : "—"}
              </Text>
            </View>
            <Button
              label={t ? "Re-capture" : "Capture Touch"}
              variant={t ? "secondary" : "primary"}
              icon={<Crosshair size={16} color={buttonTextColor(t ? "secondary" : "primary")} />}
              onPress={captureTouch}
              disabled={!toolCleared}
            />
          </View>
        </Card>

        <View style={styles.navRow}>
          <Button label="Back" variant="secondary" onPress={() => goto(step - 1)} style={styles.navBtn} />
          <Button
            label={step === TOUCHES ? "Review" : "Next"}
            variant="primary"
            onPress={() => goto(step + 1)}
            disabled={!t}
            style={styles.navBtn}
          />
        </View>
      </>
    );
  } else {
    const ok = !!solution;
    const lowSpread = angleSpread < MIN_ANGLE_SPREAD;
    const highErr = ok && solution!.err > 2;
    body = (
      <>
        {!ok ? (
          <Notice tone="warning" title="Couldn't solve the offset">
            The touches weren't rotated enough to separate the tool offset. Go back and re-capture
            with larger angle changes between touches.
          </Notice>
        ) : (
          <>
            {lowSpread && (
              <Notice tone="warning" title="Small rotation range">
                The captures only spanned {angleSpread.toFixed(0)}° of rotation. The result may be
                imprecise — consider re-capturing with the tool rotated further apart.
              </Notice>
            )}
            {highErr && (
              <Notice tone="warning" title="Loose fit">
                The touches disagree by up to {solution!.err.toFixed(1)} mm — they may not have all
                hit the exact same point. Re-capture for a tighter result.
              </Notice>
            )}
          </>
        )}

        <Card style={styles.card}>
          <Text style={styles.sectionLabel}>SOLVED TCP OFFSET</Text>
          <View style={styles.resultRow}>
            <Dro label="X" value={solution ? solution.tx : 0} unit="mm" big />
            <Dro label="Y" value={solution ? solution.ty : 0} unit="mm" big />
          </View>
          {ok && (
            <Text style={styles.fit}>
              Fit: ±{solution!.err.toFixed(2)} mm over {angleSpread.toFixed(0)}° of rotation · Z offset left at 0
            </Text>
          )}

          <Divider />

          <Text style={styles.sectionLabel}>TOOL NAME</Text>
          <Input value={name} onChangeText={setName} placeholder="e.g. Pointer" autoCapitalize="words" />
          <Text style={styles.hint}>
            {tools.some(t => t.name === name.trim())
              ? "Updates the existing tool and makes it active."
              : "Creates a new tool and makes it active."}
          </Text>
        </Card>

        <View style={styles.navRow}>
          <Button label="Back" variant="secondary" onPress={() => goto(TOUCHES)} style={styles.navBtn} />
          <Button
            label={saving ? "Saving…" : "Save Tool"}
            variant="primary"
            icon={<Check size={16} color={buttonTextColor("primary")} />}
            onPress={save}
            loading={saving}
            disabled={saving || !ok || !name.trim()}
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
          title="Teach TCP"
          subtitle="Touch one point from several angles to solve the tool offset"
          crumbs={[
            { label: "Space", href: "/(tabs)/space" },
            { label: "Tools", href: "/(tabs)/space/tools" },
            { label: "Teach TCP" },
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

function Dro({ label, value, unit, big }: { label: string; value: number; unit: string; big?: boolean }) {
  return (
    <View style={styles.dro}>
      <Text style={styles.droLabel}>{label}</Text>
      <Text style={[styles.droValue, big && styles.droValueBig]}>
        {Number.isFinite(value) ? value.toFixed(1) : "—"}
        <Text style={styles.droUnit}> {unit}</Text>
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  bodyGap: { gap: spacing.md, marginTop: spacing.md },
  card: { gap: spacing.md, alignItems: "stretch" },
  hint: { ...type.caption, textAlign: "center" },
  sectionLabel: { ...type.sectionLabel },

  toolStateRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  toolStateText: { ...type.body, color: colors.text, flex: 1 },

  droRow: { flexDirection: "row", gap: spacing.md },
  resultRow: { flexDirection: "row", gap: spacing.md, justifyContent: "center" },
  dro: { flex: 1, alignItems: "center", gap: spacing.xs },
  droLabel: { ...type.sectionLabel },
  droValue: { fontSize: 20, fontWeight: "700", color: colors.text },
  droValueBig: { fontSize: 34, fontWeight: "800" },
  droUnit: { fontSize: 13, fontWeight: "600", color: colors.textMuted },

  jogRow: { flexDirection: "row", justifyContent: "center", gap: spacing.sm, flexWrap: "wrap" },

  captureRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  captureInfo: { flex: 1, gap: spacing.xs },
  captureLabel: { ...type.sectionLabel },
  captureValue: { ...type.mono, fontSize: 13, color: colors.text },

  fit: { ...type.caption, textAlign: "center", color: colors.textMuted },

  navRow: { flexDirection: "row", gap: spacing.sm + 2 },
  navBtn: { flex: 1 },
});
