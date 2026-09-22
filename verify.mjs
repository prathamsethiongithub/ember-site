/* ember-site verification: console errors, scroll shots, reduced-motion check.
   Run: node verify.mjs   (needs node 22+ for global WebSocket/fetch) */
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";

const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const URL = "file:///C:/Users/fortn/ember-site/index.html";
const OUT = "C:/Users/fortn/AppData/Local/Temp";
const PORT = 9333;

mkdirSync(OUT, { recursive: true });
const edge = spawn(EDGE, [
  "--headless=new", "--disable-gpu", `--remote-debugging-port=${PORT}`,
  "--user-data-dir=" + OUT + "/edge-verify-profile",
  "--window-size=1280,800", "about:blank",
], { stdio: "ignore" });

async function cdpTarget() {
  for (let i = 0; i < 30; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/json/list`);
      const list = await r.json();
      const page = list.find((t) => t.type === "page");
      if (page) return page.webSocketDebuggerUrl;
    } catch {}
    await sleep(400);
  }
  throw new Error("no CDP target");
}

const wsUrl = await cdpTarget();
const ws = new WebSocket(wsUrl);
await new Promise((res) => (ws.onopen = res));

let id = 0;
const pending = new Map();
const consoleErrors = [];
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  if (m.method === "Runtime.consoleAPICalled" && m.params.type === "error")
    consoleErrors.push(JSON.stringify(m.params.args.map(a => a.value ?? a.description ?? "")));
  if (m.method === "Runtime.exceptionThrown")
    consoleErrors.push("EXCEPTION: " + (m.params.exceptionDetails?.text ?? ""));
  if (m.method === "Log.entryAdded" && m.params.entry.level === "error")
    consoleErrors.push("LOG: " + m.params.entry.text);
};
function send(method, params = {}) {
  const mid = ++id;
  ws.send(JSON.stringify({ id: mid, method, params }));
  return new Promise((res) => pending.set(mid, res));
}

await send("Runtime.enable");
await send("Log.enable");
await send("Page.enable");
await send("Page.navigate", { url: URL });
await sleep(3500); // load + fonts + gsap init

// --- scroll shots ---
const positions = [970, 1140, 1310, 1480, 2150, 2550, 3900, 4900, 5900];
const pageH = await send("Runtime.evaluate", { expression: "document.body.scrollHeight", returnByValue: true });
console.log("scrollHeight:", pageH.result?.result?.value);

for (const y of positions) {
  await send("Runtime.evaluate", { expression: `window.scrollTo(0, ${y})` });
  await sleep(700); // let scrub catch up
  const shot = await send("Page.captureScreenshot", { format: "png" });
  if (shot.result?.data) {
    writeFileSync(`${OUT}/ember-scroll-${y}.png`, Buffer.from(shot.result.data, "base64"));
    console.log(`shot @${y} saved`);
  }
}

// --- reduced-motion: below-fold element must be fully visible ---
await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
await send("Page.navigate", { url: URL });
await sleep(2500);
const rmCheck = await send("Runtime.evaluate", {
  expression: `(() => {
    const el = document.querySelector('.builder-credit');
    const cs = getComputedStyle(el);
    const html = document.documentElement;
    return JSON.stringify({
      jsClass: html.classList.contains('js'),
      builderOpacity: cs.opacity,
      hintColor: getComputedStyle(document.querySelector('.hero-hint')).color,
      webglCanvas: !!document.querySelector('#s1 canvas'),
    });
  })()`, returnByValue: true,
});
console.log("reduced-motion check:", rmCheck.result?.result?.value);
// static materialized frame — scroll to S1 and shoot
await send("Runtime.evaluate", { expression: "window.scrollTo(0, 950)" });
await sleep(900);
const rmShot = await send("Page.captureScreenshot", { format: "png" });
if (rmShot.result?.data) writeFileSync(`${OUT}/ember-rm-s1.png`, Buffer.from(rmShot.result.data, "base64"));
console.log("reduced-motion S1 shot saved");

// --- normal-mode reveal sanity: is html.js added? ---
await send("Emulation.setEmulatedMedia", { features: [] });
await send("Page.navigate", { url: URL });
await sleep(2500);
const nmCheck = await send("Runtime.evaluate", {
  expression: `JSON.stringify({
    jsClass: document.documentElement.classList.contains('js'),
    gsap: typeof window.gsap,
    st: typeof window.ScrollTrigger,
    heroVisible: getComputedStyle(document.querySelector('.hero-word')).opacity
  })`, returnByValue: true,
});
console.log("normal-mode check:", nmCheck.result?.result?.value);

// --- no-JS: all content must be visible (hidden states gated on html.js) ---
await send("Emulation.setScriptExecutionDisabled", { value: true });
await send("Page.navigate", { url: URL });
await sleep(2000);
const noJsCheck = await send("Runtime.evaluate", {
  expression: `JSON.stringify({
    jsClass: document.documentElement.classList.contains('js'),
    beatOpacity: getComputedStyle(document.querySelector('.beat')).opacity,
    evidenceOpacity: getComputedStyle(document.querySelector('.evidence-line')).opacity,
    builderOpacity: getComputedStyle(document.querySelector('.builder-credit')).opacity,
    oracleText: document.querySelector('.oracle-evidence')?.innerText?.slice(0, 40)
  })`, returnByValue: true,
});
console.log("no-JS check:", noJsCheck.result?.result?.value);
await send("Emulation.setScriptExecutionDisabled", { value: false });

// --- performance sweep: rAF frame times during a full-page scroll ---
await send("Emulation.setEmulatedMedia", { features: [] });
await send("Page.navigate", { url: URL });
await sleep(3000);
await send("Runtime.evaluate", { expression: `
  window.__frames = [];
  (function(){
    var last = performance.now();
    function tick(t){ window.__frames.push(t - last); last = t;
      if (window.__frames.length < 1200) requestAnimationFrame(tick); }
    requestAnimationFrame(tick);
  })();
  window.scrollTo(0,0);
` });
for (let y = 0; y <= 5800; y += 55) {
  await send("Runtime.evaluate", { expression: `window.scrollTo(0,${y})` });
  await sleep(14);
}
await sleep(400);
const perf = await send("Runtime.evaluate", { expression: `(() => {
  var f = window.__frames.filter(function(x){ return x > 0 && x < 500; });
  var sorted = f.slice().sort(function(a,b){ return a-b; });
  var p95 = sorted[Math.floor(sorted.length * 0.95)] || 0;
  var over20 = f.filter(function(x){ return x > 20; }).length;
  var over33 = f.filter(function(x){ return x > 33; }).length;
  return JSON.stringify({ frames: f.length, p95: p95.toFixed(1),
    max: Math.max.apply(null, f).toFixed(1), over20: over20,
    pctOver20: (100 * over20 / f.length).toFixed(1), over33: over33 });
})()`, returnByValue: true });
console.log("perf sweep (software rendering, worst case):", perf.result?.result?.value);

// --- mobile pass (390px): entrances + typography weight ---
await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
await send("Page.navigate", { url: URL });
await sleep(3000);
const mpos = await send("Runtime.evaluate", { expression: `(() => {
  var q = function(s){ var el = document.querySelector(s); return el ? Math.round(el.getBoundingClientRect().top + scrollY) : -1; };
  return JSON.stringify({ s1: q('#s1'), ev: q('.oracle-evidence'), s3: q('#s3'), s5: q('#s5'), h: document.body.scrollHeight });
})()`, returnByValue: true });
console.log("mobile positions:", mpos.result?.result?.value);
const mp = JSON.parse(mpos.result.result.value);
for (const [name, y] of [["m-s1", mp.s1], ["m-ev", mp.ev - 150], ["m-s5", mp.s5 - 120]]) {
  await send("Runtime.evaluate", { expression: `window.scrollTo(0,${y})` });
  await sleep(800);
  const s = await send("Page.captureScreenshot", { format: "png" });
  if (s.result?.data) writeFileSync(`${OUT}/ember-${name}.png`, Buffer.from(s.result.data, "base64"));
  console.log(name, "saved");
}
await send("Emulation.clearDeviceMetricsOverride");

console.log("console errors:", consoleErrors.length === 0 ? "NONE" : consoleErrors.slice(0, 10));
ws.close();
edge.kill();
process.exit(0);
