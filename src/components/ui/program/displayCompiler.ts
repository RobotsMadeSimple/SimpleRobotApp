import type { DisplayPageLayout, DisplayWidget } from "@/src/models/robotModels";
import { LIVE_FEED_JS } from "@/src/vision/liveFeedSocket";

/**
 * Compiles a visual display-page {@link DisplayPageLayout} into body HTML that the existing
 * display-page bridge runs (see displayBridge.ts → `window.robot`). Each widget is positioned
 * absolutely by grid cell (percent columns, pixel rows) — the same maths the editor's drag layer
 * uses, so the live preview lines up exactly with the handles. Value/gauge/lamp/graph widgets bind
 * to an expression evaluated live (`robot.onExpr`); a plugin widget compiles to an <iframe> at the
 * controller-served plugin UI (resolved via {@link CompileCtx.pluginUiUrl}), like PluginUiView.
 *
 * Look: every page is themed from one token set (dark or light, per the layout's `theme`) and
 * follows SimpleRobotApp/docs/display-design.md — calm surfaces, colour only for meaning, one primary action.
 * A narrow page reflows in reading order: 4 columns under 760 px wide (small tablets, a foldable
 * held upright), 2 under 640 px (phones). Wider pages — desktop, tablet or foldable landscape —
 * keep the grid.
 */

export type CompileCtx = {
  pluginUiUrl: (pluginId: string, entry: string) => string | null;
  /** The controller's live frame-socket URL for a camera (/camera/{id}/ws), for the camera widget. */
  cameraWsUrl?: (cameraId: string) => string | null;
  /**
   * Reflow to 1–2 columns on narrow screens (default true). The editor turns it off so the
   * preview behind its drag handles keeps the exact grid positions.
   */
  reflow?: boolean;
};

export type DisplayTheme = "dark" | "light" | "auto";

const GAP = 16;
/** Nominal desktop page width used to give tall widgets their shape when they reflow on a phone. */
const NOMINAL_WIDTH = 1200;

// Grams per display unit for load-cell graphs — mirrors src/components/ui/loadcell.ts, which
// isn't imported here so the compiled page stays a plain string with no runtime deps.
const GRAMS_PER_UNIT: Record<string, number> = { g: 1, kg: 1000, oz: 28.349523125, lb: 453.59237, N: 1000 / 9.80665 };

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

/** The plugin page URL with its settings as the query string (empty values left out). */
function withQuery(url: string, params: Record<string, unknown>): string {
  const q = Object.entries(params)
    .filter(([k, v]) => k && v != null && v !== "")
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join("&");
  return q ? `${url}${url.includes("?") ? "&" : "?"}${q}` : url;
}

/** Widgets whose shape (not just height) matters: when they reflow they keep an aspect ratio. */
const SHAPED = new Set(["gauge", "graph", "image", "camera", "plugin", "cell3d"]);

/**
 * How many reflow columns a widget spans: on a phone (2 columns) and a tablet (4 columns).
 * Hero content (plugin, image, graph) and headings take the row; status takes half; values,
 * lamps, buttons and gauges sit side by side.
 */
function reflowSpans(w: DisplayWidget): { phone: number; tablet: number } {
  switch (w.type) {
    case "plugin":
    case "image":
    case "camera":
    case "graph":
    case "cell3d":
    case "text":
      return { phone: 2, tablet: 4 };
    case "status":
      return { phone: 2, tablet: 2 };
    case "gauge":
      return { phone: 1, tablet: 2 };
    default:
      return { phone: 1, tablet: 1 };
  }
}

