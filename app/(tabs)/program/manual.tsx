// The programming manual's contents: search, chapters by part and the instruction reference.

import { View } from "react-native";

import { ManualContentsView } from "@/src/components/docs/ManualContentsView";
import { PageHeader, Screen, colors } from "@/src/components/ui/kit";
import { usePaneLayout } from "@/src/components/ui/responsive";
import { manualBack, openManual } from "@/src/docs/navigation";

export default function ManualScreen() {
  const desktop = usePaneLayout() === "desktop";
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <PageHeader
        title="Programming Manual"
        subtitle="How programs work, and every instruction with its parameters"
        crumbs={[{ label: "Program", href: "/program" }, { label: "Manual" }]}
        onBack={() => manualBack("/program")}
        connection={false}
      />
      <Screen>
        <ManualContentsView onNavigate={openManual} twoColumn={desktop} />
      </Screen>
    </View>
  );
}

