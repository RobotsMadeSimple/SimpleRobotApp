import { SubPageHeader } from "@/src/components/ui/SubPageHeader";
import { robotClient } from "@/src/services/RobotConnectService";
import { CameraState } from "@/src/models/robotModels";
import { router, useLocalSearchParams } from "expo-router";
import { WebView } from "react-native-webview";
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
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

// ── Camera HTML builder ───────────────────────────────────────────────────────

function makeCameraHtml(wsUrl: string, zoomable: boolean): string {
  const viewport = zoomable
    ? 'width=device-width,initial-scale=1,maximum-scale=10,user-scalable=yes'
    : 'width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no';
  const tapScript = zoomable ? '' :
    `document.addEventListener('click',function(){try{window.ReactNativeWebView.postMessage('tap');}catch(e){}});`;
  return `<!DOCTYPE html><html>
<head>
  <meta name="viewport" content="${viewport}">
  <style>*{margin:0;padding:0;box-sizing:border-box}html,body{width:100%;height:100%;background:#000;overflow:hidden}canvas{width:100%;height:100%;object-fit:contain;display:block}</style>
</head>
<body>
  <canvas id="c"></canvas>
  <script>
    var c=document.getElementById('c'),x=c.getContext('2d'),dec=false,pend=null;
    function draw(src){dec=true;var i=new Image();i.onload=function(){if(c.width!==i.naturalWidth||c.height!==i.naturalHeight){c.width=i.naturalWidth;c.height=i.naturalHeight;}x.drawImage(i,0,0,c.width,c.height);dec=false;if(pend!==null){var n=pend;pend=null;draw(n);}};i.src=src;}
    var ws=new WebSocket(${JSON.stringify(wsUrl)});
    ws.onmessage=function(e){if(dec){pend=e.data;}else{draw(e.data);}};
    ${tapScript}
  <\/script>
</body></html>`;
}

// ── CameraWebSocketFeed ───────────────────────────────────────────────────────

function CameraWebSocketFeed({ cameraId, onTap }: { cameraId: string; onTap?: () => void }) {
  const [hasFrame, setHasFrame] = useState(false);
  const canvasRef = useRef<any>(null);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const wsUrl = robotClient.cameraWsUrl(cameraId);
    if (!wsUrl) return;
    let cancelled = false;
    let decoding  = false;
    let pending: string | null = null;
    function decode(data: string) {
      decoding = true;
      const img = new (window as any).Image() as HTMLImageElement;
      img.onload = () => {
        if (cancelled) { decoding = false; return; }
        const canvas = canvasRef.current;
        if (canvas) {
          if (canvas.width !== img.naturalWidth || canvas.height !== img.naturalHeight) {
            canvas.width  = img.naturalWidth;
            canvas.height = img.naturalHeight;
          }
          canvas.getContext('2d')?.drawImage(img, 0, 0);
          setHasFrame(true);
        }
        decoding = false;
        if (pending !== null) { const next = pending; pending = null; decode(next); }
      };
      img.src = data;
    }
    const ws = new WebSocket(wsUrl);
    ws.onmessage = (e) => { if (decoding) { pending = e.data as string; } else { decode(e.data as string); } };
    ws.onerror = () => {};
    return () => { cancelled = true; ws.close(); };
  }, [cameraId]);

  if (Platform.OS === 'web') {
    return (
      <View style={styles.cameraFeed}>
        {/* @ts-ignore */}
        <canvas
          ref={canvasRef}
          onClick={() => canvasRef.current?.requestFullscreen?.()}
          style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block', backgroundColor: '#000', cursor: 'pointer' }}
        />
        {!hasFrame && (
          <View style={[StyleSheet.absoluteFill, { justifyContent: 'center', alignItems: 'center', gap: 8, backgroundColor: '#000' }]}>
            <Camera size={28} color="#4b5563" />
            <Text style={styles.feedPlaceholderText}>Connecting…</Text>
          </View>
        )}
      </View>
    );
  }

  const wsUrl = robotClient.cameraWsUrl(cameraId);
  if (!wsUrl) {
    return (
      <View style={styles.feedPlaceholder}>
        <Camera size={28} color="#4b5563" />
        <Text style={styles.feedPlaceholderText}>Not connected</Text>
      </View>
    );
  }

  return (
    <WebView
      source={{ html: makeCameraHtml(wsUrl, false) }}
      style={styles.cameraFeed}
      scrollEnabled={false}
      originWhitelist={['*']}
      javaScriptEnabled
      onMessage={(e) => { if (e.nativeEvent.data === 'tap') onTap?.(); }}
    />
  );
}