function widgetBody(w: DisplayWidget, ctx: CompileCtx): string {
  const id = sid(w.id);
  const c = w.config || {};

  switch (w.type) {
    case "value": {
      const label = esc(c.label || c.variable || "");
      const unit = c.unit ? `<span class="dp-unit">${esc(c.unit)}</span>` : "";
      return `<div class="dp-card dp-stat">
  <div class="dp-lbl">${label}</div>
  <div class="dp-big"><span id="${id}">—</span>${unit}</div>
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
    <svg viewBox="0 0 100 62" style="width:100%;max-width:240px;max-height:100%;">
      <path d="M10 56 A40 40 0 0 1 90 56" fill="none" stroke="var(--track)" stroke-width="7" stroke-linecap="round"/>
      <path id="${id}_arc" d="M10 56 A40 40 0 0 1 90 56" fill="none" stroke="var(--accent)" stroke-width="7" stroke-linecap="round" stroke-dasharray="126" stroke-dashoffset="126" style="transition:stroke-dashoffset .3s ease"/>
      <text id="${id}_t" x="50" y="50" text-anchor="middle" class="dp-num" style="font-size:15px;font-weight:650;fill:var(--text);">—</text>
      <text x="10" y="62" text-anchor="middle" style="font-size:6px;fill:var(--muted);">${esc(String(min))}</text>
      <text x="90" y="62" text-anchor="middle" style="font-size:6px;fill:var(--muted);">${esc(String(max))}</text>
    </svg>
  </div>
</div>
<script>(function(){var mn=${min},mx=${max};robot.onExpr(${js(c.variable)},function(v){if(v===null||v===undefined)return;var f=Math.max(0,Math.min(1,(v-mn)/((mx-mn)||1)));var a=document.getElementById('${id}_arc');if(a)a.setAttribute('stroke-dashoffset',String(126*(1-f)));var t=document.getElementById('${id}_t');if(t)t.textContent=window.__fmt(v)+${js(unit)};});})();</script>`;
    }

    case "boolean": {
      // A status pill: neutral when false, the "ok" colour when true — colour means something.
      const label = esc(c.label || c.variable || "");
      // Laid out like a value tile (label top-left, state under it) so it lines up beside them.
      return `<div class="dp-card dp-stat">
  <div class="dp-lbl">${label}</div>
  <div style="display:flex;align-items:center;gap:10px;margin-top:6px;"><div id="${id}_l" class="dp-dot"></div><div id="${id}_t" class="dp-mid">—</div></div>
</div>
<script>robot.onExpr(${js(c.variable)},function(v){if(v===null||v===undefined)return;var on=(Number(v)!==0);var l=document.getElementById('${id}_l');if(l)l.className='dp-dot'+(on?' on':'');var t=document.getElementById('${id}_t');if(t)t.textContent=on?'On':'Off';});</script>`;
    }

    case "status": {
      // The program's run state: a coloured dot + word, and the current step (or the error) below.
      return `<div class="dp-btnwrap"><div id="${id}_p" class="dp-card dp-pill">
  <div id="${id}_d" class="dp-dot"></div>
  <div style="min-width:0;flex:1 1 auto;"><div id="${id}_s" class="dp-mid">—</div><div id="${id}_x" class="dp-sub"></div></div>
</div></div>
<script>robot.onState(function(s){var st=String(s.status||'Ready'),k=st.toLowerCase(),cls=/error|fault|abort/.test(k)?'err':/pause|wait|hold/.test(k)?'warn':/run|busy|start/.test(k)?'run':'';
  var d=document.getElementById('${id}_d');if(d)d.className='dp-dot '+cls;var p=document.getElementById('${id}_p');if(p)p.className='dp-card dp-pill '+cls;var t=document.getElementById('${id}_s');if(t)t.textContent=st;
  var x=document.getElementById('${id}_x');if(x){x.textContent=(cls==='err'&&s.error)||(cls==='warn'&&s.warning)||(cls==='run'&&s.currentStep?(s.maxSteps?('Step '+s.stepNumber+' of '+s.maxSteps+' · '):'')+s.currentStep:'')||'';x.className='dp-sub'+(cls==='err'?' err':'');}});</script>`;
    }

    case "graph": {
      const isLoadCell = c.source !== "variable";
      // Load-cell samples arrive in grams (the master unit); scale into the chosen display unit.
      const unit = isLoadCell ? String(c.unit || "g") : "";
      const perUnit = GRAMS_PER_UNIT[unit] ?? 1;
      const decimals = unit === "kg" || unit === "lb" ? 3 : unit === "oz" || unit === "N" ? 2 : unit === "g" ? 1 : 2;
      const label = esc(c.label || (isLoadCell ? `Load cell (${unit})` : c.variable || ""));
      // Optional fixed axis bounds (in the display unit); blank/non-numeric = auto-scale to the data.
      const fixedMin = c.min === "" || c.min == null ? null : num(c.min, NaN);
      const fixedMax = c.max === "" || c.max == null ? null : num(c.max, NaN);
      const bounds = `var fmn=${Number.isFinite(fixedMin as number) ? fixedMin : "null"},fmx=${Number.isFinite(fixedMax as number) ? fixedMax : "null"};`;
      // The old default colour follows the theme's accent; a colour the user picked is kept.
      const color = !c.color || c.color === "#2563eb" ? "" : c.color;
      const subscribe = !isLoadCell
        ? `robot.onExpr(${js(c.variable)},function(v){if(typeof v==='number'){pts.push(v);if(pts.length>240)pts=pts.slice(pts.length-240);}});`
        : `robot.onHistory(${js(c.deviceId)},${num(c.pin, 0)},function(s){s.forEach(function(x){pts.push(x.v/${perUnit});});if(pts.length>240)pts=pts.slice(pts.length-240);});`;
      return `<div class="dp-card" style="justify-content:flex-start;">
  <div style="display:flex;align-items:baseline;justify-content:space-between;gap:8px;"><div class="dp-lbl">${label}</div><div id="${id}_v" class="dp-mid dp-num">—</div></div>
  <canvas id="${id}_c" style="flex:1 1 auto;width:100%;min-height:0;margin-top:6px;"></canvas>
</div>
<script>(function(){var cv=document.getElementById('${id}_c'),lv=document.getElementById('${id}_v'),pts=[],unit=${js(unit)},dec=${decimals};${bounds}
  function css(n){return getComputedStyle(document.documentElement).getPropertyValue(n).trim();}
  function fmt(v){return v.toFixed(dec)+(unit?' '+unit:'');}
  function draw(){var r=cv.getBoundingClientRect(),dpr=window.devicePixelRatio||1;cv.width=r.width*dpr;cv.height=r.height*dpr;var ctx=cv.getContext('2d');ctx.scale(dpr,dpr);var w=r.width,h=r.height;ctx.clearRect(0,0,w,h);
    if(pts.length<2){return;}var color=${js(color)}||css('--accent'),mn=fmn!==null?fmn:Math.min.apply(null,pts),mx=fmx!==null?fmx:Math.max.apply(null,pts),rg=(mx-mn)||1,top=4,bot=16;
    ctx.strokeStyle=css('--track');ctx.lineWidth=1;[0,.5,1].forEach(function(f){var y=top+(h-top-bot)*f;ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(w,y);ctx.stroke();});
    var path=new Path2D();pts.forEach(function(v,i){var x=i/(pts.length-1)*w,y=h-bot-(v-mn)/rg*(h-top-bot);i?path.lineTo(x,y):path.moveTo(x,y);});
    var fill=new Path2D(path);fill.lineTo(w,h-bot);fill.lineTo(0,h-bot);fill.closePath();var g=ctx.createLinearGradient(0,top,0,h-bot);g.addColorStop(0,color+'40');g.addColorStop(1,color+'00');ctx.fillStyle=g;ctx.fill(fill);
    ctx.strokeStyle=color;ctx.lineWidth=2;ctx.lineJoin='round';ctx.stroke(path);
    ctx.font='500 10px '+css('--font');ctx.fillStyle=css('--muted');ctx.textBaseline='bottom';ctx.textAlign='left';ctx.fillText(fmt(mn),0,h);ctx.textAlign='right';ctx.fillText(fmt(mx),w,h);
    if(lv)lv.textContent=fmt(pts[pts.length-1]);}
  ${subscribe}
  setInterval(draw,200);})();</script>`;
    }

    case "image": {
      // The frame fills the card; the label floats over it so no space goes to a header row.
      const label = esc(c.label || "");
      const fit = c.fit === "contain" ? "contain" : "cover";
      return `<div class="dp-card dp-media">
  <img id="${id}_i" alt="" style="object-fit:${fit};"/>
  ${label ? `<div class="dp-chip">${label}</div>` : ""}
  <div id="${id}_e" class="dp-empty">Waiting for an image…</div>
</div>
<script>setInterval(function(){robot.getImage(${js(c.variable)}).then(function(u){if(u){var e=document.getElementById('${id}_i');if(e){e.src=u;e.style.visibility='visible';}var m=document.getElementById('${id}_e');if(m)m.style.display='none';}});},500);</script>`;
    }

    case "camera": {
      // A live camera feed: the controller's /camera/{id}/ws MJPEG stream drawn on a canvas, the same
      // self-healing socket the I/O page uses (liveFeedSocket). Smooth, unlike the polled image widget.
      const label = esc(c.label || "");
      const fit = c.fit === "contain" ? "contain" : "cover";
      const ws = c.cameraId && ctx.cameraWsUrl ? ctx.cameraWsUrl(String(c.cameraId)) : null;
      if (!ws) {
        return `<div class="dp-card" style="align-items:center;justify-content:center;text-align:center;color:var(--muted);">
  <div>Camera unavailable.<br/>Connect and pick a camera.</div>
</div>`;
      }
      return `<div class="dp-card dp-media">
  <canvas id="${id}_c" style="width:100%;height:100%;object-fit:${fit};display:block;background:#000;"></canvas>
  ${label ? `<div class="dp-chip">${label}</div>` : ""}
  <div id="${id}_e" class="dp-empty">Connecting…</div>
</div>
<script>(function(){
  var cv=document.getElementById('${id}_c'),cx=cv.getContext('2d'),em=document.getElementById('${id}_e');
  ${LIVE_FEED_JS}
  function draw(src,done){var im=new Image();im.onload=function(){if(cv.width!==im.naturalWidth||cv.height!==im.naturalHeight){cv.width=im.naturalWidth;cv.height=im.naturalHeight;}cx.drawImage(im,0,0,cv.width,cv.height);if(em)em.style.display='none';done();};im.onerror=done;im.src=src;}
  liveFeed(${js(ws)},{frame:draw,note:function(t){if(em){em.textContent=t||'';em.style.display=t?'flex':'none';}},log:function(){}});
})();</script>`;
    }

    case "button": {
      // One primary action (Run, filled accent); Stop is a calm tonal button, not a red slab.
      const stop = c.action === "stop";
      const label = esc(c.label || (stop ? "Stop" : "Run"));
      const action = stop ? "robot.stop()" : `robot.run(${JSON.stringify(parseInputs(c.inputs || ""))})`;
      const icon = stop
        ? `<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><rect x="3" y="3" width="10" height="10" rx="2" fill="currentColor"/></svg>`
        : `<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M4.5 2.8v10.4a.6.6 0 0 0 .9.5l8.2-5.2a.6.6 0 0 0 0-1L5.4 2.3a.6.6 0 0 0-.9.5z" fill="currentColor"/></svg>`;
      return `<div class="dp-btnwrap"><button id="${id}" class="dp-btn ${stop ? "dp-btn-stop" : "dp-btn-run"}">${icon}<span>${label}</span></button></div>
<script>(function(){var b=document.getElementById('${id}');b.addEventListener('click',function(){${action};});${stop ? `robot.onState(function(s){b.classList.toggle('dp-idle',!/run|busy|start|pause|wait|hold/i.test(String(s.status||'')));});` : ""}})();</script>`;
    }

    case "text": {
      const cls = c.size === "small" ? "dp-t-sm" : c.size === "medium" ? "dp-t-md" : "dp-t-lg";
      return `<div class="dp-text ${cls}"><div>${esc(c.text || "")}</div></div>`;
    }

    case "plugin": {
      const base = c.pluginId && c.entry ? ctx.pluginUiUrl(c.pluginId, c.entry) : null;
      const url = base ? withQuery(base, { ...parseInputs(c.paramsText || ""), ...(c.params || {}) }) : null;
      if (!url) {
        return `<div class="dp-card" style="align-items:center;justify-content:center;text-align:center;color:var(--muted);">
  <div>Plugin UI unavailable${c.pluginName ? ` (${esc(c.pluginName)})` : ""}.<br/>Connect and pick a plugin that ships a UI.</div>
</div>`;
      }
      // The page's theme is added at load (`theme=dark|light`) so a plugin GUI can match it.
      return `<div class="dp-card dp-media"><iframe data-src="${esc(url)}" title="${esc(c.pluginName || c.pluginId)}"></iframe></div>`;
    }

    case "cell3d": {
      // The live 3D view: the viewer bundle (inlined by wrapDisplayHtml for any page carrying
      // data-cell3d) mounts in the card and is fed by the host over robot.onCell3d.
      const views = ["iso", "front", "side", "top", "follow"];
      const opts = {
        trail: c.trail !== "off",
        points: c.points === "on",
        locals: false,
        controls: c.controls === "full" || c.controls === "none" ? c.controls : "views",
      };
      const mount = { options: opts, view: views.includes(c.view) ? c.view : "iso", title: c.label || undefined };
      return `<div class="dp-card dp-media"><div id="${id}" class="dp-c3d" data-cell3d></div></div>
<script>(function(){var h=document.getElementById('${id}');if(!window.Cell3D||!window.robot||!robot.onCell3d){h.innerHTML='<div class="dp-empty">3D view unavailable</div>';return;}var o=${js(mount)};o.theme=window.__theme==='dark'?'dark':'light';var v=Cell3D.mount(h,o);robot.onCell3d(function(cmds){for(var i=0;i<cmds.length;i++)v.apply(cmds[i]);});})();</script>`;
    }

    default:
      return "";
  }
}

