import { colors, radii, spacing } from "@/src/components/ui/kit";
import { Input } from "@/src/components/ui/kit/Field";
import type { ProgramPrompt } from "@/src/models/robotModels";
import { addKeyboardListener, getKeyboard } from "@/src/platform/keyboard";
import { useProgramSummaries, useRobotStatus } from "@/src/providers/RobotProvider";
import { CommandFailedError, isNotImplementedCommand, isUnsupportedCommand, robotClient } from "@/src/services/RobotConnectService";
import { ChevronUp, Clock, MessageSquare, Minus } from "lucide-react-native";
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

// The operator prompt (controller docs/program-language.md §4.3 Prompt, §7.3). A running
// program's Prompt step publishes `prompt` in its status and waits; this dialog shows it from any
// screen (it is mounted once, in the root layout) and answers with AnswerPrompt. It closes on its
// own when the status no longer carries the prompt — answered here, on another device, timed out,
// or the program stopped. The first answer wins on the controller; a late one is "stale" and is
// simply dropped here.
//
// Several programs can prompt at once (background programs too): the oldest is shown first and
// the card says how many more are waiting. "Hide" tucks the dialog into a small pill so the screen
// underneath can be checked before answering; the pill reopens it.
//
// Web dev aid (for the keyboard audit and screenshots without a running program): a prompt in
// localStorage "rms.mockPrompt", or in ?mockPrompt=<json> for one page load, is shown as if the
// controller sent it; answering it just clears it.

const MOCK_KEY = "rms.mockPrompt";

function readMockPrompt(): ProgramPrompt | null {
  if (!__DEV__ || Platform.OS !== "web" || typeof window === "undefined") return null;
  try {
    const q = new URLSearchParams(window.location.search).get("mockPrompt");
    const raw = q ?? localStorage.getItem(MOCK_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw);
    return {
      id: String(p.id ?? "mock"), stepId: String(p.stepId ?? ""), programName: String(p.programName ?? "Program"),
      title: p.title ?? null, message: String(p.message ?? ""), buttons: Array.isArray(p.buttons) && p.buttons.length ? p.buttons.map(String) : ["OK"],
      input: p.input === "number" || p.input === "text" ? p.input : "none", default: p.default ?? null,
      min: p.min ?? null, max: p.max ?? null, timeoutMs: Number(p.timeoutMs) || 0, shownUnixMs: Number(p.shownUnixMs) || Date.now(),
    };
  } catch { return null; }
}

function clearMockPrompt() {
  try { localStorage.removeItem(MOCK_KEY); } catch { /* storage unavailable */ }
}

/** Every prompt currently in the status, oldest first, plus the web dev mock (if any). */
function usePendingPrompts(): { prompts: ProgramPrompt[]; mockId: string | null; clearMock: () => void } {
  const summaries = useProgramSummaries();
  const status = useRobotStatus();
  const [mock, setMock] = useState<ProgramPrompt | null>(readMockPrompt);

  const prompts = useMemo(() => {
    const out: ProgramPrompt[] = [];
    const seen = new Set<string>();
    const add = (p: ProgramPrompt | null | undefined) => {
      if (!p || !p.id || seen.has(p.id) || !Array.isArray(p.buttons)) return;
      seen.add(p.id);
      out.push(p);
    };
    for (const s of summaries) add(s.prompt);
    // A background program's prompt, if the controller reports it on that block.
    for (const b of (status.backgroundPrograms ?? []) as any[]) add(b?.prompt);
    add(mock);
    return out.sort((a, b) => (a.shownUnixMs ?? 0) - (b.shownUnixMs ?? 0));
  }, [summaries, status.backgroundPrograms, mock]);

  return { prompts, mockId: mock?.id ?? null, clearMock: () => { clearMockPrompt(); setMock(null); } };
}

/** Seconds left on a timed prompt (null = no timeout, or not computed yet). Ticks while mounted. */
function useCountdown(prompt: ProgramPrompt): number | null {
  const timed = prompt.timeoutMs > 0;
  const [left, setLeft] = useState<number | null>(null);
  useEffect(() => {
    if (!timed) return;
    // The controller stamps shownUnixMs with its own clock. A device whose clock is far off would
    // count from the wrong start, so an implausible stamp falls back to when we first saw it.
    const seen = Date.now();
    const plausible = prompt.shownUnixMs > 0
      && prompt.shownUnixMs <= seen + 5000 && prompt.shownUnixMs >= seen - prompt.timeoutMs - 5000;
    const shown = plausible ? prompt.shownUnixMs : seen;
    const tick = () => setLeft(Math.max(0, Math.ceil((shown + prompt.timeoutMs - Date.now()) / 1000)));
    const first = setTimeout(tick, 0);
    const t = setInterval(tick, 250);
    return () => { clearTimeout(first); clearInterval(t); };
  }, [timed, prompt.shownUnixMs, prompt.timeoutMs]);
  return timed ? left : null;
}

/** The keyboard's height, so the card can sit in the space above it. */
function useKeyboardInset(): number {
  const [h, setH] = useState(() => (getKeyboard().visible ? getKeyboard().height : 0));
  useEffect(() => addKeyboardListener(k => setH(k.visible ? k.height : 0)), []);
  return h;
}

