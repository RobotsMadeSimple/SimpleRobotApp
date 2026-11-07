// The message contract between the app and the code editor (controller docs/program-language.md
// §7.2). On native the editor is CodeMirror inside a WebView, so these travel as JSON through
// postMessage / injectJavaScript; on web CodeEditor.web.tsx calls the same `apply` directly.
// Types only — safe to import from the WebView bundle.

import type { TextProblem } from "@/src/models/robotModels";
import type { SrsCompletionData } from "./srsCompletions";

/** A highlighted range of lines (1-based, inclusive). */
export type EditorLineRange = { line: number; endLine: number };

/** app → editor */
export type EditorCommand =
  | { type: "setText"; text: string; /** keep the cursor line (clamped) instead of moving to the top */ keepCursor?: boolean }
  | { type: "setDiagnostics"; problems: TextProblem[] }
  | { type: "setHighlightLines"; running: EditorLineRange | null; paused?: boolean }
  | { type: "setBreakpoints"; lines: number[] }
  | { type: "setCompletions"; data: SrsCompletionData | null }
  | { type: "setReadOnly"; readOnly: boolean }
  /** Space at the bottom of the editor that something (the keyboard) covers, in CSS px. */
  | { type: "setBottomInset"; px: number }
  | { type: "focus" }
  | { type: "blur" }
  /** Replace the selection with `text` (key row symbols). */
  | { type: "insertText"; text: string }
  /** Insert a CodeMirror snippet template at the cursor, on its own line when `asLine`. */
  | { type: "insertSnippet"; template: string; asLine?: boolean }
  | { type: "jumpTo"; line: number; col?: number; focus?: boolean }
  | { type: "scrollCursorIntoView" }
  | { type: "toggleComment" }
  | { type: "indent" }
  | { type: "dedent" }
  | { type: "undo" }
  | { type: "redo" }
  | { type: "startCompletion" };

/** editor → app */
export type EditorEvent =
  | { type: "ready" }
  | { type: "change"; text: string }
  | { type: "cursor"; line: number; col: number }
  | { type: "focus"; focused: boolean }
  /** The breakpoint gutter was tapped on this line. */
  | { type: "toggleBreakpoint"; line: number }
  /** A tap on a read-only editor (phones open the full-screen editor at that line). */
  | { type: "tapLine"; line: number }
  | { type: "error"; message: string };

/** What the WebView/web editor exposes. */
export type EditorController = {
  apply(cmd: EditorCommand): void;
  getText(): string;
  destroy(): void;
};
