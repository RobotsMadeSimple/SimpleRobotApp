import { useIsWide, useWideContent } from "@/src/components/ui/responsive";
import { robotClient } from "@/src/services/RobotConnectService";
import { CameraSourceType, CameraState } from "@/src/models/robotModels";
import { NetworkSourceFields } from "@/src/components/ui/camera/NetworkSourceFields";
import { SofiaSourceFields } from "@/src/components/ui/camera/SofiaSourceFields";
import {
  cameraSourceParams, cameraSourceSummary, cameraSourceTag, cameraUrlProblem,
  EMPTY_NETWORK_SOURCE, EMPTY_SOFIA_SOURCE, isNetworkCamera, isSofiaCamera, NetworkSource, networkSourceOf,
  SofiaSource, sofiaSourceOf, sofiaSourceProblem, SOURCE_OPTIONS,
} from "@/src/components/ui/camera/cameraSource";
import { router, useLocalSearchParams } from "expo-router";
import { VisionCanvas } from "@/src/vision/VisionCanvas";
import { CameraLiveFeed, makeCameraHtml } from "@/src/components/vision/CameraLiveFeed";
import { CameraCalibrationControls } from "@/src/components/ui/calibration/CameraCalibrationControls";
import * as ScreenOrientation from "expo-screen-orientation";
import {
  Camera,
  Check,
  ChevronDown,
  X,
} from "lucide-react-native";
import React, { useEffect, useRef, useState } from "react";
import {
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import {
  Button,
  Card,
  colors,
  Divider,
  FormRow,
  InfoTip,
  Input,
  PageHeader,
  radii,
  SegmentedControl,
  Screen,
  SectionHeader,
  spacing,
  StatusPill,
  type,
} from "@/src/components/ui/kit";

// ── CameraFullscreenModal ─────────────────────────────────────────────────────
// Unchanged orientation/feed logic; only the close affordance is restyled.

function CameraFullscreenModal({ camera, onClose }: { camera: CameraState; onClose: () => void }) {
  useEffect(() => {
    ScreenOrientation.unlockAsync().catch(() => {});
    return () => { ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => {}); };
  }, []);

  const wsUrl = robotClient.cameraWsUrl(camera.id);
  if (!wsUrl) return null;

  return (
    <Modal visible animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={{ flex: 1, backgroundColor: '#000' }}>
        <VisionCanvas
          html={makeCameraHtml(wsUrl, true)}
          style={{ flex: 1 }}
        />
        <TouchableOpacity style={styles.fullscreenClose} onPress={onClose} activeOpacity={0.8}>
          <X size={18} color={colors.onAccent} />
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

// ── ResolutionSheet ───────────────────────────────────────────────────────────

type Resolution = { width: number; height: number };

function ResolutionSheet({
  visible,
  options,
  selectedWidth,
  selectedHeight,
  isCustom,
  onSelect,
  onSelectCustom,
  onClose,
}: {
  visible: boolean;
  options: Resolution[];
  selectedWidth: string;
  selectedHeight: string;
  isCustom: boolean;
  onSelect: (r: Resolution) => void;
  onSelectCustom: () => void;
  onClose: () => void;
}) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <TouchableOpacity style={styles.sheetBackdrop} activeOpacity={1} onPress={onClose} />
      <View style={styles.sheet}>
        <View style={styles.sheetHandle} />
        <Text style={styles.sheetTitle}>Select Resolution</Text>
        <ScrollView bounces={false} showsVerticalScrollIndicator={false}>
          {options.map((r, i) => {
            const sel = !isCustom && String(r.width) === selectedWidth && String(r.height) === selectedHeight;
            return (
              <React.Fragment key={`${r.width}x${r.height}`}>
                <TouchableOpacity
                  style={styles.sheetRow}
                  onPress={() => { onSelect(r); onClose(); }}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.sheetRowText, sel && styles.sheetRowTextSelected]}>
                    {r.width} × {r.height}
                  </Text>
                  {sel && <Check size={16} color={colors.accent} />}
                </TouchableOpacity>
                <Divider />
              </React.Fragment>
            );
          })}
          <TouchableOpacity
            style={styles.sheetRow}
            onPress={() => { onSelectCustom(); onClose(); }}
            activeOpacity={0.7}
          >
            <Text style={[styles.sheetRowText, isCustom && styles.sheetRowTextSelected]}>
              Custom
            </Text>
            {isCustom && <Check size={16} color={colors.accent} />}
          </TouchableOpacity>
        </ScrollView>
      </View>
    </Modal>
  );
}

