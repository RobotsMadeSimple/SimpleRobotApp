import type { Cell3DMountOptions } from "./bridge";
import { CELL3D_BUNDLE_JS } from "./cell3dBundle.generated";

export { CELL3D_BUNDLE_JS };

/**
 * The page Cell3DView loads (a WebView on native, an iframe on web): a full-size host div plus the
 * bundled viewer (cell3dBundle.generated.ts — built by scripts/build-cell3d.mjs), all inline so
 * nothing is fetched at run time; robots are often on networks without internet. Same pattern as
 * the code editor (code-editor/codeEditorHtml.ts).
 */
export function makeCell3DHtml(init: Omit<Cell3DMountOptions, "onEvent">): string {
  const initJson = JSON.stringify(init).replace(/<\//g, "<\\/");
  const bg = init.theme === "dark" ? "#121519" : "#EDEFF2";
  return `<!DOCTYPE html><html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<style>
*{box-sizing:border-box}
html,body{margin:0;padding:0;width:100%;height:100%;background:${bg};overflow:hidden;-webkit-text-size-adjust:100%;overscroll-behavior:none}
#cell3d{position:absolute;inset:0}
</style>
</head>
<body>
<div id="cell3d"></div>
<script>window.__C3D_INIT__=${initJson};</script>
<script>${CELL3D_BUNDLE_JS}</script>
</body>
</html>`;
}