/**
 * Theme tokens (docs/display-design.md) + the shared widget styles and helpers every compiled
 * page carries once. The theme is set on <html data-theme> by the script below.
 */
function prelude(theme: DisplayTheme, reflow: boolean): string {
  return `<style>
  :root{--font:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;
    --bg:#F3F4F6;--surface:#FFFFFF;--raised:#F7F8FA;--inset:#E9ECF0;--border:#E2E5E9;--track:#E6E9ED;
    --text:#14171C;--text2:#4B5361;--muted:#868E9A;--accent:#2563EB;--accent-soft:#2563EB24;--on-accent:#FFFFFF;
    --ok:#1A7F37;--warn:#B7791F;--err:#CF222E;--err-soft:#CF222E24;--shadow:0 1px 2px #14171C0D,0 1px 3px #14171C0F;--r:14px;}
  html[data-theme=dark]{--bg:#0E1013;--surface:#16191E;--raised:#1D2127;--inset:#0B0D10;--border:#262B33;--track:#262B33;
    --text:#E7E9EC;--text2:#A2A9B4;--muted:#6B7380;--accent:#4C8DFF;--accent-soft:#4C8DFF24;--on-accent:#FFFFFF;
    --ok:#3FB950;--warn:#E3A008;--err:#F0524D;--err-soft:#F0524D24;--shadow:none;}
  html,body{background:var(--bg);color:var(--text);font-family:var(--font);-webkit-font-smoothing:antialiased;}
  .dp-grid{position:relative;width:100%;box-sizing:border-box;}
  .dp-cell{position:absolute;padding:${GAP / 2}px;box-sizing:border-box;}
  .dp-card{height:100%;box-sizing:border-box;padding:16px;border:1px solid var(--border);border-radius:var(--r);background:var(--surface);box-shadow:var(--shadow);display:flex;flex-direction:column;justify-content:center;overflow:hidden;position:relative;}
  .dp-lbl{font-size:12px;font-weight:500;letter-spacing:.06em;text-transform:uppercase;color:var(--text2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
  .dp-num,.dp-big{font-variant-numeric:tabular-nums;}
  .dp-big{font-size:32px;line-height:1.1;font-weight:600;letter-spacing:-.01em;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:4px;}
  .dp-unit{font-size:13px;font-weight:500;color:var(--muted);margin-left:4px;}
  .dp-mid{font-size:16px;font-weight:600;color:var(--text);}
  .dp-sub{font-size:12px;color:var(--text2);margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
  .dp-sub.err{color:var(--err);}
  .dp-dot{width:10px;height:10px;border-radius:50%;flex:0 0 auto;background:var(--muted);box-shadow:0 0 0 4px var(--track);}
  .dp-dot.on,.dp-dot.run{background:var(--ok);box-shadow:0 0 0 4px color-mix(in srgb,var(--ok) 22%,transparent);}
  .dp-dot.warn{background:var(--warn);box-shadow:0 0 0 4px color-mix(in srgb,var(--warn) 22%,transparent);}
  .dp-dot.err{background:var(--err);box-shadow:0 0 0 4px color-mix(in srgb,var(--err) 22%,transparent);}
  .dp-media{padding:0;background:var(--inset);}
  .dp-media img{position:absolute;inset:0;width:100%;height:100%;visibility:hidden;}
  .dp-media iframe{position:absolute;inset:0;width:100%;height:100%;border:0;background:transparent;}
  .dp-c3d{position:absolute;inset:0;}
  .dp-chip{position:absolute;left:12px;top:12px;padding:4px 9px;border-radius:999px;background:#0b0e13b3;color:#e8ecf2;font-size:11px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);}
  .dp-empty{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:var(--muted);font-size:13px;}
  .dp-btn{height:100%;max-height:48px;width:100%;display:flex;align-items:center;justify-content:center;gap:8px;border-radius:12px;font:600 15px var(--font);cursor:pointer;transition:filter .15s,transform .05s;}
  .dp-btnwrap{height:100%;display:flex;align-items:center;}
  .dp-btn:active{transform:scale(.98);}
  .dp-btn-run{background:var(--accent);color:var(--on-accent);border:1px solid var(--accent);}
  .dp-btn-run:hover{filter:brightness(1.08);}
  .dp-btn-stop{background:var(--err-soft);color:var(--err);border:1px solid color-mix(in srgb,var(--err) 35%,transparent);}
  .dp-btn-stop:hover{filter:brightness(1.1);}
  .dp-btn-stop.dp-idle{opacity:.45;pointer-events:none;}
  .dp-pill{max-height:48px;flex-direction:row;align-items:center;gap:12px;padding:8px 14px;border-radius:12px;}
  .dp-pill .dp-mid{font-size:14px;line-height:18px;}
  .dp-pill .dp-sub{margin-top:0;}
  .dp-pill.err{background:var(--err-soft);border-color:transparent;}
  .dp-pill.warn{background:color-mix(in srgb,var(--warn) 14%,transparent);border-color:transparent;}
  /* Value tiles read top-down: label at the top, the value right under it. */
  .dp-stat{justify-content:flex-start;}
  .dp-text{height:100%;display:flex;align-items:center;color:var(--text);padding:0 4px;}
  .dp-text>div{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
  .dp-t-lg{font-size:20px;line-height:28px;font-weight:600;}
  .dp-t-md{font-size:15px;line-height:20px;font-weight:600;}
  .dp-t-sm{font-size:13px;font-weight:500;color:var(--text2);}
${reflow ? `  @media (max-width:759px){
    .dp-grid.dp-reflow{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));height:auto!important;}
    .dp-reflow .dp-cell.dp-stat-cell{height:min(var(--mh),112px)!important;}
    .dp-reflow .dp-cell{position:relative;left:auto!important;top:auto!important;width:auto!important;min-width:0;height:var(--mh)!important;grid-column:span var(--ts);}
    .dp-reflow .dp-cell.dp-shaped{height:auto!important;aspect-ratio:var(--ar);}
  }
  @media (max-width:640px){
    .dp-grid.dp-reflow{grid-template-columns:repeat(2,minmax(0,1fr));}
    .dp-reflow .dp-cell{grid-column:span var(--ms);padding:6px;}
    .dp-reflow .dp-cell.dp-shaped.dp-half{aspect-ratio:auto;height:var(--mh)!important;}
    .dp-card:not(.dp-pill):not(.dp-media){padding:12px;}
    .dp-big{font-size:26px;}
  }
