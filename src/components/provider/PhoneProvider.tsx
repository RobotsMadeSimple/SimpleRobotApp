import { useCameraPermissions } from "expo-camera";
import { activateKeepAwakeAsync, deactivateKeepAwake } from "expo-keep-awake";
import { Moon, Router } from "lucide-react-native";
import { useCallback, useEffect, useState } from "react";
import { Platform, Pressable, StyleSheet, Switch, Text, View } from "react-native";

import { NotConnectedOverlay } from "@/src/components/ui/NotConnectedOverlay";
import {
  Button, buttonTextColor, Card, colors, Divider, FormRow, PageHeader, radii, Screen, SectionHeader,
  SegmentedControl, spacing, StatusPill, type,
} from "@/src/components/ui/kit";
import { CameraLiveFeed } from "@/src/components/vision/CameraLiveFeed";
import { useConnected, useSelectedRobot } from "@/src/providers/RobotProvider";
import {
  lensLabel, providerEngine, RES_OPTIONS, RTC_BITRATE_OPTIONS, RTC_FPS_OPTIONS,
  type ProviderEngineState,
} from "@/src/services/providerEngine";
import { DEFAULT_PHONE_DEVICE_NAME } from "./providerUtil";

// This phone streams its camera as a hardware-H.264 WebRTC feed (the controller decodes it to JPEG and
// fills the same "phone" camera every consumer reads). WebRTC is the only transport: the old periodic-
// JPEG "photo/video" modes ran the full stills pipeline per frame, which capped at ~3 fps and ran the
// phone hot — the hardware encoder is both faster and far cooler.
//
// All the actual streaming lives in `providerEngine` (a non-React singleton) so it keeps running when
// you navigate away or the screen turns off, backed by an Android foreground service. This screen is
// just a view over the engine: it reflects engine state and forwards control changes.
//
// A device is provided by ONE assigned phone. Until THIS phone is assigned, the only control shown is
// an "Assign this phone" button — so the setup phone can't accidentally become the stream source.

/** Compact display of a channel value: integers as-is, else 3 decimals. */
const fmtVal = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(3));

const KEEP_AWAKE_TAG = "provider-stream";

/**
 * Streams THIS phone's camera + sensors to a specific controller device (set up on the I/O page).
 * A device set up on one phone can be provided for by a different phone — whichever one is assigned.
 * The backing "phone" camera is named after the device.
 *
 * `autostart` (set when the screen is opened from a scanned/tapped provider tag) claims this phone as
 * the provider and turns the camera on as soon as the screen mounts.
 */
