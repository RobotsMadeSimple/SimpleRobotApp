// The SRS code editor itself: CodeMirror 6 configured for Simple Robot Script. DOM only, no React
// or React Native — CodeEditor.web.tsx mounts it in a div, and webviewEntry.ts bundles it (via
// scripts/build-code-editor.mjs) into the HTML the native WebView loads, so web and phones run
// the very same editor. Commands and events are the bridge.ts contract.

import { Compartment, EditorSelection, EditorState, RangeSet, StateEffect, StateField, type Extension } from "@codemirror/state";
import {
  Decoration, type DecorationSet, EditorView, GutterMarker, drawSelection, gutter, highlightActiveLine,
  highlightActiveLineGutter, keymap, lineNumbers, tooltips,
} from "@codemirror/view";
import { HighlightStyle, StreamLanguage, bracketMatching, indentOnInput, indentUnit, syntaxHighlighting } from "@codemirror/language";
import { tags as t } from "@lezer/highlight";
import { defaultKeymap, history, historyKeymap, indentLess, indentMore, indentWithTab, redo, toggleComment, undo } from "@codemirror/commands";
import {
  autocompletion, closeBrackets, closeBracketsKeymap, completionKeymap, snippet, startCompletion,
  type Completion, type CompletionContext, type CompletionResult,
} from "@codemirror/autocomplete";
import { type Diagnostic, lintGutter, setDiagnostics } from "@codemirror/lint";
import type { TextProblem } from "@/src/models/robotModels";
import type { EditorCommand, EditorController, EditorEvent, EditorLineRange } from "./bridge";
import { type SrsKeywords, srsKeywords, srsStreamParser } from "./srsTokens";
import { type SrsCompletionData, srsCompletionsAt } from "./srsCompletions";

type Box = { left: number; right: number; top: number; bottom: number };

/**
 * Where a completion's info (syntax + description) sits. Beside the list when there is room; on a
 * narrow screen CodeMirror's default drops it under the selected row, on top of the rest of the
 * list — so put it below the whole list instead (or above it when the space below is short).
 */
function positionInfo(_view: EditorView, list: Box, _option: Box, info: Box, space: Box) {
  const gap = 4;
  const infoW = info.right - info.left, infoH = info.bottom - info.top;
  const spaceRight = space.right - list.right, spaceLeft = list.left - space.left;
  if (infoW + gap <= spaceRight) {
    return { style: `top: 0; max-width: ${Math.min(400, spaceRight - gap)}px`, class: "cm-completionInfo-right" };
  }
  if (infoW + gap <= spaceLeft) {
    return { style: `top: 0; max-width: ${Math.min(400, spaceLeft - gap)}px`, class: "cm-completionInfo-left" };
  }
  const maxWidth = Math.min(400, space.right - list.left - 8);
  const listH = list.bottom - list.top;
  const below = space.bottom - list.bottom >= infoH + gap || space.bottom - list.bottom >= list.top - space.top;
  return {
    style: `${below ? "top" : "bottom"}: ${listH + gap}px; left: 0; max-width: ${maxWidth}px`,
    class: "cm-completionInfo-below",
  };
}

export type SrsEditorOptions = {
  text?: string;
  readOnly?: boolean;
  onEvent: (e: EditorEvent) => void;
};

// App palette (src/components/ui/kit/theme.ts) — duplicated as literals because this file also
// runs inside the WebView bundle, which must not pull React Native in.
const C = {
  text: "#111827", muted: "#6b7280", faint: "#9ca3af", border: "#e5e7eb", surface: "#ffffff", well: "#f9fafb",
  accent: "#2563eb", accentSoft: "#eff6ff", purple: "#7c3aed", cyan: "#0891b2", orange: "#ea580c",
  success: "#16a34a", warning: "#d97706", danger: "#dc2626", dangerSoft: "#fef2f2",
};

