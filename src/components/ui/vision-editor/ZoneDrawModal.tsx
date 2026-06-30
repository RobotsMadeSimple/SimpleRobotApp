import React, { useEffect, useRef, useState } from "react";
import { Modal, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { makeZoneDrawHtml } from "@/src/vision/visionHtml";
import { VisionZone, VisionZoneGeometry, VisionZoneShape } from "@/src/models/robotModels";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { WebView } from "react-native-webview";
import { ves } from "./visionEditorStyles";

const SHAPES: { shape: VisionZoneShape; label: string }[] = [
  { shape: 'Rectangle', label: 'Rect' },
  { shape: 'Circle',    label: 'Circle' },
  { shape: 'Polygon',   label: 'Polygon' },
];

export function ZoneDrawModal({ visible, snapshotUri, zones, editingZoneId, onDone, onCancel }: {
  visible: boolean;
  snapshotUri: string | null;
  zones: VisionZone[];
  editingZoneId: string | null;
  onDone: (geometry: VisionZoneGeometry) => void;
  onCancel: () => void;
}) {
  const insets                    = useSafeAreaInsets();
  const [shape, setShape]         = useState<VisionZoneShape>('Rectangle');
  const [polyReady, setPolyReady] = useState(false);
  const webviewRef                = useRef<any>(null);

  useEffect(() => {
    if (visible) { setShape('Rectangle'); setPolyReady(false); }
  }, [visible]);

  function changeShape(s: VisionZoneShape) {
    setShape(s);
    setPolyReady(false);
    webviewRef.current?.injectJavaScript(`window.setShape(${JSON.stringify(s)});true;`);
  }

  function onMessage(e: any) {
    try {
      const msg = JSON.parse(e.nativeEvent.data);
      if (msg.type === 'zone' && msg.geometry) {
        onDone(msg.geometry as VisionZoneGeometry);
      } else if (msg.type === 'polypts') {
        setPolyReady(msg.count >= 3);
      }
    } catch {}
  }

  function finishPolygon() {
    webviewRef.current?.injectJavaScript(`window.finishPolygon();true;`);
  }

  const html = snapshotUri
    ? makeZoneDrawHtml(snapshotUri, zones, editingZoneId, shape)
    : null;

  return (
    <Modal visible={visible} animationType="slide" statusBarTranslucent onRequestClose={onCancel}>
      <View style={ves.drawModalRoot}>
        {html ? (
          <WebView
            ref={webviewRef}
            source={{ html }}
            style={StyleSheet.absoluteFill}
            scrollEnabled={false}
            originWhitelist={["*"]}
            javaScriptEnabled
            onMessage={onMessage}
          />
        ) : (
          <View style={[StyleSheet.absoluteFill, { justifyContent: 'center', alignItems: 'center' }]}>
            <Text style={{ color: '#6b7280', fontSize: 14 }}>
              Select a camera above to load a snapshot for zone drawing.
            </Text>
          </View>
        )}

        <View style={ves.drawHint} pointerEvents="none">
          <Text style={ves.drawHintText}>
            {shape === 'Rectangle' ? 'Drag to draw a rectangle' :
             shape === 'Circle'    ? 'Drag from center outward' :
             polyReady             ? 'Tap Finish or keep adding points' :
                                    'Tap to add points (need 3+)'}
          </Text>
        </View>

        <View style={ves.drawToolbar} pointerEvents="box-none">
          <View style={[ves.drawToolbarInner, { paddingBottom: insets.bottom || 10 }]}>
            <TouchableOpacity onPress={onCancel} style={ves.drawCancelBtn}>
              <Text style={ves.drawCancelText}>Cancel</Text>
            </TouchableOpacity>

            <View style={ves.drawShapeRow}>
              {SHAPES.map(({ shape: s, label }) => (
                <TouchableOpacity
                  key={s}
                  style={[ves.drawShapeChip, shape === s && ves.drawShapeChipActive]}
                  onPress={() => changeShape(s)}
                >
                  <Text style={[ves.drawShapeText, shape === s && ves.drawShapeTextActive]}>{label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {shape === 'Polygon' && polyReady && (
              <TouchableOpacity onPress={finishPolygon} style={ves.drawFinishBtn}>
                <Text style={ves.drawFinishText}>Finish</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
}