export function PhoneProvider({
  deviceId, deviceName, autostart = false,
}: { deviceId?: string; deviceName?: string; autostart?: boolean }) {
  const connected = useConnected();
  const robot = useSelectedRobot();
  const name = deviceName || DEFAULT_PHONE_DEVICE_NAME;
  const [camPerm, requestCamPerm] = useCameraPermissions();
  const [dimmed, setDimmed] = useState(false);

  // Mirror the engine's state into React. The engine owns the stream; this component only reflects it.
  const [st, setSt] = useState<ProviderEngineState>(() => providerEngine.getState());
  useEffect(() => providerEngine.subscribe(setSt), []);

  // Keep the screen on while this phone is actively streaming, so a mounted provider phone doesn't
  // sleep mid-feed. Released when streaming stops or the screen unmounts (then it may sleep; the
  // foreground service keeps the stream itself alive).
  useEffect(() => {
    if (!st.active) return;
    activateKeepAwakeAsync(KEEP_AWAKE_TAG).catch(() => {});
    return () => { try { deactivateKeepAwake(KEEP_AWAKE_TAG); } catch { /* noop */ } };
  }, [st.active]);

  const cfg = st.config;
  const streaming = st.rtcState === "connected";
  const ready = st.identityReady && st.configLoaded;

  // Point the engine at this device. If `autostart`, secure camera permission first so the engine can
  // open the camera without a prompt it can't show from outside React.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      let granted = false;
      if (autostart) granted = camPerm?.granted || (await requestCamPerm()).granted;
      if (cancelled) return;
      providerEngine.open({ deviceId, deviceName: name, autostart: autostart && granted });
    })();
    return () => { cancelled = true; };
  }, [deviceId, name, autostart, camPerm?.granted, requestCamPerm]);

  // Fill the lens picker once camera permission is granted (labels are only exposed then).
  useEffect(() => { if (camPerm?.granted && st.assignedHere) providerEngine.refreshLenses(); }, [camPerm?.granted, st.assignedHere]);

  const onCamToggle = useCallback(async (on: boolean) => {
    if (on) {
      const granted = camPerm?.granted || (await requestCamPerm()).granted;
      if (!granted) return;
    }
    providerEngine.setCamOn(on);
  }, [camPerm?.granted, requestCamPerm]);

  // ── Render ────────────────────────────────────────────────────────────────
  const crumbs = [{ label: "I/O", href: "/io" }, { label: name }];
  const lenses = st.lenses;

  const pill = !ready || !st.assignedHere
    ? <StatusPill label={st.assignedHere ? "Idle" : "Not linked"} tone="neutral" />
    : (streaming || st.devLive)
      ? <StatusPill label="Streaming" tone="success" dot />
      : <StatusPill label="Idle" tone="neutral" />;

  return (
    <View style={styles.container}>
      <NotConnectedOverlay />
      <PageHeader
        title={name}
        subtitle="Stream this phone's camera & sensors to this device"
        crumbs={crumbs}
        right={pill}
      />
      <Screen>
        {!ready ? (
          <Card style={styles.stack}><Text style={type.caption}>Loading…</Text></Card>
        ) : !st.assignedHere ? (
          // ── Not this phone's device: the only action is to claim it ──
          <>
            <SectionHeader title="Link this phone" />
            <Card style={styles.stack}>
              <Text style={type.body}>
                {st.assignedPhoneId
                  ? `“${name}” is currently provided by ${st.assignedPhoneName || "another phone"}.`
                  : `No phone is linked to “${name}” yet.`}
              </Text>
              <Text style={type.caption}>
                Assigning links <Text style={styles.bold}>this</Text> phone as the camera & sensor source for “{name}”.
                It stays linked to this device until you change it — other phones won&apos;t take it over.
              </Text>
              <Button
                label={st.assignedPhoneId ? "Assign this phone instead" : "Assign this phone"}
                onPress={() => providerEngine.assignHere()}
              />
            </Card>
          </>
        ) : (
          // ── This phone is the provider: full streaming UI ──
          <>
            {/* Which robot this phone is serving + its live connection status (clear + reconnect-aware). */}
            <Card style={[styles.stack, styles.connCard]}>
              <View style={styles.connRow}>
                <View style={[styles.connIcon, { backgroundColor: connected ? colors.successSoft : colors.dangerSoft }]}>
                  <Router size={20} color={connected ? colors.success : colors.danger} />
                </View>
                <View style={styles.connText}>
                  <Text style={styles.connTitle} numberOfLines={1}>{robot?.robotName || robot?.ipAddress || "No robot selected"}</Text>
                  <Text style={type.caption} numberOfLines={1}>
                    {robot
                      ? (connected ? `Connected · ${robot.ipAddress}:${robot.port}` : `Reconnecting… · ${robot.ipAddress}:${robot.port}`)
                      : "Open the Robot tab to connect"}
                  </Text>
                </View>
                <StatusPill label={connected ? "Online" : "Offline"} tone={connected ? "success" : "danger"} dot={connected} />
              </View>
            </Card>

            <SectionHeader title="Camera" />
            <Card style={styles.stack}>
              <FormRow label="Stream camera" hint="Feeds this phone's camera to the controller to preview, calibrate and run vision on. Hardware H.264 (WebRTC)." inline>
                <Switch value={st.camOn} onValueChange={onCamToggle} trackColor={{ false: colors.border, true: colors.success }} />
              </FormRow>
              {st.camOn && (
                <>
                  <Divider />
                  <FormRow label="Resolution" hint="Capture size requested from the camera.">
                    <SegmentedControl options={RES_OPTIONS} value={cfg.resTier} onChange={v => providerEngine.updateConfig({ resTier: v })} />
                  </FormRow>
                  <Divider />
                  <FormRow label="Frame rate" hint="Target capture/encode rate for the stream.">
                    <SegmentedControl options={RTC_FPS_OPTIONS} value={cfg.rtcFps} onChange={v => providerEngine.updateConfig({ rtcFps: v })} />
                  </FormRow>
                  <Divider />
                  <FormRow label="Bitrate" hint="Mbps ceiling — the quality knob. WebRTC adapts below it; applies live. Higher = cleaner (esp. at 60 fps / 1080p).">
                    <SegmentedControl options={RTC_BITRATE_OPTIONS} value={String(cfg.bitrate)} onChange={v => providerEngine.updateConfig({ bitrate: Number(v) })} />
                  </FormRow>
                  {lenses.length > 1 && (
                    <>
                      <Divider />
                      <FormRow label="Lens" hint="Which camera to stream from (this phone's cameras).">
                        <SegmentedControl
                          options={[{ label: "Default", value: "" }, ...lenses.map((l, i) => ({ label: lensLabel(l, i), value: l.id }))]}
                          value={cfg.lensId ?? ""}
                          onChange={(v: string) => providerEngine.updateConfig({ lensId: v || null })}
                        />
                      </FormRow>
                    </>
                  )}
                  <Divider />
                  <FormRow label="Lock orientation" hint="Keep the stream fixed to the current orientation when the phone rotates." inline>
                    <Switch value={cfg.lockOrient} onValueChange={v => providerEngine.updateConfig({ lockOrient: v })} trackColor={{ false: colors.border, true: colors.success }} />
                  </FormRow>
                  {st.camId
                    ? <CameraLiveFeed cameraId={st.camId} aspectRatio={4 / 3} />
                    : <View style={[styles.preview, styles.previewEmpty]}><Text style={type.caption}>Connecting…</Text></View>}
                  <Text style={type.caption}>
                    {`WebRTC ${st.rtcState || "connecting…"}${st.rtcStats ? ` · ${st.rtcStats.fps} fps · ${st.rtcStats.w}×${st.rtcStats.h} · ${st.rtcStats.kbps} kb/s` : ""} · H.264 · controller round-trip of “${name}”.`}
                  </Text>
                </>
              )}
            </Card>

            <SectionHeader title="Sensors" />
            <Card style={styles.stack}>
              <FormRow label="Motion" hint="accel.x/y/z, gyro.x/y/z, mag.x/y/z" inline>
                <Switch value={cfg.motionOn} onValueChange={v => providerEngine.updateConfig({ motionOn: v })} trackColor={{ false: colors.border, true: colors.success }} />
              </FormRow>
              <Divider />
              {Platform.OS === "android" && (
                <>
                  <FormRow label="Light" hint="Ambient light (lux)" inline>
                    <Switch value={cfg.lightOn} onValueChange={v => providerEngine.updateConfig({ lightOn: v })} trackColor={{ false: colors.border, true: colors.success }} />
                  </FormRow>
                  <Divider />
                </>
              )}
              <FormRow label="Location" hint="location.lat/lon/alt/speed/heading/accuracy" inline>
                <Switch value={cfg.locationOn} onValueChange={v => providerEngine.updateConfig({ locationOn: v })} trackColor={{ false: colors.border, true: colors.success }} />
              </FormRow>
              <Divider />
              <FormRow label="Battery" hint="battery.level (0–1), battery.charging" inline>
                <Switch value={cfg.batteryOn} onValueChange={v => providerEngine.updateConfig({ batteryOn: v })} trackColor={{ false: colors.border, true: colors.success }} />
              </FormRow>
              {st.devLive && (
                <Text style={type.caption}>Pushing channels as “{name}” — read them in programs as $device.&lt;id&gt;.&lt;channel&gt;.</Text>
              )}
            </Card>

            {Object.keys(st.values).length > 0 && (
              <>
                <SectionHeader title="Live values" />
                <Card style={styles.stack}>
                  {Object.entries(st.values).sort(([a], [b]) => a.localeCompare(b)).map(([k, v], i, arr) => (
                    <View key={k}>
                      <View style={styles.valueRow}>
                        <Text style={styles.valueKey}>{k}</Text>
                        <Text style={styles.valueVal}>{fmtVal(v)}</Text>
                      </View>
                      {i < arr.length - 1 && <Divider />}
                    </View>
                  ))}
                </Card>
              </>
            )}

            <SectionHeader title="This phone" />
            <Card style={styles.stack}>
              <Text style={type.caption}>
                {st.active
                  ? "Streaming keeps running in the background — you can leave this screen or turn the screen off and this phone keeps serving data. A notification shows while it's active."
                  : "This phone is linked as the provider for this device. Turn on the camera or a sensor to start streaming."}
              </Text>
              <Button
                label="Dim screen"
                variant="secondary"
                icon={<Moon size={16} color={buttonTextColor("secondary")} />}
                onPress={() => setDimmed(true)}
              />
              {st.active && <Button label="Stop streaming" variant="destructive" onPress={() => providerEngine.stop()} />}
              <Button label="Unlink this phone" variant="secondary" onPress={() => providerEngine.unassignHere()} />
            </Card>

            <Text style={[type.caption, styles.note]}>
              {connected
                ? "Streaming runs in a foreground service, so it continues when the app is in the background or the screen is off."
                : "Not connected — streaming will resume automatically when this phone reconnects to the controller."}
            </Text>
          </>
        )}
      </Screen>

      {/* Dim mode: a near-black kiosk overlay (OLED power save + no burn-in) that keeps the key status
          visible while the screen stays awake (keep-awake stays active). Tap anywhere to wake. */}
      {dimmed && (
        <Pressable style={styles.dimOverlay} onPress={() => setDimmed(false)}>
          <Text style={styles.dimTitle} numberOfLines={1}>{robot?.robotName || robot?.ipAddress || name}</Text>
          <View style={styles.dimStatusRow}>
            <View style={[styles.dimDot, { backgroundColor: (streaming || st.devLive) ? colors.success : colors.textMuted }]} />
            <Text style={styles.dimStatus}>
              {(streaming || st.devLive) ? "Streaming" : "Idle"}{connected ? "" : " · reconnecting"}
            </Text>
          </View>
          {st.rtcStats && (streaming) && (
            <Text style={styles.dimMeta}>{`${st.rtcStats.fps} fps · ${st.rtcStats.w}×${st.rtcStats.h}`}</Text>
          )}
          <Text style={styles.dimHint}>Tap to wake</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  stack: { gap: spacing.md },
  bold: { fontWeight: "700", color: colors.text },
  preview: {
    width: "100%",
    aspectRatio: 4 / 3,
    borderRadius: radii.md,
    overflow: "hidden",
    backgroundColor: "#000",
  },
  previewEmpty: { alignItems: "center", justifyContent: "center" },
  valueRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 3 },
  valueKey: { ...type.body, color: colors.text },
  valueVal: { ...type.mono, color: colors.textSecondary },
  note: { marginTop: spacing.sm },

  // Robot connection header
  connCard: { backgroundColor: colors.surface },
  connRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  connIcon: { width: 40, height: 40, borderRadius: radii.md, alignItems: "center", justifyContent: "center" },
  connText: { flex: 1 },
  connTitle: { ...type.body, fontWeight: "700", color: colors.text },

  // Dim (kiosk) overlay
  dimOverlay: {
    position: "absolute",
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: "#000",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
  },
  dimTitle: { fontSize: 20, fontWeight: "700", color: "#e5e7eb", maxWidth: "80%", textAlign: "center" },
  dimStatusRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  dimDot: { width: 10, height: 10, borderRadius: 5 },
  dimStatus: { fontSize: 15, color: "#cbd5e1" },
  dimMeta: { fontSize: 13, color: "#64748b" },
  dimHint: { fontSize: 12, color: "#475569", marginTop: spacing.lg },
});
