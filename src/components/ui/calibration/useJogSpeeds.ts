import { useCallback, useState } from "react";
import { useFocusEffect } from "expo-router";

import { robotClient } from "@/src/services/RobotConnectService";

export type JogSpeeds = { Slow: number; Normal: number; Fast: number };

/** The Slow/Normal/Fast jog speeds from Robot › Configure, reloaded on focus (as the jog page does). */
export function useJogSpeeds(): JogSpeeds | undefined {
  const [speeds, setSpeeds] = useState<JogSpeeds | undefined>(undefined);
  useFocusEffect(useCallback(() => {
    robotClient.getRobotConfig()
      .then(cfg => setSpeeds({ Slow: cfg.jogSlowSpeed, Normal: cfg.jogNormalSpeed, Fast: cfg.jogFastSpeed }))
      .catch(() => {});
  }, []));
  return speeds;
}
