import { OctagonAlert } from "lucide-react-native";
import { useEffect, useState } from "react";
import { StyleSheet, Switch, Text, View } from "react-native";

import { appAlert } from "@/src/components/ui/AppAlert";
import {
  Card, Chip, ChipGroup, colors, Divider, FormRow, InfoTip, SectionHeader, SegmentedControl, spacing,
  StatusPill, type,
} from "@/src/components/ui/kit";
import { DEFAULT_ESTOP_CONFIG, type EstopConfig, type EstopPolarity, type EstopSource } from "@/src/models/safetyModels";
import { useIoDevices, useRobotStatusValue } from "@/src/providers/RobotProvider";
import { errorText, getEstopConfig, setEstopConfig } from "@/src/services/safetyApi";

/**
 * Robot config's "Emergency stop" section: where the hardwired e-stop sense input is read (an STB
 * input, or an IO device pin picked by the device's stable id), its polarity, and the live input.
 * Each change is saved straight away (SetEstopConfig).
 */
export function EstopConfigSection() {
  const connected = useRobotStatusValue(s => s.connected);
  const robotType = useRobotStatusValue(s => s.robotType);
  const liveInput  = useRobotStatusValue(s => s.estopInput ?? null);
  const liveOnline = useRobotStatusValue(s => !!s.estopSourceOnline);
  const liveSource = useRobotStatusValue(s => s.estopSource ?? "");
  const ioDevices = useIoDevices();

  const [cfg, setCfg] = useState<EstopConfig | null>(null);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!connected) return;
    let alive = true;
    getEstopConfig()
      .then(r => { if (alive) { setCfg(r.config); setLoadError(null); } })
      .catch(e => { if (alive) setLoadError(errorText(e)); });
    return () => { alive = false; };
  }, [connected]);

  const c = cfg ?? DEFAULT_ESTOP_CONFIG;
  const nc = c.polarity !== "normallyOpen";
  const tripped = liveInput == null ? null : nc ? !liveInput : liveInput;

  async function save(patch: Partial<EstopConfig>) {
    if (!cfg) return;
    const prev = cfg;
    setCfg({ ...cfg, ...patch });          // optimistic
    setSaving(true);
    try {
      const r = await setEstopConfig(patch);
      setCfg(r.config);
    } catch (e) {
      setCfg(prev);
      appAlert("E-stop setting not saved", errorText(e));
    } finally {
      setSaving(false);
    }
  }

  function toggleEnabled(next: boolean) {
    if (!next) {
      appAlert("Turn off e-stop monitoring?",
        "The e-stop button still cuts the drivers' power, but the controller will no longer notice it: programs keep running and nothing is latched.",
        [{ text: "Cancel", style: "cancel" }, { text: "Turn off", style: "destructive", onPress: () => save({ enabled: false }) }]);
      return;
    }
    if (c.source === "io" && (!c.deviceId || c.pin == null)) {
      appAlert("Pick the input first", "Choose the IO device and pin the e-stop's sense contact is wired to.");
      return;
    }
    if (tripped !== false) {
      appAlert("The input does not read healthy",
        tripped == null
          ? "The source is offline right now. Turning monitoring on will block all motion until it connects and reads healthy."
          : "The e-stop input reads tripped right now. Turning monitoring on will block all motion until it reads healthy. Check the wiring and polarity.",
        [{ text: "Cancel", style: "cancel" }, { text: "Turn on anyway", onPress: () => save({ enabled: true }) }]);
      return;
    }
    save({ enabled: true });
  }

  // Devices with input pins (Nano IO boards and aux boards' spare pins), by stable id.
  const devices = ioDevices.filter(d => d.pins.some(p => p.type === "Input") || d.id === c.deviceId);
  const device = devices.find(d => d.id === c.deviceId);
  const inputPins = (device?.pins ?? []).filter(p => p.type === "Input" || p.pin === c.pin);

  const live = !cfg ? (
    <StatusPill label="—" />
  ) : liveInput == null || !liveOnline ? (
    <StatusPill label="Source offline" tone="warning" dot />
  ) : tripped ? (
    <StatusPill label={nc ? "Open · e-stop" : "Closed · e-stop"} tone="danger" dot />
  ) : (
    <StatusPill label={nc ? "Closed · healthy" : "Open · healthy"} tone="success" dot />
  );

  return (
    <>
      <SectionHeader
        title="Emergency stop"
        icon={OctagonAlert}
        right={<InfoTip text="The e-stop button cuts the stepper drivers' power in hardware. A second contact wired to an input lets the controller notice: it stops motion, aborts programs, and blocks moving until the e-stop is reset and the robot homed. Not a certified safety function — see the controller's docs/estop.md for wiring." />}
      />
      <Card>
        <View style={styles.body}>
        <FormRow label="Monitor e-stop input" hint={c.enabled ? "On: a trip stops everything and must be reset" : "Off: the controller ignores the input"} inline>
          <Switch
            value={c.enabled}
            onValueChange={toggleEnabled}
            disabled={!cfg || saving}
            trackColor={{ true: colors.danger, false: colors.borderStrong }}
            thumbColor={colors.surface}
          />
        </FormRow>
        <Divider />

        <FormRow label="Input source">
          <SegmentedControl<EstopSource>
            options={[{ label: "STB input", value: "stb" }, { label: "IO device pin", value: "io" }]}
            value={c.source}
            onChange={v => save(v === "io" && devices[0] && !c.deviceId
              ? { source: v, deviceId: devices[0].id, pin: devices[0].pins.find(p => p.type === "Input")?.pin ?? null }
              : { source: v })}
          />
        </FormRow>

        {c.source === "stb" ? (
          <FormRow label="STB input" hint={robotType !== "CNC4Axis" ? "Inputs 1–3 are the homing switches; use input 4" : undefined}>
            <ChipGroup>
              {[1, 2, 3, 4].map(n => (
                <Chip key={n} label={`Input ${n}`} selected={c.stbInput === n} onPress={() => save({ stbInput: n })}
                  disabled={!cfg || saving} tint={[colors.danger, colors.dangerSoft]} />
              ))}
            </ChipGroup>
          </FormRow>
        ) : (
          <>
            <FormRow label="IO device">
              {devices.length === 0 ? (
                <Text style={styles.empty}>No IO device has an input pin. Configure a pin as an Input on the I/O page.</Text>
              ) : (
                <ChipGroup>
                  {devices.map(d => (
                    <Chip key={d.id} label={`${d.name || d.id}${d.connected ? "" : " (offline)"}`} selected={d.id === c.deviceId}
                      onPress={() => save({ deviceId: d.id, pin: d.pins.find(p => p.type === "Input")?.pin ?? null })}
                      disabled={!cfg || saving} tint={[colors.danger, colors.dangerSoft]} />
                  ))}
                </ChipGroup>
              )}
            </FormRow>
            {!!device && (
              <FormRow label="Pin">
                <ChipGroup>
                  {inputPins.map(p => (
                    <Chip key={p.pin} label={p.name ? `${p.name} · D${p.pin}` : `D${p.pin}`} selected={p.pin === c.pin}
                      onPress={() => save({ pin: p.pin })} disabled={!cfg || saving} tint={[colors.danger, colors.dangerSoft]} />
                  ))}
                </ChipGroup>
              </FormRow>
            )}
          </>
        )}

        <FormRow label="Polarity" hint={nc ? "Fail-safe: an open circuit or a broken wire is an e-stop" : "The input reads on when the e-stop is pressed — a broken wire is not detected"}>
          <SegmentedControl<EstopPolarity>
            options={[{ label: "Normally closed", value: "normallyClosed" }, { label: "Normally open", value: "normallyOpen" }]}
            value={c.polarity}
            onChange={v => save({ polarity: v })}
          />
        </FormRow>
        <Divider />

        <FormRow label="Live input" hint={liveSource || undefined} inline>
          {live}
        </FormRow>
        {!!loadError && <Text style={styles.error}>{loadError}</Text>}
        </View>
      </Card>
    </>
  );
}

const styles = StyleSheet.create({
  body: { gap: spacing.md },
  empty: { ...type.caption, color: colors.textMuted, lineHeight: 16 },
  error: { ...type.caption, color: colors.danger, marginTop: spacing.sm },
});
