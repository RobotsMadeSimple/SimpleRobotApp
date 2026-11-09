import { useCameraPermissions } from "expo-camera";
import { activateKeepAwakeAsync, deactivateKeepAwake } from "expo-keep-awake";
import { router, useFocusEffect } from "expo-router";
import { Moon, RotateCw } from "lucide-react-native";
import { useCallback, useEffect, useState } from "react";
import { AppState, BackHandler, Platform, Pressable, StyleSheet, Switch, Text, View } from "react-native";

import { NotConnectedOverlay } from "@/src/components/ui/NotConnectedOverlay";
import { DeviceStatusBar } from "@/src/components/ui/io/ioShared";
import {
  Button, buttonTextColor, Card, colors, Divider, FormRow, PageHeader, radii, Screen, SectionHeader,
  SegmentedControl, spacing, StatusPill, type,
} from "@/src/components/ui/kit";
import { CameraLiveFeed } from "@/src/components/vision/CameraLiveFeed";
import { useConnected, useSelectedRobot } from "@/src/providers/RobotProvider";
import {
  ASPECT_OPTIONS, describeRxStats, lensLabel, ORIENT_OPTIONS, providerEngine, RES_OPTIONS, RTC_BITRATE_OPTIONS,
  RTC_FPS_OPTIONS, type ProviderEngineState,
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
  // What the controller actually decodes (the sender's stats only say frames are going out).
  const rx = st.assignedHere && st.rxStats ? describeRxStats(st.rxStats, cfg.bitrate) : null;
  const ready = st.identityReady && st.configLoaded;
  // Preview shape follows the stream (portrait frames are taller than wide). Other phones have no
  // sender stats, so they work it out from the settings.
  const wide = cfg.aspect === "16:9" ? 16 / 9 : 4 / 3;
  const previewAspect = st.rtcStats?.w && st.rtcStats.h
    ? st.rtcStats.w / st.rtcStats.h
    : cfg.orientation.startsWith("portrait") ? 1 / wide : wide;

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
    // Only the phone that streams needs camera permission; other phones just change the setting.
    if (on && st.assignedHere) {
      const granted = camPerm?.granted || (await requestCamPerm()).granted;
      if (!granted) return;
    }
    providerEngine.setCamOn(on);
  }, [camPerm?.granted, requestCamPerm, st.assignedHere]);

  // Assigning carries the device's settings over, so this phone starts streaming straight away if
  // the camera was on — secure camera permission first so the engine can open the camera (denied:
  // the camera switch flips off, the rest still carries over).
  const onAssign = useCallback(async () => {
    const camOk = !st.config.camOn || camPerm?.granted || (await requestCamPerm()).granted;
    await providerEngine.assignHere();
    if (!camOk) providerEngine.setCamOn(false);
  }, [st.config.camOn, camPerm?.granted, requestCamPerm]);

  // Back always lands on the I/O page. A phone set up as a device opens straight onto this screen at
  // launch, so there's often no I/O page under it and a plain "go back" would leave the I/O tab.
  const backToIo = useCallback(() => router.dismissTo("/io"), []);
  useFocusEffect(useCallback(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => { backToIo(); return true; });
    return () => sub.remove();
  }, [backToIo]));

  // The preview is a WebView decoding the controller's feed: it holds GPU memory and keeps decoding
  // even when nobody can see it. Only mount it while this screen is focused, the app is in the
  // foreground and the screen isn't dimmed — the stream itself runs on regardless.
  const [focused, setFocused] = useState(true);
  useFocusEffect(useCallback(() => { setFocused(true); return () => setFocused(false); }, []));
  const [appActive, setAppActive] = useState(AppState.currentState === "active");
  useEffect(() => {
    const sub = AppState.addEventListener("change", s => setAppActive(s === "active"));
    return () => sub.remove();
  }, []);
  const previewLive = focused && appActive && !dimmed;

  // ── Render ────────────────────────────────────────────────────────────────
  const crumbs = [{ label: "I/O", href: "/io" }, { label: name }];
  const lenses = st.lenses;

  const pill = !ready || (!st.assignedHere && !st.assignedPhoneId)
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
      />
      <Screen>
        <DeviceStatusBar status={pill} />
        {!ready ? (
          <Card style={styles.stack}><Text style={type.caption}>Loading…</Text></Card>
        ) : (
          // Every phone sees and can change the settings; only the assigned phone streams them.
          <>
            {!st.assignedHere && (
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
                onPress={onAssign}
              />
            </Card>
            )}

            <SectionHeader title="Camera" />
            <Card style={styles.stack}>
              <FormRow label="Stream camera" hint="Feeds the linked phone's camera to the controller to preview, calibrate and run vision on. Hardware H.264 (WebRTC)." inline>
                <Switch value={st.camOn} onValueChange={onCamToggle} trackColor={{ false: colors.border, true: colors.success }} />
              </FormRow>
              {st.camOn && (
                <>
                  <Divider />
                  <FormRow label="Resolution" hint="Capture size requested from the camera.">
                    <SegmentedControl options={RES_OPTIONS} value={cfg.resTier} onChange={v => providerEngine.updateConfig({ resTier: v })} />
                  </FormRow>
                  <Divider />
                  <FormRow label="Frame shape" hint="4:3 streams the camera's whole view; 16:9 cuts off the top and bottom of it.">
                    <SegmentedControl options={ASPECT_OPTIONS} value={cfg.aspect} onChange={v => providerEngine.updateConfig({ aspect: v })} />
                  </FormRow>
                  <Divider />
                  <FormRow label="Frame rate" hint="Target capture/encode rate for the stream.">
                    <SegmentedControl options={RTC_FPS_OPTIONS} value={cfg.rtcFps} onChange={v => providerEngine.updateConfig({ rtcFps: v })} />
                  </FormRow>
                  <Divider />
                  <FormRow label="Bitrate" hint="Mbps the phone sends at — the quality knob; applies live. Higher = cleaner, but over Wi-Fi more gets lost and resent; 12 is plenty for 1080p.">
                    <SegmentedControl options={RTC_BITRATE_OPTIONS} value={String(cfg.bitrate)} onChange={v => providerEngine.updateConfig({ bitrate: Number(v) })} />
                  </FormRow>
                  {lenses.length > 1 && (
                    <>
                      <Divider />
                      <FormRow label="Lens" hint="Which of the linked phone's cameras to stream from.">
                        <SegmentedControl
                          options={[{ label: "Default", value: "" }, ...lenses.map((l, i) => ({ label: lensLabel(l, i, lenses), value: l.id }))]}
                          value={cfg.lensId ?? ""}
                          onChange={(v: string) => providerEngine.updateConfig({ lensId: v || null })}
                        />
                      </FormRow>
                    </>
                  )}
                  <Divider />
                  <FormRow label="Orientation" hint="Turns the stream itself, whatever way the phone or its screen is turned. Rotate turns it a quarter turn clockwise.">
                    <View style={styles.orientRow}>
                      <View style={styles.orientSeg}>
                        <SegmentedControl
                          options={ORIENT_OPTIONS}
                          value={cfg.orientation.startsWith("portrait") ? "portrait" : "landscape"}
                          onChange={v => providerEngine.updateConfig({ orientation: v })}
                        />
                      </View>
                      <Button
                        label="Rotate"
                        variant="secondary"
                        icon={<RotateCw size={16} color={buttonTextColor("secondary")} />}
                        onPress={() => providerEngine.rotate()}
                      />
                    </View>
                  </FormRow>
                  {st.camId && previewLive
                    ? <CameraLiveFeed cameraId={st.camId} aspectRatio={previewAspect} />
                    : <View style={[styles.preview, styles.previewEmpty]}><Text style={type.caption}>{st.camId ? "Preview paused" : "Connecting…"}</Text></View>}
                  <Text style={type.caption}>
                    {!st.assignedHere
                      ? `Streamed by ${st.assignedPhoneName || "the linked phone"} · controller view of “${name}”.`
                      : `WebRTC ${st.rtcState || "connecting…"}${st.rtcStats ? ` · sending ${st.rtcStats.fps} fps${st.rtcStats.limit ? ` (held back by ${st.rtcStats.limit})` : ""} ·${st.rtcStats.w}×${st.rtcStats.h} · ${st.rtcStats.kbps} kb/s` : ""} · H.264 · controller round-trip of “${name}”.`}
                  </Text>
                  {rx && streaming && (
                    <Text style={[type.caption, rx.bad && styles.rxBad]}>{rx.text}</Text>
                  )}
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

            {st.assignedHere && <>
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
            </>}

            <Text style={[type.caption, styles.note]}>
              {!st.assignedHere
                ? `Changes here are saved on the controller and picked up by ${st.assignedPhoneName || "the linked phone"}, which does the streaming.`
                : connected
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
          {rx?.bad && streaming && <Text style={[styles.dimMeta, styles.rxBad]}>{rx.text}</Text>}
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
  orientRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  orientSeg: { flex: 1 },
  valueRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 3 },
  valueKey: { ...type.body, color: colors.text },
  valueVal: { ...type.mono, color: colors.textSecondary },
  note: { marginTop: spacing.sm },
  rxBad: { color: colors.warning },

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
