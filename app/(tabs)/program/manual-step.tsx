// One instruction's reference page — the connected robot's catalog for syntax and parameters,
// the bundled manual for everything else (and all of it offline).

import { useLocalSearchParams } from "expo-router";
import { ListTree } from "lucide-react-native";
import { View } from "react-native";

import { StepReferenceView } from "@/src/components/docs/StepReferenceView";
import { Button, EmptyState, PageHeader, Screen, colors } from "@/src/components/ui/kit";
import { useStepCatalog } from "@/src/components/ui/builder/useStepCatalog";
import { manualBack, openManual } from "@/src/docs/navigation";
import { useStepReference } from "@/src/docs/useStepReference";

export default function ManualStepScreen() {
  const { key } = useLocalSearchParams<{ key?: string }>();
  const { entry, live } = useStepReference(key);
  const catalog = useStepCatalog();

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <PageHeader
        title={entry ? entry.keyword : "Instruction"}
        subtitle={entry ? entry.name : "Not in this manual"}
        crumbs={[
          { label: "Program", href: "/program" },
          { label: "Manual", href: "/(tabs)/program/manual" },
          { label: entry?.keyword ?? "Instruction" },
        ]}
        onBack={() => manualBack()}
        connection={false}
      />
      <Screen contentStyle={{ maxWidth: 980 }}>
        {entry ? (
          <StepReferenceView entry={entry} live={live} onNavigate={openManual} liveCategories={catalog.catalog?.categories} showTitle={false} />
        ) : (
          <EmptyState
            icon={<ListTree size={32} color={colors.textFaint} />}
            title={`No reference for ${key ?? "this step"}`}
            subtitle="It may be newer than this app. Connect to the robot to see its steps."
            action={<Button label="Open the manual" variant="secondary" onPress={() => openManual({ kind: "contents" })} />}
          />
        )}
      </Screen>
    </View>
  );
}
