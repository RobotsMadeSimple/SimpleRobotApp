#!/usr/bin/env node
// Controller CLI — a thin client over the SimpleRobotController WebSocket command API
// (ws://<host>:9000/control) plus the HTTP camera endpoints. Lets us read/write a phone device's
// provider config, view its channel data + camera state, and grab a snapshot image — without
// tapping through the app. Node 21+ (global WebSocket); no dependencies.
//
// Host: env CTRL=host:port (default 127.0.0.1:9000).
//
// Usage:
//   node ctrl.mjs devices                     # all devices: id, name, live, channels, providerConfig
//   node ctrl.mjs cameras                     # all cameras: id, name, connected, WxH, fps, source
//   node ctrl.mjs cfg <deviceId>              # print a device's parsed providerConfig
//   node ctrl.mjs setcfg <deviceId> k=v ...   # merge keys into providerConfig (e.g. rtcFps=60 resTier=high)
//   node ctrl.mjs data <deviceId>             # just the device's live channel values
//   node ctrl.mjs snapshot <cameraId> [out]   # save a JPEG snapshot (default: scratch snapshot.jpg)
//   node ctrl.mjs cmd <Command> [jsonParams]  # raw command, e.g. cmd GetCameras

const HOSTPORT = process.env.CTRL || "127.0.0.1:9000";
const WS_URL = `ws://${HOSTPORT}/control`;
const HTTP = `http://${HOSTPORT}`;

function rid() { return Math.random().toString(36).slice(2) + Date.now().toString(36); }

/** Open the control socket, send one command, resolve its ack, close. */
function sendCommand(command, params = {}, timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(WS_URL);
    const id = rid();
    const timer = setTimeout(() => { try { ws.close(); } catch {} reject(new Error(`${command} timed out`)); }, timeoutMs);
    ws.addEventListener("open", () => ws.send(JSON.stringify({ type: "Command", id, command, params })));
    ws.addEventListener("message", ev => {
      let m; try { m = JSON.parse(typeof ev.data === "string" ? ev.data : ev.data.toString()); } catch { return; }
      if (m?.type === "ack" && m.id === id) {
        clearTimeout(timer); try { ws.close(); } catch {}
        if (m.ok === false) reject(new Error(m.error || `${command} failed`)); else resolve(m);
      }
    });
    ws.addEventListener("error", () => { clearTimeout(timer); reject(new Error(`cannot reach ${WS_URL}`)); });
  });
}

const parseJson = (s, fb) => { try { return JSON.parse(s ?? ""); } catch { return fb; } };

async function getDevices() { return parseJson((await sendCommand("GetDevices")).devices, []); }
async function getCameras() { return parseJson((await sendCommand("GetCameras")).cameras, []); }

// Coerce a k=v token to the right type for the provider config blob.
const BOOL_KEYS = new Set(["lockOrient", "motionOn", "lightOn", "locationOn", "batteryOn", "camOn"]);
const NUM_KEYS = new Set(["bitrate"]);
function coerce(key, val) {
  if (val === "null") return null;
  if (BOOL_KEYS.has(key)) return val === "true" || val === "1";
  if (NUM_KEYS.has(key)) return Number(val);
  return val; // resTier/rtcFps/lensId/assignedPhone* are strings
}

async function main() {
  const [sub, ...rest] = process.argv.slice(2);
  switch (sub) {
    case "devices": {
      const devs = await getDevices();
      for (const d of devs) {
        console.log(`\n● ${d.name}  [${d.id}]  ${d.connected ? "LIVE" : "offline"}`);
        console.log(`  providerConfig: ${JSON.stringify(parseJson(d.providerConfig, null))}`);
        const ch = d.channels || [];
        if (ch.length) console.log(`  channels: ${ch.map(c => `${c.name}=${c.value}`).join(", ")}`);
      }
      if (!devs.length) console.log("(no devices)");
      break;
    }
    case "cameras": {
      const cams = await getCameras();
      for (const c of cams) {
        console.log(`● ${c.name} [${c.id}] ${c.connected ? "CONNECTED" : "offline"} · ${c.width}x${c.height} · ${c.targetFps}fps · ${c.sourceType}`);
      }
      if (!cams.length) console.log("(no cameras)");
      break;
    }
    case "cfg": {
      const d = (await getDevices()).find(x => x.id === rest[0] || x.name === rest[0]);
      if (!d) { console.error("device not found"); process.exit(1); }
      console.log(JSON.stringify(parseJson(d.providerConfig, {}), null, 2));
      break;
    }
    case "data": {
      const d = (await getDevices()).find(x => x.id === rest[0] || x.name === rest[0]);
      if (!d) { console.error("device not found"); process.exit(1); }
      for (const c of (d.channels || [])) console.log(`${c.name} = ${c.value}${c.unit ? " " + c.unit : ""}`);
      break;
    }
    case "setcfg": {
      const key = rest[0];
      const d = (await getDevices()).find(x => x.id === key || x.name === key);
      if (!d) { console.error("device not found"); process.exit(1); }
      const cfg = parseJson(d.providerConfig, {});
      for (const kv of rest.slice(1)) {
        const i = kv.indexOf("=");
        if (i < 0) continue;
        const k = kv.slice(0, i), v = kv.slice(i + 1);
        cfg[k] = coerce(k, v);
      }
      await sendCommand("SetDeviceConfig", { id: d.id, providerConfig: JSON.stringify(cfg) });
      console.log(`updated ${d.name} [${d.id}]:`, JSON.stringify(cfg));
      console.log("(the phone picks this up when its provider screen reopens / reconnects)");
      break;
    }
    case "snapshot": {
      const camId = rest[0];
      const out = rest[1] || "snapshot.jpg";
      const res = await fetch(`${HTTP}/camera/${encodeURIComponent(camId)}/snapshot`);
      if (!res.ok) { console.error(`snapshot HTTP ${res.status}`); process.exit(1); }
      const buf = Buffer.from(await res.arrayBuffer());
      const fs = await import("node:fs");
      fs.writeFileSync(out, buf);
      console.log(`saved ${buf.length} bytes → ${out}`);
      break;
    }
    case "cmd": {
      const m = await sendCommand(rest[0], rest[1] ? JSON.parse(rest[1]) : {});
      console.log(JSON.stringify(m, null, 2));
      break;
    }
    default:
      console.log("usage: node ctrl.mjs <devices|cameras|cfg|data|setcfg|snapshot|cmd> ...");
      process.exit(1);
  }
}

main().catch(e => { console.error("error:", e.message); process.exit(1); });
