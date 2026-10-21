import type { DisplayPageLayout, DisplayWidget } from "@/src/models/robotModels";

/**
 * Compiles a visual display-page {@link DisplayPageLayout} into body HTML that the existing
 * display-page bridge runs (see displayBridge.ts → `window.robot`). Each widget is positioned
 * absolutely by grid cell (percent columns, pixel rows) — the same maths the editor's drag layer
 * uses, so the live preview lines up exactly with the handles. Value/gauge/lamp/graph widgets bind
 * to an expression evaluated live (`robot.onExpr`); a plugin widget compiles to an <iframe> at the
 * controller-served plugin UI (resolved via {@link CompileCtx.pluginUiUrl}), like PluginUiView.
 */

export type CompileCtx = {
  pluginUiUrl: (pluginId: string, entry: string) => string | null;
};

const GAP = 8;

const esc = (s: string): string =>
  String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const js = (v: unknown): string => JSON.stringify(v ?? "");

const sid = (id: string): string => "W" + String(id).replace(/[^a-zA-Z0-9_]/g, "_");

const num = (v: unknown, d: number): number => {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : d;
};

/** Parse a "name=value, name=value" seed-inputs string into a typed object literal. */
function parseInputs(raw: string): Record<string, number | boolean | string> {
  const out: Record<string, number | boolean | string> = {};
  for (const pair of String(raw ?? "").split(",")) {
    const i = pair.indexOf("=");
    if (i < 0) continue;
    const name = pair.slice(0, i).trim();
    const val = pair.slice(i + 1).trim();
    if (!name) continue;
    if (/^-?\d+(\.\d+)?$/.test(val)) out[name] = Number(val);
    else if (val === "true" || val === "false") out[name] = val === "true";
    else out[name] = val;
  }
  return out;
}

function widgetBody(w: DisplayWidget, ctx: CompileCtx): string {
  const id = sid(w.id);
  const c = w.config || {};

  switch (w.type) {
    case "value": {
      const label = esc(c.label || c.variable || "");
      return `<div class="dp-card">
  <div class="dp-lbl">${label}</div>
  <div id="${id}" class="dp-big">—</div>
</div>
<script>robot.onExpr(${js(c.variable)},function(v,b){var e=document.getElementById('${id}');if(e)e.textContent=(v===null||v===undefined)?'—':(b?(v?'True':'False'):window.__fmt(v));});</script>`;
    }

    case "gauge": {
      const label = esc(c.label || c.variable || "");
      const min = num(c.min, 0);
      const max = num(c.max, 100);
      const unit = c.unit ? " " + c.unit : "";
      return `<div class="dp-card" style="justify-content:flex-start;">
  <div class="dp-lbl">${label}</div>
  <div style="flex:1 1 auto;min-height:0;display:flex;align-items:center;justify-content:center;">
    <svg viewBox="0 0 100 62" style="width:100%;max-width:220px;max-height:100%;">
      <path d="M10 56 A40 40 0 0 1 90 56" fill="none" stroke="#e5e7eb" stroke-width="8" stroke-linecap="round"/>
      <path id="${id}_arc" d="M10 56 A40 40 0 0 1 90 56" fill="none" stroke="#2563eb" stroke-width="8" stroke-linecap="round" stroke-dasharray="126" stroke-dashoffset="126"/>
      <text id="${id}_t" x="50" y="50" text-anchor="middle" style="font:700 15px system-ui;fill:#111827;">—</text>
    </svg>
  </div>
</div>
<script>(function(){var mn=${min},mx=${max};robot.onExpr(${js(c.variable)},function(v){if(v===null||v===undefined)return;var f=Math.max(0,Math.min(1,(v-mn)/((mx-mn)||1)));var a=document.getElementById('${id}_arc');if(a)a.setAttribute('stroke-dashoffset',String(126*(1-f)));var t=document.getElementById('${id}_t');if(t)t.textContent=window.__fmt(v)+${js(unit)};});})();</script>`;
    }

    case "boolean": {
      const label = esc(c.label || c.variable || "");
      return `<div class="dp-card" style="flex-direction:row;align-items:center;">
  <div id="${id}_l" style="width:18px;height:18px;border-radius:50%;background:#9ca3af;margin-right:10px;flex:0 0 auto;"></div>
  <div style="min-width:0;"><div class="dp-lbl">${label}</div><div id="${id}_t" class="dp-mid">—</div></div>
</div>
<script>robot.onExpr(${js(c.variable)},function(v){if(v===null||v===undefined)return;var on=(Number(v)!==0);var l=document.getElementById('${id}_l');if(l)l.style.background=on?'#16a34a':'#dc2626';var t=document.getElementById('${id}_t');if(t)t.textContent=on?'True':'False';});</script>`;
    }

    case "graph": {
      const label = esc(c.label || (c.source === "variable" ? c.variable || "" : "Load cell"));
      const subscribe = c.source === "variable"
        ? `robot.onExpr(${js(c.variable)},function(v){if(typeof v==='number'){pts.push(v);if(pts.length>240)pts=pts.slice(pts.length-240);}});`
        : `robot.onHistory(${js(c.nanoId)},${num(c.pin, 0)},function(s){s.forEach(function(x){pts.push(x.v);});if(pts.length>240)pts=pts.slice(pts.length-240);});`;
      return `<div class="dp-card">
  <div class="dp-lbl">${label}</div>
  <canvas id="${id}_c" style="flex:1 1 auto;width:100%;min-height:0;"></canvas>
</div>
<script>(function(){var cv=document.getElementById('${id}_c'),pts=[],color=${js(c.color || "#2563eb")};
  function draw(){var r=cv.getBoundingClientRect();cv.width=r.width;cv.height=r.height;var ctx=cv.getContext('2d'),w=cv.width,h=cv.height;ctx.clearRect(0,0,w,h);if(pts.length<2)return;var mn=Math.min.apply(null,pts),mx=Math.max.apply(null,pts),rg=(mx-mn)||1;ctx.beginPath();ctx.strokeStyle=color;ctx.lineWidth=2;pts.forEach(function(v,i){var x=i/(pts.length-1)*w,y=h-(v-mn)/rg*(h-8)-4;i?ctx.lineTo(x,y):ctx.moveTo(x,y);});ctx.stroke();}
  ${subscribe}
  setInterval(draw,200);})();</script>`;
    }

    case "image": {
      const label = esc(c.label || `$${c.variable || ""}`);
      return `<div class="dp-card">
  <div class="dp-lbl">${label}</div>
  <img id="${id}_i" alt="" style="flex:1 1 auto;min-height:0;width:100%;object-fit:contain;border-radius:8px;background:#f3f4f6;"/>
</div>
<script>setInterval(function(){robot.getImage(${js(c.variable)}).then(function(u){if(u){var e=document.getElementById('${id}_i');if(e)e.src=u;}});},500);</script>`;
    }

    case "button": {
      const stop = c.action === "stop";
      const label = esc(c.label || (stop ? "Stop" : "Run"));
      const action = stop ? "robot.stop()" : `robot.run(${JSON.stringify(parseInputs(c.inputs || ""))})`;
      const bg = stop ? "#dc2626" : "#16a34a";
      return `<button id="${id}" style="height:100%;width:100%;border:0;border-radius:12px;background:${bg};color:#fff;font:700 16px system-ui;cursor:pointer;">${label}</button>
<script>document.getElementById('${id}').addEventListener('click',function(){${action};});</script>`;
    }

    case "text": {
      const size = c.size === "small" ? "600 14px" : c.size === "medium" ? "700 19px" : "800 26px";
      return `<div style="height:100%;display:flex;align-items:center;font-family:system-ui;"><div style="font:${size} system-ui;color:#111827;">${esc(c.text || "")}</div></div>`;
    }

    case "plugin": {
      const url = c.pluginId && c.entry ? ctx.pluginUiUrl(c.pluginId, c.entry) : null;
      if (!url) {
        return `<div class="dp-card" style="align-items:center;justify-content:center;text-align:center;color:#9ca3af;">
  <div>Plugin UI unavailable${c.pluginName ? ` (${esc(c.pluginName)})` : ""}.<br/>Connect and pick a plugin that ships a UI.</div>
</div>`;
      }
      return `<iframe src="${esc(url)}" title="${esc(c.pluginName || c.pluginId)}" style="width:100%;height:100%;border:0;border-radius:12px;background:#fff;"></iframe>`;
    }

    default:
      return "";
  }
}

