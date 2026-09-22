import { getSelectedRobot, setSelectedRobot, subscribeRobot } from "@/src/connections/robotState";
import { useRobotStatus } from "@/src/providers/RobotProvider";
import { robotClient } from "@/src/services/RobotConnectService";
import { robotDiscovery } from "@/src/services/RobotDiscoveryService";
import { router } from "expo-router";
import {
  Activity,
  CheckCircle2,
  Cpu,
  Download,
  Gauge,
  Hash,
  Network,
  Pencil,
  RefreshCw,
  Server,
  Tag,
  Wifi,
  WifiOff,
  Zap,
} from "lucide-react-native";

import {
  accents,
  Button,
  Card,
  colors,
  Divider,
  Input,
  ListRow,
  radii,
  Screen,
  SectionHeader,
  shadows,
  spacing,
  StatusPill,
  type,
} from "@/src/components/ui/kit";
import { SubPageHeader } from "@/src/components/ui/SubPageHeader";
import { useEffect, useRef, useState } from "react";
import { Picker } from "@react-native-picker/picker";
import { ActivityIndicator, Animated, Image, Modal, Platform, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import Constants from "expo-constants";
import * as WebBrowser from "expo-web-browser";

const CONTROLLER_REPO = "RobotsMadeSimple/SimpleRobotController";
const APP_REPO        = "RobotsMadeSimple/SimpleRobotApp";
const APP_APK_ASSET   = "SimpleRobotApp.apk";

const robotImages: Record<string, any> = {
  ASTRO: require("@/assets/images/ASTRO.png"),
};
const defaultRobotImage = require("@/assets/images/no-robot.png");

// ── Small building blocks ─────────────────────────────────────────────────────

/** Label/value row — a flat ListRow used inside a Card, no chevron/onPress. */
function Row({
  icon,
  tileBg,
  label,
  value,
}: {
  icon: React.ReactNode;
  tileBg?: string;
  label: string;
  value: string | number | React.ReactNode;
}) {
  return (
    <ListRow
      card={false}
      icon={icon}
      iconColor={tileBg}
      title={label}
      right={
        typeof value === "string" || typeof value === "number" ? (
          <Text style={styles.rowValue} numberOfLines={1}>{value}</Text>
        ) : (
          value
        )
      }
    />
  );
}

/** Pressable action row (icon tile + accent label), e.g. "Check for Updates". */
function ActionRow({
  icon,
  label,
  onPress,
  disabled,
}: {
  icon: React.ReactNode;
  label: string;
  onPress?: () => void;
  disabled?: boolean;
}) {
  return (
    <ListRow
      card={false}
      icon={icon}
      iconColor={colors.background}
      title={label}
      titleColor={colors.accent}
      chevron={false}
      onPress={disabled ? undefined : onPress}
    />
  );
}

function StatusDot({ ok, label }: { ok: boolean; label: string }) {
  return (
    <View style={styles.statusDot}>
      <View style={[styles.dot, { backgroundColor: ok ? colors.success : colors.danger }]} />
      <Text style={[styles.dotLabel, { color: ok ? colors.success : colors.danger }]}>{label}</Text>
    </View>
  );
}

function ProgressBar({ progress }: { progress: number }) {
  return (
    <View style={styles.progressBarTrack}>
      <View style={[styles.progressBarFill, { width: `${Math.round(progress * 100)}%` as any }]} />
    </View>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function AboutRobot() {
  const [robot, setRobot] = useState(getSelectedRobot());
  const status = useRobotStatus();

  useEffect(() => subscribeRobot(setRobot), []);

  const [editVisible,   setEditVisible]   = useState(false);
  const [editName,      setEditName]      = useState("");
  const [editType,      setEditType]      = useState("");
  const [saving,        setSaving]        = useState(false);

  const [restartVisible, setRestartVisible] = useState(false);
  const [restarting,     setRestarting]     = useState(false);

  // ── Toast ──────────────────────────────────────────────────────────────────
  const [toast, setToast] = useState<{ message: string; error: boolean } | null>(null);
  const toastAnim  = useRef(new Animated.Value(0)).current;
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function showToast(message: string, error = false) {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ message, error });
    toastAnim.setValue(0);
    Animated.timing(toastAnim, { toValue: 1, duration: 200, useNativeDriver: true }).start();
    toastTimer.current = setTimeout(() => {
      Animated.timing(toastAnim, { toValue: 0, duration: 300, useNativeDriver: true })
        .start(() => setToast(null));
    }, 3500);
  }

  // ── Controller update state ────────────────────────────────────────────────
  const [checkingUpdate,  setCheckingUpdate]  = useState(false);
  const [latestVersion,   setLatestVersion]   = useState<string | null>(null);
  const [updating,        setUpdating]        = useState(false);
  const [updateDone,      setUpdateDone]      = useState(false);
  const disconnectedDuringUpdate = useRef(false);

  useEffect(() => {
    if (!updating) { disconnectedDuringUpdate.current = false; return; }
    if (!status.connected) disconnectedDuringUpdate.current = true;
    if (disconnectedDuringUpdate.current && status.connected) {
      setUpdating(false);
      setUpdateDone(true);
    }
  }, [status.connected, updating]);

  useEffect(() => {
    if (!updating) return;
    const t = setTimeout(() => setUpdating(false), 120_000);
    return () => clearTimeout(t);
  }, [updating]);

  // ── App update state ───────────────────────────────────────────────────────
  const [appLatestVersion,  setAppLatestVersion]  = useState<string | null>(null);
  const [appAssetUrl,       setAppAssetUrl]       = useState<string | null>(null);
  const [checkingAppUpdate, setCheckingAppUpdate] = useState(false);

  const appVersion = Constants.expoConfig?.version ?? "0.0.0";
  const isAndroid  = Platform.OS === "android";

  // ── Electron update state ──────────────────────────────────────────────────
  const electronAPI = typeof window !== "undefined" ? (window as any).electronAPI : null;
  const isElectron  = !!electronAPI;
  const [electronVersion,          setElectronVersion]          = useState<string | null>(null);
  const [electronLatestVersion,    setElectronLatestVersion]    = useState<string | null>(null);
  const [checkingElectronUpdate,   setCheckingElectronUpdate]   = useState(false);
  const [downloadingElectron,      setDownloadingElectron]      = useState(false);
  const [electronDownloadProgress, setElectronDownloadProgress] = useState(0);

  useEffect(() => {
    if (!isElectron) return;
    electronAPI.getVersion().then(setElectronVersion);
  }, [isElectron]);

  // ── Shared fetch ───────────────────────────────────────────────────────────

  async function fetchLatestRelease(repo: string): Promise<{ version: string; assets: { name: string; browser_download_url: string }[] } | null> {
    try {
      const res  = await fetch(`https://api.github.com/repos/${repo}/releases/latest`);
      const data = await res.json();
      const version = (data.tag_name as string ?? "").replace(/^v/, "");
      return { version, assets: data.assets ?? [] };
    } catch {
      return null;
    }
  }

  // Finds the most recent release that contains the given asset filename.
  // The Android APK build takes ~15 min while the Windows build takes ~5 min,
  // so the absolute latest release often exists before the APK is uploaded.
  async function fetchLatestReleaseWithAsset(repo: string, assetName: string): Promise<{ version: string; asset: { name: string; browser_download_url: string } } | null> {
    try {
      const res = await fetch(`https://api.github.com/repos/${repo}/releases?per_page=5`);
      const releases = await res.json();
      if (!Array.isArray(releases)) return null;
      for (const rel of releases) {
        const asset = (rel.assets ?? []).find((a: any) => a.name === assetName);
        if (asset) {
          return { version: (rel.tag_name as string ?? "").replace(/^v/, ""), asset };
        }
      }
      return null;
    } catch {
      return null;
    }
  }

  // ── Controller update ──────────────────────────────────────────────────────

  async function checkForUpdates() {
    setCheckingUpdate(true);
    setLatestVersion(null);
    const rel = await fetchLatestRelease(CONTROLLER_REPO);
    setCheckingUpdate(false);
    if (!rel) { showToast("Could not reach GitHub", true); return; }
    setLatestVersion(rel.version);
  }

  async function handleUpdate() {
    setCheckingUpdate(true);
    const rel = await fetchLatestRelease(CONTROLLER_REPO);
    setCheckingUpdate(false);
    if (!rel) { showToast("Could not reach GitHub", true); return; }
    setLatestVersion(rel.version);
    const current = status.version && status.version !== "0.0.0" ? status.version : null;
    if (current && rel.version === current) { showToast("Controller is already up to date"); return; }
    setUpdating(true);
    disconnectedDuringUpdate.current = false;
    try {
      await robotClient.updateController();
      showToast("Update started — controller will reconnect when done");
    } catch {
      setUpdating(false);
      showToast("Failed to send update command", true);
    }
  }

  // ── Android app update ─────────────────────────────────────────────────────

  async function checkAppForUpdates() {
    setCheckingAppUpdate(true);
    setAppLatestVersion(null);
    setAppAssetUrl(null);
    const rel = await fetchLatestReleaseWithAsset(APP_REPO, APP_APK_ASSET);
    setCheckingAppUpdate(false);
    if (!rel) { showToast("Could not reach GitHub", true); return; }
    setAppLatestVersion(rel.version);
    setAppAssetUrl(rel.asset.browser_download_url);
  }

  async function handleAppUpdate() {
    if (!appAssetUrl) return;
    try {
      showToast("Opening download in browser…");
      await WebBrowser.openBrowserAsync(appAssetUrl);
    } catch (err: any) {
      showToast(err?.message ?? "Update failed", true);
    }
  }

  // ── Electron app update ────────────────────────────────────────────────────

  async function checkElectronForUpdates() {
    setCheckingElectronUpdate(true);
    setElectronLatestVersion(null);
    const result = await electronAPI.checkForUpdates();
    setCheckingElectronUpdate(false);
    if (!result) { showToast("Could not reach GitHub", true); return; }
    setElectronLatestVersion(result.version);
  }

  async function handleElectronUpdate() {
    setDownloadingElectron(true);
    setElectronDownloadProgress(0);
    electronAPI.onUpdateProgress((p: number) => setElectronDownloadProgress(p));
    showToast("Downloading update…");
    try {
      await electronAPI.downloadAndInstall();
    } catch (err: any) {
      showToast(err?.message ?? "Update failed", true);
      electronAPI.offUpdateProgress();
      setDownloadingElectron(false);
    }
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  async function confirmRestart() {
    setRestarting(true);
    try { await robotClient.restartController(); }
    finally { setRestarting(false); setRestartVisible(false); }
  }

  function openEdit() {
    setEditName(robot?.robotName ?? "");
    setEditType(robot?.robotType ?? "");
    setEditVisible(true);
  }

  async function saveEdit() {
    if (!robot) return;
    setSaving(true);
    try {
      await robotClient.setRobotIdentity({
        robotName: editName !== robot.robotName ? editName : undefined,
        robotType: editType !== robot.robotType ? editType : undefined,
      });
      if (editType !== robot.robotType) {
        await robotClient.setRobotConfig({ robotType: editType });
      }
      const updated = { ...robot, robotName: editName, robotType: editType };
      setSelectedRobot(updated);
      robotDiscovery.updateRobot(robot.serialNumber, updated);
      setEditVisible(false);
    } finally { setSaving(false); }
  }

  if (!robot) {
    return (
      <View style={styles.center}>
        <Text style={styles.centerText}>No robot selected</Text>
      </View>
    );
  }

  const imageSource = robotImages[robot.robotType] ?? defaultRobotImage;
  const isHoming = status.homingState !== "WaitingForStart";
  const controllerVersion = status.version && status.version !== "0.0.0" ? `v${status.version}` : "—";
  const isLinux = status.isLinux;

  const isUpToDate    = latestVersion !== null && status.version !== "0.0.0" && latestVersion === status.version;
  const hasUpdate     = latestVersion !== null && status.version !== "0.0.0" && latestVersion !== status.version;
  const appIsUpToDate = appLatestVersion !== null && appLatestVersion === appVersion;
  const appHasUpdate  = appLatestVersion !== null && appLatestVersion !== appVersion;
  const evCurrent          = electronVersion ?? "0.0.0";
  const electronIsUpToDate = electronLatestVersion !== null && electronLatestVersion === evCurrent;
  const electronHasUpdate  = electronLatestVersion !== null && electronLatestVersion !== evCurrent;

  return (
    <View style={styles.root}>
      <SubPageHeader title="About Robot" />
      <Screen>
        {/* Hero card */}
        <Card style={styles.heroCard}>
          <View style={styles.heroImageWrapper}>
            <Image source={imageSource} style={styles.heroImage} resizeMode="contain" />
          </View>
          <Text style={styles.heroName}>{robot.robotName || "Unknown Robot"}</Text>
          {!!robot.robotType && (
            <View style={styles.typeBadge}>
              <Text style={styles.typeText}>{robot.robotType}</Text>
            </View>
          )}
        </Card>

        {/* Identity */}
        <SectionHeader
          title="Identity"
          right={
            <TouchableOpacity onPress={openEdit} style={styles.editButton}>
              <Pencil size={14} color={colors.accent} />
              <Text style={styles.editButtonText}>Edit</Text>
            </TouchableOpacity>
          }
        />
        <Card>
          <Row icon={<Tag size={18} color={colors.accent} />} tileBg={colors.accentSoft} label="Name" value={robot.robotName || "—"} />
          <Divider inset />
          <Row icon={<Cpu size={18} color={accents.purple} />} tileBg={accents.purpleSoft} label="Type" value={robot.robotType || "—"} />
          <Divider inset />
          <Row icon={<Hash size={18} color={colors.textMuted} />} tileBg={colors.surfaceMuted} label="Serial Number" value={robot.serialNumber || "—"} />
        </Card>

        {/* Network */}
        <SectionHeader title="Network" />
        <Card>
          <Row icon={<Network size={18} color={accents.cyan} />} tileBg={accents.cyanSoft} label="IP Address" value={robot.ipAddress || "—"} />
          <Divider inset />
          <Row icon={<Server size={18} color={accents.cyan} />} tileBg={accents.cyanSoft} label="Port" value={robot.port} />
          <Divider inset />
          <Row icon={<Zap size={18} color={accents.cyan} />} tileBg={accents.cyanSoft} label="Endpoint" value={robot.controlEndpoint} />
        </Card>

        {/* Live status */}
        <SectionHeader title="Live Status" />
        <Card>
          <Row
            icon={status.connected ? <Wifi size={18} color={colors.success} /> : <WifiOff size={18} color={colors.danger} />}
            tileBg={status.connected ? colors.successSoft : colors.dangerSoft}
            label="Connection"
            value={<StatusDot ok={status.connected} label={status.connected ? "Connected" : "Disconnected"} />}
          />
          <Divider inset />
          <Row
            icon={<Cpu size={18} color={status.driverConnected ? colors.success : colors.danger} />}
            tileBg={status.driverConnected ? colors.successSoft : colors.dangerSoft}
            label="Motor Driver"
            value={
              <View style={styles.multiDot}>
                <StatusDot ok={status.driverConnected} label={status.driverConnected ? "Connected" : "Disconnected"} />
                {status.driverConnected && (
                  <StatusDot ok={status.driverOk} label={status.driverOk ? "OK" : "Fault"} />
                )}
              </View>
            }
          />
          <Divider inset />
          <Row
            icon={<Activity size={18} color={status.wasHomed ? colors.success : accents.orange} />}
            tileBg={status.wasHomed ? colors.successSoft : accents.orangeSoft}
            label="Homed"
            value={<StatusDot ok={status.wasHomed} label={status.wasHomed ? "Yes" : "No"} />}
          />
          <Divider inset />
          <Row
            icon={<Gauge size={18} color={colors.textMuted} />}
            tileBg={colors.surfaceMuted}
            label="Homing State"
            value={isHoming ? status.homingState : "Idle"}
          />
        </Card>

        {/* Software */}
        <SectionHeader title="Software" />
        <Card>
          <Row
            icon={<Download size={18} color={colors.accent} />}
            tileBg={colors.accentSoft}
            label="Controller Version"
            value={
              <View style={styles.versionRight}>
                {isUpToDate && (
                  <StatusPill label="Up to date" tone="success" icon={<CheckCircle2 size={11} color={colors.success} />} />
                )}
                {hasUpdate && <StatusPill label={`v${latestVersion} available`} tone="warning" />}
                <Text style={styles.rowValue} numberOfLines={1}>{controllerVersion}</Text>
              </View>
            }
          />
          <Divider inset />
          <Row
            icon={<Server size={18} color={isLinux ? colors.success : colors.textMuted} />}
            tileBg={isLinux ? colors.successSoft : colors.surfaceMuted}
            label="Platform"
            value={isLinux ? "Linux" : "Windows"}
          />
          <Divider inset />
          <ActionRow
            icon={checkingUpdate ? <ActivityIndicator size="small" color={colors.accent} /> : <RefreshCw size={18} color={colors.accent} />}
            label="Check for Updates"
            onPress={checkForUpdates}
            disabled={checkingUpdate}
          />
          <Divider />
          <Button
            variant="ghost"
            label={updating ? "Updating…" : "Update Controller"}
            icon={(checkingUpdate || updating)
              ? <ActivityIndicator size="small" color={isLinux ? colors.accent : colors.textFaint} />
              : <Download size={15} color={isLinux ? colors.accent : colors.textFaint} />}
            textStyle={!isLinux && styles.cardActionTextDisabled}
            onPress={handleUpdate}
            disabled={!isLinux || checkingUpdate || updating}
            style={styles.cardActionBtn}
          />
          {!isLinux && (
            <Text style={styles.cardNote}>Remote update is only available on Linux controllers.</Text>
          )}
        </Card>

        {/* App update — Android */}
        {isAndroid && (
          <>
            <SectionHeader title="App" />
            <Card>
              <Row
                icon={<Download size={18} color={colors.accent} />}
                tileBg={colors.accentSoft}
                label="App Version"
                value={
                  <View style={styles.versionRight}>
                    {appIsUpToDate && (
                      <StatusPill label="Up to date" tone="success" icon={<CheckCircle2 size={11} color={colors.success} />} />
                    )}
                    {appHasUpdate && <StatusPill label={`v${appLatestVersion} available`} tone="warning" />}
                    <Text style={styles.rowValue} numberOfLines={1}>v{appVersion}</Text>
                  </View>
                }
              />
              <Divider inset />
              <ActionRow
                icon={checkingAppUpdate ? <ActivityIndicator size="small" color={colors.accent} /> : <RefreshCw size={18} color={colors.accent} />}
                label="Check for Updates"
                onPress={checkAppForUpdates}
                disabled={checkingAppUpdate}
              />
              <Divider />
              <Button
                variant="ghost"
                label="Update App"
                icon={<Download size={15} color={appHasUpdate ? colors.accent : colors.textFaint} />}
                textStyle={!appHasUpdate && styles.cardActionTextDisabled}
                onPress={handleAppUpdate}
                disabled={!appAssetUrl || !appHasUpdate}
                style={styles.cardActionBtn}
              />
            </Card>
          </>
        )}

        {/* App update — Electron */}
        {isElectron && (
          <>
            <SectionHeader title="App" />
            <Card>
              <Row
                icon={<Download size={18} color={colors.accent} />}
                tileBg={colors.accentSoft}
                label="App Version"
                value={
                  <View style={styles.versionRight}>
                    {electronIsUpToDate && (
                      <StatusPill label="Up to date" tone="success" icon={<CheckCircle2 size={11} color={colors.success} />} />
                    )}
                    {electronHasUpdate && <StatusPill label={`v${electronLatestVersion} available`} tone="warning" />}
                    <Text style={styles.rowValue} numberOfLines={1}>
                      {electronVersion ? `v${electronVersion}` : "—"}
                    </Text>
                  </View>
                }
              />
              <Divider inset />
              <ActionRow
                icon={checkingElectronUpdate ? <ActivityIndicator size="small" color={colors.accent} /> : <RefreshCw size={18} color={colors.accent} />}
                label="Check for Updates"
                onPress={checkElectronForUpdates}
                disabled={checkingElectronUpdate || downloadingElectron}
              />
              {downloadingElectron && <ProgressBar progress={electronDownloadProgress} />}
              <Divider />
              <Button
                variant="ghost"
                label={downloadingElectron ? `Downloading… ${Math.round(electronDownloadProgress * 100)}%` : "Update App"}
                icon={downloadingElectron
                  ? <ActivityIndicator size="small" color={colors.accent} />
                  : <Download size={15} color={electronHasUpdate ? colors.accent : colors.textFaint} />}
                textStyle={!electronHasUpdate && styles.cardActionTextDisabled}
                onPress={handleElectronUpdate}
                disabled={!electronHasUpdate || downloadingElectron || checkingElectronUpdate}
                style={styles.cardActionBtn}
              />
            </Card>
          </>
        )}

        {/* Restart */}
        <Button
          variant="dangerSoft"
          label="Restart Controller"
          icon={<RefreshCw size={15} color={colors.danger} />}
          onPress={() => setRestartVisible(true)}
        />

        {/* ── Modals ── */}

        <Modal visible={updating} transparent animationType="fade">
          <View style={styles.modalOverlay}>
            <View style={styles.modalCard}>
              <ActivityIndicator size="large" color={colors.accent} style={styles.modalSpinner} />
              <Text style={styles.modalTitle}>Updating Controller</Text>
              <Text style={styles.modalBody}>
                Downloading and applying the update. The controller will reconnect automatically once complete.
              </Text>
            </View>
          </View>
        </Modal>

        <Modal visible={updateDone} transparent animationType="fade" onRequestClose={() => setUpdateDone(false)}>
          <View style={styles.modalOverlay}>
            <View style={styles.modalCard}>
              <CheckCircle2 size={36} color={colors.success} style={styles.modalIcon} />
              <Text style={styles.modalTitle}>Update Complete</Text>
              <Text style={styles.modalBody}>The controller is now running the latest version.</Text>
              <View style={styles.modalButtons}>
                <Button label="Done" onPress={() => setUpdateDone(false)} style={styles.modalButtonFlex} />
              </View>
            </View>
          </View>
        </Modal>

        <Modal visible={restartVisible} transparent animationType="fade" onRequestClose={() => setRestartVisible(false)}>
          <View style={styles.modalOverlay}>
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>Restart Controller?</Text>
              <Text style={styles.modalBody}>
                The robot will disconnect briefly while the controller restarts. Motion will stop.
              </Text>
              <View style={styles.modalButtons}>
                <Button variant="secondary" label="Cancel" onPress={() => setRestartVisible(false)} style={styles.modalButtonFlex} />
                <Button
                  variant="destructive"
                  label={restarting ? "Restarting…" : "Restart"}
                  onPress={confirmRestart}
                  disabled={restarting}
                  style={styles.modalButtonFlex}
                />
              </View>
            </View>
          </View>
        </Modal>

        <Modal visible={editVisible} transparent animationType="fade" onRequestClose={() => setEditVisible(false)}>
          <View style={styles.modalOverlay}>
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>Edit Robot Identity</Text>
              <Text style={styles.editLabel}>Robot Name</Text>
              <Input
                style={styles.editInput}
                value={editName}
                onChangeText={setEditName}
                placeholder="Robot name"
              />
              <Text style={styles.editLabel}>Robot Type</Text>
              <View style={styles.pickerWrapper}>
                <Picker selectedValue={editType} onValueChange={setEditType} style={styles.picker} dropdownIconColor={colors.textMuted}>
                  <Picker.Item label="ASTRO"      value="ASTRO" />
                  <Picker.Item label="4-Axis CNC" value="CNC4Axis" />
                </Picker>
              </View>
              <View style={styles.modalButtons}>
                <Button variant="secondary" label="Cancel" onPress={() => setEditVisible(false)} style={styles.modalButtonFlex} />
                <Button
                  label={saving ? "Saving…" : "Save"}
                  onPress={saveEdit}
                  disabled={saving}
                  style={styles.modalButtonFlex}
                />
              </View>
            </View>
          </View>
        </Modal>
      </Screen>

      {/* Toast */}
      {toast && (
        <Animated.View style={[styles.toast, toast.error && styles.toastError, { opacity: toastAnim }]}>
          <Text style={styles.toastText}>{toast.message}</Text>
        </Animated.View>
      )}
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root:       { flex: 1, backgroundColor: colors.background },
  center:     { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: colors.background },
  centerText: { fontSize: 15, color: colors.textMuted },

  heroCard: {
    alignItems: "center",
    paddingVertical: spacing.xl,
    gap: spacing.sm,
  },
  heroImageWrapper: { width: 110, height: 110, borderRadius: radii.xl, backgroundColor: colors.surface, justifyContent: "center", alignItems: "center", marginBottom: spacing.xs },
  heroImage:        { width: 110, height: 110 },
  heroName:         { ...type.pageTitle, fontSize: 22 },
  typeBadge:        { backgroundColor: colors.accentSoft, borderRadius: radii.sm - 1, paddingHorizontal: spacing.md, paddingVertical: spacing.xs / 2 },
  typeText:         { fontSize: 13, fontWeight: "600", color: colors.accent },

  editButton:     { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  editButtonText: { fontSize: 12, fontWeight: "600", color: colors.accent },

  rowValue: { ...type.body, color: colors.textMuted, maxWidth: "45%", textAlign: "right" },

  multiDot:     { flexDirection: "row", gap: spacing.sm },
  versionRight: { flexDirection: "row", alignItems: "center", gap: spacing.sm },

  cardActionBtn:          { paddingVertical: spacing.sm + 5, borderRadius: 0 },
  cardActionTextDisabled: { color: colors.textFaint },
  cardNote: { fontSize: 12, color: colors.textFaint, textAlign: "center", paddingHorizontal: spacing.lg, paddingBottom: spacing.md },

  progressBarTrack: { height: 3, backgroundColor: colors.border, marginHorizontal: spacing.lg, marginBottom: 2 },
  progressBarFill:  { height: 3, backgroundColor: colors.accent, borderRadius: 2 },

  modalOverlay: { flex: 1, backgroundColor: colors.overlay, justifyContent: "center", alignItems: "center" },
  modalCard:    { backgroundColor: colors.surface, borderRadius: radii.xl, padding: spacing.xl - 4, width: 300, alignItems: "center", ...shadows.raised },
  modalSpinner: { marginBottom: spacing.lg },
  modalIcon:    { marginBottom: spacing.md },
  modalTitle:   { ...type.title, fontSize: 16, marginBottom: spacing.sm, textAlign: "center" },
  modalBody:    { ...type.body, color: colors.textMuted, marginBottom: spacing.lg, lineHeight: 18, textAlign: "center" },

  editLabel: { ...type.sectionLabel, marginBottom: spacing.xs, alignSelf: "flex-start" },
  editInput: { marginBottom: spacing.md, width: "100%" },
  pickerWrapper: { borderWidth: 1, borderColor: colors.border, borderRadius: radii.sm, backgroundColor: colors.surfaceMuted, marginBottom: spacing.md, overflow: "hidden", width: "100%" },
  picker:        { color: colors.text },

  modalButtons: { flexDirection: "row", gap: spacing.sm + 2, marginTop: spacing.xs, width: "100%" },
  modalButtonFlex: { flex: 1 },

  statusDot: { flexDirection: "row", alignItems: "center", gap: 5 },
  dot:       { width: 8, height: 8, borderRadius: 4 },
  dotLabel:  { fontSize: 13, fontWeight: "600" },

  toast: {
    position: "absolute",
    bottom: spacing.xl,
    left: spacing.lg,
    right: spacing.lg,
    backgroundColor: colors.surfaceDark,
    borderRadius: radii.sm + 1,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    alignItems: "center",
    ...shadows.raised,
  },
  toastError: { backgroundColor: colors.danger },
  toastText:  { color: colors.onSurfaceDark, fontSize: 14, fontWeight: "500", textAlign: "center" },
});
