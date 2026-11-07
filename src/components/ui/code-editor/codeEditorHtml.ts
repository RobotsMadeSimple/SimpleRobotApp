import { CODE_EDITOR_BUNDLE_JS } from "./codeEditorBundle.generated";

/**
 * The page the native WebView loads for the code editor: an empty full-size host div plus the
 * bundled CodeMirror editor (codeEditorBundle.generated.ts — built by
 * scripts/build-code-editor.mjs), all inline so nothing is fetched at run time; robots are often
 * on networks without internet. Same pattern as the vision canvas (src/vision/visionHtml.ts).
 *
 * The initial text rides in `__SRS_INIT__` so the first paint already shows the program; every
 * later change goes through `window.__srs.apply(cmd)` (bridge.ts).
 */
export function makeCodeEditorHtml(init: { text: string; readOnly: boolean }): string {
  // JSON in a <script>: break up "</" so a program containing "</script>" cannot end the tag.
  const initJson = JSON.stringify(init).replace(/<\//g, "<\\/");
  return `<!DOCTYPE html><html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<style>
*{box-sizing:border-box}
html,body{margin:0;padding:0;width:100%;height:100%;background:#fff;overflow:hidden;-webkit-text-size-adjust:100%}
#editor{position:absolute;inset:0}
</style>
</head>
<body>
<div id="editor"></div>
<script>window.__SRS_INIT__=${initJson};</script>
<script>${CODE_EDITOR_BUNDLE_JS}</script>
</body>
</html>`;
}
