import type { StyleProp, ViewStyle } from "react-native";
import type { TextProblem } from "@/src/models/robotModels";
import type { EditorCommand, EditorLineRange } from "./bridge";
import type { SrsCompletionData } from "./srsCompletions";

/**
 * Props shared by CodeEditor.tsx (native WebView) and CodeEditor.web.tsx (CodeMirror in a div).
 * Declarative state (diagnostics, highlight, breakpoints, completions, read-only, inset) is
 * pushed to the editor whenever it changes; the text is set once from `initialText` and after
 * that only through the handle's `setText`, so typing never round-trips through React.
 */
export type CodeEditorProps = {
  initialText: string;
  readOnly?: boolean;
  problems?: TextProblem[];
  /** The running step's lines; `paused` tints it stronger (a breakpoint stop). */
  runningLines?: EditorLineRange | null;
  paused?: boolean;
  /** Lines that carry a breakpoint marker. */
  breakpointLines?: number[];
  completions?: SrsCompletionData | null;
  /** Bottom part of the editor that is covered (by the keyboard), in px. */
  bottomInset?: number;
  style?: StyleProp<ViewStyle>;
  onChange?: (text: string) => void;
  onCursor?: (line: number, col: number) => void;
  onFocusChange?: (focused: boolean) => void;
  onToggleBreakpoint?: (line: number) => void;
  /** A tap on a read-only editor. */
  onTapLine?: (line: number) => void;
  onReady?: () => void;
};

export type CodeEditorHandle = {
  /** Send one command (queued until the editor is ready). */
  send: (cmd: EditorCommand) => void;
  setText: (text: string, keepCursor?: boolean) => void;
  focus: () => void;
  jumpTo: (line: number, col?: number, focus?: boolean) => void;
  insertText: (text: string) => void;
  insertSnippet: (template: string, asLine?: boolean) => void;
};
