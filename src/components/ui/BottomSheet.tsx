import { ReactNode } from "react";
import { Modal, Text, TouchableOpacity, View } from "react-native";
import { colors, radii, spacing } from "@/src/components/ui/kit";

export function BottomSheet({ visible, onClose, title, children }: {
  visible: boolean; onClose: () => void; title: string; children: ReactNode;
}) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' }}>
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
