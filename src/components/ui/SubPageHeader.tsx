import { colors, radii, spacing } from "@/src/components/ui/kit";
import { router } from "expo-router";
import { ArrowLeft } from "lucide-react-native";
import { Pressable, StyleSheet, Text, View } from "react-native";

type Props = {
  title:     string;
  subtitle?: string;
  right?:    React.ReactNode;
  onBack?:   () => void;
};

/**
 * Consistent top bar for full-screen subpages that manage their own header
 * (i.e. headerShown: false in the layout).  Matches the style of the IO
 * configure page's topBar.
 */
export function SubPageHeader({ title, subtitle, right, onBack }: Props) {
  return (
    <View style={styles.bar}>
      <Pressable style={styles.backBtn} onPress={() => onBack ? onBack() : router.back()} hitSlop={8}>
        <ArrowLeft size={20} color={colors.text} />
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
    paddingHorizontal: spacing.lg,
    paddingTop:        spacing.lg,
    paddingBottom:     spacing.md,
    backgroundColor:   colors.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  backBtn: {
    width:           36,
    height:          36,
    borderRadius:    radii.sm,
    backgroundColor: colors.background,
    justifyContent:  "center",
    alignItems:      "center",
  },
  titleBlock: {
    flex: 1,
  },
  title: {
    fontSize:   16,
    fontWeight: "700",
    color:      colors.text,
  },
  subtitle: {
    fontSize:  11,
    color:     colors.textFaint,
    marginTop: 1,
  },
});