const srsHighlight = HighlightStyle.define([
  { tag: t.keyword, color: C.accent, fontWeight: "600" },
  { tag: t.controlKeyword, color: "#9333ea", fontWeight: "600" },
  { tag: t.definitionKeyword, color: "#0f766e", fontWeight: "600" },
  { tag: t.variableName, color: C.purple },
  { tag: t.string, color: C.orange },
  { tag: t.special(t.string), color: C.purple, fontWeight: "600" },
  { tag: t.escape, color: "#c2410c" },
  { tag: t.number, color: "#0369a1" },
  { tag: t.unit, color: "#0369a1", fontStyle: "italic" },
  { tag: t.bool, color: "#0369a1", fontWeight: "600" },
  { tag: t.comment, color: C.faint, fontStyle: "italic" },
  { tag: t.heading, color: C.text, fontWeight: "700", backgroundColor: "#f3f4f6" },
  { tag: t.meta, color: C.faint },
  { tag: t.attributeName, color: C.cyan },
  { tag: t.propertyName, color: "#475569" },
  { tag: t.labelName, color: "#065f46" },
  { tag: t.operator, color: "#64748b" },
  { tag: t.punctuation, color: "#64748b" },
  { tag: t.invalid, color: C.danger, textDecoration: "underline wavy" },
]);

