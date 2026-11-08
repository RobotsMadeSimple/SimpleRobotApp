import { useEffect, useRef, useState } from "react";
import { Platform, StyleProp, StyleSheet, Text, View, ViewStyle } from "react-native";
import { Camera } from "lucide-react-native";

import { colors, radii } from "@/src/components/ui/kit";
import { robotClient } from "@/src/services/RobotConnectService";
import { VisionCanvas } from "@/src/vision/VisionCanvas";
import { FEED_NOTE_JS, LIVE_FEED_JS, startLiveFeedHere } from "@/src/vision/liveFeedSocket";

// The WebView's decode/draw loop for the camera's MJPEG-over-WebSocket feed (native).
function makeCameraHtml(wsUrl: string, zoomable: boolean): string {
  const viewport = zoomable
    ? "width=device-width,initial-scale=1,maximum-scale=10,user-scalable=yes"
    : "width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no";
  const tapScript = zoomable ? "" :
    `document.addEventListener('click',function(){try{window.ReactNativeWebView.postMessage('tap');}catch(e){}});`;
  return `<!DOCTYPE html><html>
<head>
  <meta name="viewport" content="${viewport}">
  <style>*{margin:0;padding:0;box-sizing:border-box}html,body{width:100%;height:100%;background:#000;overflow:hidden}canvas{width:100%;height:100%;object-fit:contain;display:block}</style>
</head>
<body>
  <canvas id="c"></canvas>
  <script>
    var c=document.getElementById('c'),x=c.getContext('2d');
    ${LIVE_FEED_JS}
    ${FEED_NOTE_JS}
    function draw(src,done){var i=new Image();i.onload=function(){if(c.width!==i.naturalWidth||c.height!==i.naturalHeight){c.width=i.naturalWidth;c.height=i.naturalHeight;}x.drawImage(i,0,0,c.width,c.height);done();};i.onerror=done;i.src=src;}
    // Reconnects and watches itself (src/vision/liveFeedSocket.ts), so a dropped socket never freezes the picture.
    liveFeed(${JSON.stringify(wsUrl)},{frame:draw,note:showNote,log:function(m){try{console.log('[feed] '+m);}catch(e){}}});
    ${tapScript}
  <\/script>
</body></html>`;
}

export { makeCameraHtml };

/**
 * Live view of a camera: the controller's `/camera/{id}/ws` stream of base64 JPEG
 * frames, drawn on a canvas (web) or inside a WebView (native). Shared by the
 * camera pages and the calibration wizard.
 */
export function CameraLiveFeed({
  cameraId, onTap, style, aspectRatio = 4 / 3, zoomable = false,
}: {
  cameraId: string;
  onTap?: () => void;
  style?: StyleProp<ViewStyle>;
  /** Frame box shape until the first frame sets the real one. */
  aspectRatio?: number;
  /** Native only: allow pinch-zoom in the WebView. */
  zoomable?: boolean;
}) {
  const [hasFrame, setHasFrame] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const canvasRef = useRef<any>(null);

  useEffect(() => {
    if (Platform.OS !== "web") return;
    const wsUrl = robotClient.cameraWsUrl(cameraId);
    if (!wsUrl) return;
    let cancelled = false;
    function decode(data: string, done: () => void) {
      const img = new (window as any).Image() as HTMLImageElement;
      img.onload = () => {
        const canvas = canvasRef.current;
        if (!cancelled && canvas) {
          if (canvas.width !== img.naturalWidth || canvas.height !== img.naturalHeight) {
            canvas.width  = img.naturalWidth;
            canvas.height = img.naturalHeight;
          }
          canvas.getContext("2d")?.drawImage(img, 0, 0);
          setHasFrame(true);
        }
        done();
      };
      img.onerror = () => done();
      img.src = data;
    }
    // Reconnects and watches itself (src/vision/liveFeedSocket.ts), like the native document.
    const feed = startLiveFeedHere(wsUrl, {
      frame: decode,
      note: (t) => { if (!cancelled) setNote(t); },
      log: (m) => console.log(`[feed] ${m}`),
    });
    return () => { feed.close(); cancelled = true; };
  }, [cameraId]);

  const box = [styles.feed, { aspectRatio }, style];

  if (Platform.OS === "web") {
    return (
      <View style={box}>
        {/* @ts-ignore — DOM element on web */}
        <canvas
          ref={canvasRef}
          onClick={() => (onTap ? onTap() : canvasRef.current?.requestFullscreen?.())}
          style={{ width: "100%", height: "100%", objectFit: "contain", display: "block", backgroundColor: "#000", cursor: "pointer" }}
        />
        {!hasFrame && (
          <View style={[StyleSheet.absoluteFill, styles.placeholder]}>
            <Camera size={28} color={colors.textFaint} />
            <Text style={styles.placeholderText}>Connecting…</Text>
          </View>
        )}
        {hasFrame && !!note && (
          <View style={styles.note} pointerEvents="none">
            <Text style={styles.noteText}>{note}</Text>
          </View>
        )}
      </View>
    );
  }

  const wsUrl = robotClient.cameraWsUrl(cameraId);
  if (!wsUrl) {
    return (
      <View style={[box, styles.placeholder]}>
        <Camera size={28} color={colors.textFaint} />
        <Text style={styles.placeholderText}>Not connected</Text>
      </View>
    );
  }

  return (
    <VisionCanvas
      html={makeCameraHtml(wsUrl, zoomable)}
      style={box}
      onMessage={(e) => { if (e.nativeEvent.data === "tap") onTap?.(); }}
    />
  );
}

const styles = StyleSheet.create({
  feed: {
    width: "100%",
    backgroundColor: "#000",
    borderRadius: radii.lg,
    overflow: "hidden",
  },
  placeholder: { justifyContent: "center", alignItems: "center", gap: 8, backgroundColor: "#000" },
  placeholderText: { fontSize: 13, color: colors.textMuted },
  // The "No new frames…" note over a stalled feed (dark chip on the video, like the native one).
  note: { position: "absolute", bottom: 10, alignSelf: "center", maxWidth: "92%", paddingHorizontal: 10, paddingVertical: 5,
          borderRadius: 6, backgroundColor: "rgba(0,0,0,0.72)" },
  noteText: { color: "#fff", fontSize: 12, fontWeight: "600", textAlign: "center" },
});
