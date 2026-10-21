import React from "react";
import { StyleProp, View, ViewStyle } from "react-native";

export type PluginUiViewProps = {
  /** The controller-served UI URL, e.g. `http://<controller>:9000/plugins/<id>/ui/`. */
  uri: string;
  style?: StyleProp<ViewStyle>;
};

/**
 * Web/Electron host for a plugin's custom GUI: an iframe pointed at the
 * controller-served page (`react-native-webview` has no browser implementation).
 * The page opens its own WebSocket to the controller; the app does not relay.
 */
export function PluginUiView({ uri, style }: PluginUiViewProps) {
  return (
    <View style={style}>
      <iframe
        src={uri}
        title="Plugin UI"
        style={{ width: "100%", height: "100%", border: 0, display: "block", background: "transparent" }}
      />
    </View>
  );
}
