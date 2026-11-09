// Entry of the native WebView's editor bundle. scripts/build-code-editor.mjs bundles this (with
// CodeMirror) into codeEditorBundle.generated.ts; codeEditorHtml.ts inlines it, so the editor
// works offline on a robot's network — nothing is fetched at run time.
//
// Commands arrive as `window.__srs.apply(cmd)` (CodeEditor.tsx injectJavaScript); events go out
// through `ReactNativeWebView.postMessage(JSON)`.

import { createSrsEditor } from "./editorCore";
import type { EditorCommand, EditorEvent } from "./bridge";

declare global {
  interface Window {
    ReactNativeWebView?: { postMessage(msg: string): void };
    __srs?: { apply(cmd: EditorCommand): void; applyAll(cmds: EditorCommand[]): void };
    __SRS_INIT__?: { text?: string; readOnly?: boolean };
  }
}

const post = (e: EditorEvent) => window.ReactNativeWebView?.postMessage(JSON.stringify(e));

window.addEventListener("error", ev => post({ type: "error", message: String(ev.message || ev) }));

const host = document.getElementById("editor")!;
const ctl = createSrsEditor(host, { text: window.__SRS_INIT__?.text ?? "", readOnly: window.__SRS_INIT__?.readOnly, onEvent: post });
window.__srs = {
  apply: cmd => { try { ctl.apply(cmd); } catch (e) { post({ type: "error", message: String(e) }); } },
  applyAll: cmds => cmds.forEach(c => window.__srs!.apply(c)),
};
post({ type: "ready" });