const baseTheme = EditorView.theme({
  "&": { height: "100%", fontSize: "14px", backgroundColor: C.surface, color: C.text },
  "&.cm-focused": { outline: "none" },
  ".cm-scroller": { fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, 'Roboto Mono', monospace", lineHeight: "1.55", overflow: "auto" },
  ".cm-content": { padding: "6px 0", caretColor: C.accent },
  ".cm-gutters": { backgroundColor: C.well, color: C.faint, borderRight: `1px solid ${C.border}` },
  ".cm-lineNumbers .cm-gutterElement": { padding: "0 6px 0 4px", minWidth: "26px" },
  ".cm-activeLine": { backgroundColor: "rgba(37,99,235,0.05)" },
  ".cm-activeLineGutter": { backgroundColor: "rgba(37,99,235,0.08)", color: C.text },
  ".cm-bp-gutter": { width: "18px", cursor: "pointer" },
  ".cm-bp-gutter .cm-gutterElement": { display: "flex", alignItems: "center", justifyContent: "center" },
  ".cm-bp": { width: "10px", height: "10px", borderRadius: "5px", backgroundColor: C.danger, boxShadow: "0 0 0 2px #fff" },
  ".cm-bp-spacer": { width: "10px", height: "10px" },
  ".cm-runLine": { backgroundColor: "rgba(22,163,74,0.14)", boxShadow: `inset 3px 0 0 ${C.success}` },
  ".cm-pausedLine": { backgroundColor: "rgba(217,119,6,0.22)", boxShadow: `inset 3px 0 0 ${C.warning}` },
  ".cm-tooltip": { border: `1px solid ${C.border}`, borderRadius: "8px", backgroundColor: C.surface, boxShadow: "0 6px 18px rgba(0,0,0,0.12)" },
  ".cm-tooltip-autocomplete > ul": { fontFamily: "ui-monospace, Menlo, Consolas, monospace", maxHeight: "14em" },
  ".cm-tooltip-autocomplete > ul > li": { padding: "4px 8px !important", lineHeight: "1.5" },
  ".cm-tooltip-autocomplete > ul > li[aria-selected]": { backgroundColor: C.accentSoft, color: C.text },
  ".cm-completionDetail": { color: C.muted, fontStyle: "normal", marginLeft: "8px" },
  ".cm-completionInfo": { fontFamily: "system-ui, sans-serif", fontSize: "12px", whiteSpace: "pre-wrap", maxWidth: "320px", padding: "6px 8px" },
  ".cm-diagnostic": { fontFamily: "system-ui, sans-serif", fontSize: "13px" },
  ".cm-lintRange-error": { backgroundImage: "none", textDecoration: `underline wavy ${C.danger}`, textUnderlineOffset: "3px" },
  ".cm-lintRange-warning": { backgroundImage: "none", textDecoration: `underline wavy ${C.warning}`, textUnderlineOffset: "3px" },
  ".cm-placeholder": { color: C.faint },
});

// ── Touch: keep hover/lint tooltips clear of the caret handle ─────────────────

/** Height of the teardrop selection handle a touch browser draws under the caret (CSS px), plus a gap. */
const CARET_HANDLE_CLEARANCE = 32;

/**
 * On a touch screen a tap is also a hover, so the lint tooltip opens right at the caret — and the
 * system's teardrop handle under the caret covers its first characters. Lint tooltips already ask
 * to sit above the line; this keeps them inside the editor (never over whatever sits above it,
 * such as the line-help bar on web) and, when there is no room above so CodeMirror flips them
 * below, drops them past the handle. Mouse pointers keep CodeMirror's default placement.
 */
function touchTooltipPlacement(): Extension {
  const coarse = typeof window !== "undefined" && typeof window.matchMedia === "function"
    && window.matchMedia("(pointer: coarse)").matches;
  if (!coarse) return [];
  return [
    tooltips({
      tooltipSpace: view => {
        const html = view.dom.ownerDocument.documentElement;
        return { top: Math.max(0, view.dom.getBoundingClientRect().top), left: 0, right: html.clientWidth, bottom: html.clientHeight };
      },
    }),
    EditorView.theme({
      ".cm-tooltip-hover.cm-tooltip-below": { marginTop: `${CARET_HANDLE_CLEARANCE}px` },
      ".cm-tooltip-hover.cm-tooltip-above": { marginTop: "-4px" },
    }),
  ];
}

// ── Breakpoint gutter ─────────────────────────────────────────────────────────

class BreakpointMarker extends GutterMarker {
  toDOM() { const d = document.createElement("div"); d.className = "cm-bp"; return d; }
}
class SpacerMarker extends GutterMarker {
  toDOM() { const d = document.createElement("div"); d.className = "cm-bp-spacer"; return d; }
}
const bpMarker = new BreakpointMarker();
const setBreakpointLines = StateEffect.define<number[]>();
const breakpointField = StateField.define<RangeSet<GutterMarker>>({
  create: () => RangeSet.empty,
  update(set, tr) {
    set = set.map(tr.changes);
    for (const e of tr.effects) {
      if (!e.is(setBreakpointLines)) continue;
      const doc = tr.state.doc;
      const lines = [...new Set(e.value)].filter(l => l >= 1 && l <= doc.lines).sort((a, b) => a - b);
      set = RangeSet.of(lines.map(l => bpMarker.range(doc.line(l).from)));
    }
    return set;
  },
});

// ── Running-line highlight ────────────────────────────────────────────────────

const setRunLines = StateEffect.define<{ range: EditorLineRange | null; paused: boolean }>();
const runLineField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(deco, tr) {
    deco = deco.map(tr.changes);
    for (const e of tr.effects) {
      if (!e.is(setRunLines)) continue;
      const doc = tr.state.doc;
      const r = e.value.range;
      if (!r || r.line < 1 || r.line > doc.lines) { deco = Decoration.none; continue; }
      const cls = e.value.paused ? "cm-pausedLine" : "cm-runLine";
      const marks = [];
      for (let l = r.line; l <= Math.min(r.endLine, doc.lines); l++) marks.push(Decoration.line({ class: cls }).range(doc.line(l).from));
      deco = Decoration.set(marks);
    }
    return deco;
  },
  provide: f => EditorView.decorations.from(f),
});

// ── Problems → CodeMirror diagnostics ─────────────────────────────────────────

