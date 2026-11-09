import React, { useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { ProgramStep } from "@/src/models/robotModels";
import { accents, colors } from "@/src/components/ui/kit";
import { sharedStyles } from "./builderStyles";
import { BranchFooter, ifStyles } from "./IfConditionBody";
import { STEP_THEME, ScopeFrame } from "./stepUtils";

// A Try block's body, modelled on IfConditionBody: a TRY card (the steps that may fail, and how
// often they are retried) and a CATCH card (what runs when they still fail — empty means the
// error is ignored), each with an Enter pill. Retries and codes are set in the step editor.

const CARD_GAP = 8;

export function TryBody({ step, onEnterScope }: {
  step: ProgramStep;
  onEnterScope: (frame: ScopeFrame) => void;
}) {
  const theme = STEP_THEME["Try"] ?? STEP_THEME["MoveL"];
  const [stripW, setStripW] = useState(0);
  const inner = Math.max(0, stripW - 20);
  const cardW = Math.round(inner * 0.82);
  const cardStyle = cardW > 0 ? { width: cardW } : undefined;
  const retries = step.tryRetries ?? 0;
  const tryNote = retries > 0
    ? `retried ×${retries}${step.tryRetryDelayMs ? `, ${step.tryRetryDelayMs} ms apart` : ""}`
    : "runs once";
  const catchCount = (step.catchSteps ?? []).length;
  const codes = step.catchCodes?.length ? step.catchCodes.join(", ") : "any runtime error";

  return (
    <View style={[sharedStyles.loopCardBody, { borderTopColor: theme.accent + "40" }]}>
      <View onLayout={e => setStripW(e.nativeEvent.layout.width)}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={ifStyles.strip}
          snapToInterval={cardW + CARD_GAP} snapToAlignment="start" decelerationRate="fast">
          <View style={[ifStyles.branchCard, cardStyle, { borderColor: "#bae6fd", backgroundColor: colors.accentSoft }]}>
            <View style={ifStyles.branchHeader}>
              <View style={[ifStyles.branchBadge, { backgroundColor: accents.cyan }]}>
                <Text style={[ifStyles.branchLabel, { color: colors.onAccent }]}>TRY</Text>
              </View>
              <Text style={ifStyles.elseText} numberOfLines={1}>{tryNote}</Text>
            </View>
            <BranchFooter count={(step.trySteps ?? []).length} tint={accents.cyan}
              onPress={() => onEnterScope({ kind: "try", stepId: step.id, label: "TRY" })} />
          </View>
          <View style={[ifStyles.branchCard, cardStyle, { borderColor: "#fecaca", backgroundColor: colors.dangerSoft }]}>
            <View style={ifStyles.branchHeader}>
              <View style={[ifStyles.branchBadge, { backgroundColor: colors.danger }]}>
                <Text style={[ifStyles.branchLabel, { color: colors.onAccent }]}>CATCH</Text>
              </View>
              <Text style={ifStyles.elseText} numberOfLines={1}>
                {catchCount ? `on ${codes}` : `ignores ${codes}`}
              </Text>
            </View>
            <BranchFooter count={catchCount} tint={colors.danger}
              onPress={() => onEnterScope({ kind: "catch", stepId: step.id, label: "CATCH" })} />
          </View>
        </ScrollView>
      </View>
    </View>
  );
}
