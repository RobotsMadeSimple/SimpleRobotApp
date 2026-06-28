import { ReactNode } from "react";
import { Modal, Text, TouchableOpacity, View } from "react-native";

export function BottomSheet({ visible, onClose, title, children }: {
  visible: boolean; onClose: () => void; title: string; children: ReactNode;
}) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' }}>
        <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={onClose} />
        <View style={{
          backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20,
          padding: 20, paddingBottom: 36, gap: 4, maxHeight: '85%',
        }}>
          <Text style={{ fontSize: 16, fontWeight: '700', color: '#111827', marginBottom: 10 }}>{title}</Text>
          {children}
        </View>
      </View>
    </Modal>
  );
}
