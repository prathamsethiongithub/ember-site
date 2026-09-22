import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";
const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const OUT = "C:/Users/fortn/AppData/Local/Temp";
const edge = spawn(EDGE, ["--headless=new","--remote-debugging-port=9380","--user-data-dir="+OUT+"/edge-repro","--window-size=1900,950","about:blank"], { stdio: "ignore" });
async function t(){for(let i=0;i<40;i++){try{const r=await fetch("http://127.0.0.1:9380/json/list");const l=await r.json();const p=l.find(x=>x.type==="page");if(p)return p.webSocketDebuggerUrl;}catch{}await sleep(400);}throw new Error("no target");}
const ws=new WebSocket(await t());await new Promise(r=>ws.onopen=r);
let id=0;const pend=new Map();
ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id&&pend.has(m.id)){pend.get(m.id)(m);pend.delete(m.id);}};
const send=(m,p={})=>{const i=++id;ws.send(JSON.stringify({id:i,method:m,params:p}));return new Promise(r=>pend.set(i,r));};
await send("Runtime.enable");await send("Page.enable");
await send("Page.navigate",{url:"file:///C:/Users/fortn/ember-site/index.html"});await sleep(6000);
// full viewport as he sees it
let s = await send("Page.captureScreenshot",{format:"png"});
if (s.result?.data) writeFileSync(`${OUT}/ember-repro-full.png`, Buffer.from(s.result.data,"base64"));
// zoom on the character: project his world position to screen, clip around it
const r = await send("Runtime.evaluate",{expression:`(() => {
  const cam = window.__emberIsland ? null : null;
  return 'no-hook';
})()`,returnByValue:true});
// character sits at x=1.9 world; estimate screen: just clip center-right upper area
const clip = { x: 820, y: 60, width: 420, height: 560, scale: 2 };
s = await send("Page.captureScreenshot",{format:"png", clip});
if (s.result?.data) writeFileSync(`${OUT}/ember-repro-char.png`, Buffer.from(s.result.data,"base64"));
console.log("shots saved");
ws.close();edge.kill();process.exit(0);