` : ""}</style>
<script>(function(){var want=${js(theme)};var t=want==='auto'?(window.matchMedia&&matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'):want;document.documentElement.setAttribute('data-theme',t);
  window.__theme=t;document.addEventListener('DOMContentLoaded',function(){document.querySelectorAll('iframe[data-src]').forEach(function(f){var u=f.getAttribute('data-src');f.src=u+(u.indexOf('?')<0?'?':'&')+'theme='+t;});});})();
window.__fmt=function(v){if(typeof v!=='number'||!isFinite(v))return (v==null?'—':String(v));return Number.isInteger(v)?String(v):v.toFixed(3).replace(/\\.?0+$/,'');};</script>`;
}

/** Compile a widget layout into body HTML for {@link import("./DisplayPageView")}. */
export function compileLayout(layout: DisplayPageLayout | undefined, ctx: CompileCtx): string {
  const cols = Math.max(1, Math.round(layout?.cols ?? 12));
  const rowH = Math.max(8, Math.round(layout?.rowHeight ?? 44));
  const theme: DisplayTheme = layout?.theme === "dark" || layout?.theme === "auto" ? layout.theme : "light";
  const reflow = ctx.reflow !== false;
  // Reading order (top-to-bottom, then left-to-right) so the phone reflow stacks sensibly.
  const widgets = [...(layout?.widgets ?? [])].sort((a, b) => a.y - b.y || a.x - b.x);
  const totalRows = widgets.reduce((m, w) => Math.max(m, Math.round(w.y) + Math.round(w.h)), 0);

  const cells = widgets
    .map((w) => {
      const x = Math.max(0, Math.round(w.x));
      const y = Math.max(0, Math.round(w.y));
      const cw = Math.max(1, Math.round(w.w));
      const ch = Math.max(1, Math.round(w.h));
      const spans = reflowSpans(w);
      // A reflowed hero is full width: keep its desktop shape, but never wider than square for a
      // plugin page (those usually stack controls under their content).
      let aspect = ((cw / cols) * NOMINAL_WIDTH) / (ch * rowH);
      if (w.type === "plugin") aspect = Math.min(aspect, 0.85);
      // A 3D view needs height to read on a phone: no flatter than 4:3.
      if (w.type === "cell3d") aspect = Math.min(aspect, 1.33);
      // Percent columns + pixel rows, with a half-gap inset — matches the editor's cell maths.
      // --mh/--ms/--ar drive the phone reflow (height, column span, shape).
      const style = `left:${(x / cols) * 100}%;top:${y * rowH}px;width:${(cw / cols) * 100}%;height:${ch * rowH}px;--mh:${Math.min(ch * rowH, w.type === "text" ? 48 : 420)}px;--ms:${spans.phone};--ts:${spans.tablet};--ar:${aspect.toFixed(3)};`;
      const cls = `dp-cell${SHAPED.has(w.type) ? " dp-shaped" : ""}${spans.phone === 1 ? " dp-half" : ""}${w.type === "value" || w.type === "boolean" ? " dp-stat-cell" : ""}`;
      return `<div class="${cls}" style="${style}">${widgetBody(w, ctx)}</div>`;
    })
    .join("\n");

  return `${prelude(theme, reflow)}
<div class="dp-grid${reflow ? " dp-reflow" : ""}" style="height:${totalRows * rowH}px;margin:${GAP / 2}px;width:calc(100% - ${GAP}px);">
${cells}
</div>`;
}
