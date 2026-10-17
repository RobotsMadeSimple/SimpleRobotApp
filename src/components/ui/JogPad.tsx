import { robotClient } from "@/src/services/RobotConnectService";
import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useRef } from "react";
import { AppState, AppStateStatus } from "react-native";
import { CartesianJogPanel, CartesianAxis } from "@/src/components/ui/jog/CartesianJogPanel";
import { CartesianJoystickPanel } from "@/src/components/ui/jog/CartesianJoystickPanel";
import { JointJogPanel, JointAxis } from "@/src/components/ui/jog/JointJogPanel";

// ── Speed map ─────────────────────────────────────────────────────────────────
// "mm" entries are step-move magnitudes; others are continuous speeds (mm/s or °/s)

const DEFAULT_SPEEDS = { Slow: 10, Normal: 100, Fast: 300 };

// Jog keep-alive cadence. The controller runs a continuous velocity profile with
// a ~1s watchdog (JoggingMotionProfiler.resetTime), so each jog command is just a
// heartbeat that refreshes it — not a discrete move. 150ms keeps a ~6x safety
// margin while cutting jog traffic ~85% vs the old 20ms firehose, which used to
// leave StopJog stuck behind a congested socket over WiFi (laggy start/stop).
export const JOG_HEARTBEAT_MS = 150;

function buildSpeedMap(overrides?: { Slow: number; Normal: number; Fast: number }): Record<string, number> {
  const s = overrides ?? DEFAULT_SPEEDS;
  return {
    "0.1mm": 0.1,
    "1mm":   1,
    "10mm":  10,
    Slow:    s.Slow,
    Normal:  s.Normal,
    Fast:    s.Fast,
  };
}

// Joint degree-step equivalents for the discrete "mm" speed options
const jointStepMap: Record<string, number> = {
  "0.1mm": 0.5,
  "1mm":   2,
  "10mm":  10,
};

export type JogPadStyle = "buttons" | "joystick";

type JogPadProps = {
  jogMode:        string;  // "XYZ" | "Tool" | "Joint"
  selectedSpeed:  string;
  speedOverrides?: { Slow: number; Normal: number; Fast: number };
  /** XYZ/Tool only: directional buttons or an analog joystick. Ignored for Joint. */
  padStyle?:      JogPadStyle;
  /** Available height for the pad; panels scale down to fit it on short screens. */
  maxHeight?:     number;
};

type Vec = { x: number; y: number; z: number; rz: number };

const cartVec  = (axis: CartesianAxis, dir: number): Vec =>
  ({ x: axis === "x" ? dir : 0, y: axis === "y" ? dir : 0, z: axis === "z" ? dir : 0, rz: axis === "rz" ? dir : 0 });
// Joint → motor-space axis mapping (matches the controller's jog vector: J1→X, J3→Y, J2→Z, J4→RZ).
const jointVec = (joint: JointAxis, dir: number): Vec =>
  ({ x: joint === "j1" ? dir : 0, y: joint === "j3" ? dir : 0, z: joint === "j2" ? dir : 0, rz: joint === "j4" ? dir : 0 });

/**
 * Smart jog-pad container.
 *
 * Owns all interval timing and robot commands; delegates visual layout to
 * CartesianJogPanel / CartesianJoystickPanel (XYZ / Tool) or JointJogPanel (Joint).
 *
 * Multi-touch: every held direction button adds a unit contribution to `activeRef`,
 * and a single heartbeat composes the combined vector and sends one jog command per
 * tick — so holding +X and +Y jogs the diagonal. Joystick mode feeds an analog vector
 * into `joyRef` instead. The controller's jog profiler applies `targetVel = axis × speed`,
 * so a unit direction holds the selected speed and an analog (sub-unit) vector scales it.
 */
