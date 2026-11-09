// Opening manual pages from anywhere in the app.

import { router } from "expo-router";
import { Linking } from "react-native";

import { DocTarget, findRefEntry, manualRoute } from "./manual";

/** Go to a manual page (pushed, so Back returns to where the reader came from). */
export function openManual(target: DocTarget = { kind: "contents" }) {
  if (target.kind === "external") { void Linking.openURL(target.url); return; }
  const href = manualRoute(target);
  if (href) router.push(href as never);
}

/** Open a step's reference page by step type or keyword; falls back to the contents. */
export function openStepReference(key: string) {
  openManual({ kind: "step", key: findRefEntry(key)?.type ?? key });
}

/**
 * Back from a manual page: the previous screen when there is one (the builder, another manual
 * page), else the manual's contents or the Program tab.
 */
export function manualBack(fallback: string = "/(tabs)/program/manual") {
  if (router.canGoBack()) router.back();
  else router.dismissTo(fallback as never);
}
