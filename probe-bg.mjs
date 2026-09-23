import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";
const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const OUT = "C:/Users/fortn/AppData/Local/Temp";
const edge = spawn(EDGE, ["--headless=new", "--remote-debugging-port=9402", "--user-data-dir=" + OUT + "/edge-bg", "--window-size=800,500", "about:blank"], { stdio: "ignore" });
async function t() {
  for (let i = 0; i < 40; i++) {
    try {
      const r = await fetch("http://127.0.0.1:9402/json/list");
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
await send("Page.navigate", { url: "http://127.0.0.1:4173/render-hero-bg.html" });
await sleep(9000);
const st = await send("Runtime.evaluate", { expression: `JSON.stringify({ready: window.__ready, err: window.__err || null})`, returnByValue: true });
console.log("state:", st.result?.result?.value);
const r = await send("Runtime.evaluate", {
  expression: `document.querySelector('canvas').toDataURL('image/jpeg', 0.88)`,
  returnByValue: true,
});
const data = r.result?.result?.value || "";
if (data.startsWith("data:image/jpeg")) {
  const buf = Buffer.from(data.split(",")[1], "base64");
  writeFileSync("C:/Users/fortn/ember-site/assets/hero-bg.jpg", buf);
  console.log("hero-bg.jpg written:", Math.round(buf.length / 1024), "KB");
} else console.log("FAILED:", data.slice(0, 120));
console.log("errors:", errs.length ? errs.slice(0, 5) : "NONE");
ws.close();
edge.kill();
process.exit(0);