// ── CameraConfigFields ────────────────────────────────────────────────────────

function CameraConfigFields({
  name, setName,
  deviceIndex, setDeviceIndex,
  width, setWidth,
  height, setHeight,
  targetFps, setTargetFps,
  savedResolutions,
  source, setSource,
  network, setNetwork,
  sofia, setSofia,
}: {
  name: string;        setName: (v: string) => void;
  deviceIndex: string; setDeviceIndex: (v: string) => void;
  width: string;       setWidth: (v: string) => void;
  height: string;      setHeight: (v: string) => void;
  targetFps: string;   setTargetFps: (v: string) => void;
  savedResolutions:    Resolution[];
  source:  CameraSourceType; setSource:  (v: CameraSourceType) => void;
  network: NetworkSource;    setNetwork: (v: NetworkSource) => void;
  sofia:   SofiaSource;      setSofia:   (v: SofiaSource) => void;
}) {
  const [sheetOpen,      setSheetOpen]      = useState(false);
  const [customSelected, setCustomSelected] = useState(false);

  const options       = savedResolutions;
  const hasOptions    = options.length > 0;
  const matchedOption = options.find(r => String(r.width) === width && String(r.height) === height);
  const isCustom      = customSelected || !matchedOption;

  return (
    // gap, not a bare View: SectionHeader relies on the parent's flex gap for
    // its bottom spacing (Screen's gap can't reach inside this wrapper).
    <View style={{ gap: spacing.md }}>
      <SectionHeader
        title="Configuration"
        right={
          <InfoTip text="A USB camera is opened by Device Index; a network camera by its RTSP or HTTP stream URL. Device Index selects which USB camera the controller opens, in the same order the OS enumerates them (0, 1, 2…). Resolution and Target FPS should match a mode the camera actually supports — an unsupported combination can leave the feed blank." />
        }
      />
      <Card>
        <FormRow label="Name">
          <Input
            value={name}
            onChangeText={setName}
            placeholder="Camera"
            returnKeyType="done"
          />
        </FormRow>

        <FormRow label="Source" style={styles.fieldGap}>
          <SegmentedControl options={SOURCE_OPTIONS} value={source} onChange={setSource} />
        </FormRow>

        {source === "network" ? (
          <NetworkSourceFields value={network} onChange={setNetwork} rowStyle={styles.fieldGap} />
        ) : source === "sofia" ? (
          <SofiaSourceFields value={sofia} onChange={setSofia} rowStyle={styles.fieldGap} />
        ) : (
          <>
            <FormRow label="Device Index" style={styles.fieldGap}>
              <Input
                value={deviceIndex}
                onChangeText={setDeviceIndex}
                placeholder="0"
                keyboardType="numeric"
                returnKeyType="done"
              />
            </FormRow>

            {/* Resolution row — tappable when options exist */}
            <FormRow label="Resolution" style={styles.fieldGap}>
              {hasOptions ? (
                <TouchableOpacity
                  style={styles.dropdownRow}
                  onPress={() => setSheetOpen(true)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.dropdownValue}>
                    {isCustom ? "Custom" : `${matchedOption!.width} × ${matchedOption!.height}`}
                  </Text>
                  <ChevronDown size={16} color={colors.textMuted} style={{ marginLeft: 6 }} />
                </TouchableOpacity>
              ) : (
                <View style={styles.resolutionRow}>
                  <Input
                    style={styles.resolutionInput}
                    value={width}
                    onChangeText={setWidth}
                    placeholder="640"
                    keyboardType="numeric"
                    returnKeyType="done"
                    textAlign="center"
                  />
                  <Text style={styles.resolutionSep}>×</Text>
                  <Input
                    style={styles.resolutionInput}
                    value={height}
                    onChangeText={setHeight}
                    placeholder="480"
                    keyboardType="numeric"
                    returnKeyType="done"
                    textAlign="center"
                  />
                </View>
              )}
            </FormRow>

            {/* Custom W×H inputs — sub-row visually attached to Resolution row above */}
            {hasOptions && isCustom && (
              <FormRow label="W × H" style={styles.fieldGap}>
                <View style={styles.resolutionRow}>
                  <Input
                    style={styles.resolutionInput}
                    value={width}
                    onChangeText={setWidth}
                    placeholder="640"
                    keyboardType="numeric"
                    returnKeyType="done"
                    textAlign="center"
                  />
                  <Text style={styles.resolutionSep}>×</Text>
                  <Input
                    style={styles.resolutionInput}
                    value={height}
                    onChangeText={setHeight}
                    placeholder="480"
                    keyboardType="numeric"
                    returnKeyType="done"
                    textAlign="center"
                  />
                </View>
              </FormRow>
            )}
          </>
        )}

        <FormRow label="Target FPS" style={styles.fieldGap}>
          <Input
            value={targetFps}
            onChangeText={setTargetFps}
            placeholder="15"
            keyboardType="numeric"
            returnKeyType="done"
          />
        </FormRow>
      </Card>

      <ResolutionSheet
        visible={sheetOpen}
        options={options}
        selectedWidth={width}
        selectedHeight={height}
        isCustom={isCustom}
        onSelect={(r) => { setWidth(String(r.width)); setHeight(String(r.height)); setCustomSelected(false); }}
        onSelectCustom={() => setCustomSelected(true)}
        onClose={() => setSheetOpen(false)}
      />
    </View>
  );
}

