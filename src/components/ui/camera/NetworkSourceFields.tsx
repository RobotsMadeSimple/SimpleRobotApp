import { CircleCheck, Eye, EyeOff, PlugZap } from "lucide-react-native";
import { useEffect, useState } from "react";
import { Pressable, StyleProp, StyleSheet, Text, View, ViewStyle } from "react-native";

import { Button, buttonTextColor, colors, FormRow, Input, SegmentedControl, spacing, type } from "@/src/components/ui/kit";
import { Notice } from "@/src/components/ui/calibration/Notice";
import { CameraSourceTestResult, CameraTransport } from "@/src/models/robotModels";
import { isUnsupportedCommand, robotClient } from "@/src/services/RobotConnectService";
import { cameraUrlProblem, formatTestResult, isRtspUrl, NetworkSource, testErrorHint } from "./cameraSource";

const TRANSPORTS: { label: string; value: CameraTransport }[] = [
  { label: "TCP", value: "tcp" },
  { label: "UDP", value: "udp" },
];

/**
 * The network-camera half of the add/edit camera form: URL, credentials,
 * RTSP transport and a Test connection probe (TestCameraSource). Rendered
 * inside the Configuration card in place of the USB device/resolution rows.
 */
export function NetworkSourceFields({
  value, onChange, rowStyle,
}: {
  value: NetworkSource;
  onChange: (next: NetworkSource) => void;
  /** Spacing between rows (the form's fieldGap). */
  rowStyle?: StyleProp<ViewStyle>;
}) {
  const [revealed,      setRevealed]      = useState(false);
  const [testing,       setTesting]       = useState(false);
  const [testSupported, setTestSupported] = useState(true);
  const [result,        setResult]        = useState<CameraSourceTestResult | null>(null);

  const set = (patch: Partial<NetworkSource>) => onChange({ ...value, ...patch });
  const urlProblem = cameraUrlProblem(value.url);
  const rtsp = isRtspUrl(value.url);

  // A result describes the address it was run against — drop it once that changes.
  useEffect(() => { setResult(null); }, [value.url, value.username, value.password, value.transport]);

  const test = async () => {
    setTesting(true);
    setResult(null);
    try {
      setResult(await robotClient.testCameraSource({
        url:       value.url.trim(),
        username:  value.username.trim() || undefined,
        password:  value.password || undefined,
        transport: rtsp ? value.transport : undefined,
      }));
    } catch (e) {
      // An older controller has no TestCameraSource: hide the button instead of failing.
      if (isUnsupportedCommand(e)) setTestSupported(false);
      else setResult({ ok: false, width: 0, height: 0, openMs: 0, firstFrameMs: 0,
                       error: e instanceof Error ? e.message : "The controller didn't answer." });
    } finally {
      setTesting(false);
    }
  };

  const failure = result && !result.ok ? testErrorHint(result.error) : null;

  return (
    <>
      <FormRow label="Stream URL" style={rowStyle}>
        <Input
          value={value.url}
          onChangeText={url => set({ url })}
          placeholder="rtsp://192.168.0.50:554/stream1"
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="off"
          keyboardType="url"
          returnKeyType="done"
          style={type.mono}
        />
        {!!urlProblem && (
          <Text style={[type.caption, styles.problem, value.url.trim() ? styles.problemError : null]}>
            {urlProblem}
          </Text>
        )}
      </FormRow>

      <FormRow label="Username" hint="Optional. Leave blank if the camera has no login." style={rowStyle}>
        <Input
          value={value.username}
          onChangeText={username => set({ username })}
          placeholder="admin"
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="off"
          returnKeyType="done"
        />
      </FormRow>

      <FormRow label="Password" style={rowStyle}>
        <View style={styles.passwordRow}>
          <Input
            style={styles.grow}
            value={value.password}
            onChangeText={password => set({ password })}
            placeholder="Optional"
            secureTextEntry={!revealed}
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="off"
            textContentType="password"
            returnKeyType="done"
          />
          <Pressable
            style={styles.revealBtn}
            onPress={() => setRevealed(r => !r)}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel={revealed ? "Hide password" : "Show password"}
          >
            {revealed
              ? <EyeOff size={18} color={colors.textMuted} />
              : <Eye size={18} color={colors.textMuted} />}
          </Pressable>
        </View>
      </FormRow>

      {rtsp && (
        <FormRow
          label="Transport"
          hint="TCP is reliable on Wi-Fi; UDP can lower latency on a wired network."
          style={rowStyle}
        >
          <SegmentedControl
            size="sm"
            options={TRANSPORTS}
            value={value.transport}
            onChange={transport => set({ transport })}
          />
        </FormRow>
      )}

      {testSupported && (
        <View style={[styles.testBlock, rowStyle]}>
          <Button
            label="Test connection"
            variant="secondary"
            size="sm"
            icon={<PlugZap size={14} color={buttonTextColor("secondary")} />}
            loading={testing}
            disabled={!!urlProblem}
            onPress={test}
            style={styles.testBtn}
          />
          {result?.ok && (
            <View style={styles.okRow}>
              <CircleCheck size={16} color={colors.success} />
              <Text style={[type.body, styles.okText]}>{formatTestResult(result)}</Text>
            </View>
          )}
          {failure && <Notice tone="danger" title={failure.title}>{failure.hint}</Notice>}
        </View>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  grow: { flex: 1 },
  problem: { marginTop: spacing.xs },
  problemError: { color: colors.danger },
  passwordRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  revealBtn: { padding: spacing.xs },
  testBlock: { gap: spacing.sm },
  testBtn: { alignSelf: "flex-start" },
  okRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  okText: { color: colors.success, flexShrink: 1 },
});
