import { ChevronDown, ChevronRight, CircleCheck, Eye, EyeOff, PlugZap } from "lucide-react-native";
import { useEffect, useState } from "react";
import { Pressable, StyleProp, StyleSheet, Text, View, ViewStyle } from "react-native";

import { Button, buttonTextColor, colors, FormRow, Input, SegmentedControl, spacing, type } from "@/src/components/ui/kit";
import { Notice } from "@/src/components/ui/calibration/Notice";
import { CameraCodec, CameraDecoder, CameraSourceTestResult, CameraStream } from "@/src/models/robotModels";
import { isUnsupportedCommand, robotClient } from "@/src/services/RobotConnectService";
import { formatSofiaTestResult, sofiaSourceProblem, SofiaSource, sofiaTestErrorHint } from "./cameraSource";

const STREAMS:  { label: string; value: CameraStream }[]  = [{ label: "Main", value: "Main" }, { label: "Sub", value: "Extra1" }];
const CODECS:   { label: string; value: CameraCodec }[]   = [{ label: "H.264", value: "h264" }, { label: "H.265", value: "hevc" }];
const DECODERS: { label: string; value: CameraDecoder }[] = [{ label: "In-process", value: "opencv" }, { label: "ffmpeg", value: "ffmpeg" }];

/**
 * The Sofia (DVRIP / XMeye) half of the add/edit camera form: host/port,
 * credentials, stream, codec, an Advanced disclosure for the decoder, and a
 * Test connection probe (TestCameraSource). Rendered inside the
 * Configuration card in place of the USB / network source fields.
 */
