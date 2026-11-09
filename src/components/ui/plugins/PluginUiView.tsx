import React from "react";
import { StyleProp, ViewStyle } from "react-native";
import { WebView } from "react-native-webview";

export type PluginUiViewProps = {
  /** The controller-served UI URL, e.g. `http://<controller>:9000/plugins/<id>/ui/`. */
  uri: string;
  style?: StyleProp<ViewStyle>;
};

/**
 * Native host for a plugin's custom GUI. Loads the controller-served page by URL;
 * the page opens its own WebSocket back to the controller (see the served
 * `ui-bridge.js` → `SimpleRobot.onState/invoke`), so nothing is relayed through the
 * app. See PluginUiView.web.tsx for the browser/Electron half (an iframe).
 */
export function PluginUiView({ uri, style }: PluginUiViewProps) {
  return (
    <WebView
      source={{ uri }}
      style={style}
      originWhitelist={["*"]}
      javaScriptEnabled
      domStorageEnabled
      setSupportMultipleWindows={false}
    />
  );
}