function formatSeconds(s: number): string {
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}

/** Why a typed number cannot be sent, or null when it is fine. */
function numberProblem(text: string, min?: number | null, max?: number | null): string | null {
  const t = text.trim();
  if (!t) return "Enter a number";
  const n = Number(t);
  if (!Number.isFinite(n)) return "Not a number";
  if (min != null && n < min) return `At least ${min}`;
  if (max != null && n > max) return `At most ${max}`;
  return null;
}

export function PromptDialog() {
  const { prompts, mockId, clearMock } = usePendingPrompts();
  const [hiddenId, setHiddenId] = useState<string | null>(null);
  // Answered here and waiting for the status to drop it — keep it closed meanwhile.
  const [answeredId, setAnsweredId] = useState<string | null>(null);

  const open = prompts.filter(p => p.id !== answeredId);
  const prompt = open[0];
  if (!prompt) return null;
  return (
    // Keyed by id: a new prompt starts fresh (its default in the field, no error).
    <PromptCard
      key={prompt.id}
      prompt={prompt}
      more={open.length - 1}
      isMock={prompt.id === mockId}
      clearMock={clearMock}
      hidden={hiddenId === prompt.id}
      onHide={() => setHiddenId(prompt.id)}
      onShow={() => setHiddenId(null)}
      onAnswered={() => setAnsweredId(prompt.id)}
    />
  );
}

type CardProps = {
  prompt: ProgramPrompt;
  more: number;
  isMock: boolean;
  clearMock: () => void;
  hidden: boolean;
  onHide: () => void;
  onShow: () => void;
  onAnswered: () => void;
};