export default function JogPad({ jogMode, selectedSpeed, speedOverrides, padStyle = "buttons", maxHeight }: JogPadProps) {
  const speedMap = buildSpeedMap(speedOverrides);
  const isStep   = selectedSpeed.includes("mm");
  const joystick = padStyle === "joystick" && jogMode !== "Joint";

  // Step magnitudes have no meaning for the analog joystick — use a continuous speed instead.
  const activeSpeed = joystick && isStep
    ? (speedOverrides?.Normal ?? DEFAULT_SPEEDS.Normal)
    : speedMap[selectedSpeed];

  // Refs so the shared heartbeat tick always reads the current mode/speed.
  const cfg = useRef({ jogMode, activeSpeed });
  cfg.current = { jogMode, activeSpeed };

  const activeRef = useRef<Map<string, Vec>>(new Map());        // held buttons (continuous)
  const joyXYRef  = useRef<{ x: number; y: number } | null>(null); // analog X/Y stick
  const joyZRef   = useRef<number | null>(null);                 // analog Z stick (robot Z)
  const beatRef   = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Heartbeat: compose the combined vector and send one command ───────────────
  const tick = useCallback(() => {
    const { jogMode, activeSpeed } = cfg.current;

    let x = 0, y = 0, z = 0, rz = 0;
    for (const v of activeRef.current.values()) { x += v.x; y += v.y; z += v.z; rz += v.rz; }

    if (joyXYRef.current || joyZRef.current != null) {
      // Analog sticks drive X/Y and Z (their magnitude is the speed signal); held buttons add RZ.
      if (joyXYRef.current) { x += joyXYRef.current.x; y += joyXYRef.current.y; }
      if (joyZRef.current != null) { z += joyZRef.current; }
    } else {
      // Buttons: normalize the translational part to unit so a diagonal holds the selected speed.
      const m = Math.hypot(x, y, z);
      if (m > 0) { x /= m; y /= m; z /= m; }
    }

    const vec = { x, y, z, rz, speed: activeSpeed, accel: 200, decel: 1000 };
    if (jogMode === "Joint")     robotClient.jogJ(vec);
    else if (jogMode === "Tool") robotClient.jogTool(vec);
    else                         robotClient.jogL(vec);
  }, []);

  const ensureBeat = useCallback(() => {
    if (beatRef.current) return;
    tick();                                   // fire immediately so motion starts on press
    beatRef.current = setInterval(tick, JOG_HEARTBEAT_MS);
  }, [tick]);

  const maybeStop = useCallback(() => {
    if (activeRef.current.size > 0 || joyXYRef.current || joyZRef.current != null) return;
    if (beatRef.current) { clearInterval(beatRef.current); beatRef.current = null; }
    robotClient.stopJog();
  }, []);

  // ── Full stop (navigation, backgrounding) ─────────────────────────────────────
  const stopJog = useCallback(() => {
    activeRef.current.clear();
    joyXYRef.current = null;
    joyZRef.current = null;
    if (beatRef.current) { clearInterval(beatRef.current); beatRef.current = null; }
    robotClient.stopJog();
  }, []);

  useFocusEffect(useCallback(() => () => stopJog(), [stopJog]));
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state: AppStateStatus) => {
      if (state !== "active") stopJog();
    });
    return () => { sub.remove(); stopJog(); };
  }, [stopJog]);

  // ── Cartesian (XYZ / Tool) ────────────────────────────────────────────────────
  const startCartesian = (axis: CartesianAxis, direction: 1 | -1) => {
    // Discrete step moves only apply to the XYZ button pad (Tool and the joystick's Z/RZ side
    // controls are always continuous).
    if (isStep && jogMode !== "Tool" && !joystick) {
      const step = speedMap[selectedSpeed];
      const v = cartVec(axis, direction);
      robotClient.offsetL({ x: v.x * step, y: v.y * step, z: v.z * step, rz: v.rz * step, speed: 100, accel: 200, decel: 1000 });
      return;
    }
    activeRef.current.set(`${axis}:${direction}`, cartVec(axis, direction));
    ensureBeat();
  };
  const stopCartesian = (axis: CartesianAxis, direction: 1 | -1) => {
    activeRef.current.delete(`${axis}:${direction}`);
    maybeStop();
  };

  // ── Joint ─────────────────────────────────────────────────────────────────────
  const startJoint = (joint: JointAxis, direction: 1 | -1) => {
    if (isStep) {
      const stepDeg = jointStepMap[selectedSpeed] ?? 2;
      const v = jointVec(joint, direction);
      robotClient.jogJ({ x: v.x * stepDeg, y: v.y * stepDeg, z: v.z * stepDeg, rz: v.rz * stepDeg, speed: 20, accel: 100, decel: 200 });
      return;
    }
    activeRef.current.set(`${joint}:${direction}`, jointVec(joint, direction));
    ensureBeat();
  };
  const stopJoint = (joint: JointAxis, direction: 1 | -1) => {
    activeRef.current.delete(`${joint}:${direction}`);
    maybeStop();
  };

  // ── Joysticks (analog X/Y + vertical Z) ───────────────────────────────────────
  // X/Y pad reports a unit-disc vector (vx right, vy down). Map to robot axes to match the
  // button cross: screen-right = +Y, screen-down = +X.
  const onJoyChange = (vx: number, vy: number) => {
    joyXYRef.current = { x: vy, y: vx };
    ensureBeat();
  };
  const onJoyRelease = () => {
    joyXYRef.current = null;
    maybeStop();
  };
  // Vertical Z stick reports vy (screen-down +). Screen-up = +Z, so invert.
  const onJoyZChange = (vy: number) => {
    joyZRef.current = -vy;
    ensureBeat();
  };
  const onJoyZRelease = () => {
    joyZRef.current = null;
    maybeStop();
  };

  // ── Render ────────────────────────────────────────────────────────────────────
  if (jogMode === "Joint") {
    return <JointJogPanel onStart={startJoint} onStopAxis={stopJoint} maxHeight={maxHeight} />;
  }
  if (joystick) {
    return (
      <CartesianJoystickPanel
        onJoyChange={onJoyChange}
        onJoyRelease={onJoyRelease}
        onJoyZChange={onJoyZChange}
        onJoyZRelease={onJoyZRelease}
        onStart={startCartesian}
        onStopAxis={stopCartesian}
        maxHeight={maxHeight}
      />
    );
  }
  return <CartesianJogPanel onStart={startCartesian} onStopAxis={stopCartesian} maxHeight={maxHeight} />;
}