/** 1-based line/col (UTF-16, endCol exclusive) → document offsets, clamped to the document. */
export function problemToDiagnostic(state: EditorState, p: TextProblem): Diagnostic | null {
  const doc = state.doc;
  if (!doc.lines) return null;
  const line = Math.min(Math.max(1, p.line || 1), doc.lines);
  const l = doc.line(line);
  const col = Math.max(1, p.col || 1);
  let from = Math.min(l.from + col - 1, l.to);
  const endLine = Math.min(Math.max(line, p.endLine || line), doc.lines);
  const el = doc.line(endLine);
  let to = p.endCol ? Math.min(el.from + p.endCol - 1, el.to) : from;
  if (to <= from) {
    // A point problem: mark the word at the column, or the whole line if it is empty there.
    const m = /^[^\s,()]+/.exec(l.text.slice(from - l.from));
    to = m ? from + m[0].length : l.to;
    if (to <= from) { from = l.from + (l.text.length - l.text.trimStart().length); to = l.to; }
  }
  return {
    from, to,
    severity: p.severity === "error" ? "error" : p.severity === "warning" ? "warning" : "info",
    message: p.message,
    source: p.code ? `${p.code}${p.source === "validate" ? " · validation" : ""}` : undefined,
  };
}

const COMPLETION_TYPE: Record<string, string> = {
  keyword: "keyword", flow: "keyword", decl: "keyword", arg: "property", name: "constant",
  value: "enum", variable: "variable", property: "property", io: "variable", function: "function",
};

// ── The editor ────────────────────────────────────────────────────────────────

