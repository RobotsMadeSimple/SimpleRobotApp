/**
 * Starter widgets for the display-page editor. Each is body-level HTML (plus a small inline
 * script) written against the `window.robot` bridge — see displayBridge.ts for the full API.
 * The editor inserts a snippet's `code` at the end of the page so authors are never staring at
 * a blank editor. Placeholders in CAPS (NANO_ID, PIN, myVar, myImage) are meant to be replaced.
 */

export type DisplaySnippet = {
  id: string;
  label: string;
  description: string;
  code: string;
};

/** A new display page starts from this: a status line plus Run/Stop controls. */
export const DEFAULT_DISPLAY_HTML = `<div style="padding:16px;font-family:system-ui;">
  <h2 style="margin:0 0 4px;">My Program</h2>
  <div id="status" style="font:600 15px system-ui;padding:10px 12px;border-radius:10px;background:#eef2ff;color:#3730a3;">Status: …</div>

  <div style="margin-top:16px;">
    <button onclick="robot.run()" style="font:600 15px system-ui;padding:10px 20px;border:0;border-radius:9px;background:#16a34a;color:#fff;">Run</button>
    <button onclick="robot.stop()" style="font:600 15px system-ui;margin-left:6px;padding:10px 20px;border:0;border-radius:9px;background:#dc2626;color:#fff;">Stop</button>
  </div>
</div>
<script>
  robot.onState(function (s) {
    document.getElementById('status').textContent =
      'Status: ' + s.status + (s.maxSteps ? '  (step ' + s.stepNumber + '/' + s.maxSteps + ')' : '');
  });
</script>`;

export const DISPLAY_SNIPPETS: DisplaySnippet[] = [
  {
    id: "state",
    label: "Status badge",
    description: "Live program status and step progress.",
    code: `
<div id="status" style="margin:12px;font:600 15px system-ui;padding:10px 12px;border-radius:10px;background:#eef2ff;color:#3730a3;">Status: …</div>
<script>
  robot.onState(function (s) {
    document.getElementById('status').textContent =
      'Status: ' + s.status + (s.maxSteps ? '  (step ' + s.stepNumber + '/' + s.maxSteps + ')' : '');
  });
</script>`,
  },
  {
    id: "value",
    label: "Value readout",
    description: "Shows one variable's live value. Rename myVar.",
    code: `
<div style="margin:12px;padding:16px;border:1px solid #e5e7eb;border-radius:12px;font-family:system-ui;">
  <div style="font:600 12px system-ui;color:#6b7280;">$myVar</div>
  <div id="val-myVar" style="font:700 28px system-ui;color:#111827;">—</div>
</div>
<script>
  robot.onVar('myVar', function (v) {
    document.getElementById('val-myVar').textContent =
      (typeof v === 'boolean') ? (v ? 'True' : 'False') : v;
  });
</script>`,
  },
  {
    id: "image",
    label: "Image panel",
    description: "Shows a display-image variable, refreshed twice a second. Rename myImage.",
    code: `
<img id="img-myImage" alt="myImage" style="display:block;width:100%;max-width:360px;margin:12px;border-radius:12px;border:1px solid #e5e7eb;background:#f3f4f6;" />
<script>
  setInterval(function () {
    robot.getImage('myImage').then(function (uri) {
      if (uri) document.getElementById('img-myImage').src = uri;
    });
  }, 500);
</script>`,
  },
  {
    id: "graph",
    label: "Load-cell graph",
    description: "Live line graph of a load cell. Set NANO_ID and PIN.",
    code: `
<canvas id="lc" width="360" height="140" style="display:block;margin:12px;border:1px solid #e5e7eb;border-radius:12px;background:#fff;"></canvas>
<script>
  (function () {
    var cv = document.getElementById('lc'), ctx = cv.getContext('2d'), pts = [];
    // Replace NANO_ID with your nano's id and PIN with the load cell's DT pin.
    robot.onHistory('NANO_ID', PIN, function (samples) {
      samples.forEach(function (s) { pts.push(s.v); });
      if (pts.length > 240) pts = pts.slice(pts.length - 240);
      var w = cv.width, h = cv.height; ctx.clearRect(0, 0, w, h);
      if (pts.length < 2) return;
      var min = Math.min.apply(null, pts), max = Math.max.apply(null, pts), rng = (max - min) || 1;
      ctx.beginPath(); ctx.strokeStyle = '#2563eb'; ctx.lineWidth = 2;
      pts.forEach(function (v, i) {
        var x = i / (pts.length - 1) * w, y = h - (v - min) / rng * (h - 8) - 4;
        i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      });
      ctx.stroke();
    });
  })();
</script>`,
  },
  {
    id: "input",
    label: "Input + Run",
    description: "A number field that seeds an input variable, with Run/Stop. Rename count.",
    code: `
<div style="margin:12px;padding:16px;border:1px solid #e5e7eb;border-radius:12px;font-family:system-ui;">
  <label style="font:600 13px system-ui;color:#374151;display:block;margin-bottom:6px;">Count</label>
  <input id="in-count" type="number" value="1" style="font:16px system-ui;padding:8px;width:120px;border:1px solid #d1d5db;border-radius:8px;" />
  <button onclick="robot.run({ count: Number(document.getElementById('in-count').value) })"
    style="font:600 15px system-ui;margin-left:8px;padding:9px 18px;border:0;border-radius:8px;background:#16a34a;color:#fff;">Run</button>
  <button onclick="robot.stop()"
    style="font:600 15px system-ui;margin-left:4px;padding:9px 18px;border:0;border-radius:8px;background:#dc2626;color:#fff;">Stop</button>
  <div style="font:12px system-ui;color:#9ca3af;margin-top:8px;">Mark "count" as an input variable on the program for the value to take effect.</div>
</div>`,
  },
];