// ── CameraDetailPage ──────────────────────────────────────────────────────────
// Two-pane on wide screens (settings left, live feed right) — kept as a manual
// useIsWide/useWideContent screen per the kit README (Screen only supports a
// single scrolling column).

function CameraDetailPage({ camera }: { camera: CameraState }) {
  const wideContent = useWideContent();
  const isWide = useIsWide();
  const [fullscreen,  setFullscreen]  = useState(false);
  const [name,        setName]        = useState(camera.name);
  const [deviceIndex, setDeviceIndex] = useState(String(camera.deviceIndex));
  const [width,       setWidth]       = useState(String(camera.width));
  const [height,      setHeight]      = useState(String(camera.height));
  const [targetFps,   setTargetFps]   = useState(String(camera.targetFps));
  const [source,      setSource]      = useState<CameraSourceType>(
    isSofiaCamera(camera) ? "sofia" : isNetworkCamera(camera) ? "network" : "usb"
  );
  const [network,     setNetwork]     = useState(() => networkSourceOf(camera));
  const [sofia,       setSofia]       = useState(() => sofiaSourceOf(camera));
  const [saving,      setSaving]      = useState(false);
  const sourceProblem =
    source === "network" ? cameraUrlProblem(network.url) :
    source === "sofia"   ? sofiaSourceProblem(sofia) :
    null;
  const tag = cameraSourceTag(camera);

  const save = async () => {
    setSaving(true);
    await robotClient.setCameraConfig({
      id:          camera.id,
      name:        name.trim(),
      deviceIndex: parseInt(deviceIndex) || 0,
      enabled:     true,
      width:       parseInt(width)     || 640,
      height:      parseInt(height)    || 480,
      targetFps:   parseInt(targetFps) || 15,
      ...cameraSourceParams(source, network, sofia),
    });
    await robotClient.getCameras().catch(() => {});
    setSaving(false);
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {fullscreen && Platform.OS !== 'web' && (
        <CameraFullscreenModal camera={camera} onClose={() => setFullscreen(false)} />
      )}
      <PageHeader
        title={camera.name}
        subtitle={cameraSourceSummary(camera)}
        right={
          <View style={styles.headerRight}>
            {tag && <StatusPill label={tag} tone="accent" />}
            <CameraCalibrationControls camera={camera} layout="inline" />
            <StatusPill
              label={camera.connected ? "Connected" : "Offline"}
              tone={camera.connected ? "success" : "danger"}
              dot
            />
          </View>
        }
      />
      {(() => {
        const feed = camera.connected
          ? <CameraLiveFeed cameraId={camera.id} onTap={() => setFullscreen(true)} />
          : (
            <View style={styles.feedPlaceholder}>
              <Camera size={28} color="#4b5563" />
              <Text style={styles.feedPlaceholderText}>Offline</Text>
            </View>
          );
        const feedBlock = (
          <View style={styles.feedBlock}>
            {feed}
          </View>
        );
        const editables = (
          <>
            <CameraConfigFields
              name={name}               setName={setName}
              deviceIndex={deviceIndex} setDeviceIndex={setDeviceIndex}
              width={width}             setWidth={setWidth}
              height={height}           setHeight={setHeight}
              targetFps={targetFps}     setTargetFps={setTargetFps}
              savedResolutions={camera.supportedResolutions ?? []}
              source={source}           setSource={setSource}
              network={network}         setNetwork={setNetwork}
              sofia={sofia}             setSofia={setSofia}
            />
            <Button
              label={saving ? "Saving…" : "Save"}
              loading={saving}
              disabled={!!sourceProblem}
              onPress={save}
            />
          </>
        );

        // Wide: the editable settings fill a wider left column, the live frame a column
        // on the right. Narrow: everything stacked in one scroll as before.
        if (isWide) {
          return (
            <View style={styles.camWideRow}>
              <ScrollView
                style={{ flex: 1 }}
                contentContainerStyle={styles.camWideScrollContent}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
              >
                {editables}
              </ScrollView>
              <View style={styles.camFeedPane}>{feedBlock}</View>
            </View>
          );
        }
        return (
          <ScrollView
            contentContainerStyle={[styles.scrollContent, wideContent]}
            showsVerticalScrollIndicator={false}
          >
            {feedBlock}
            {editables}
          </ScrollView>
        );
      })()}
    </View>
  );
}