/** The shared head styles + helpers every compiled page carries once. */
const PRELUDE = `<style>
  .dp-card{height:100%;box-sizing:border-box;padding:12px;border:1px solid #e5e7eb;border-radius:12px;background:#fff;font-family:system-ui;display:flex;flex-direction:column;justify-content:center;overflow:hidden;}
  .dp-lbl{font:600 12px system-ui;color:#6b7280;margin-bottom:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
  .dp-big{font:700 26px system-ui;color:#111827;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
  .dp-mid{font:700 16px system-ui;color:#111827;}
</style>
<script>window.__fmt=function(v){if(typeof v!=='number'||!isFinite(v))return (v==null?'—':String(v));return Number.isInteger(v)?String(v):v.toFixed(3).replace(/\\.?0+$/,'');};</script>`;

/** Compile a widget layout into body HTML for {@link import("./DisplayPageView")}. */
export function compileLayout(layout: DisplayPageLayout | undefined, ctx: CompileCtx): string {
  const cols = Math.max(1, Math.round(layout?.cols ?? 12));
  const rowH = Math.max(8, Math.round(layout?.rowHeight ?? 44));
  const widgets = layout?.widgets ?? [];
  const totalRows = widgets.reduce((m, w) => Math.max(m, Math.round(w.y) + Math.round(w.h)), 0);

  const cells = widgets
    .map((w) => {
      const x = Math.max(0, Math.round(w.x));
      const y = Math.max(0, Math.round(w.y));
      const cw = Math.max(1, Math.round(w.w));
      const ch = Math.max(1, Math.round(w.h));
      // Percent columns + pixel rows, with a half-gap inset — matches the editor's cell maths.
      const style = `position:absolute;left:${(x / cols) * 100}%;top:${y * rowH}px;width:${(cw / cols) * 100}%;height:${ch * rowH}px;padding:${GAP / 2}px;box-sizing:border-box;`;
      return `<div style="${style}">${widgetBody(w, ctx)}</div>`;
    })
    .join("\n");

  return `${PRELUDE}
<div style="position:relative;width:100%;height:${totalRows * rowH + GAP}px;">
${cells}
</div>`;
}
