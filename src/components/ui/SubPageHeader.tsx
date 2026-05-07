import { router } from "expo-router";
import { ArrowLeft } from "lucide-react-native";
import { Pressable, StyleSheet, Text, View } from "react-native";

type Props = {
  title:     string;
  subtitle?: string;
  right?:    React.ReactNode;
};

/**
 * Consistent top bar for full-screen subpages that manage their own header
 * (i.e. headerShown: false in the layout).  Matches the style of the IO
 * configure page's topBar.
 */
export function SubPageHeader({ title, subtitle, right }: Props) {
  return (
    <View style={styles.bar}>
      <Pressable style={styles.backBtn} onPress={() => router.back()} hitSlop={8}>
        <ArrowLeft size={20} color="#111827" />
      </Pressable>

      <View style={styles.titleBlock}>
        <Text style={styles.title} numberOfLines={1}>{title}</Text>
        {!!subtitle && (
          <Text style={styles.subtitle} numberOfLines={1}>{subtitle}</Text>
        )}
      </View>

      {right != null && <View>{right}</View>}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection:     "row",
    alignItems:        "center",
    gap:               10,
    paddingHorizontal: 16,
    paddingTop:        16,
    paddingBottom:     12,
    backgroundColor:   "#fff",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#e5e7eb",
  },
  backBtn: {
    width:           36,
    height:          36,
    borderRadius:    10,
    backgroundColor: "#f3f4f6",
    justifyContent:  "center",
    alignItems:      "center",
  },
  titleBlock: {
    flex: 1,
  },
  title: {
    fontSize:   16,
    fontWeight: "700",
    color:      "#111827",
  },
  subtitle: {
    fontSize:  11,
    color:     "#9ca3af",
    marginTop: 1,
  },
});