// ── NewCameraPage ─────────────────────────────────────────────────────────────

function NewCameraPage() {
  const [name,        setName]        = useState("Camera");
  const [deviceIndex, setDeviceIndex] = useState("0");
  const [width,       setWidth]       = useState("640");
  const [height,      setHeight]      = useState("480");
  const [targetFps,   setTargetFps]   = useState("15");
  const [source,      setSource]      = useState<CameraSourceType>("usb");
  const [network,     setNetwork]     = useState<NetworkSource>(EMPTY_NETWORK_SOURCE);
  const [sofia,       setSofia]       = useState<SofiaSource>(EMPTY_SOFIA_SOURCE);
  const [saving,      setSaving]      = useState(false);
  const sourceProblem =
    source === "network" ? cameraUrlProblem(network.url) :
    source === "sofia"   ? sofiaSourceProblem(sofia) :
    null;

  const add = async () => {
    setSaving(true);
    try {
      const trimmedName  = name.trim();
      const idx          = parseInt(deviceIndex) || 0;

      // AddCamera's ack carries no payload (see CameraCommands.cs — it returns
      // void), so the new camera's id can't be read off the response. Snapshot
      // the ids we have *before* submitting, then diff against the refreshed
      // list to find the one that just appeared.
      let before: CameraState[] = [];
      robotClient.onCameras(cams => { before = cams; })();

      await robotClient.addCamera({
        name:        trimmedName,
        deviceIndex: idx,
        enabled:     true,
        width:       parseInt(width)     || 640,
        height:      parseInt(height)    || 480,
        targetFps:   parseInt(targetFps) || 15,
        ...cameraSourceParams(source, network, sofia),
      });
      await robotClient.getCameras().catch(() => {});

      let after: CameraState[] = [];
      robotClient.onCameras(cams => { after = cams; })();

      const beforeIds = new Set(before.map(c => c.id));
      const added     = after.filter(c => !beforeIds.has(c.id));
      const newCamera =
        added.find(c => c.name === trimmedName && c.deviceIndex === idx) ??
        added[0] ??
        after.find(c => c.name === trimmedName && c.deviceIndex === idx);

      if (newCamera) {
        // Land in the editor, not the form — Back from there shouldn't return
        // here.
        router.replace({ pathname: "/(tabs)/io/cameras", params: { cameraId: newCamera.id } });
      } else {
        // Controller was slow to reflect the add (or it genuinely failed) —
        // never strand the user on a spinner.
        router.back();
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <PageHeader
        title="New Camera"
        subtitle={source === "network" ? "Network camera" : source === "sofia" ? "Sofia / XMeye camera" : "USB camera"}
      />
      <Screen>
        <CameraConfigFields
          name={name}               setName={setName}
          deviceIndex={deviceIndex} setDeviceIndex={setDeviceIndex}
          width={width}             setWidth={setWidth}
          height={height}           setHeight={setHeight}
          targetFps={targetFps}     setTargetFps={setTargetFps}
          savedResolutions={[]}
          source={source}           setSource={setSource}
          network={network}         setNetwork={setNetwork}
          sofia={sofia}             setSofia={setSofia}
        />

        <Button
          label={saving ? "Adding…" : "Add Camera"}
          loading={saving}
          disabled={!!sourceProblem}
          onPress={add}
        />
      </Screen>
    </View>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function CamerasPage() {
  const { cameraId, addNew } = useLocalSearchParams<{ cameraId?: string; addNew?: string }>();
  const [cameras, setCameras] = useState<CameraState[]>([]);

  useEffect(() => {
    robotClient.getCameras().catch(() => {});
    const unsub = robotClient.onCameras(cams => setCameras(cams));
    const poll  = setInterval(() => robotClient.getCameras().catch(() => {}), 3000);
    return () => { unsub(); clearInterval(poll); };
  }, []);

  if (cameraId) {
    const camera = cameras.find(c => c.id === cameraId) ?? null;
    if (!camera) {
      return (
        <View style={{ flex: 1, backgroundColor: colors.background }}>
          <PageHeader title="Camera" subtitle="Loading…" />
        </View>
      );
    }
    return <CameraDetailPage camera={camera} />;
  }

  return <NewCameraPage />;
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  scrollContent: { paddingTop: spacing.lg + 8, paddingBottom: spacing.xxl + 8, paddingHorizontal: spacing.lg, gap: spacing.xl },
  fieldGap: { marginTop: spacing.md + 2 },
  headerRight: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end", gap: spacing.sm },

  dropdownRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  dropdownValue: { fontSize: 15, color: colors.textSecondary },

  resolutionRow: { flexDirection: "row", alignItems: "center", gap: spacing.xs + 2 },
  resolutionInput: { flex: 0, width: 52 },
  resolutionSep: { fontSize: 14, color: colors.textMuted },

  sheetBackdrop: {
    flex: 1,
    backgroundColor: colors.overlay,
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radii.md + 2,
    borderTopRightRadius: radii.md + 2,
    paddingBottom: spacing.xl,
    maxHeight: "60%",
  },
  sheetHandle: {
    alignSelf: "center",
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.borderStrong,
    marginTop: spacing.sm + 2,
    marginBottom: spacing.xs,
  },
  sheetTitle: {
    ...type.sectionLabel,
    textAlign: "center",
    paddingVertical: spacing.sm + 2,
  },
  sheetRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.xl - 4,
    paddingVertical: spacing.md + 2,
    backgroundColor: colors.surface,
  },
  sheetRowText: { fontSize: 16, color: colors.text, flex: 1 },
  sheetRowTextSelected: { color: colors.accent, fontWeight: "600" },

  cameraFeed: {
    width: "100%",
    aspectRatio: 4 / 3,
    backgroundColor: "#000",
    borderRadius: radii.lg,
    overflow: "hidden",
  },
  feedPlaceholder: {
    width: "100%",
    aspectRatio: 4 / 3,
    backgroundColor: colors.text,
    justifyContent: "center",
    alignItems: "center",
    gap: spacing.sm,
    borderRadius: radii.lg,
    overflow: "hidden",
  },
  feedPlaceholderText: { fontSize: 13, color: colors.textMuted },
  feedBlock: { gap: spacing.md },

  // Wide (desktop) camera edit layout: frame left, settings right.
  camWideRow: { flex: 1, flexDirection: "row" },
  camWideScrollContent: { paddingTop: spacing.lg + 4, paddingBottom: spacing.xxl, gap: spacing.xl, paddingHorizontal: spacing.lg },
  camFeedPane: {
    width: "48%", minWidth: 380, maxWidth: 820,
    padding: spacing.lg,
    borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: colors.border,
  },

  fullscreenClose: {
    position: "absolute",
    top: 48,
    right: 16,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "center",
    alignItems: "center",
  },
});
