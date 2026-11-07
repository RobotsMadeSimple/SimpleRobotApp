import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Modal, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AlertCircle, AlertTriangle, Blocks, BookOpen, Check, Code, Loader, RotateCcw, SquarePen, WandSparkles, WifiOff } from "lucide-react-native";
import { Button, colors, radii, spacing } from "@/src/components/ui/kit";
import { BottomSheet } from "@/src/components/ui/BottomSheet";
import type {
  BuiltProgram, ProgramStep, ProgramTextMapEntry, StepType, TextProblem, ValidationProblem,
} from "@/src/models/robotModels";
import {
  isNotImplementedCommand, isUnsupportedCommand, robotClient,
} from "@/src/services/RobotConnectService";
import {
  useCameras, useGrids, useIoDevices, useLocals, usePoints, useProgramSummaries, useStacks, useTools, useBuiltPrograms,
} from "@/src/providers/RobotProvider";
import { useKeyboardTop } from "@/src/platform/keyboard";
import { CodeEditor } from "@/src/components/ui/code-editor/CodeEditor";
import type { CodeEditorHandle } from "@/src/components/ui/code-editor/codeEditorTypes";
import type { EditorCommand } from "@/src/components/ui/code-editor/bridge";
import { KeyRow } from "@/src/components/ui/code-editor/KeyRow";
import { buildSrsCompletionData, srsLineHelp, stepSnippet } from "@/src/components/ui/code-editor/srsCompletions";
import { useExpressionEnv } from "./expressions/ExpressionEnv";
import { StepTypePicker } from "./StepTypePicker";
import { newId } from "./stepUtils";
import { useStepCatalog } from "./useStepCatalog";
import { findRefEntry } from "@/src/docs/manual";
import { openStepReference } from "@/src/docs/navigation";
import type { BreakpointsView } from "./useBreakpoints";

/**
 * The Text view of the program builder (controller docs/program-language.md §7): the program as
 * Simple Robot Script in a CodeMirror editor. The controller owns the language —
 * FormatProgramText turns the document into text, ParseProgramText turns text back into steps
 * (ids reconciled against the document) with problems mapped to lines.
 *
 * - Entering the view formats the current (unsaved) document.
 * - While typing, a debounced parse runs; when it parses cleanly the result is applied to the
 *   document as ONE undoable edit (the builder's onApply), so validation, Save and Run see it.
 *   Text that does not parse is never applied; it stays "unapplied" until fixed or reverted.
 * - Apply applies now, Revert throws away unapplied text, Format re-prints canonically.
 * - Leaving for Blocks with unapplied text that has errors asks first.
 * - Phones (and narrow web) edit in a full-screen editor sized to the keyboard's top, with the
 *   symbol key row docked above the keyboard, so the line being typed is never covered.
 */
export type TextProgramViewProps = {
  /** The current (possibly unsaved) document as a program — the text is generated from it. */
  program: BuiltProgram;
  /**
   * Commit a successfully parsed program to the document as ONE undoable edit (the builder
   * replaces steps and variables; metadata stays as edited in the header).
   */
  onApply: (program: BuiltProgram) => void;
  /** Leave Text for Blocks (e.g. from an error sheet's "discard text changes"). */
  onSwitchToBlocks: () => void;
  /** Text editing needs a controller; offline the view is read-only with a banner. */
  connected: boolean;
  /** The builder's live validation problems (mapped to lines through the text map). */
  problems?: ValidationProblem[];
  /** Step-id breakpoints shared with Blocks and the monitor. */
  breakpoints?: BreakpointsView;
  /** The step the running program is on (status currentStepId), for the line highlight. */
  runningStepId?: string | null;
};

type Phase = "loading" | "ready" | "unsupported" | "offline" | "error";

const PARSE_DEBOUNCE_MS = 450;
const RUNNING = new Set(["Starting", "Running", "Finishing", "Stopping"]);

