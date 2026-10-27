import React, { ReactNode } from 'react';
import { Modal, Text, TouchableOpacity, View } from 'react-native';
import { colors, radii, spacing } from '@/src/components/ui/kit';
import { useKeyboardHeight } from '@/src/platform/keyboard';

export function BottomSheet({ visible, onClose, title, children }: {
  visible: boolean; onClose: () => void; title: string; children: ReactNode;
}) {
  // A Modal keeps the full window when the keyboard opens (Android draws the IME over it), so
  // lift the sheet by the keyboard's height ourselves — whatever is being typed stays visible.
  const kb = useKeyboardHeight();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)', paddingBottom: kb }}>
        <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={onClose} />
        <View style={{
          backgroundColor: colors.surface, borderTopLeftRadius: radii.xl, borderTopRightRadius: radii.xl,
          padding: 20, paddingBottom: 36, gap: spacing.xs, maxHeight: '85%',
        }}>
          <Text style={{ fontSize: 16, fontWeight: '700', color: colors.text, marginBottom: 10 }}>{title}</Text>
          {children}
        </View>
      </View>
    </Modal>
  );
}
