import type { StyleProp, ViewStyle } from "react-native";

/**
 * The slice of the WebView API the vision editor actually uses.
 *
 * Deliberately small. Every method here has to hold on both a native WebView and a
 * browser iframe, and the two bridge messages in opposite ways — anything wider
 * would be a promise the web side cannot keep.
 */
export type VisionCanvasHandle = {
  /**
   * Run a snippet inside the canvas. Fire-and-forget: results come back through
   * `onMessage`, the same as on native.
   *
   * Calls made before the document is ready are queued and flushed on load rather
   * than dropped, so an effect that runs on mount does not have to wait for it.
   */
  injectJavaScript: (code: string) => void;
};

export type VisionCanvasProps = {
  /** A whole document. `window.ReactNativeWebView.postMessage` works inside it on both platforms. */
  html: string;
  style?: StyleProp<ViewStyle>;
  /** Shaped like the WebView event so call sites read the same on both platforms. */
  onMessage?: (event: { nativeEvent: { data: string } }) => void;
  /** Fires once the document is ready. Injections made earlier have already been flushed. */
  onLoad?: () => void;
  /** False keeps the canvas out of the tab order — for a feed that is watched, not used. */
  focusable?: boolean;
};