// ── Leave guard ───────────────────────────────────────────────────────────────
// The builder's Blocks | Text toggle can ask the mounted text view whether it may leave
// (`await requestLeaveTextView()`): true when there is nothing unapplied, or the unapplied text
// parsed and was applied; false when the user chose to keep editing. Without a mounted view it
// resolves true.
let leaveGuard: (() => Promise<boolean>) | null = null;
export function requestLeaveTextView(): Promise<boolean> {
  return leaveGuard ? leaveGuard() : Promise.resolve(true);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Steps + variables as a stable string, ignoring empty/absent fields (they print the same). */
function programKey(p: Pick<BuiltProgram, "steps" | "variables">): string {
  return JSON.stringify({ s: p.steps ?? [], v: p.variables ?? [] }, (_k, v) => {
    if (v === null || v === undefined) return undefined;
    if (Array.isArray(v) && v.length === 0) return undefined;
    if (v && typeof v === "object" && !Array.isArray(v)) {
      const keys = Object.keys(v).sort();
      if (keys.length === 0) return undefined;
      const o: Record<string, unknown> = {};
      for (const k of keys) o[k] = v[k];
      return o;
    }
    return v;
  });
}

/** The map entry a line belongs to: one starting there, else the innermost containing it. */
function entryForLine(map: ProgramTextMapEntry[], line: number): ProgramTextMapEntry | undefined {
  const exact = map.find(e => e.line === line);
  if (exact) return exact;
  let best: ProgramTextMapEntry | undefined;
  for (const e of map) {
    if (e.line <= line && line <= e.endLine && (!best || e.endLine - e.line < best.endLine - best.line)) best = e;
  }
  return best;
}

/** Builder validation problems → text problems, through the step → line map. */
function mapValidation(problems: ValidationProblem[] | undefined, map: ProgramTextMapEntry[]): TextProblem[] {
  if (!problems?.length || !map.length) return [];
  const out: TextProblem[] = [];
  for (const p of problems) {
    const e = p.stepId ? map.find(m => m.stepId === p.stepId) : undefined;
    out.push({
      line: e?.line ?? 1, col: 1, endLine: e?.line ?? 1, endCol: 0,
      severity: p.severity, code: p.code, message: p.message, stepId: p.stepId || undefined, field: p.field, source: "validate",
    });
  }
  return out;
}

/**
 * One problem per spot: a parse-time name warning and the validator's error for the same thing
 * (same line, column and code) show once, at the higher severity.
 */
function dedupeProblems(problems: TextProblem[]): TextProblem[] {
  const best = new Map<string, TextProblem>();
  for (const p of problems) {
    const k = `${p.line}:${p.col}:${p.code}`;
    const cur = best.get(k);
    if (!cur || (cur.severity !== "error" && p.severity === "error")) best.set(k, p);
  }
  return [...best.values()];
}

/** Plain text as a CodeMirror snippet template: braces escaped, caret at the end. */
function textAsSnippet(text: string): string {
  const esc = (s: string) => s.replace(/[{}]/g, m => "\\" + m);
  const [first, ...rest] = text.split("\n");
  // The first value after the keyword (e.g. a move's target) becomes a selected placeholder, so
  // typing replaces it; Tab then goes to the end.
  const m = /^(\s*[A-Za-z_]\w*\s+)([^\s,"(){}]+)(.*)$/.exec(first);
  const head = m ? esc(m[1]) + "${" + m[2].replace(/\\/g, "") + "}" + esc(m[3]) : esc(first);
  return [head, ...rest.map(esc)].join("\n") + "${}";
}

/** A ref that always holds the latest render's value (read in callbacks and effects). */
function useLatest<T>(value: T) {
  const r = useRef(value);
  useLayoutEffect(() => { r.current = value; });
  return r;
}

function errorText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

// ── View ──────────────────────────────────────────────────────────────────────

export function TextProgramView({
  program, onApply, onSwitchToBlocks, connected, problems: validationProblems, breakpoints, runningStepId,
}: TextProgramViewProps) {
  const { width, height: winH } = useWindowDimensions();
  // Touch devices (and phone-width web, so it can be tested) edit full screen above the keyboard.
  const modalEditing = Platform.OS !== "web" || width < 700;
  const insets = useSafeAreaInsets();
  const kbTop = useKeyboardTop();

  // ── Completion data (catalog + the robot's names + expression symbols) ──
  const catalog = useStepCatalog(connected);
  const env = useExpressionEnv();
  const points = usePoints(), tools = useTools(), locals = useLocals(), grids = useGrids(), stacks = useStacks();
  const cameras = useCameras(), ioDevices = useIoDevices(), builtPrograms = useBuiltPrograms();
  const [visionNames, setVisionNames] = useState<string[]>([]);
  useEffect(() => {
    if (!connected) return;
    let live = true;
    robotClient.getVisionPrograms().then(r => { if (live) setVisionNames(r.programs.map(p => p.name)); }).catch(() => {});
    return () => { live = false; };
  }, [connected]);
  const completions = useMemo(() => buildSrsCompletionData(catalog.catalog, {
    points: points.map(p => p.name),
    tools: tools.map(t => t.name),
    locals: locals.map(l => l.name),
    grids: grids.map(g => g.name),
    stacks: stacks.map(s => s.name),
    cameras: cameras.map(c => c.name),
    devices: ioDevices.map(d => d.name),
    routines: builtPrograms.filter(p => p.isRoutine).map(p => p.name),
    background: builtPrograms.filter(p => p.isBackground).map(p => p.name),
    vision: visionNames,
  }, env?.symbols ?? null, program.variables ?? []),
  [catalog.catalog, points, tools, locals, grids, stacks, cameras, ioDevices, builtPrograms, visionNames, env?.symbols, program.variables]);

  // ── Text state ──
  const [phase, setPhase] = useState<Phase>("loading");
  const [phaseMsg, setPhaseMsg] = useState("");
  const [initialText, setInitialText] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [appliedText, setAppliedText] = useState("");
  const [map, setMap] = useState<ProgramTextMapEntry[]>([]);
  const [textProblems, setTextProblems] = useState<TextProblem[] | null>(null);
  const [parseOk, setParseOk] = useState(true);
  const [parsing, setParsing] = useState(false);
  const [parseUnsupported, setParseUnsupported] = useState(false);
  const [cursor, setCursor] = useState({ line: 1, col: 1 });
  const [fullscreen, setFullscreen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [leaveSheet, setLeaveSheet] = useState(false);
  const [editorFocused, setEditorFocused] = useState(false);

  const inlineRef = useRef<CodeEditorHandle>(null);
  const fullRef = useRef<CodeEditorHandle>(null);
  const fullscreenRef = useLatest(fullscreen);
  const editor = useCallback(() => (fullscreenRef.current ? fullRef.current : inlineRef.current), [fullscreenRef]);

  const textRef = useRef("");
  const appliedTextRef = useRef("");
  const lastAppliedKey = useRef<string | null>(null);
  const echoPending = useRef(false);
  const parseSeq = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mounted = useRef(true);
  const programRef = useLatest(program);
  const onApplyRef = useLatest(onApply);
  const pendingJump = useRef<number | null>(null);
  // The read-only preview's top visible line, so the full-screen editor opens showing the same place.
  const previewTop = useRef(1);
  const pendingTop = useRef<number | null>(null);
  const initialTextRefSet = useRef(false);
  const phaseRef = useLatest(phase);
  const [fullInitial, setFullInitial] = useState("");

  useEffect(() => () => { mounted.current = false; }, []);

  const setAllText = useCallback((t: string) => {
    textRef.current = t;
    setText(t);
    inlineRef.current?.setText(t, true);
    fullRef.current?.setText(t, true);
  }, []);

  /** Parse `t` against the document; apply it when it parses cleanly (and `apply`). */
  const runParse = useCallback(async (t: string, apply: boolean) => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    const seq = ++parseSeq.current;
    const base = programRef.current;
    setParsing(true);
    try {
      const r = await robotClient.parseProgramText(t, { base, validate: true });
      if (!mounted.current && !apply) return r;
      if (seq !== parseSeq.current) return r;
      setTextProblems(r.problems);
      setParseOk(r.ok);
      // Only a clean parse has reconciled ids; a failed one keeps the last good map (breakpoints,
      // run highlight) rather than one whose new steps have fresh ids.
      if (r.ok && r.map.length) setMap(r.map);
      setParseUnsupported(false);
      if (r.ok && r.program && apply) {
        const k = programKey(r.program);
        if (k !== programKey(base)) {
          lastAppliedKey.current = k;
          echoPending.current = true;
          onApplyRef.current({ ...base, steps: r.program.steps ?? [], variables: r.program.variables ?? [] });
        }
        appliedTextRef.current = t;
        if (mounted.current) setAppliedText(t);
      }
      return r;
    } catch (e) {
      if (seq === parseSeq.current && mounted.current) {
        if (isNotImplementedCommand(e) || isUnsupportedCommand(e)) setParseUnsupported(true);
        else setTextProblems([{ line: 1, col: 1, endLine: 1, endCol: 0, severity: "error", code: "parseFailed", message: errorText(e), source: "parse" }]);
      }
      return null;
    } finally {
      if (seq === parseSeq.current && mounted.current) setParsing(false);
    }
  }, [onApplyRef, programRef]);

  /** (Re)print the text from the document. */
  const formatFromDocument = useCallback(async (p: BuiltProgram) => {
    if (!connected) { setPhase("offline"); return; }
    try {
      const r = await robotClient.formatProgramText(p);
      if (!mounted.current) return;
      lastAppliedKey.current = programKey(p);
      appliedTextRef.current = r.text;
      setAppliedText(r.text);
      setMap(r.map);
      setTextProblems(null);
      setParseOk(true);
      if (initialTextRefSet.current) setAllText(r.text);
      else { initialTextRefSet.current = true; textRef.current = r.text; setText(r.text); setInitialText(r.text); }
      setPhase("ready");
      // Problems for the fresh text (validation mapped to lines), without applying anything.
      runParse(r.text, false);
    } catch (e) {
      if (!mounted.current) return;
      if (isNotImplementedCommand(e) || isUnsupportedCommand(e)) setPhase("unsupported");
      else { setPhase("error"); setPhaseMsg(errorText(e)); }
    }
  }, [connected, runParse, setAllText]);
  // Enter the view (and reconnects): print the document.
  useEffect(() => {
    if (connected) formatFromDocument(programRef.current);
    else setPhase("offline");
  }, [connected, formatFromDocument, programRef]);

  // The document changed from outside (undo/redo in the toolbar, a revision restored): re-print,
  // unless it is the echo of our own apply.
  const docKey = useMemo(() => programKey(program), [program]);
  useEffect(() => {
    if (phase !== "ready") return;
    if (echoPending.current) { echoPending.current = false; lastAppliedKey.current = docKey; return; }
    if (docKey === lastAppliedKey.current) return;
    formatFromDocument(programRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docKey]);

  // Leaving the view (toolbar toggle, navigation) with clean unapplied text: apply it on the way out.
  useEffect(() => () => {
    if (textRef.current !== appliedTextRef.current && phaseRef.current === "ready") runParse(textRef.current, true);
  }, [runParse, phaseRef]);
  const onChange = useCallback((t: string) => {
    textRef.current = t;
    setText(t);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { timer.current = null; runParse(textRef.current, true); }, PARSE_DEBOUNCE_MS);
  }, [runParse]);

  const dirty = phase === "ready" && text !== appliedText;
  const readOnly = !connected || phase !== "ready" || parseUnsupported;

  // ── Problems, breakpoints, run highlight ──
  const shownProblems = useMemo<TextProblem[]>(
    () => dedupeProblems(textProblems ?? mapValidation(validationProblems, map)),
    [textProblems, validationProblems, map]);
  const errorCount = shownProblems.filter(p => p.severity === "error" && p.source === "parse").length;
  const problemCounts = {
    errors: shownProblems.filter(p => p.severity === "error").length,
    warnings: shownProblems.filter(p => p.severity !== "error").length,
  };

  const breakpointLines = useMemo(() => {
    if (!breakpoints || breakpoints.ids.size === 0) return [];
    return map.filter(e => breakpoints.ids.has(e.stepId)).map(e => e.line);
  }, [breakpoints, map]);
  const onToggleBreakpoint = useCallback((line: number) => {
    const e = entryForLine(map, line);
    if (e && breakpoints) breakpoints.toggle(e.stepId);
  }, [map, breakpoints]);

  const summaries = useProgramSummaries();
  const summary = summaries.find(s => s.name === program.name);
  const live = summary && RUNNING.has(summary.status);
  // A paused program reads "Stopped" with a pause reason; the paused step gets the stronger tint.
  const pausedId = summary?.pauseReason ? summary.pausedAtStepId ?? summary.currentStepId ?? null : null;
  const runId = pausedId ?? runningStepId ?? (live ? summary?.currentStepId ?? null : null);
  const runEntry = runId ? map.find(e => e.stepId === runId) : undefined;
  const runningLines = runEntry ? { line: runEntry.line, endLine: runEntry.line } : null;

  const lines = useMemo(() => text.split("\n"), [text]);
  const help = srsLineHelp(lines[cursor.line - 1] ?? "", completions);

  // ── Actions ──
  const send = useCallback((cmd: EditorCommand) => editor()?.send(cmd), [editor]);

  const applyNow = () => { runParse(textRef.current, true); };
  const revert = () => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    parseSeq.current++;
    formatFromDocument(programRef.current);
  };
  const format = async () => {
    const r = await runParse(textRef.current, true);
    if (!r?.ok || !r.program) return;
    try {
      const f = await robotClient.formatProgramText({ ...programRef.current, steps: r.program.steps ?? [], variables: r.program.variables ?? [] });
      appliedTextRef.current = f.text;
      setAppliedText(f.text);
      setMap(f.map);
      setAllText(f.text);
    } catch { /* keep the user's text */ }
  };

  const switchToBlocks = useCallback(async (): Promise<boolean> => {
    if (textRef.current === appliedTextRef.current || phaseRef.current !== "ready") { onSwitchToBlocks(); return true; }
    const r = await runParse(textRef.current, true);
    if (r?.ok) { onSwitchToBlocks(); return true; }
    setLeaveSheet(true);
    return false;
  }, [onSwitchToBlocks, runParse, phaseRef]);

  useEffect(() => {
    leaveGuard = async () => {
      if (textRef.current === appliedTextRef.current || phaseRef.current !== "ready") return true;
      const r = await runParse(textRef.current, true);
      if (r?.ok) return true;
      setLeaveSheet(true);
      return false;
    };
    return () => { leaveGuard = null; };
  }, [runParse, phaseRef]);

  const discardAndLeave = () => {
    setLeaveSheet(false);
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    textRef.current = appliedTextRef.current; // nothing left to flush on unmount
    setFullscreen(false);
    onSwitchToBlocks();
  };

  const openFullscreen = (line?: number) => {
    // A tap opens on the tapped line; the Edit button on the top line the preview shows.
    pendingJump.current = line ?? previewTop.current;
    pendingTop.current = previewTop.current;
    setFullInitial(textRef.current);
    setFullscreen(true);
  };
  const closeFullscreen = () => {
    setFullscreen(false);
    inlineRef.current?.setText(textRef.current, true);
    if (textRef.current !== appliedTextRef.current) runParse(textRef.current, true);
  };

  const jumpToProblem = (p: TextProblem) => {
    if (modalEditing && !fullscreen) { openFullscreen(p.line); return; }
    editor()?.jumpTo(p.line, p.col, true);
  };

  const insertStep = async (type: StepType) => {
    setPickerOpen(false);
    let template: string | null = null;
    try {
      const step = { id: newId(), type } as ProgramStep;
      const r = await robotClient.formatProgramText({ ...programRef.current, steps: [step], variables: [] });
      const body = r.text.split("\n").filter(l => !/^\s*#!srs\b/.test(l)).join("\n").trim();
      if (body) template = textAsSnippet(body);
    } catch { /* fall back to the catalog's syntax */ }
    if (!template) {
      const spec = completions.steps.find(s => s.type === type);
      if (spec) template = stepSnippet(spec);
    }
    // After the picker has closed and handed focus back (a modal restores focus to its opener).
    if (template) setTimeout(() => editor()?.insertSnippet(template!, true), 400);
  };

  // Keep the caret clear of the keyboard: the full-screen editor ends at the keyboard's top.
  const fullHeight = Math.max(200, (kbTop ?? winH));
  useEffect(() => {
    if (!fullscreen) return;
    const t = setTimeout(() => fullRef.current?.send({ type: "scrollCursorIntoView" }), 120);
    return () => clearTimeout(t);
  }, [fullscreen, fullHeight]);

  // ── Render ──
  if (phase === "unsupported") {
    return (
      <Notice icon={<Code size={26} color={colors.borderStrong} />} title="Text editing needs a newer controller"
        body="This controller cannot turn programs into text yet. The blocks are unchanged — switch back to keep editing."
        action={<Button label="Back to Blocks" variant="secondary" onPress={onSwitchToBlocks} />} />
    );
  }
  if (phase === "error") {
    return (
      <Notice icon={<AlertCircle size={26} color={colors.danger} />} title="Could not show the program as text"
        body={phaseMsg || "The controller could not print this program."}
        action={<View style={styles.noticeActions}>
          <Button label="Try again" variant="secondary" onPress={() => { setPhase("loading"); formatFromDocument(programRef.current); }} />
          <Button label="Back to Blocks" variant="ghost" onPress={onSwitchToBlocks} />
        </View>} />
    );
  }
  if (initialText === null) {
    return phase === "offline"
      ? <Notice icon={<WifiOff size={26} color={colors.borderStrong} />} title="Connect to edit as text"
          body="Text editing runs through the controller. Connect to a robot, or switch back to Blocks."
          action={<Button label="Back to Blocks" variant="secondary" onPress={onSwitchToBlocks} />} />
      : <Notice icon={<Loader size={26} color={colors.borderStrong} />} title="Printing the program…" body="" />;
  }

  const status = <StatusChip phase={phase} parsing={parsing} dirty={dirty} parseOk={parseOk} errors={errorCount} unsupported={parseUnsupported} />;
  const inlineEditorHeight = modalEditing
    ? Math.min(Math.max(160, lines.length * 21.7 + 16), Math.round(winH * 0.55))
    : Math.max(340, Math.min(winH - 340, 900));

  const editorProps = {
    readOnly,
    problems: shownProblems,
    runningLines,
    paused: !!pausedId,
    breakpointLines,
    completions,
    onChange,
    onCursor: (line: number, col: number) => setCursor({ line, col }),
    onToggleBreakpoint,
    onFocusChange: setEditorFocused,
  };

  return (
    <View style={styles.card}>
      {phase === "offline" && (
        <Banner tone="warning" icon={<WifiOff size={14} color={colors.warning} />}
          text="Not connected — the text is read-only until the controller is back." />
      )}
      {parseUnsupported && (
        <Banner tone="warning" icon={<AlertTriangle size={14} color={colors.warning} />}
          text="This controller cannot read text back into blocks yet — the text is read-only." />
      )}

      <View style={styles.toolbar}>
        {status}
        <View style={{ flex: 1 }} />
        {modalEditing ? (
          <>
            <ToolButton label="Blocks" icon={Blocks} onPress={switchToBlocks} />
            <ToolButton label="Edit" icon={SquarePen} primary disabled={readOnly} onPress={() => openFullscreen()} />
          </>
        ) : (
          <>
            <ToolButton label="Format" icon={WandSparkles} disabled={readOnly || !parseOk} onPress={format} />
            <ToolButton label="Revert" icon={RotateCcw} disabled={!dirty} onPress={revert} />
            <ToolButton label="Apply" icon={Check} primary disabled={!dirty || readOnly} onPress={applyNow} />
            <ToolButton label="Blocks" icon={Blocks} onPress={switchToBlocks} />
          </>
        )}
      </View>

      <View style={[styles.editorWrap, { height: inlineEditorHeight }]}>
        <CodeEditor
          ref={inlineRef}
          initialText={initialText}
          style={StyleSheet.absoluteFill}
          {...editorProps}
          readOnly={modalEditing ? true : readOnly}
          onTapLine={modalEditing && !readOnly ? line => openFullscreen(line) : undefined}
          onViewport={line => { previewTop.current = line; }}
        />
      </View>

      {!modalEditing && !readOnly && <KeyRow compact send={send} onInsertStep={() => setPickerOpen(true)} />}
      {!modalEditing && help && <HelpStrip help={help} onDocs={openStepReference} />}

      {modalEditing && dirty && (
        <View style={styles.inlineActions}>
          <ToolButton label="Revert" icon={RotateCcw} onPress={revert} />
          <ToolButton label="Apply" icon={Check} primary disabled={readOnly} onPress={applyNow} />
        </View>
      )}

      <ProblemList problems={shownProblems} counts={problemCounts} onSelect={jumpToProblem} />

      {modalEditing && (
        <Modal
          visible={fullscreen}
          animationType="slide"
          // Web: Escape belongs to the editor (it closes the completion list), not the modal.
          onRequestClose={() => { if (Platform.OS !== "web" || !editorFocused) closeFullscreen(); }} statusBarTranslucent>
          <View style={[styles.full, { height: fullHeight }]}>
            <View style={{ height: Platform.OS === "web" ? 0 : insets.top }} />
            <View style={styles.fullHeader}>
              <TouchableOpacity onPress={closeFullscreen} style={styles.doneBtn} accessibilityRole="button" accessibilityLabel="Done editing">
                <Check size={16} color={colors.onAccent} />
                <Text style={styles.doneText}>Done</Text>
              </TouchableOpacity>
              {status}
              <View style={{ flex: 1 }} />
              <ToolButton label="Format" icon={WandSparkles} iconOnly disabled={readOnly || !parseOk} onPress={format} />
              <ToolButton label="Revert" icon={RotateCcw} iconOnly disabled={!dirty} onPress={revert} />
            </View>
            {help && <HelpStrip help={help} compact onDocs={ref => { closeFullscreen(); setTimeout(() => openStepReference(ref), 300); }} />}
            <View style={{ flex: 1 }}>
              {fullscreen && (
                <CodeEditor
                  ref={fullRef}
                  initialText={fullInitial}
                  style={StyleSheet.absoluteFill}
                  {...editorProps}
                  onReady={() => {
                    const line = pendingJump.current ?? 1, top = pendingTop.current;
                    pendingJump.current = null; pendingTop.current = null;
                    // Open showing what the preview showed, cursor on the tapped line (the keyboard
                    // effect above then scrolls only if the keyboard would cover it).
                    setTimeout(() => fullRef.current?.send({ type: "jumpTo", line, focus: true, topLine: top ?? undefined }), 60);
                  }}
                />
              )}
            </View>
            <ProblemStrip problems={shownProblems} onSelect={p => fullRef.current?.jumpTo(p.line, p.col, true)} />
            <KeyRow send={send} onInsertStep={() => setPickerOpen(true)} />
          </View>
          {fullscreen && (
            <StepTypePicker visible={pickerOpen} onPick={insertStep} onClose={() => setPickerOpen(false)} isBackgroundMode={!!program.isBackground} />
          )}
        </Modal>
      )}
      {!fullscreen && (
        <StepTypePicker visible={pickerOpen} onPick={insertStep} onClose={() => setPickerOpen(false)} isBackgroundMode={!!program.isBackground} />
      )}

      <BottomSheet visible={leaveSheet} onClose={() => setLeaveSheet(false)} title="Text has errors">
        <Text style={styles.sheetBody}>
          {`Fix ${errorCount || "the"} error${errorCount === 1 ? "" : "s"} to switch to Blocks, or discard the text changes that have not been applied.`}
        </Text>
        <View style={styles.sheetActions}>
          <Button label="Keep editing" variant="secondary" onPress={() => setLeaveSheet(false)} />
          <Button label="Discard changes" variant="dangerSoft" onPress={discardAndLeave} />
        </View>
      </BottomSheet>
    </View>
  );
}

// ── Pieces ────────────────────────────────────────────────────────────────────

function Notice({ icon, title, body, action }: { icon: React.ReactNode; title: string; body: string; action?: React.ReactNode }) {
  return (
    <View style={styles.notice} accessibilityRole="summary">
      {icon}
      <Text style={styles.noticeTitle}>{title}</Text>
      {!!body && <Text style={styles.noticeBody}>{body}</Text>}
      {action}
    </View>
  );
}

function Banner({ tone, icon, text }: { tone: "warning"; icon: React.ReactNode; text: string }) {
  return (
    <View style={[styles.banner, tone === "warning" && styles.bannerWarning]}>
      {icon}
      <Text style={styles.bannerText}>{text}</Text>
    </View>
  );
}

function StatusChip({ phase, parsing, dirty, parseOk, errors, unsupported }: {
  phase: Phase; parsing: boolean; dirty: boolean; parseOk: boolean; errors: number; unsupported: boolean;
}) {
  let label = "Applied", tone: "ok" | "busy" | "warn" | "bad" = "ok";
  if (phase !== "ready" || unsupported) { label = "Read-only"; tone = "warn"; }
  else if (parsing) { label = "Checking…"; tone = "busy"; }
  else if (!parseOk && errors > 0) { label = `${errors} error${errors === 1 ? "" : "s"} · not applied`; tone = "bad"; }
  else if (dirty) { label = "Not applied"; tone = "warn"; }
  const c = tone === "ok" ? colors.success : tone === "bad" ? colors.danger : tone === "warn" ? colors.warning : colors.textMuted;
  const bg = tone === "ok" ? colors.successSoft : tone === "bad" ? colors.dangerSoft : tone === "warn" ? colors.warningSoft : colors.surfaceMuted;
  return (
    <View style={[styles.chip, { backgroundColor: bg }]} accessibilityLabel={`Text status: ${label}`}>
      <View style={[styles.chipDot, { backgroundColor: c }]} />
      <Text style={[styles.chipText, { color: c }]} numberOfLines={1}>{label}</Text>
    </View>
  );
}

function ToolButton({ label, icon: Icon, onPress, disabled, primary, iconOnly }: {
  label: string; icon: React.ComponentType<{ size?: number; color?: string }>; onPress: () => void;
  disabled?: boolean; primary?: boolean; iconOnly?: boolean;
}) {
  const color = primary ? colors.onAccent : colors.textSecondary;
  return (
    <TouchableOpacity
      onPress={disabled ? undefined : onPress}
      activeOpacity={0.7}
      style={[styles.toolBtn, primary && styles.toolBtnPrimary, disabled && styles.toolBtnDisabled]}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
    >
      <Icon size={14} color={color} />
      {!iconOnly && <Text style={[styles.toolBtnText, { color }]}>{label}</Text>}
    </TouchableOpacity>
  );
}

function HelpStrip({ help, compact, onDocs }: {
  help: { title: string; syntax: string; description: string; ref?: string };
  compact?: boolean;
  /** Open the line's instruction in the programming manual. */
  onDocs?: (ref: string) => void;
}) {
  // Only link a keyword the bundled manual has a page for.
  const entry = help.ref ? findRefEntry(help.ref) : undefined;
  return (
    <View style={[styles.help, compact && styles.helpCompact, styles.helpRow]}>
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Text style={styles.helpSyntax} numberOfLines={compact ? 1 : 2}>{help.syntax}</Text>
        {!compact && !!help.description && <Text style={styles.helpDesc} numberOfLines={2}>{help.description}</Text>}
      </View>
      {entry && onDocs && (
        <TouchableOpacity onPress={() => onDocs(entry.type)} hitSlop={8} activeOpacity={0.7} style={styles.helpDocs}
          accessibilityRole="link" accessibilityLabel={`${entry.keyword} in the programming manual`}>
          <BookOpen size={14} color={colors.accent} />
          {!compact && <Text style={styles.helpDocsText}>Docs</Text>}
        </TouchableOpacity>
      )}
    </View>
  );
}

function ProblemList({ problems, counts, onSelect }: {
  problems: TextProblem[]; counts: { errors: number; warnings: number }; onSelect: (p: TextProblem) => void;
}) {
  const [open, setOpen] = useState(true);
  if (problems.length === 0) return null;
  const sorted = [...problems].sort((a, b) => (a.severity === b.severity ? a.line - b.line : a.severity === "error" ? -1 : 1));
  return (
    <View style={styles.problems}>
      <TouchableOpacity style={styles.problemsHead} onPress={() => setOpen(o => !o)} activeOpacity={0.7} accessibilityRole="button">
        <Text style={styles.problemsTitle}>PROBLEMS</Text>
        {counts.errors > 0 && <Text style={[styles.problemsCount, { color: colors.danger }]}>{counts.errors} error{counts.errors === 1 ? "" : "s"}</Text>}
        {counts.warnings > 0 && <Text style={[styles.problemsCount, { color: colors.warning }]}>{counts.warnings} warning{counts.warnings === 1 ? "" : "s"}</Text>}
        <View style={{ flex: 1 }} />
        <Text style={styles.problemsToggle}>{open ? "Hide" : "Show"}</Text>
      </TouchableOpacity>
      {open && (
        <ScrollView style={styles.problemsScroll} nestedScrollEnabled>
          {sorted.map((p, i) => (
            <TouchableOpacity key={i} style={styles.problemRow} onPress={() => onSelect(p)} activeOpacity={0.7}
              accessibilityRole="button" accessibilityLabel={`Line ${p.line}: ${p.message}`}>
              {p.severity === "error"
                ? <AlertCircle size={14} color={colors.danger} />
                : <AlertTriangle size={14} color={colors.warning} />}
              <Text style={styles.problemLoc}>{`${p.line}:${p.col}`}</Text>
              <Text style={styles.problemMsg} numberOfLines={2}>{p.message}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

/** Full-screen editor: the first problem in one line; tap to jump, the arrow to step through them. */
function ProblemStrip({ problems, onSelect }: { problems: TextProblem[]; onSelect: (p: TextProblem) => void }) {
  const [i, setI] = useState(0);
  if (problems.length === 0) return null;
  const sorted = [...problems].sort((a, b) => (a.severity === b.severity ? a.line - b.line : a.severity === "error" ? -1 : 1));
  const p = sorted[Math.min(i, sorted.length - 1)];
  return (
    <View style={styles.strip}>
      <TouchableOpacity style={styles.stripMain} onPress={() => onSelect(p)} activeOpacity={0.7} accessibilityRole="button">
        {p.severity === "error" ? <AlertCircle size={14} color={colors.danger} /> : <AlertTriangle size={14} color={colors.warning} />}
        <Text style={styles.problemLoc}>{`${p.line}:${p.col}`}</Text>
        <Text style={styles.problemMsg} numberOfLines={1}>{p.message}</Text>
      </TouchableOpacity>
      {sorted.length > 1 && (
        <TouchableOpacity onPress={() => { const n = (i + 1) % sorted.length; setI(n); onSelect(sorted[n]); }} style={styles.stripNext}
          accessibilityRole="button" accessibilityLabel="Next problem">
          <Text style={styles.stripNextText}>{`${Math.min(i, sorted.length - 1) + 1}/${sorted.length} ›`}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    overflow: "hidden",
  },
  notice: {
    alignItems: "center",
    gap: spacing.sm,
    padding: spacing.xl,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  noticeTitle: { fontSize: 15, fontWeight: "700", color: colors.text, textAlign: "center" },
  noticeBody: { fontSize: 13, color: colors.textMuted, textAlign: "center", maxWidth: 380 },
  noticeActions: { flexDirection: "row", gap: spacing.sm },
  banner: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: spacing.md, paddingVertical: 8 },
  bannerWarning: { backgroundColor: colors.warningSoft, borderBottomWidth: 1, borderBottomColor: colors.warningBorder },
  bannerText: { flex: 1, fontSize: 12, color: colors.textSecondary },
  toolbar: {
    flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap",
    paddingHorizontal: spacing.sm, paddingVertical: spacing.sm,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  chip: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 9, height: 26, borderRadius: radii.pill, flexShrink: 1 },
  chipDot: { width: 7, height: 7, borderRadius: 4 },
  chipText: { fontSize: 12, fontWeight: "700" },
  toolBtn: {
    flexDirection: "row", alignItems: "center", gap: 5, height: 32, paddingHorizontal: 10,
    borderRadius: radii.sm, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface,
  },
  toolBtnPrimary: { backgroundColor: colors.accent, borderColor: colors.accent },
  toolBtnDisabled: { opacity: 0.4 },
  toolBtnText: { fontSize: 13, fontWeight: "600" },
  editorWrap: { position: "relative", backgroundColor: colors.surface },
  inlineActions: {
    flexDirection: "row", justifyContent: "flex-end", gap: 6, padding: spacing.sm,
    borderTopWidth: 1, borderTopColor: colors.border,
  },
  help: {
    paddingHorizontal: spacing.md, paddingVertical: 8, gap: 2,
    borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.surfaceMuted,
  },
  helpCompact: { paddingVertical: 5, borderTopWidth: 0, borderBottomWidth: 1, borderBottomColor: colors.border },
  helpSyntax: { fontSize: 12, color: colors.textSecondary, fontFamily: Platform.select({ ios: "Menlo", default: "monospace" }) },
  helpDesc: { fontSize: 12, color: colors.textMuted },
  helpRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  helpDocs: {
    flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: spacing.sm, paddingVertical: 4,
    borderRadius: radii.sm, backgroundColor: colors.accentSoft,
  },
  helpDocsText: { fontSize: 12, fontWeight: "700", color: colors.accent },
  problems: { borderTopWidth: 1, borderTopColor: colors.border },
  problemsHead: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: spacing.md, paddingVertical: 8 },
  problemsTitle: { fontSize: 11, fontWeight: "800", letterSpacing: 0.6, color: colors.textMuted },
  problemsCount: { fontSize: 12, fontWeight: "700" },
  problemsToggle: { fontSize: 12, color: colors.accent, fontWeight: "600" },
  problemsScroll: { maxHeight: 220 },
  problemRow: { flexDirection: "row", alignItems: "flex-start", gap: 8, paddingHorizontal: spacing.md, paddingVertical: 7 },
  problemLoc: { fontSize: 12, fontWeight: "700", color: colors.textSecondary, minWidth: 34, fontFamily: Platform.select({ ios: "Menlo", default: "monospace" }) },
  problemMsg: { flex: 1, fontSize: 13, color: colors.text },
  full: { position: "absolute", top: 0, left: 0, right: 0, backgroundColor: colors.surface },
  fullHeader: {
    flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: spacing.sm, height: 50,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  doneBtn: { flexDirection: "row", alignItems: "center", gap: 5, height: 34, paddingHorizontal: 12, borderRadius: radii.sm, backgroundColor: colors.accent },
  doneText: { fontSize: 14, fontWeight: "700", color: colors.onAccent },
  strip: {
    flexDirection: "row", alignItems: "center", minHeight: 34,
    borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.dangerSoft,
  },
  stripMain: { flex: 1, flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: spacing.md, paddingVertical: 6 },
  stripNext: { paddingHorizontal: spacing.md, paddingVertical: 6 },
  stripNextText: { fontSize: 12, fontWeight: "700", color: colors.textSecondary },
  sheetBody: { fontSize: 14, color: colors.textSecondary, marginBottom: spacing.md },
  sheetActions: { flexDirection: "row", gap: spacing.sm, justifyContent: "flex-end" },
});

