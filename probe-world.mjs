import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";
const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const OUT = "C:/Users/fortn/AppData/Local/Temp";
const edge = spawn(EDGE, ["--headless=new","--remote-debugging-port=9398","--user-data-dir="+OUT+"/edge-w9","--window-size=1240,760","about:blank"], { stdio: "ignore" });
async function t() {
  for (let i = 0; i < 40; i++) {
    try {
      const r = await fetch("http://127.0.0.1:9398/json/list");
      const l = await r.json();
      const p = l.find((x) => x.type === "page");
      if (p) return p.webSocketDebuggerUrl;
    } catch {}
    await sleep(400);
  }
  throw new Error("no target");
}
const ws = new WebSocket(await t());
await new Promise((r) => (ws.onopen = r));
let id = 0;
const pend = new Map();
const errs = [];
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); }
  if (m.method === "Runtime.exceptionThrown") errs.push(m.params.exceptionDetails?.text);
  if (m.method === "Log.entryAdded" && m.params.entry.level === "error") errs.push(m.params.entry.text);
};
const send = (m, p = {}) => { const i = ++id; ws.send(JSON.stringify({ id: i, method: m, params: p })); return new Promise((r) => pend.set(i, r)); };
await send("Runtime.enable");
await send("Log.enable");
await send("Page.enable");
await send("Page.navigate", { url: "http://127.0.0.1:4173/test-world.html" });
await sleep(6000);
const dbg = await send("Runtime.evaluate", { expression: `JSON.stringify({gl: typeof (window.THREE && THREE.GLTFLoader), ready: window.__shotReady, err: window.__loadErr, prog: window.__loadProg})`, returnByValue: true });
console.log("page state:", dbg.result?.result?.value);
// A/B: hide the blend (water) mesh, re-render
await send("Runtime.evaluate", { expression: `(function(){ var names=[]; window.__sceneRef.traverse(function(o){ if(o.isMesh){ names.push(o.name); if (o.material && (o.material.transparent || o.material.alphaMode === 'BLEND' || (o.material.transparent === true))) o.visible = false; } }); window.__mats = names; window.__render(); return JSON.stringify(names); })()`, returnByValue: true }).then(r => console.log("meshes:", r.result?.result?.value));
console.log("console errors:", errs.length ? errs.slice(0, 6) : "NONE");
const s = await send("Page.captureScreenshot", { format: "png" });
if (s.result?.data) writeFileSync(`${OUT}/ember-world-test.png`, Buffer.from(s.result.data, "base64"));
console.log("world test saved");
ws.close();
edge.kill();
process.exit(0);
