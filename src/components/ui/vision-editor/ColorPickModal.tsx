import React from "react";
import { ActivityIndicator, Modal, Text, TouchableOpacity, View } from "react-native";
import { makeColorPickHtml } from "@/src/vision/visionHtml";
import { WebView } from "react-native-webview";

export function ColorPickModal({ visible, snapshotUri, onPick, onClose }: {
  visible: boolean;
  snapshotUri: string | null;
  onPick: (r: number, g: number, b: number) => void;
  onClose: () => void;
}) {
  const html = snapshotUri ? makeColorPickHtml(snapshotUri) : null;
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: '#000' }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
          paddingHorizontal: 16, paddingTop: 52, paddingBottom: 10, backgroundColor: 'rgba(0,0,0,0.7)' }}>
          <Text style={{ color: '#fff', fontSize: 14, fontWeight: '600' }}>Tap to pick a color</Text>
          <TouchableOpacity onPress={onClose}
            style={{ backgroundColor: '#374151', borderRadius: 8, paddingHorizontal: 14, paddingVertical: 6 }}>
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>Cancel</Text>
          </TouchableOpacity>
        </View>
        <View style={{ flex: 1 }}>
          {html ? (
            <WebView source={{ html }} scrollEnabled={false} originWhitelist={['*']} javaScriptEnabled
              onMessage={e => {
                try {
                  const msg = JSON.parse(e.nativeEvent.data);
                  if (msg.type === 'color') { onPick(msg.r, msg.g, msg.b); onClose(); }
                } catch {}
              }}
            />
          ) : (
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 }}>
              <ActivityIndicator size="large" color="#0891b2" />
              <Text style={{ color: '#9ca3af', fontSize: 13 }}>Loading snapshot…</Text>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}
