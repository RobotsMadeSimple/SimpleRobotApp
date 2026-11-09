// Dev tooling — live camera-perf collector for the phone provider.
//
// The PhoneProvider screen POSTs one JSON perf sample/second to http://<thisPC>:8099/perf when its
// "Log metrics" (or "Auto-sweep") diagnostic is on. This server receives them over Tailscale and
// prints a rolling per-resolution summary, so camera capture can be tuned by watching the numbers
// directly instead of reading them off the phone.
//
//   node scripts/perf-collector.mjs [snapshotPath]
//
// Sample shape: { fps, avgMs, p95, kb, mode, res, size, ts }
import http from "node:http";
import fs from "node:fs";

const PORT = 8099;
const SNAP = process.argv[2] || "perf-snapshot.json";

const samples = [];                 // recent raw samples (capped)
const byKey = new Map();            // `${res}/${mode}` -> rolling aggregate

function record(s) {
  // Drop warmup/transition samples (no frames captured yet) so they don't skew the averages.
  if (!s.fps && !s.avgMs) return;
  samples.push(s);
  if (samples.length > 1000) samples.shift();
  const key = `${s.res}/${s.mode}`;
  const r = byKey.get(key) || { n: 0, fpsSum: 0, fpsMax: 0, msSum: 0, msMin: Infinity, p95Sum: 0, kbSum: 0, last: null };
  r.n++;
  r.fpsSum += s.fps; r.fpsMax = Math.max(r.fpsMax, s.fps);
  r.msSum += s.avgMs; if (s.avgMs) r.msMin = Math.min(r.msMin, s.avgMs);
  r.p95Sum += s.p95; r.kbSum += s.kb; r.last = s;
  byKey.set(key, r);
}

function rows() {
  const out = [];
  for (const [key, r] of byKey) {
    out.push({
      key, size: r.last?.size, samples: r.n,
      fpsAvg: +(r.fpsSum / r.n).toFixed(1), fpsMax: r.fpsMax,
      msAvg: Math.round(r.msSum / r.n), msMin: r.msMin === Infinity ? 0 : r.msMin,
      p95Avg: Math.round(r.p95Sum / r.n), kbAvg: Math.round(r.kbSum / r.n),
    });
  }
  return out.sort((a, b) => a.key.localeCompare(b.key));
}

const server = http.createServer((req, res) => {
  if (req.method === "POST" && req.url === "/perf") {
    let body = "";
    req.on("data", c => (body += c));
    req.on("end", () => {
      try {
        const s = JSON.parse(body);
        record(s);
        console.log(`[sample] ${s.res}/${s.mode} ${s.size}  fps=${s.fps} avgMs=${s.avgMs} p95=${s.p95} kb=${s.kb}`);
      } catch { /* ignore malformed */ }
      res.writeHead(204); res.end();
    });
  } else {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true, snapshot: rows() }));
  }
});

server.listen(PORT, "0.0.0.0", () => console.log(`perf-collector listening on 0.0.0.0:${PORT} — POST /perf`));

setInterval(() => {
  const r = rows();
  if (!r.length) return;
  console.log("\n=== PERF SUMMARY (res/mode · size) ===");
  for (const x of r) {
    console.log(
      `  ${x.key.padEnd(11)} ${String(x.size).padEnd(10)}  fpsAvg=${x.fpsAvg} fpsMax=${x.fpsMax}` +
      `  msAvg=${x.msAvg} msMin=${x.msMin} p95=${x.p95Avg}  kb=${x.kbAvg}  (n=${x.samples})`,
    );
  }
  const best = r.slice().sort((a, b) => b.fpsAvg - a.fpsAvg)[0];
  if (best) console.log(`  >>> best sustained: ${best.key} (${best.size}) @ ${best.fpsAvg} fps avg, ${best.msAvg} ms/frame`);
  console.log("");
  try { fs.writeFileSync(SNAP, JSON.stringify({ updated: Date.now(), rows: r }, null, 2)); } catch { /* noop */ }
}, 3000);
