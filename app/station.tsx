import { Stack, router, useLocalSearchParams, usePathname } from "expo-router";
import { CheckCircle2, Radio } from "lucide-react-native";
import { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

import { Button, Card, colors, radii, spacing, type } from "@/src/components/ui/kit";
import { getSelectedRobot, setSelectedRobot } from "@/src/connections/robotState";
import type { RobotInfo } from "@/src/models/robotModels";
import { robotClient } from "@/src/services/RobotConnectService";
import { manualRobot, recordConnection } from "@/src/services/connectionStore";
import {
  DEFAULT_CONTROL_PORT,
  goRoute,
  hasAction,
  paramsToLink,
  stationLabel,
  stationSummary,
  type StationLink,
  type StationRunKind,
} from "@/src/services/stationLink";

// Landing screen for a scanned/tapped station link (simplerobotapp://station?…). Expo Router routes
// here on both cold and warm launches. It talks to the robotClient singleton directly because it
// lives outside the (tabs) group, so the React providers aren't mounted here. Confirmation (when the
// tag asks for it) is rendered inline rather than via appAlert — the alert host isn't mounted on a
// cold start, which would otherwise auto-fire the action without asking.

const RUN_CONNECT_TIMEOUT_MS = 15000;

function robotFromLink(link: StationLink): RobotInfo {
  const robot = manualRobot(link.host!);
  robot.port = link.port ?? DEFAULT_CONTROL_PORT;
  if (link.name) robot.robotName = link.name;
  return robot;
}

/** Start a program/background program as soon as the controller is connected. */
function startWhenConnected(name: string, id: string | undefined, kind: StationRunKind | undefined) {
  let done = false;
  const finish = () => { done = true; unsub(); };
  const unsub = robotClient.onStatus(status => {
    if (!done && status.connected) {
      finish();
      // id resolved first on the controller (rename-proof); name is the fallback.
      if (kind === "background") robotClient.startBackgroundProgram(name, id).catch(() => {});
      else robotClient.startProgram(name, id).catch(() => {});
    }
  });
  // Give up quietly if the controller never comes up — the user still lands on the page.
  setTimeout(() => { if (!done) finish(); }, RUN_CONNECT_TIMEOUT_MS);
}

function targetRoute(link: StationLink): string {
  if (link.go) return goRoute(link.go);
  if (link.run || link.runId) return "/program"; // a "start the cycle" tag lands on Programs by default
  return "/robot";
}

type Phase = "redirect" | "confirm" | "working";

/** True if the client is already connected to exactly this controller (host + port). */
function alreadyConnectedTo(link: StationLink): boolean {
  if (!link.host) return false;
  const cur = getSelectedRobot();
  return (
    robotClient.connected &&
    cur?.ipAddress === link.host &&
    cur?.port === (link.port ?? DEFAULT_CONTROL_PORT)
  );
}

export default function Station() {
  const params = useLocalSearchParams<Record<string, string>>();
  const link = useMemo(() => paramsToLink(params), [params]);
  const pathname = usePathname();
  const acted = useRef(false);
  // Decide the phase at render (not via setState-in-effect): nothing to do → bounce to Robot;
  // a tag that asks to confirm → wait for the button; otherwise act straight away on mount.
  const [phase] = useState<Phase>(() => (!hasAction(link) ? "redirect" : link.confirm ? "confirm" : "working"));

  function act() {
    if (acted.current) return;
    acted.current = true;

    // #2 Idempotent connect: if a re-fired tag points at the controller we're already connected to,
    // skip connectTo() entirely — it would otherwise disconnect + reconnect, flickering the status.
    if (link.host && !alreadyConnectedTo(link)) {
      const robot = robotFromLink(link);
      recordConnection(robot);
      setSelectedRobot(robot);       // persist + flip the Robot tab to the connected dashboard
      robotClient.connectTo(robot);  // connect now (covers a warm launch where providers are up)
    }
    if (link.run || link.runId) startWhenConnected(link.run ?? "", link.runId, link.runKind);

    // A "provider" tag opens the phone-provider for the tag's device and auto-starts streaming, so
    // the phone that scanned it becomes that device's source. Carry the device id/name + mode as params.
    if (link.provider) {
      const dest = "/io/phone-provider";
      if (pathname !== dest) {
        router.replace({
          pathname: dest,
          params: {
            deviceId: link.provider,
            name: link.name ?? "",
            autostart: "1",
          },
        } as never);
      }
      return;
    }

    // #3 Skip redundant navigation: only replace if we aren't already on the destination route.
    // Replace (not push) so Back never returns to this transient screen.
    const dest = targetRoute(link);
    if (pathname !== dest) router.replace(dest as never);
  }

  useEffect(() => {
    if (phase === "redirect") router.replace("/robot");
    else if (phase === "working") act();
    // Runs once on mount; `act`/`link`/`phase` are fixed for this screen's life.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />
      <Card style={styles.card}>
        {phase === "confirm" ? (
          <>
            <View style={[styles.badge, { backgroundColor: colors.accentSoft }]}>
              <Radio size={28} color={colors.accent} />
            </View>
            <Text style={styles.title}>Station tag</Text>
            <Text style={styles.summary}>{stationSummary(link)}</Text>
            <View style={styles.buttons}>
              <Button label="Cancel" variant="ghost" onPress={() => router.replace("/robot")} style={styles.btn} />
              <Button label={(link.run || link.runId) ? "Connect & start" : "Connect"} onPress={act} style={styles.btn} />
            </View>
          </>
        ) : (
          <>
            <View style={[styles.badge, { backgroundColor: colors.accentSoft }]}>
              {phase === "working" ? <CheckCircle2 size={28} color={colors.accent} /> : <Radio size={28} color={colors.accent} />}
            </View>
            <Text style={styles.title}>{link.host ? `Connecting to ${stationLabel(link)}…` : "Opening…"}</Text>
            <ActivityIndicator color={colors.accent} style={styles.spinner} />
          </>
        )}
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, alignItems: "center", justifyContent: "center", padding: spacing.lg },
  card: { width: "100%", maxWidth: 420, alignItems: "center", gap: spacing.md, paddingVertical: spacing.xl },
  badge: { width: 56, height: 56, borderRadius: radii.pill, alignItems: "center", justifyContent: "center" },
  title: { ...type.pageTitle, textAlign: "center" },
  summary: { ...type.body, color: colors.textSecondary, textAlign: "center" },
  spinner: { marginTop: spacing.xs },
  buttons: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm, alignSelf: "stretch" },
  btn: { flex: 1 },
});
