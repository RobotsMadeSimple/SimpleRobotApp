import { useEffect, useImperativeHandle, type Ref } from "react";
import type { EditorCommand } from "./bridge";
import type { CodeEditorHandle, CodeEditorProps } from "./codeEditorTypes";

/**
 * Pushes the declarative CodeEditor props into the editor whenever they change, and builds the
 * imperative handle — shared by the native (WebView) and web (direct) CodeEditor so both stay in
 * step. `ready` re-sends everything once the editor has (re)loaded.
 */
export function useEditorSync(ref: Ref<CodeEditorHandle>, send: (cmd: EditorCommand) => void, p: CodeEditorProps, ready: boolean) {
  useImperativeHandle(ref, () => ({
    send,
    setText: (text, keepCursor) => send({ type: "setText", text, keepCursor }),
    focus: () => send({ type: "focus" }),
    jumpTo: (line, col, focus) => send({ type: "jumpTo", line, col, focus }),
    insertText: text => send({ type: "insertText", text }),
    insertSnippet: (template, asLine) => send({ type: "insertSnippet", template, asLine }),
  }), [send]);

  useEffect(() => { if (ready) send({ type: "setReadOnly", readOnly: !!p.readOnly }); }, [ready, send, p.readOnly]);
  useEffect(() => { if (ready) send({ type: "setDiagnostics", problems: p.problems ?? [] }); }, [ready, send, p.problems]);
  useEffect(() => { if (ready) send({ type: "setCompletions", data: p.completions ?? null }); }, [ready, send, p.completions]);
  useEffect(() => { if (ready) send({ type: "setBottomInset", px: p.bottomInset ?? 0 }); }, [ready, send, p.bottomInset]);
  const bpKey = (p.breakpointLines ?? []).join(",");
  useEffect(() => {
    if (ready) send({ type: "setBreakpoints", lines: bpKey ? bpKey.split(",").map(Number) : [] });
  }, [ready, send, bpKey]);
  const runKey = p.runningLines ? `${p.runningLines.line}-${p.runningLines.endLine}-${p.paused ? 1 : 0}` : "";
  useEffect(() => {
    if (!ready) return;
    send({ type: "setHighlightLines", running: p.runningLines ?? null, paused: !!p.paused });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, send, runKey]);
}