export function createSrsEditor(parent: HTMLElement, opts: SrsEditorOptions): EditorController {
  let data: SrsCompletionData | null = null;
  let keywords: SrsKeywords = srsKeywords();
  let bottomInset = 0;
  let readOnly = !!opts.readOnly;
  let applyingExternal = false;
  const emit = (e: EditorEvent) => { try { opts.onEvent(e); } catch { /* host gone */ } };
  let tapStart: { x: number; y: number } | null = null;

  const languageConf = new Compartment();
  const editableConf = new Compartment();
  const marginsConf  = new Compartment();
  const makeLanguage = () => StreamLanguage.define(srsStreamParser(() => keywords));

  const source = (ctx: CompletionContext): CompletionResult | null => {
    const line = ctx.state.doc.lineAt(ctx.pos);
    const full = /^\s*goto\b/i.test(line.text) ? ctx.state.doc.toString() : "";
    const r = srsCompletionsAt(line.text, ctx.pos - line.from, data, full, { explicit: ctx.explicit });
    if (!r || r.items.length === 0) return null;
    const options: Completion[] = r.items.map((i, n) => ({
      label: i.label,
      detail: i.detail,
      info: i.info,
      type: COMPLETION_TYPE[i.kind] ?? "text",
      apply: i.snippet ? snippet(i.snippet) : i.insert,
      boost: -n,
    }));
    return { from: line.from + r.from, to: line.from + Math.max(r.to, ctx.pos - line.from), options, filter: false };
  };

  const breakpointGutter = gutter({
    class: "cm-bp-gutter",
    markers: v => v.state.field(breakpointField),
    initialSpacer: () => new SpacerMarker(),
    domEventHandlers: {
      mousedown(view, block, event) {
        event.preventDefault();
        emit({ type: "toggleBreakpoint", line: view.state.doc.lineAt(block.from).number });
        return true;
      },
    },
  });

  const extensions: Extension[] = [
    breakpointField,
    breakpointGutter,
    lineNumbers(),
    lintGutter(),
    highlightActiveLineGutter(),
    history(),
    drawSelection(),
    indentOnInput(),
    bracketMatching(),
    closeBrackets(),
    highlightActiveLine(),
    EditorView.lineWrapping,
    indentUnit.of("  "),
    EditorState.tabSize.of(2),
    languageConf.of(makeLanguage()),
    syntaxHighlighting(srsHighlight),
    baseTheme,
    touchTooltipPlacement(),
    runLineField,
    autocompletion({ override: [source], activateOnTyping: true, icons: false, maxRenderedOptions: 40, positionInfo }),
    keymap.of([
      ...closeBracketsKeymap, ...completionKeymap, ...defaultKeymap, ...historyKeymap, indentWithTab,
      { key: "Mod-/", run: toggleComment },
    ]),
    editableConf.of([EditorView.editable.of(!readOnly), EditorState.readOnly.of(readOnly)]),
    marginsConf.of(EditorView.scrollMargins.of(() => ({ bottom: bottomInset + 24, top: 8 }))),
    EditorView.updateListener.of(u => {
      if (u.docChanged && !applyingExternal) emit({ type: "change", text: u.state.doc.toString() });
      if (u.selectionSet || u.docChanged) {
        const head = u.state.selection.main.head;
        const line = u.state.doc.lineAt(head);
        emit({ type: "cursor", line: line.number, col: head - line.from + 1 });
      }
      if (u.focusChanged) emit({ type: "focus", focused: u.view.hasFocus });
    }),
    // A tap on a read-only editor (pointer down and up without moving): `click` is not reliable here
    // (no click reaches a read-only CodeMirror in some browsers), and a swipe that scrolls must not count.
    EditorView.domEventHandlers({
      pointerdown(event) {
        tapStart = readOnly && event.isPrimary ? { x: event.clientX, y: event.clientY } : null;
        return false;
      },
      pointercancel() { tapStart = null; return false; },
      pointerup(event, view) {
        const start = tapStart; tapStart = null;
        if (!readOnly || !start || Math.hypot(event.clientX - start.x, event.clientY - start.y) > 8) return false;
        if (!view.contentDOM.contains(event.target as Node)) return false; // gutter taps toggle breakpoints
        const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
        if (pos != null) emit({ type: "tapLine", line: view.state.doc.lineAt(pos).number });
        return false;
      },
    }),
    // Phones: let the system keyboard offer no autocorrect/capitalisation on code.
    EditorView.contentAttributes.of({ autocapitalize: "off", autocorrect: "off", spellcheck: "false", "aria-label": "Program text" }),
  ];

  const view = new EditorView({
    parent,
    state: EditorState.create({ doc: opts.text ?? "", extensions }),
  });

  // Report the top visible line as the user scrolls (once per frame), so a phone's full-screen
  // editor can open at the place the read-only preview was showing.
  let lastTop = 0, scrollFrame = 0;
  view.scrollDOM.addEventListener("scroll", () => {
    if (scrollFrame) return;
    scrollFrame = requestAnimationFrame(() => {
      scrollFrame = 0;
      const block = view.lineBlockAtHeight(view.scrollDOM.scrollTop - view.documentPadding.top);
      const top = view.state.doc.lineAt(block.from).number;
      if (top !== lastTop) { lastTop = top; emit({ type: "viewport", topLine: top }); }
    });
  }, { passive: true });

  const applyInset = (px: number) => {
    bottomInset = Math.max(0, Math.round(px));
    view.contentDOM.style.paddingBottom = `${bottomInset + 6}px`;
    view.dispatch({ effects: marginsConf.reconfigure(EditorView.scrollMargins.of(() => ({ bottom: bottomInset + 24, top: 8 }))) });
    view.dispatch({ effects: EditorView.scrollIntoView(view.state.selection.main.head, { y: "nearest", yMargin: 24 }) });
  };

  const apply = (cmd: EditorCommand) => {
    switch (cmd.type) {
      case "setText": {
        const cur = view.state.doc.toString();
        if (cur === cmd.text) return;
        const headLine = view.state.doc.lineAt(view.state.selection.main.head).number;
        applyingExternal = true;
        try {
          view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: cmd.text } });
          if (cmd.keepCursor) {
            const doc = view.state.doc;
            const l = doc.line(Math.min(headLine, doc.lines));
            view.dispatch({ selection: EditorSelection.cursor(l.to) });
          } else {
            view.dispatch({ selection: EditorSelection.cursor(0), effects: EditorView.scrollIntoView(0) });
          }
        } finally { applyingExternal = false; }
        return;
      }
      case "setDiagnostics": {
        const diags = cmd.problems.map(p => problemToDiagnostic(view.state, p)).filter((d): d is Diagnostic => !!d);
        view.dispatch(setDiagnostics(view.state, diags));
        return;
      }
      case "setHighlightLines": {
        view.dispatch({ effects: setRunLines.of({ range: cmd.running, paused: !!cmd.paused }) });
        if (cmd.running && cmd.running.line <= view.state.doc.lines && !view.hasFocus) {
          view.dispatch({ effects: EditorView.scrollIntoView(view.state.doc.line(cmd.running.line).from, { y: "nearest", yMargin: 48 }) });
        }
        return;
      }
      case "setBreakpoints":
        view.dispatch({ effects: setBreakpointLines.of(cmd.lines) });
        return;
      case "setCompletions": {
        data = cmd.data;
        const kws = cmd.data?.steps.flatMap(s => [s.keyword, ...s.aliases]);
        keywords = srsKeywords(kws && kws.length ? kws : undefined);
        view.dispatch({ effects: languageConf.reconfigure(makeLanguage()) });
        return;
      }
      case "setReadOnly":
        readOnly = cmd.readOnly;
        view.dispatch({ effects: editableConf.reconfigure([EditorView.editable.of(!readOnly), EditorState.readOnly.of(readOnly)]) });
        return;
      case "setBottomInset":
        applyInset(cmd.px);
        return;
      case "focus":
        view.focus();
        view.dispatch({ effects: EditorView.scrollIntoView(view.state.selection.main.head, { y: "nearest", yMargin: 24 }) });
        return;
      case "blur":
        view.contentDOM.blur();
        return;
      case "insertText": {
        if (readOnly) return;
        view.dispatch(view.state.replaceSelection(cmd.text), { scrollIntoView: true, userEvent: "input.type" });
        view.focus();
        if (/[$=,(\s]$/.test(cmd.text)) startCompletion(view);
        return;
      }
      case "insertSnippet": {
        if (readOnly) return;
        const sel = view.state.selection.main;
        let from = sel.from, to = sel.to;
        if (cmd.asLine) {
          const line = view.state.doc.lineAt(sel.head);
          if (line.text.trim() === "") { from = line.from + line.text.length; to = line.to; }
          else {
            // Start a new line under the cursor's line, at its indentation.
            const indent = /^\s*/.exec(line.text)![0];
            view.dispatch({ changes: { from: line.to, insert: "\n" + indent }, selection: { anchor: line.to + 1 + indent.length } });
            from = to = view.state.selection.main.head;
          }
        }
        snippet(cmd.template)(view, null, from, to);
        view.focus();
        return;
      }
      case "jumpTo": {
        const doc = view.state.doc;
        const l = doc.line(Math.min(Math.max(1, cmd.line), doc.lines));
        const pos = Math.min(l.from + Math.max(0, (cmd.col ?? 1) - 1), l.to);
        // One transaction: CodeMirror keeps only the last scroll request before it measures.
        const scroll = cmd.topLine != null
          ? EditorView.scrollIntoView(doc.line(Math.min(Math.max(1, cmd.topLine), doc.lines)).from, { y: "start" })
          : EditorView.scrollIntoView(pos, { y: "center" });
        view.dispatch({ selection: EditorSelection.cursor(pos), effects: scroll });
        if (cmd.focus) view.focus();
        return;
      }
      case "scrollCursorIntoView":
        view.dispatch({ effects: EditorView.scrollIntoView(view.state.selection.main.head, { y: "nearest", yMargin: 24 }) });
        return;
      case "toggleComment": toggleComment(view); view.focus(); return;
      case "indent": indentMore(view); view.focus(); return;
      case "dedent": indentLess(view); view.focus(); return;
      case "undo": undo(view); return;
      case "redo": redo(view); return;
      case "startCompletion": view.focus(); startCompletion(view); return;
    }
  };

  return {
    apply,
    getText: () => view.state.doc.toString(),
    destroy: () => view.destroy(),
  };
}
