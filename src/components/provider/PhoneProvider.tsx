import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCameraPermissions } from "expo-camera";
import { router, useFocusEffect } from "expo-router";
import { ChevronDown, ChevronRight, Moon, RotateCw } from "lucide-react-native";
import { type ReactNode, useCallback, useEffect, useState } from "react";
import { AppState, BackHandler, Platform, Pressable, StyleSheet, Switch, Text, View } from "react-native";

import { BottomSheet } from "@/src/components/ui/BottomSheet";
import { NotConnectedOverlay } from "@/src/components/ui/NotConnectedOverlay";
import { usePaneLayout } from "@/src/components/ui/responsive";
import { DeviceStatusBar } from "@/src/components/ui/io/ioShared";
import {
  Button, buttonTextColor, Card, colors, Divider, FormRow, PageHeader, RadioRow, radii, Screen, SectionHeader,
  SegmentedControl, spacing, StatusPill, type,
} from "@/src/components/ui/kit";
import { CameraLiveFeed } from "@/src/components/vision/CameraLiveFeed";
import { useConnected, useSelectedRobot } from "@/src/providers/RobotProvider";
import {
  describeRxStats, type FrameAspect, lensLabel, providerEngine, type ProviderConfig, type ProviderEngineState,
  RES_OPTIONS, RES_TIERS, type ResTier, RTC_BITRATE_OPTIONS, RTC_FPS_OPTIONS, sortLenses, type StreamOrientation,
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

// ── Camera settings ───────────────────────────────────────────────────────────

/** One-tap quality presets: a resolution + frame rate + bitrate from the engine's own option lists
 *  (RES_TIERS / RTC_FPS_OPTIONS / RTC_BITRATE_OPTIONS). Balanced is the engine's default config. */
type QualityPreset = "low" | "balanced" | "high";
const QUALITY_PRESETS: { label: string; value: QualityPreset; resTier: ResTier; rtcFps: string; bitrate: number }[] = [
  { label: "Low",      value: "low",      resTier: "low",  rtcFps: "15", bitrate: 6_000_000 },
  { label: "Balanced", value: "balanced", resTier: "med",  rtcFps: "30", bitrate: 12_000_000 },
  { label: "High",     value: "high",     resTier: "high", rtcFps: "30", bitrate: 12_000_000 },
];
const presetOf = (c: ProviderConfig): QualityPreset | "custom" =>
  QUALITY_PRESETS.find(p => p.resTier === c.resTier && p.rtcFps === c.rtcFps && p.bitrate === c.bitrate)?.value ?? "custom";
const qualitySummary = (c: ProviderConfig) =>
  `${RES_TIERS[c.resTier].height}p · ${c.rtcFps} fps · ${+(c.bitrate / 1e6).toFixed(1)} Mbps`;

const RES_SHORT = RES_OPTIONS.map(o => ({ label: `${RES_TIERS[o.value].height}p`, value: o.value }));
const ASPECT_SHORT: { label: string; value: FrameAspect }[] = [{ label: "4:3", value: "4:3" }, { label: "16:9", value: "16:9" }];
const ORIENT_LABEL: Record<StreamOrientation, string> = {
  "portrait": "Portrait", "landscape": "Landscape",
  "portrait-flipped": "Portrait · flipped", "landscape-flipped": "Landscape · flipped",
};

/** Tallest the inline preview gets, so a portrait stream doesn't fill the whole screen. */
const PREVIEW_MAX_H = 420;

// The "More settings" disclosure remembers whether it was left open (per app install).
const MORE_KEY = "phoneProvider.moreSettingsOpen";
let moreOpenCache: boolean | null = null;

/** Compact settings row: label left, control right, an optional one-line hint underneath. */
function CompactRow({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <View style={styles.compactRow}>
      <View style={styles.compactTop}>
        <Text style={styles.compactLabel} numberOfLines={1}>{label}</Text>
        <View style={styles.compactControl}>{children}</View>
      </View>
      {!!hint && <Text style={type.caption} numberOfLines={1}>{hint}</Text>}
    </View>
  );
}

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
  // (While this phone streams, the engine keeps the screen on and guards against NFC tags.)
  useEffect(() => providerEngine.subscribe(setSt), []);

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

  // "More settings" disclosure (remembered) and the lens picker sheet.
  const [moreOpen, setMoreOpen] = useState(moreOpenCache ?? false);
  useEffect(() => {
    if (moreOpenCache !== null) return;
    AsyncStorage.getItem(MORE_KEY).then(v => { moreOpenCache = v === "1"; setMoreOpen(moreOpenCache); }).catch(() => {});
  }, []);
  const toggleMore = useCallback(() => {
    setMoreOpen(o => {
      moreOpenCache = !o;
      AsyncStorage.setItem(MORE_KEY, moreOpenCache ? "1" : "0").catch(() => {});
      return !o;
    });
  }, []);
  const [lensSheet, setLensSheet] = useState(false);
  // Desktop: preview left, settings right. Narrower windows stack them.
  const desktop = usePaneLayout() === "desktop";

  // ── Render ────────────────────────────────────────────────────────────────
  const crumbs = [{ label: "I/O", href: "/io" }, { label: name }];
  const lenses = st.lenses;
  const lensOptions = [
    { label: "Auto", hint: "The phone's main back camera", value: "" },
    ...sortLenses(lenses).map((l, i) => ({ label: lensLabel(l, i, lenses), hint: undefined as string | undefined, value: l.id })),
  ];
  const lensCurrent = lensOptions.find(o => o.value === (cfg.lensId ?? "")) ?? lensOptions[0];
  const preset = presetOf(cfg);
  const qualityOptions: { label: string; value: QualityPreset | "custom" }[] = preset === "custom"
    ? [...QUALITY_PRESETS, { label: "Custom", value: "custom" }]
    : QUALITY_PRESETS;
  const setPreset = (v: QualityPreset | "custom") => {
    const p = QUALITY_PRESETS.find(q => q.value === v);
    if (p) providerEngine.updateConfig({ resTier: p.resTier, rtcFps: p.rtcFps, bitrate: p.bitrate });
  };

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
            {/* With no phone linked yet, assigning is the first thing to do, so it leads the page. */}
            {!st.assignedHere && !st.assignedPhoneId && (
            <Card style={styles.stack}>
              <Text style={type.body}>No phone is linked to “{name}” yet.</Text>
              <Text style={type.caption}>
                Assigning links <Text style={styles.bold}>this</Text> phone as the camera & sensor source for “{name}”.
                It stays linked to this device until you change it — other phones won&apos;t take it over.
              </Text>
              <Button label="Assign this phone" onPress={onAssign} />
            </Card>
            )}

            <SectionHeader title="Camera" />
            <Card style={styles.stack}>
              <FormRow label="Stream camera" hint="Sends the linked phone's camera to the controller." inline>
                <Switch value={st.camOn} onValueChange={onCamToggle} trackColor={{ false: colors.border, true: colors.success }} />
              </FormRow>
              {st.camOn && (
                <View style={desktop ? styles.camSplit : styles.stack}>
                  {/* Preview first (left on desktop), so every change shows up right here. */}
                  <View style={desktop ? styles.camPreviewCol : styles.stack}>
                  <View style={[styles.previewWrap, { aspectRatio: previewAspect, maxWidth: PREVIEW_MAX_H * previewAspect }]}>
                    {st.camId && previewLive
                      ? <CameraLiveFeed cameraId={st.camId} aspectRatio={previewAspect} />
                      : <View style={[styles.preview, styles.previewEmpty]}><Text style={type.caption}>{st.camId ? "Preview paused" : "Connecting…"}</Text></View>}
                    <Pressable
                      style={styles.rotatePill}
                      onPress={() => providerEngine.rotate()}
                      accessibilityRole="button"
                      accessibilityLabel={`Rotate stream a quarter turn (now ${ORIENT_LABEL[cfg.orientation]})`}
                      hitSlop={6}
                    >
                      <RotateCw size={14} color={colors.onSurfaceDark} />
                      <Text style={styles.rotateText}>{ORIENT_LABEL[cfg.orientation]}</Text>
                    </Pressable>
                  </View>
                  <Text style={type.caption}>
                    {!st.assignedHere
                      ? `Streamed by ${st.assignedPhoneName || "the linked phone"} · as the controller sees it.`
                      : st.rtcStats
                        ? `Sending ${st.rtcStats.fps} fps${st.rtcStats.limit ? ` (held back by ${st.rtcStats.limit})` : ""} · ${st.rtcStats.w}×${st.rtcStats.h} · ${st.rtcStats.kbps} kb/s · as the controller sees it.`
                        : `WebRTC ${st.rtcState || "connecting…"}`}
                  </Text>
                  {rx && streaming && (
                    <Text style={[type.caption, rx.bad && styles.rxBad]}>{rx.text}</Text>
                  )}
                  </View>
                  {!desktop && <Divider />}
                  <View style={desktop ? styles.camSettingsCol : styles.stack}>
                  <FormRow label="Quality" hint={preset === "custom" ? `Custom: ${qualitySummary(cfg)}` : qualitySummary(cfg)}>
                    <SegmentedControl options={qualityOptions} value={preset} onChange={setPreset} style={styles.qualitySeg} />
                  </FormRow>
                  {lenses.length > 1 && (
                    <>
                      <Divider />
                      <Pressable
                        style={styles.pickerRow}
                        onPress={() => setLensSheet(true)}
                        accessibilityRole="button"
                        accessibilityLabel={`Lens: ${lensCurrent.label}`}
                      >
                        <Text style={styles.compactLabel}>Lens</Text>
                        <Text style={styles.pickerValue} numberOfLines={1}>{lensCurrent.label}</Text>
                        <ChevronDown size={16} color={colors.textMuted} />
                      </Pressable>
                      <BottomSheet visible={lensSheet} onClose={() => setLensSheet(false)} title="Lens">
                        {lensOptions.map((o, i) => (
                          <View key={o.value || "auto"}>
                            {i > 0 && <Divider />}
                            <RadioRow
                              title={o.label}
                              subtitle={o.hint}
                              selected={o.value === lensCurrent.value}
                              onPress={() => { providerEngine.updateConfig({ lensId: o.value || null }); setLensSheet(false); }}
                            />
                          </View>
                        ))}
                      </BottomSheet>
                    </>
                  )}
                  <Divider />
                  <Pressable
                    style={styles.pickerRow}
                    onPress={toggleMore}
                    accessibilityRole="button"
                    accessibilityState={{ expanded: moreOpen }}
                  >
                    <Text style={styles.compactLabel}>More settings</Text>
                    {moreOpen
                      ? <ChevronDown size={16} color={colors.textMuted} />
                      : <ChevronRight size={16} color={colors.textMuted} />}
                  </Pressable>
                  {moreOpen && (
                    <View style={styles.moreBody}>
                      <CompactRow label="Frame shape" hint="4:3 is the full view; 16:9 crops top and bottom.">
                        <SegmentedControl size="sm" options={ASPECT_SHORT} value={cfg.aspect} onChange={v => providerEngine.updateConfig({ aspect: v })} />
                      </CompactRow>
                      <CompactRow label="Resolution">
                        <SegmentedControl size="sm" options={RES_SHORT} value={cfg.resTier} onChange={v => providerEngine.updateConfig({ resTier: v })} />
                      </CompactRow>
                      <CompactRow label="Frame rate">
                        <SegmentedControl size="sm" options={RTC_FPS_OPTIONS} value={cfg.rtcFps} onChange={v => providerEngine.updateConfig({ rtcFps: v })} />
                      </CompactRow>
                      <CompactRow label="Bitrate (Mbps)" hint="Applies live. Higher is cleaner; 12 suits 1080p.">
                        <SegmentedControl size="sm" options={RTC_BITRATE_OPTIONS} value={String(cfg.bitrate)} onChange={v => providerEngine.updateConfig({ bitrate: Number(v) })} />
                      </CompactRow>
                    </View>
                  )}
                  </View>
                </View>
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

            {/* Another phone already provides this device: taking it over is rare, so it sits at the end. */}
            {!st.assignedHere && !!st.assignedPhoneId && <>
            <SectionHeader title="Linked phone" />
            <Card style={styles.stack}>
              <Text style={type.body}>Provided by {st.assignedPhoneName || "another phone"}.</Text>
              <Text style={type.caption}>
                Assigning moves the camera & sensor source for “{name}” to <Text style={styles.bold}>this</Text> phone.
              </Text>
              <Button label="Assign this phone instead" variant="secondary" onPress={onAssign} />
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
  previewWrap: { width: "100%", alignSelf: "center" },
  preview: {
    width: "100%",
    height: "100%",
    borderRadius: radii.lg,
    overflow: "hidden",
    backgroundColor: "#000",
  },
  previewEmpty: { alignItems: "center", justifyContent: "center" },
  // Rotate + current orientation, floating on the preview's top-right corner.
  rotatePill: {
    position: "absolute", top: spacing.sm, right: spacing.sm,
    flexDirection: "row", alignItems: "center", gap: 6,
    minHeight: 32, paddingHorizontal: spacing.md - 2, borderRadius: radii.pill,
    backgroundColor: colors.overlayDark,
  },
  rotateText: { fontSize: 12, fontWeight: "700", color: colors.onSurfaceDark },
  // Label-left / value-right rows (lens picker, disclosure) and the compact advanced rows.
  pickerRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, minHeight: 40 },
  pickerValue: { flex: 1, textAlign: "right", fontSize: 14, fontWeight: "600", color: colors.text },
  compactLabel: { flex: 1, fontSize: 13, fontWeight: "600", color: colors.textSecondary },
  compactRow: { gap: 2 },
  compactTop: { flexDirection: "row", alignItems: "center", gap: spacing.md, minHeight: 40 },
  compactControl: { width: 208 },
  moreBody: { gap: spacing.md },
  qualitySeg: { maxWidth: 480 },
  camSplit: { flexDirection: "row", alignItems: "flex-start", gap: spacing.xl },
  camPreviewCol: { flex: 1, minWidth: 0, gap: spacing.md },
  camSettingsCol: { width: 380, gap: spacing.md },
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
