import { getSelectedRobot, setSelectedRobot, subscribeRobot } from "@/src/connections/robotState";
import { useRobotStatus } from "@/src/providers/RobotProvider";
import { robotClient } from "@/src/services/RobotConnectService";
import { robotDiscovery } from "@/src/services/RobotDiscoveryService";
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

import { SubPageHeader } from "@/src/components/ui/SubPageHeader";
import { useEffect, useRef, useState } from "react";
import { Picker } from "@react-native-picker/picker";
import { ActivityIndicator, Animated, Image, Modal, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
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

function InfoRow({
  icon,
  tileBg,
  label,
  value,
  last = false,
}: {
  icon: React.ReactNode;
  tileBg?: string;
  label: string;
  value: string | number | React.ReactNode;
  last?: boolean;
}) {
  return (
    <View style={[styles.infoRow, !last && styles.infoRowBorder]}>
      <View style={[styles.rowTile, { backgroundColor: tileBg ?? "#f3f4f6" }]}>
        {icon}
      </View>
      <Text style={styles.infoLabel}>{label}</Text>
      {typeof value === "string" || typeof value === "number" ? (
        <Text style={styles.infoValue} numberOfLines={1}>{value}</Text>
      ) : (
        value
      )}
    </View>
  );
}

function StatusDot({ ok, label }: { ok: boolean; label: string }) {
  return (
    <View style={styles.statusDot}>
      <View style={[styles.dot, { backgroundColor: ok ? "#16a34a" : "#dc2626" }]} />
      <Text style={[styles.dotLabel, { color: ok ? "#16a34a" : "#dc2626" }]}>{label}</Text>
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
    <View style={{ flex: 1, backgroundColor: "#f3f4f6" }}>
      <SubPageHeader title="About Robot" />
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero card */}
        <View style={styles.heroCard}>
          <View style={styles.heroImageWrapper}>
            <Image source={imageSource} style={styles.heroImage} resizeMode="contain" />
          </View>
          <Text style={styles.heroName}>{robot.robotName || "Unknown Robot"}</Text>
          {!!robot.robotType && (
            <View style={styles.typeBadge}>
              <Text style={styles.typeText}>{robot.robotType}</Text>
            </View>
          )}
        </View>

        {/* Identity */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionLabel}>IDENTITY</Text>
          <TouchableOpacity onPress={openEdit} style={styles.editButton}>
            <Pencil size={14} color="#2563eb" />
            <Text style={styles.editButtonText}>Edit</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.card}>
          <InfoRow icon={<Tag size={16} color="#2563eb" />}  tileBg="#eff6ff" label="Name"          value={robot.robotName   || "—"} />
          <InfoRow icon={<Cpu size={16} color="#7c3aed" />}  tileBg="#f5f3ff" label="Type"          value={robot.robotType   || "—"} />
          <InfoRow icon={<Hash size={16} color="#6b7280" />} tileBg="#f9fafb" label="Serial Number" value={robot.serialNumber || "—"} last />
        </View>

        {/* Network */}
        <Text style={styles.sectionLabel}>NETWORK</Text>
        <View style={styles.card}>
          <InfoRow icon={<Network size={16} color="#0891b2" />} tileBg="#ecfeff" label="IP Address" value={robot.ipAddress       || "—"} />
          <InfoRow icon={<Server  size={16} color="#0891b2" />} tileBg="#ecfeff" label="Port"       value={robot.port} />
          <InfoRow icon={<Zap     size={16} color="#0891b2" />} tileBg="#ecfeff" label="Endpoint"   value={robot.controlEndpoint} last />
        </View>

        {/* Live status */}
        <Text style={styles.sectionLabel}>LIVE STATUS</Text>
        <View style={styles.card}>
          <InfoRow
            icon={status.connected ? <Wifi size={16} color="#16a34a" /> : <WifiOff size={16} color="#dc2626" />}
            tileBg={status.connected ? "#f0fdf4" : "#fef2f2"}
            label="Connection"
            value={<StatusDot ok={status.connected} label={status.connected ? "Connected" : "Disconnected"} />}
          />
          <InfoRow
            icon={<Cpu size={16} color={status.driverConnected ? "#16a34a" : "#dc2626"} />}
            tileBg={status.driverConnected ? "#f0fdf4" : "#fef2f2"}
            label="Motor Driver"
            value={
              <View style={{ flexDirection: "row", gap: 8 }}>
                <StatusDot ok={status.driverConnected} label={status.driverConnected ? "Connected" : "Disconnected"} />
                {status.driverConnected && (
                  <StatusDot ok={status.driverOk} label={status.driverOk ? "OK" : "Fault"} />
                )}
              </View>
            }
          />
          <InfoRow
            icon={<Activity size={16} color={status.wasHomed ? "#16a34a" : "#f97316"} />}
            tileBg={status.wasHomed ? "#f0fdf4" : "#fff7ed"}
            label="Homed"
            value={<StatusDot ok={status.wasHomed} label={status.wasHomed ? "Yes" : "No"} />}
          />
          <InfoRow
            icon={<Gauge size={16} color="#6b7280" />}
            tileBg="#f9fafb"
            label="Homing State"
            value={isHoming ? status.homingState : "Idle"}
            last
          />
        </View>

        {/* Software */}
        <Text style={styles.sectionLabel}>SOFTWARE</Text>
        <View style={styles.card}>
          <View style={[styles.infoRow, styles.infoRowBorder]}>
            <View style={[styles.rowTile, { backgroundColor: "#eff6ff" }]}>
              <Download size={16} color="#2563eb" />
            </View>
            <Text style={styles.infoLabel}>Controller Version</Text>
            <View style={styles.versionRight}>
              {isUpToDate && (
                <View style={styles.upToDateChip}>
                  <CheckCircle2 size={11} color="#16a34a" />
                  <Text style={styles.upToDateText}>Up to date</Text>
                </View>
              )}
              {hasUpdate && (
                <View style={styles.updateChip}>
                  <Text style={styles.updateChipText}>v{latestVersion} available</Text>
                </View>
              )}
              <Text style={[styles.infoValue, { maxWidth: undefined }]} numberOfLines={1}>{controllerVersion}</Text>
            </View>
          </View>
          <View style={[styles.infoRow, styles.infoRowBorder]}>
            <View style={[styles.rowTile, { backgroundColor: isLinux ? "#f0fdf4" : "#f9fafb" }]}>
              <Server size={16} color={isLinux ? "#16a34a" : "#6b7280"} />
            </View>
            <Text style={styles.infoLabel}>Platform</Text>
            <Text style={styles.infoValue}>{isLinux ? "Linux" : "Windows"}</Text>
          </View>
          <TouchableOpacity
            style={[styles.infoRow, styles.infoRowBorder]}
            onPress={checkForUpdates}
            activeOpacity={0.7}
            disabled={checkingUpdate}
          >
            <View style={[styles.rowTile, { backgroundColor: "#f3f4f6" }]}>
              {checkingUpdate
                ? <ActivityIndicator size="small" color="#2563eb" />
                : <RefreshCw size={16} color="#2563eb" />}
            </View>
            <Text style={[styles.infoLabel, { color: "#2563eb" }]}>Check for Updates</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.cardAction}
            onPress={handleUpdate}
            activeOpacity={isLinux ? 0.7 : 1}
            disabled={!isLinux || checkingUpdate || updating}
          >
            {checkingUpdate || updating
              ? <ActivityIndicator size="small" color={isLinux ? "#2563eb" : "#9ca3af"} />
              : <Download size={15} color={isLinux ? "#2563eb" : "#9ca3af"} />}
            <Text style={[styles.cardActionText, !isLinux && styles.cardActionTextDisabled]}>
              {updating ? "Updating…" : "Update Controller"}
            </Text>
          </TouchableOpacity>
          {!isLinux && (
            <Text style={styles.cardNote}>Remote update is only available on Linux controllers.</Text>
          )}
        </View>

        {/* App update — Android */}
        {isAndroid && (
          <>
            <Text style={styles.sectionLabel}>APP</Text>
            <View style={styles.card}>
              <View style={[styles.infoRow, styles.infoRowBorder]}>
                <View style={[styles.rowTile, { backgroundColor: "#eff6ff" }]}>
                  <Download size={16} color="#2563eb" />
                </View>
                <Text style={styles.infoLabel}>App Version</Text>
                <View style={styles.versionRight}>
                  {appIsUpToDate && (
                    <View style={styles.upToDateChip}>
                      <CheckCircle2 size={11} color="#16a34a" />
                      <Text style={styles.upToDateText}>Up to date</Text>
                    </View>
                  )}
                  {appHasUpdate && (
                    <View style={styles.updateChip}>
                      <Text style={styles.updateChipText}>v{appLatestVersion} available</Text>
                    </View>
                  )}
                  <Text style={[styles.infoValue, { maxWidth: undefined }]} numberOfLines={1}>v{appVersion}</Text>
                </View>
              </View>
              <TouchableOpacity
                style={[styles.infoRow, styles.infoRowBorder]}
                onPress={checkAppForUpdates}
                activeOpacity={0.7}
                disabled={checkingAppUpdate}
              >
                <View style={[styles.rowTile, { backgroundColor: "#f3f4f6" }]}>
                  {checkingAppUpdate
                    ? <ActivityIndicator size="small" color="#2563eb" />
                    : <RefreshCw size={16} color="#2563eb" />}
                </View>
                <Text style={[styles.infoLabel, { color: "#2563eb" }]}>Check for Updates</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.cardAction}
                onPress={handleAppUpdate}
                activeOpacity={appHasUpdate ? 0.7 : 1}
                disabled={!appAssetUrl || !appHasUpdate}
              >
                <Download size={15} color={appHasUpdate ? "#2563eb" : "#9ca3af"} />
                <Text style={[styles.cardActionText, !appHasUpdate && styles.cardActionTextDisabled]}>
                  Update App
                </Text>
              </TouchableOpacity>
            </View>
          </>
        )}

        {/* App update — Electron */}
        {isElectron && (
          <>
            <Text style={styles.sectionLabel}>APP</Text>
            <View style={styles.card}>
              <View style={[styles.infoRow, styles.infoRowBorder]}>
                <View style={[styles.rowTile, { backgroundColor: "#eff6ff" }]}>
                  <Download size={16} color="#2563eb" />
                </View>
                <Text style={styles.infoLabel}>App Version</Text>
                <View style={styles.versionRight}>
                  {electronIsUpToDate && (
                    <View style={styles.upToDateChip}>
                      <CheckCircle2 size={11} color="#16a34a" />
                      <Text style={styles.upToDateText}>Up to date</Text>
                    </View>
                  )}
                  {electronHasUpdate && (
                    <View style={styles.updateChip}>
                      <Text style={styles.updateChipText}>v{electronLatestVersion} available</Text>
                    </View>
                  )}
                  <Text style={[styles.infoValue, { maxWidth: undefined }]} numberOfLines={1}>
                    {electronVersion ? `v${electronVersion}` : "—"}
                  </Text>
                </View>
              </View>
              <TouchableOpacity
                style={[styles.infoRow, styles.infoRowBorder]}
                onPress={checkElectronForUpdates}
                activeOpacity={0.7}
                disabled={checkingElectronUpdate || downloadingElectron}
              >
                <View style={[styles.rowTile, { backgroundColor: "#f3f4f6" }]}>
                  {checkingElectronUpdate
                    ? <ActivityIndicator size="small" color="#2563eb" />
                    : <RefreshCw size={16} color="#2563eb" />}
                </View>
                <Text style={[styles.infoLabel, { color: "#2563eb" }]}>Check for Updates</Text>
              </TouchableOpacity>
              {downloadingElectron && <ProgressBar progress={electronDownloadProgress} />}
              <TouchableOpacity
                style={styles.cardAction}
                onPress={handleElectronUpdate}
                activeOpacity={electronHasUpdate ? 0.7 : 1}
                disabled={!electronHasUpdate || downloadingElectron || checkingElectronUpdate}
              >
                {downloadingElectron
                  ? <ActivityIndicator size="small" color="#2563eb" />
                  : <Download size={15} color={electronHasUpdate ? "#2563eb" : "#9ca3af"} />}
                <Text style={[styles.cardActionText, !electronHasUpdate && styles.cardActionTextDisabled]}>
                  {downloadingElectron ? `Downloading… ${Math.round(electronDownloadProgress * 100)}%` : "Update App"}
                </Text>
              </TouchableOpacity>
            </View>
          </>
        )}

        {/* Restart */}
        <TouchableOpacity style={styles.restartButton} onPress={() => setRestartVisible(true)}>
          <RefreshCw size={15} color="#dc2626" />
          <Text style={styles.restartButtonText}>Restart Controller</Text>
        </TouchableOpacity>

        {/* ── Modals ── */}

        <Modal visible={updating} transparent animationType="fade">
          <View style={styles.modalOverlay}>
            <View style={styles.modalCard}>
              <ActivityIndicator size="large" color="#2563eb" style={{ marginBottom: 16 }} />
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
              <CheckCircle2 size={36} color="#16a34a" style={{ marginBottom: 12 }} />
              <Text style={styles.modalTitle}>Update Complete</Text>
              <Text style={styles.modalBody}>The controller is now running the latest version.</Text>
              <View style={styles.modalButtons}>
                <TouchableOpacity style={styles.saveButton} onPress={() => setUpdateDone(false)}>
                  <Text style={styles.saveButtonText}>Done</Text>
                </TouchableOpacity>
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
                <TouchableOpacity style={styles.cancelButton} onPress={() => setRestartVisible(false)}>
                  <Text style={styles.cancelButtonText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.restartConfirmButton, restarting && { opacity: 0.6 }]}
                  onPress={confirmRestart}
                  disabled={restarting}
                >
                  <Text style={styles.saveButtonText}>{restarting ? "Restarting…" : "Restart"}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        <Modal visible={editVisible} transparent animationType="fade" onRequestClose={() => setEditVisible(false)}>
          <View style={styles.modalOverlay}>
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>Edit Robot Identity</Text>
              <Text style={styles.editLabel}>ROBOT NAME</Text>
              <TextInput
                style={styles.editInput}
                value={editName}
                onChangeText={setEditName}
                placeholder="Robot name"
                placeholderTextColor="#9ca3af"
              />
              <Text style={styles.editLabel}>ROBOT TYPE</Text>
              <View style={styles.pickerWrapper}>
                <Picker selectedValue={editType} onValueChange={setEditType} style={styles.picker} dropdownIconColor="#6b7280">
                  <Picker.Item label="ASTRO" value="ASTRO" />
                </Picker>
              </View>
              <View style={styles.modalButtons}>
                <TouchableOpacity style={styles.cancelButton} onPress={() => setEditVisible(false)}>
                  <Text style={styles.cancelButtonText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.saveButton, saving && { opacity: 0.6 }]} onPress={saveEdit} disabled={saving}>
                  <Text style={styles.saveButtonText}>{saving ? "Saving…" : "Save"}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      </ScrollView>

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
  container:   { flex: 1, backgroundColor: "#f3f4f6" },
  content:     { padding: 16, paddingBottom: 36 },
  center:      { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#f3f4f6" },
  centerText:  { fontSize: 15, color: "#6b7280" },

  heroCard: {
    backgroundColor: "#ffffff",
    borderRadius: 16,
    alignItems: "center",
    paddingVertical: 24,
    paddingHorizontal: 16,
    marginBottom: 20,
    shadowColor: "#000",
    shadowOpacity: 0.07,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
    gap: 8,
  },
  heroImageWrapper: { width: 110, height: 110, borderRadius: 20, backgroundColor: "#ffffff", justifyContent: "center", alignItems: "center", marginBottom: 4 },
  heroImage:        { width: 110, height: 110 },
  heroName:         { fontSize: 22, fontWeight: "700", color: "#111827" },
  typeBadge:        { backgroundColor: "#eff6ff", borderRadius: 8, paddingHorizontal: 12, paddingVertical: 4 },
  typeText:         { fontSize: 13, fontWeight: "600", color: "#2563eb" },

  sectionHeader:  { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 },
  sectionLabel:   { fontSize: 11, fontWeight: "700", color: "#6b7280", letterSpacing: 0.8, marginBottom: 8 },
  editButton:     { flexDirection: "row", alignItems: "center", gap: 4 },
  editButtonText: { fontSize: 12, fontWeight: "600", color: "#2563eb" },

  card: {
    backgroundColor: "#ffffff",
    borderRadius: 14,
    marginBottom: 20,
    shadowColor: "#000",
    shadowOpacity: 0.07,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
    overflow: "hidden",
  },
  infoRow:       { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 13, gap: 12 },
  infoRowBorder: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "#e5e7eb" },
  rowTile:       { width: 32, height: 32, borderRadius: 8, justifyContent: "center", alignItems: "center" },
  infoLabel:     { flex: 1, fontSize: 14, fontWeight: "500", color: "#374151" },
  infoValue:     { fontSize: 14, color: "#6b7280", maxWidth: "45%", textAlign: "right" },

  versionRight:  { flexDirection: "row", alignItems: "center", gap: 6 },
  upToDateChip:  { flexDirection: "row", alignItems: "center", gap: 3, backgroundColor: "#dcfce7", borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  upToDateText:  { fontSize: 11, fontWeight: "600", color: "#16a34a" },
  updateChip:    { backgroundColor: "#fef3c7", borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  updateChipText:{ fontSize: 11, fontWeight: "600", color: "#d97706" },

  cardAction: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 13,
    gap: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#e5e7eb",
  },
  cardActionText:         { fontSize: 14, fontWeight: "600", color: "#2563eb" },
  cardActionTextDisabled: { color: "#9ca3af" },
  cardNote: { fontSize: 12, color: "#9ca3af", textAlign: "center", paddingHorizontal: 16, paddingBottom: 12 },

  progressBarTrack: { height: 3, backgroundColor: "#e5e7eb", marginHorizontal: 16, marginBottom: 2 },
  progressBarFill:  { height: 3, backgroundColor: "#2563eb", borderRadius: 2 },

  restartButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#fecaca",
    backgroundColor: "#fff5f5",
    marginBottom: 20,
  },
  restartButtonText:    { fontSize: 14, fontWeight: "600", color: "#dc2626" },
  restartConfirmButton: { flex: 1, backgroundColor: "#dc2626", borderRadius: 8, paddingVertical: 10, alignItems: "center" },

  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", alignItems: "center" },
  modalCard:    { backgroundColor: "#ffffff", borderRadius: 16, padding: 20, width: 300, alignItems: "center", shadowColor: "#000", shadowOpacity: 0.15, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 8 },
  modalTitle:   { fontSize: 16, fontWeight: "700", color: "#111827", marginBottom: 8, textAlign: "center" },
  modalBody:    { fontSize: 13, color: "#6b7280", marginBottom: 16, lineHeight: 18, textAlign: "center" },

  editLabel:     { fontSize: 11, fontWeight: "600", color: "#6b7280", letterSpacing: 0.5, textTransform: "uppercase", marginBottom: 4, alignSelf: "flex-start" },
  editInput:     { borderWidth: 1.5, borderColor: "#e5e7eb", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, fontSize: 14, color: "#111827", backgroundColor: "#f9fafb", marginBottom: 12, width: "100%" },
  pickerWrapper: { borderWidth: 1.5, borderColor: "#e5e7eb", borderRadius: 8, backgroundColor: "#f9fafb", marginBottom: 12, overflow: "hidden", width: "100%" },
  picker:        { color: "#111827" },

  modalButtons:     { flexDirection: "row", gap: 10, marginTop: 4, width: "100%" },
  cancelButton:     { flex: 1, borderWidth: 1, borderColor: "#d1d5db", borderRadius: 8, paddingVertical: 10, alignItems: "center" },
  cancelButtonText: { fontSize: 14, fontWeight: "600", color: "#6b7280" },
  saveButton:       { flex: 1, backgroundColor: "#2563eb", borderRadius: 8, paddingVertical: 10, alignItems: "center" },
  saveButtonText:   { fontSize: 14, fontWeight: "600", color: "#ffffff" },

  statusDot: { flexDirection: "row", alignItems: "center", gap: 5 },
  dot:       { width: 8, height: 8, borderRadius: 4 },
  dotLabel:  { fontSize: 13, fontWeight: "600" },

  toast: {
    position: "absolute",
    bottom: 24,
    left: 16,
    right: 16,
    backgroundColor: "#111827",
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    alignItems: "center",
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 8,
  },
  toastError: { backgroundColor: "#dc2626" },
  toastText:  { color: "#ffffff", fontSize: 14, fontWeight: "500", textAlign: "center" },
});
