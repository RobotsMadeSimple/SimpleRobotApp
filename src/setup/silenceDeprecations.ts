import { LogBox } from "react-native";

// nativewind's react-native-css-interop runs `cssInterop(RN.SafeAreaView, …)` at module
// load (node_modules/react-native-css-interop/dist/runtime/components.js), which touches
// React Native's deprecated `SafeAreaView` and fires a `warnOnce` on every launch. It's a
// dependency, not our code — nothing here uses RN's SafeAreaView; we use
// `react-native-safe-area-context`. Silence just that one message.
//
// This must run before nativewind/global.css is imported (so it registers ahead of the
// warnOnce), which is why it's the first import in the root layout. Remove it once
// react-native-css-interop stops referencing the deprecated component.
LogBox.ignoreLogs(["SafeAreaView has been deprecated and will be removed in a future release."]);