export function SofiaSourceFields({
  value, onChange, rowStyle,
}: {
  value: SofiaSource;
  onChange: (next: SofiaSource) => void;
  /** Spacing between rows (the form's fieldGap). */
  rowStyle?: StyleProp<ViewStyle>;
}) {
  const [revealed,     setRevealed]     = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [testing,       setTesting]       = useState(false);
  const [testSupported, setTestSupported] = useState(true);
  const [result,        setResult]        = useState<CameraSourceTestResult | null>(null);

  const set = (patch: Partial<SofiaSource>) => onChange({ ...value, ...patch });
  const problem = sofiaSourceProblem(value);

  // A result describes the address/settings it was run against — drop it once those change.
  useEffect(() => { setResult(null); }, [
    value.host, value.port, value.username, value.password,
    value.stream, value.codec, value.decoder, value.ffmpegPath, value.hwaccel,
  ]);

  const test = async () => {
    setTesting(true);
    setResult(null);
    try {
      setResult(await robotClient.testCameraSource({
        sourceType: "sofia",
        host:       value.host.trim(),
        port:       parseInt(value.port, 10) || 34567,
        username:   value.username.trim() || undefined,
        password:   value.password || undefined,
        stream:     value.stream,
        codec:      value.codec,
        decoder:    value.decoder,
        ffmpegPath: value.decoder === "ffmpeg" ? (value.ffmpegPath.trim() || undefined) : undefined,
      }));
    } catch (e) {
      // An older controller has no Sofia support: hide the button instead of failing.
      if (isUnsupportedCommand(e)) setTestSupported(false);
      else setResult({ ok: false, width: 0, height: 0, openMs: 0, firstFrameMs: 0,
                       error: e instanceof Error ? e.message : "The controller didn't answer." });
    } finally {
      setTesting(false);
    }
  };

  const failure = result && !result.ok ? sofiaTestErrorHint(result.error) : null;

  return (
    <>
      <FormRow label="Host" style={rowStyle}>
        <View style={styles.hostRow}>
          <Input
            style={[styles.grow, type.mono]}
            value={value.host}
            onChangeText={host => set({ host })}
            placeholder="192.168.0.50"
            autoCapitalize="none" autoCorrect={false} autoComplete="off"
            keyboardType="url" returnKeyType="done"
          />
          <Input
            style={styles.portInput}
            value={value.port}
            onChangeText={port => set({ port })}
            placeholder="34567"
            keyboardType="numeric" returnKeyType="done" textAlign="center"
          />
        </View>
        {!!problem && (
          <Text style={[type.caption, styles.problem, value.host.trim() ? styles.problemError : null]}>{problem}</Text>
        )}
      </FormRow>

      <FormRow label="Username" style={rowStyle}>
        <Input
          value={value.username}
          onChangeText={username => set({ username })}
          placeholder="admin"
          autoCapitalize="none" autoCorrect={false} autoComplete="off" returnKeyType="done"
        />
      </FormRow>

      <FormRow label="Password" hint="The Sofia login can differ from the RTSP credentials." style={rowStyle}>
        <View style={styles.passwordRow}>
          <Input
            style={styles.grow}
            value={value.password}
            onChangeText={password => set({ password })}
            placeholder="Optional"
            secureTextEntry={!revealed}
            autoCapitalize="none" autoCorrect={false} autoComplete="off"
            textContentType="password" returnKeyType="done"
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

      <FormRow label="Stream" style={rowStyle}>
        <SegmentedControl size="sm" options={STREAMS} value={value.stream} onChange={stream => set({ stream })} />
      </FormRow>

      <FormRow label="Codec" style={rowStyle}>
        <SegmentedControl size="sm" options={CODECS} value={value.codec} onChange={codec => set({ codec })} />
      </FormRow>

      <View style={rowStyle}>
        <Pressable
          style={styles.advancedHeader}
          onPress={() => setAdvancedOpen(o => !o)}
          accessibilityRole="button"
          accessibilityState={{ expanded: advancedOpen }}
        >
          {advancedOpen ? <ChevronDown size={15} color={colors.textMuted} /> : <ChevronRight size={15} color={colors.textMuted} />}
          <Text style={styles.advancedTitle}>Advanced</Text>
        </Pressable>
        {advancedOpen && (
          <View style={styles.advancedBody}>
            <FormRow label="Decoder">
              <SegmentedControl size="sm" options={DECODERS} value={value.decoder} onChange={decoder => set({ decoder })} />
            </FormRow>
            {value.decoder === "ffmpeg" && (
              <>
                <FormRow label="ffmpeg path" style={styles.fieldGap}>
                  <Input
                    value={value.ffmpegPath}
                    onChangeText={ffmpegPath => set({ ffmpegPath })}
                    placeholder="ffmpeg"
                    autoCapitalize="none" autoCorrect={false} autoComplete="off" returnKeyType="done"
                    style={type.mono}
                  />
                </FormRow>
                <FormRow label="hwaccel" hint="Optional: auto, d3d11va, …" style={styles.fieldGap}>
                  <Input
                    value={value.hwaccel}
                    onChangeText={hwaccel => set({ hwaccel })}
                    placeholder="Optional"
                    autoCapitalize="none" autoCorrect={false} autoComplete="off" returnKeyType="done"
                  />
                </FormRow>
              </>
            )}
          </View>
        )}
      </View>

      {testSupported && (
        <View style={[styles.testBlock, rowStyle]}>
          <Button
            label="Test connection"
            variant="secondary"
            size="sm"
            icon={<PlugZap size={14} color={buttonTextColor("secondary")} />}
            loading={testing}
            disabled={!!problem}
            onPress={test}
            style={styles.testBtn}
          />
          {result?.ok && (
            <View style={styles.okRow}>
              <CircleCheck size={16} color={colors.success} />
              <Text style={[type.body, styles.okText]}>{formatSofiaTestResult(result)}</Text>
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
  hostRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  portInput: { flex: 0, width: 76 },
  problem: { marginTop: spacing.xs },
  problemError: { color: colors.danger },
  passwordRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  revealBtn: { padding: spacing.xs },
  fieldGap: { marginTop: spacing.md + 2 },
  advancedHeader: { flexDirection: "row", alignItems: "center", gap: spacing.xs, paddingVertical: spacing.xs },
  advancedTitle: { fontSize: 13, fontWeight: "600", color: colors.textSecondary },
  advancedBody: { marginTop: spacing.sm },
  testBlock: { gap: spacing.sm },
  testBtn: { alignSelf: "flex-start" },
  okRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  okText: { color: colors.success, flexShrink: 1 },
});
