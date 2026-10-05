import React from "react";
import { ActivityIndicator, Modal, Text, TouchableOpacity, View } from "react-native";
import { makeColorPickHtml } from "@/src/vision/visionHtml";
import { VisionCanvas } from "@/src/vision/VisionCanvas";
import { accents, colors, spacing, radii } from "@/src/components/ui/kit";

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
          paddingHorizontal: spacing.lg, paddingTop: 52, paddingBottom: spacing.sm, backgroundColor: 'rgba(0,0,0,0.7)' }}>
          <Text style={{ color: colors.onAccent, fontSize: 14, fontWeight: '600' }}>Tap to pick a color</Text>
          <TouchableOpacity onPress={onClose}
            style={{ backgroundColor: colors.textSecondary, borderRadius: radii.md, paddingHorizontal: spacing.md + 2, paddingVertical: spacing.sm }}>
            <Text style={{ color: colors.onAccent, fontWeight: '700', fontSize: 13 }}>Cancel</Text>
          </TouchableOpacity>
        </View>
        <View style={{ flex: 1 }}>
          {html ? (
            <VisionCanvas html={html} style={{ flex: 1 }}
              onMessage={e => {
                try {
                  const msg = JSON.parse(e.nativeEvent.data);
                  if (msg.type === 'color') { onPick(msg.r, msg.g, msg.b); onClose(); }
                } catch {}
              }}
            />
          ) : (
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', gap: spacing.md }}>
              <ActivityIndicator size="large" color={accents.cyan} />
              <Text style={{ color: colors.textFaint, fontSize: 13 }}>Loading snapshot…</Text>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}
