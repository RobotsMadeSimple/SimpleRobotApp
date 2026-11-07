import React, { forwardRef, useCallback, useEffect, useRef, useState } from "react";
import { View } from "react-native";
import type { EditorCommand, EditorController, EditorEvent } from "./bridge";
import type { CodeEditorHandle, CodeEditorProps } from "./codeEditorTypes";
import { createSrsEditor } from "./editorCore";
import { useEditorSync } from "./useEditorSync";

/**
 * Web and Electron: CodeMirror 6 mounted directly in a div (no WebView), from the same editor core
 * the native WebView bundle is built from (editorCore.ts), so both behave the same.
 */
export const CodeEditor = forwardRef<CodeEditorHandle, CodeEditorProps>(function CodeEditor(props, ref) {
  const hostRef = useRef<View>(null);
  const ctl = useRef<EditorController | null>(null);
  const [ready, setReady] = useState(false);
  const cb = useRef(props);
  cb.current = props;

  useEffect(() => {
    const host = hostRef.current as unknown as HTMLElement | null;
    if (!host) return;
    const onEvent = (ev: EditorEvent) => {
      const p = cb.current;
      switch (ev.type) {
        case "change": p.onChange?.(ev.text); break;
        case "cursor": p.onCursor?.(ev.line, ev.col); break;
        case "focus": p.onFocusChange?.(ev.focused); break;
        case "toggleBreakpoint": p.onToggleBreakpoint?.(ev.line); break;
        case "tapLine": p.onTapLine?.(ev.line); break;
        case "error": console.warn("[CodeEditor]", ev.message); break;
      }
    };
    ctl.current = createSrsEditor(host, { text: cb.current.initialText, readOnly: cb.current.readOnly, onEvent });
    setReady(true);
    cb.current.onReady?.();
    return () => { ctl.current?.destroy(); ctl.current = null; setReady(false); };
  }, []);

  const send = useCallback((cmd: EditorCommand) => { ctl.current?.apply(cmd); }, []);
  useEditorSync(ref, send, props, ready);

  return <View ref={hostRef} style={[{ backgroundColor: "#ffffff", overflow: "hidden" }, props.style]} testID="srs-code-editor" />;
});
