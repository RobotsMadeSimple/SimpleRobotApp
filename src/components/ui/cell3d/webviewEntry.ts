// Entry of the 3D cell viewer bundle. scripts/build-cell3d.mjs bundles this (with three.js,
// GLTFLoader and OrbitControls) into cell3dBundle.generated.ts, inlined in every page that shows a
// cell — nothing is fetched at run time except the cell's own meshes from the controller.
//
// Two ways in:
//  - The standalone viewer page (cell3dHtml.ts, used by Cell3DView on native and web) sets
//    `__C3D_INIT__`: the viewer mounts on #cell3d; commands arrive as `window.__c3d.apply(cmd)`
//    (WebView injectJavaScript) or as postMessage JSON from the parent (web iframe); events go out
//    through ReactNativeWebView.postMessage or parent.postMessage.
//  - A display page carries the bundle and calls `window.Cell3D.mount(el, opts)` per widget.

import type { Cell3DCommand, Cell3DController, Cell3DEvent, Cell3DMountOptions } from "./bridge";
import { createCellViewer } from "./viewerCore";

declare global {
  interface Window {
    ReactNativeWebView?: { postMessage(msg: string): void };
    __c3d?: { apply(cmd: Cell3DCommand): void; applyAll(cmds: Cell3DCommand[]): void };
    __C3D_INIT__?: Cell3DMountOptions;
    Cell3D?: { mount(el: HTMLElement, opts?: Cell3DMountOptions): Cell3DController };
  }
}

window.Cell3D = { mount: (host, opts) => createCellViewer(host, opts) };

const init = window.__C3D_INIT__;
const host = document.getElementById("cell3d");
if (init && host) {
  const post = (e: Cell3DEvent) => {
    const s = JSON.stringify({ __c3d: 1, ...e });
    if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(s);
    else if (window.parent && window.parent !== window) window.parent.postMessage(s, "*");
  };
  window.addEventListener("error", ev => post({ type: "error", message: String(ev.message || ev) }));
  const ctl = createCellViewer(host, { ...init, onEvent: post });
  window.__c3d = {
    apply: cmd => ctl.apply(cmd),
    applyAll: cmds => cmds.forEach(c => ctl.apply(c)),
  };
  // Web: the parent posts { __c3d: 1, cmds: [...] }.
  window.addEventListener("message", e => {
    let m: any;
    try { m = typeof e.data === "string" ? JSON.parse(e.data) : e.data; } catch { return; }
    if (m && m.__c3d === 1 && Array.isArray(m.cmds)) window.__c3d!.applyAll(m.cmds);
  });
  window.addEventListener("pagehide", () => ctl.destroy());
  post({ type: "ready" });
}