function PromptCard({ prompt, more, isMock, clearMock, hidden, onHide, onShow, onAnswered }: CardProps) {
  const [value, setValue] = useState(prompt.default ?? "");
  const [sending, setSending] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const secondsLeft = useCountdown(prompt);
  const kb = useKeyboardInset();

  const needsValue = prompt.input === "number" || prompt.input === "text";
  const problem = prompt.input === "number" ? numberProblem(value, prompt.min, prompt.max) : null;

  async function answer(button: number) {
    if (problem) { setError(problem); return; }
    setSending(button);
    setError(null);
    const typed = needsValue ? (prompt.input === "number" ? String(Number(value.trim())) : value) : undefined;
    if (isMock) {
      clearMock();
      setSending(null);
      return;
    }
    try {
      await robotClient.answerPrompt(prompt.id, button, typed);
      onAnswered();
    } catch (e) {
      if (isNotImplementedCommand(e) || isUnsupportedCommand(e)) {
        setError("This controller cannot take prompt answers yet. Update the controller, or stop the program.");
      } else if (e instanceof CommandFailedError && /stalePrompt/i.test(e.message)) {
        // Someone else answered first (or it timed out): the status will drop it.
        onAnswered();
      } else {
        setError(e instanceof Error ? e.message : String(e ?? "Could not send the answer"));
      }
    } finally {
      setSending(null);
    }
  }

  if (hidden) {
    return (
      <View pointerEvents="box-none" style={styles.pillLayer}>
        <Pressable
          style={styles.pill}
          onPress={onShow}
          accessibilityRole="button"
          accessibilityLabel="Show the program prompt"
        >
          <MessageSquare size={15} color={colors.onAccent} />
          <Text style={styles.pillText} numberOfLines={1}>
            {prompt.programName} is waiting for you{secondsLeft != null ? ` · ${formatSeconds(secondsLeft)}` : ""}
          </Text>
          <ChevronUp size={16} color={colors.onAccent} />
        </Pressable>
      </View>
    );
  }

  const buttons = prompt.buttons.length > 0 ? prompt.buttons : ["OK"];
  const stacked = buttons.length > 2 || buttons.some(b => b.length > 14);

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onHide}>
      <View style={[styles.overlay, kb > 0 && { paddingBottom: kb + spacing.md, justifyContent: "flex-end" }]}>
        <View style={styles.card} accessibilityRole="alert">
          <View style={styles.header}>
            <View style={styles.iconTile}>
              <MessageSquare size={20} color={colors.accent} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.program} numberOfLines={1}>{prompt.programName.toUpperCase()}</Text>
              <Text style={styles.title} numberOfLines={2}>{prompt.title || "Operator input needed"}</Text>
            </View>
            <Pressable
              onPress={onHide}
              hitSlop={10}
              style={styles.hideBtn}
              accessibilityRole="button"
              accessibilityLabel="Hide the prompt for now"
            >
              <Minus size={18} color={colors.textMuted} />
            </Pressable>
          </View>

          <ScrollView style={styles.body} contentContainerStyle={{ gap: spacing.md }} keyboardShouldPersistTaps="handled">
            {!!prompt.message && <Text style={styles.message}>{prompt.message}</Text>}

            {needsValue && (
              <View style={{ gap: 4 }}>
                <Input
                  value={value}
                  onChangeText={t => { setValue(t); if (error) setError(null); }}
                  placeholder={prompt.input === "number" ? "Number" : "Type your answer"}
                  keyboardType={prompt.input === "number" ? "numeric" : "default"}
                  inputMode={prompt.input === "number" ? "decimal" : "text"}
                  autoFocus={Platform.OS !== "web"}
                  returnKeyType="done"
                  onSubmitEditing={() => { if (buttons.length === 1) answer(0); }}
                  accessibilityLabel={prompt.input === "number" ? "Prompt number" : "Prompt text"}
                />
                {prompt.input === "number" && (prompt.min != null || prompt.max != null) && (
                  <Text style={styles.hint}>
                    {prompt.min != null && prompt.max != null ? `Between ${prompt.min} and ${prompt.max}`
                      : prompt.min != null ? `At least ${prompt.min}` : `At most ${prompt.max}`}
                  </Text>
                )}
              </View>
            )}

            {!!error && <Text style={styles.error}>{error}</Text>}
          </ScrollView>

          <View style={[styles.buttons, stacked && styles.buttonsStacked]}>
            {buttons.map((label, i) => {
              const primary = i === 0;
              return (
                <Pressable
                  key={`${i}-${label}`}
                  onPress={() => answer(i)}
                  disabled={sending !== null}
                  style={({ pressed }) => [
                    styles.btn, !stacked && { flex: 1 },
                    primary ? styles.btnPrimary : styles.btnSecondary,
                    (pressed || (sending !== null && sending !== i)) && { opacity: 0.6 },
                  ]}
                  accessibilityRole="button"
                >
                  {sending === i
                    ? <ActivityIndicator size="small" color={primary ? colors.onAccent : colors.accent} />
                    : <Text style={[styles.btnText, primary ? styles.btnTextPrimary : styles.btnTextSecondary]} numberOfLines={2}>{label}</Text>}
                </Pressable>
              );
            })}
          </View>

          {(secondsLeft != null || more > 0) && (
            <View style={styles.footer}>
              {secondsLeft != null && (
                <View style={styles.footerItem}>
                  <Clock size={12} color={secondsLeft <= 10 ? colors.danger : colors.textFaint} />
                  <Text style={[styles.footerText, secondsLeft <= 10 && { color: colors.danger }]}>
                    Times out in {formatSeconds(secondsLeft)}
                  </Text>
                </View>
              )}
              {more > 0 && <Text style={styles.footerText}>{more} more waiting</Text>}
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "center",
    alignItems: "center",
    padding: spacing.lg,
  },
  card: {
    width: "100%",
    maxWidth: 440,
    maxHeight: "100%",
    backgroundColor: colors.surface,
    borderRadius: 18,
    padding: 20,
    gap: spacing.md,
    shadowColor: "#000",
    shadowOpacity: 0.25,
    shadowRadius: 18,
    elevation: 12,
  },
  header: { flexDirection: "row", alignItems: "center", gap: 12 },
  iconTile: {
    width: 40, height: 40, borderRadius: 10,
    backgroundColor: colors.accentSoft, alignItems: "center", justifyContent: "center",
  },
  program: { fontSize: 10, fontWeight: "700", color: colors.textFaint, letterSpacing: 0.8 },
  title: { fontSize: 17, fontWeight: "800", color: colors.text, marginTop: 1 },
  hideBtn: { padding: 6, borderRadius: radii.md },
  body: { flexGrow: 0, flexShrink: 1 },
  message: { fontSize: 15, lineHeight: 21, color: colors.textSecondary },
  hint: { fontSize: 11, color: colors.textFaint },
  error: { fontSize: 13, color: colors.danger, fontWeight: "600" },
  buttons: { flexDirection: "row", gap: 10 },
  buttonsStacked: { flexDirection: "column" },
  btn: {
    minHeight: 46, borderRadius: 12, paddingHorizontal: spacing.md, paddingVertical: 10,
    alignItems: "center", justifyContent: "center",
  },
  btnPrimary: { backgroundColor: colors.accent },
  btnSecondary: { backgroundColor: colors.accentSoft, borderWidth: 1.5, borderColor: colors.accentFaded },
  btnText: { fontSize: 15, fontWeight: "700", textAlign: "center" },
  btnTextPrimary: { color: colors.onAccent },
  btnTextSecondary: { color: colors.accent },
  footer: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: spacing.md },
  footerItem: { flexDirection: "row", alignItems: "center", gap: 5 },
  footerText: { fontSize: 12, color: colors.textFaint, fontWeight: "600" },
  pillLayer: {
    position: "absolute", left: 0, right: 0, bottom: 84,
    alignItems: "center", paddingHorizontal: spacing.lg,
  },
  pill: {
    flexDirection: "row", alignItems: "center", gap: 8, maxWidth: 440,
    backgroundColor: colors.accent, borderRadius: 999, paddingHorizontal: 16, paddingVertical: 10,
    shadowColor: "#000", shadowOpacity: 0.25, shadowRadius: 10, elevation: 8,
  },
  pillText: { color: colors.onAccent, fontSize: 13, fontWeight: "700", flexShrink: 1 },
});