// ── CameraFullscreenModal ─────────────────────────────────────────────────────

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
        <WebView
          source={{ html: makeCameraHtml(wsUrl, true) }}
          style={{ flex: 1 }}
          scrollEnabled={false}
          originWhitelist={['*']}
          javaScriptEnabled
        />
        <TouchableOpacity style={styles.fullscreenClose} onPress={onClose} activeOpacity={0.8}>
          <X size={18} color="#fff" />
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
          {options.map((r) => {
            const sel = !isCustom && String(r.width) === selectedWidth && String(r.height) === selectedHeight;
            return (
              <TouchableOpacity
                key={`${r.width}x${r.height}`}
                style={[styles.sheetRow, styles.rowBorder]}
                onPress={() => { onSelect(r); onClose(); }}
                activeOpacity={0.7}
              >
                <Text style={[styles.sheetRowText, sel && styles.sheetRowTextSelected]}>
                  {r.width} × {r.height}
                </Text>
                {sel && <Check size={16} color="#2563eb" />}
              </TouchableOpacity>
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
            {isCustom && <Check size={16} color="#2563eb" />}
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
}: {
  name: string;        setName: (v: string) => void;
  deviceIndex: string; setDeviceIndex: (v: string) => void;
  width: string;       setWidth: (v: string) => void;
  height: string;      setHeight: (v: string) => void;
  targetFps: string;   setTargetFps: (v: string) => void;
  savedResolutions:    Resolution[];
}) {
  const [sheetOpen,      setSheetOpen]      = useState(false);
  const [customSelected, setCustomSelected] = useState(false);

  const options       = savedResolutions;
  const hasOptions    = options.length > 0;
  const matchedOption = options.find(r => String(r.width) === width && String(r.height) === height);
  const isCustom      = customSelected || !matchedOption;

  return (
    <View>
      <Text style={styles.sectionLabel}>CONFIGURATION</Text>
      <View style={styles.sectionBody}>

        <View style={[styles.formRow, styles.rowBorder]}>
          <Text style={styles.formLabel}>Name</Text>
          <TextInput
            style={styles.formInput}
            value={name}
            onChangeText={setName}
            placeholder="Camera"
            placeholderTextColor="#9ca3af"
            returnKeyType="done"
            textAlign="right"
          />
        </View>

        <View style={[styles.formRow, styles.rowBorder]}>
          <Text style={styles.formLabel}>Device Index</Text>
          <TextInput
            style={styles.formInput}
            value={deviceIndex}
            onChangeText={setDeviceIndex}
            placeholder="0"
            placeholderTextColor="#9ca3af"
            keyboardType="numeric"
            returnKeyType="done"
            textAlign="right"
          />
        </View>

        {/* Resolution row — tappable when options exist */}
        {hasOptions ? (
          <TouchableOpacity
            style={[styles.formRow, styles.rowBorder]}
            onPress={() => setSheetOpen(true)}
            activeOpacity={0.7}
          >
            <Text style={styles.formLabel}>Resolution</Text>
            <Text style={styles.dropdownValue}>
              {isCustom ? "Custom" : `${matchedOption!.width} × ${matchedOption!.height}`}
            </Text>
            <ChevronDown size={16} color="#6b7280" style={{ marginLeft: 6 }} />
          </TouchableOpacity>
        ) : (
          <View style={[styles.formRow, styles.rowBorder]}>
            <Text style={styles.formLabel}>Resolution</Text>
            <View style={styles.resolutionRow}>
              <TextInput
                style={[styles.formInput, styles.resolutionInput]}
                value={width}
                onChangeText={setWidth}
                placeholder="640"
                placeholderTextColor="#9ca3af"
                keyboardType="numeric"
                returnKeyType="done"
                textAlign="right"
              />
              <Text style={styles.resolutionSep}>×</Text>
              <TextInput
                style={[styles.formInput, styles.resolutionInput]}
                value={height}
                onChangeText={setHeight}
                placeholder="480"
                placeholderTextColor="#9ca3af"
                keyboardType="numeric"
                returnKeyType="done"
                textAlign="right"
              />
            </View>
          </View>
        )}

        {/* Custom W×H inputs — sub-row visually attached to Resolution row above */}
        {hasOptions && isCustom && (
          <View style={[styles.formRow, styles.rowBorder, styles.customResolutionRow]}>
            <Text style={styles.formLabel}>W × H</Text>
            <View style={styles.resolutionRow}>
              <TextInput
                style={[styles.formInput, styles.resolutionInput]}
                value={width}
                onChangeText={setWidth}
                placeholder="640"
                placeholderTextColor="#9ca3af"
                keyboardType="numeric"
                returnKeyType="done"
                textAlign="right"
              />
              <Text style={styles.resolutionSep}>×</Text>
              <TextInput
                style={[styles.formInput, styles.resolutionInput]}
                value={height}
                onChangeText={setHeight}
                placeholder="480"
                placeholderTextColor="#9ca3af"
                keyboardType="numeric"
                returnKeyType="done"
                textAlign="right"
              />
            </View>
          </View>
        )}

        <View style={styles.formRow}>
          <Text style={styles.formLabel}>Target FPS</Text>
          <TextInput
            style={styles.formInput}
            value={targetFps}
            onChangeText={setTargetFps}
            placeholder="15"
            placeholderTextColor="#9ca3af"
            keyboardType="numeric"
            returnKeyType="done"
            textAlign="right"
          />
        </View>

      </View>

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

function CameraDetailPage({ camera }: { camera: CameraState }) {
  const [fullscreen,  setFullscreen]  = useState(false);
  const [name,        setName]        = useState(camera.name);
  const [deviceIndex, setDeviceIndex] = useState(String(camera.deviceIndex));
  const [width,       setWidth]       = useState(String(camera.width));
  const [height,      setHeight]      = useState(String(camera.height));
  const [targetFps,   setTargetFps]   = useState(String(camera.targetFps));
  const [saving,      setSaving]      = useState(false);

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
    });
    await robotClient.getCameras().catch(() => {});
    setSaving(false);
  };

  return (
    <View style={{ flex: 1, backgroundColor: "#f3f4f6" }}>
      {fullscreen && Platform.OS !== 'web' && (
        <CameraFullscreenModal camera={camera} onClose={() => setFullscreen(false)} />
      )}
      <SubPageHeader
        title={camera.name}
        subtitle={`Device ${camera.deviceIndex} · ${camera.width}×${camera.height} · ${camera.connected ? "Connected" : "Offline"}`}
      />
      <ScrollView
        contentContainerStyle={{ paddingTop: 24, paddingBottom: 40, gap: 24 }}
        showsVerticalScrollIndicator={false}
      >
        {camera.connected
          ? <CameraWebSocketFeed cameraId={camera.id} onTap={() => setFullscreen(true)} />
          : (
            <View style={styles.feedPlaceholder}>
              <Camera size={28} color="#4b5563" />
              <Text style={styles.feedPlaceholderText}>Offline</Text>
            </View>
          )
        }

        <CameraConfigFields
          name={name}               setName={setName}
          deviceIndex={deviceIndex} setDeviceIndex={setDeviceIndex}
          width={width}             setWidth={setWidth}
          height={height}           setHeight={setHeight}
          targetFps={targetFps}     setTargetFps={setTargetFps}
          savedResolutions={camera.supportedResolutions ?? []}
        />

        <TouchableOpacity
          style={[styles.saveBtn, saving && { opacity: 0.5 }]}
          onPress={save}
          disabled={saving}
          activeOpacity={0.8}
        >
          <Text style={styles.saveBtnText}>{saving ? "Saving…" : "Save"}</Text>
        </TouchableOpacity>
      </ScrollView>
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
  const [saving,      setSaving]      = useState(false);

  const add = async () => {
    setSaving(true);
    try {
      await robotClient.addCamera({
        name:        name.trim(),
        deviceIndex: parseInt(deviceIndex) || 0,
        enabled:     true,
        width:       parseInt(width)     || 640,
        height:      parseInt(height)    || 480,
        targetFps:   parseInt(targetFps) || 15,
      });
      await robotClient.getCameras().catch(() => {});
      router.back();
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: "#f3f4f6" }}>
      <SubPageHeader title="New Camera" subtitle="USB Camera" />
      <ScrollView
        contentContainerStyle={{ paddingTop: 24, paddingBottom: 40, gap: 24 }}
        showsVerticalScrollIndicator={false}
      >
        <CameraConfigFields
          name={name}               setName={setName}
          deviceIndex={deviceIndex} setDeviceIndex={setDeviceIndex}
          width={width}             setWidth={setWidth}
          height={height}           setHeight={setHeight}
          targetFps={targetFps}     setTargetFps={setTargetFps}
          savedResolutions={[]}
        />

        <TouchableOpacity
          style={[styles.saveBtn, saving && { opacity: 0.5 }]}
          onPress={add}
          disabled={saving}
          activeOpacity={0.8}
        >
          <Text style={styles.saveBtnText}>{saving ? "Adding…" : "Add Camera"}</Text>
        </TouchableOpacity>
      </ScrollView>
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
        <View style={{ flex: 1, backgroundColor: "#f3f4f6" }}>
          <SubPageHeader title="Camera" subtitle="Loading…" />
        </View>
      );
    }
    return <CameraDetailPage camera={camera} />;
  }

  return <NewCameraPage />;
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  sectionLabel: {
    fontSize: 11, fontWeight: "700", letterSpacing: 0.8,
    color: "#6b7280", marginBottom: 6, paddingHorizontal: 16,
  },
  sectionBody: {
    backgroundColor: "#fff",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: "#e5e7eb",
  },

  formRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: "#fff",
    minHeight: 48,
  },
  rowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#e5e7eb",
  },
  formLabel: { fontSize: 15, color: "#111827", flex: 1 },
  formInput: {
    fontSize: 15,
    color: "#374151",
    flex: 1,
    paddingVertical: 0,
  },

  resolutionRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  resolutionInput: { flex: 0, width: 52 },
  resolutionSep: { fontSize: 14, color: "#6b7280" },

  dropdownValue: { fontSize: 15, color: "#374151" },
  customResolutionRow: { backgroundColor: "#f9fafb", paddingLeft: 28 },

  sheetBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.35)",
  },
  sheet: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingBottom: 32,
    maxHeight: "60%",
  },
  sheetHandle: {
    alignSelf: "center",
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#d1d5db",
    marginTop: 10,
    marginBottom: 4,
  },
  sheetTitle: {
    fontSize: 13,
    fontWeight: "600",
    color: "#6b7280",
    textAlign: "center",
    paddingVertical: 10,
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
  sheetRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 14,
    backgroundColor: "#fff",
  },
  sheetRowText: { fontSize: 16, color: "#111827", flex: 1 },
  sheetRowTextSelected: { color: "#2563eb", fontWeight: "600" },

  saveBtn: {
    marginHorizontal: 16,
    backgroundColor: "#2563eb",
    borderRadius: 10,
    paddingVertical: 13,
    alignItems: "center",
  },
  saveBtnText: { fontSize: 15, fontWeight: "700", color: "#fff" },


  cameraFeed: {
    width: "100%",
    aspectRatio: 4 / 3,
    backgroundColor: "#000",
  },
  feedPlaceholder: {
    width: "100%",
    aspectRatio: 4 / 3,
    backgroundColor: "#111827",
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
  },
  feedPlaceholderText: { fontSize: 13, color: "#6b7280" },

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
