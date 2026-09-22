/* scene-build.mjs (v2) — renders the build-time fallbacks (hero island at full
   assembly, the character demo) and captures the scroll journey. */
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
  "--remote-debugging-port=9350", "--user-data-dir=" + OUT + "/edge-v2",
  "--window-size=1440,900", "about:blank",
], { stdio: "ignore" });

async function target() {
  for (let i = 0; i < 40; i++) {
    try {
      const r = await fetch("http://127.0.0.1:9350/json/list");
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
let id = 0; const pend = new Map(); const errors = [];
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); }
  if (m.method === "Runtime.exceptionThrown") errors.push(m.params.exceptionDetails?.text);
  if (m.method === "Log.entryAdded" && m.params.entry.level === "error") errors.push(m.params.entry.text);
};
const send = (m, p = {}) => { const i = ++id; ws.send(JSON.stringify({ id: i, method: m, params: p })); return new Promise((r) => pend.set(i, r)); };

await send("Runtime.enable"); await send("Log.enable"); await send("Page.enable");
await send("Page.navigate", { url: URL });
await sleep(5000);

const check = await send("Runtime.evaluate", {
  expression: `JSON.stringify({three: typeof THREE, island: typeof window.__emberIsland, char: typeof window.__emberCharacter, heroCanvas: !!document.querySelector('.hero-scene canvas'), charCanvas: !!document.querySelector('.character-scene canvas')})`,
  returnByValue: true,
});
console.log("scene check:", check.result?.result?.value);

// HERO: fully assembled, frozen, clipped to the hero viewport → hero-fallback
await send("Runtime.evaluate", { expression: `window.__emberIsland.freeze(); window.__emberIsland.setIntro(1); window.__emberIsland.setProgress(0);` });
await sleep(500);
let s = await send("Page.captureScreenshot", { format: "png" });
if (s.result?.data) { writeFileSync(`${ASSETS}/hero-fallback.png`, Buffer.from(s.result.data, "base64")); console.log("hero-fallback saved"); }

// hero journey shots: 0 / 50 / 100% of the flight
for (const pct of [0, 50, 100]) {
  await send("Runtime.evaluate", { expression: `window.__emberIsland.setProgress(${pct / 100})` });
  await sleep(350);
  s = await send("Page.captureScreenshot", { format: "png" });
  if (s.result?.data) { writeFileSync(`${OUT}/ember-v2-hero-${pct}.png`, Buffer.from(s.result.data, "base64")); console.log(`hero ${pct}% saved`); }
}

// CHARACTER: freeze + clip to the stage → character-fallback
await send("Runtime.evaluate", { expression: `window.__emberCharacter.freeze()` });
await sleep(300);
const rect = await send("Runtime.evaluate", {
  expression: `(() => { const r = document.querySelector('.character-stage').getBoundingClientRect();
    return JSON.stringify({x: Math.round(r.x + scrollX), y: Math.round(r.y + scrollY), w: Math.round(r.width), h: Math.round(r.height)}); })()`,
  returnByValue: true,
});
const r2 = JSON.parse(rect.result.result.value);
s = await send("Page.captureScreenshot", { format: "png", clip: { x: r2.x, y: r2.y, width: r2.w, height: r2.h, scale: 1 } });
if (s.result?.data) { writeFileSync(`${ASSETS}/character-fallback.png`, Buffer.from(s.result.data, "base64")); console.log("character-fallback saved", `${r2.w}x${r2.h}`); }

// mid-page section shots for the audit
for (const [name, sel] of [["oracle", "#oracle"], ["app", "#app"], ["receipts", "#receipts"]]) {
  const pos = await send("Runtime.evaluate", {
    expression: `Math.round(document.querySelector('${sel}').getBoundingClientRect().top + scrollY) - 80`,
    returnByValue: true,
  });
  await send("Runtime.evaluate", { expression: `window.scrollTo(0, ${pos.result.result.value})` });
  await sleep(700);
  s = await send("Page.captureScreenshot", { format: "png" });
  if (s.result?.data) { writeFileSync(`${OUT}/ember-v2-${name}.png`, Buffer.from(s.result.data, "base64")); console.log(`${name} saved`); }
}

console.log("console errors:", errors.length === 0 ? "NONE" : errors.slice(0, 5));
ws.close(); edge.kill(); process.exit(0);
