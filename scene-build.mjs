/* scene-build.mjs — captures the formation journey (25/50/75/100% of the pin)
   and renders the build-time fallback image (fully-formed character, frozen). */
import { spawn } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";

const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const URL = "file:///C:/Users/fortn/ember-site/index.html";
const OUT = "C:/Users/fortn/AppData/Local/Temp";
const ASSETS = "C:/Users/fortn/ember-site/assets";
mkdirSync(ASSETS, { recursive: true });

const edge = spawn(EDGE, [
  "--headless=new", "--disable-gpu", "--use-gl=swiftshader",
  "--remote-debugging-port=9337",
  "--user-data-dir=" + OUT + "/edge-scene",
  "--window-size=1280,800", "about:blank",
], { stdio: "ignore" });

async function target() {
  for (let i = 0; i < 30; i++) {
    try {
      const r = await fetch("http://127.0.0.1:9337/json/list");
      const l = await r.json();
      const p = l.find((t) => t.type === "page");
      if (p) return p.webSocketDebuggerUrl;
    } catch {}
    await sleep(400);
  }
  throw new Error("no CDP target");
}

const ws = new WebSocket(await target());
await new Promise((r) => (ws.onopen = r));
let id = 0;
const pend = new Map();
const errors = [];
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); }
  if (m.method === "Runtime.exceptionThrown") errors.push(m.params.exceptionDetails?.text);
  if (m.method === "Log.entryAdded" && m.params.entry.level === "error") errors.push(m.params.entry.text);
};
const send = (method, params = {}) => {
  const i = ++id;
  ws.send(JSON.stringify({ id: i, method, params }));
  return new Promise((r) => pend.set(i, r));
};

await send("Runtime.enable");
await send("Log.enable");
await send("Page.enable");
await send("Page.navigate", { url: URL });
await sleep(4000);

const hasScene = await send("Runtime.evaluate", {
  expression: `JSON.stringify({ three: typeof window.THREE, hook: typeof window.__emberScene, canvas: !!document.querySelector('#s1 canvas') })`,
  returnByValue: true,
});
console.log("scene check:", hasScene.result?.result?.value);

// pin range at 800px viewport: start 800, end 800+680
const PIN_START = 800, PIN_SPAN = 680;
for (const pct of [25, 50, 75, 100]) {
  const y = Math.round(PIN_START + PIN_SPAN * (pct / 100)) - 40;
  await send("Runtime.evaluate", { expression: `window.scrollTo(0, ${y})` });
  await sleep(900);
  const s = await send("Page.captureScreenshot", { format: "png" });
  if (s.result?.data) writeFileSync(`${OUT}/ember-3d-${pct}.png`, Buffer.from(s.result.data, "base64"));
  console.log(`formation ${pct}% saved (scroll ${y})`);
}

// fallback: fully formed, frozen, clipped to the frame
await send("Runtime.evaluate", { expression: `window.__emberScene && window.__emberScene.setProgress(1)` });
await sleep(400);
await send("Runtime.evaluate", { expression: `window.__emberScene && window.__emberScene.freeze()` });
await sleep(400);
const rect = await send("Runtime.evaluate", {
  expression: `(() => { const r = document.querySelector('#s1 .materialize-frame').getBoundingClientRect();
    return JSON.stringify({ x: Math.round(r.x + scrollX), y: Math.round(r.y + scrollY), w: Math.round(r.width), h: Math.round(r.height) }); })()`,
  returnByValue: true,
});
const r = JSON.parse(rect.result.result.value);
const shot = await send("Page.captureScreenshot", {
  format: "png",
  clip: { x: r.x, y: r.y, width: r.w, height: r.h, scale: 1 },
});
if (shot.result?.data) {
  writeFileSync(`${ASSETS}/character-fallback.png`, Buffer.from(shot.result.data, "base64"));
  console.log("fallback rendered:", `${r.w}x${r.h}`);
}
console.log("console errors:", errors.length === 0 ? "NONE" : errors.slice(0, 5));
ws.close();
edge.kill();
process.exit(0);
