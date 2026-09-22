import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";
const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const OUT = "C:/Users/fortn/AppData/Local/Temp";
const edge = spawn(EDGE, ["--headless=new","--remote-debugging-port=9388","--user-data-dir="+OUT+"/edge-cc","--window-size=1000,800","about:blank"], { stdio: "ignore" });
async function t(){for(let i=0;i<40;i++){try{const r=await fetch("http://127.0.0.1:9388/json/list");const l=await r.json();const p=l.find(x=>x.type==="page");if(p)return p.webSocketDebuggerUrl;}catch{}await sleep(400);}throw new Error("no target");}
const ws=new WebSocket(await t());await new Promise(r=>ws.onopen=r);
let id=0;const pend=new Map();
ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id&&pend.has(m.id)){pend.get(m.id)(m);pend.delete(m.id);}};
const send=(m,p={})=>{const i=++id;ws.send(JSON.stringify({id:i,method:m,params:p}));return new Promise(r=>pend.set(i,r));};
await send("Runtime.enable");await send("Page.enable");
await send("Page.navigate",{url:"http://127.0.0.1:4173/index.html"});
await sleep(5000);
// straight-on close-up of him (world 2.6, feet 2.5, 4.4*2.4/2.2=4.8 tall → center ~4.9)
await send("Runtime.evaluate",{expression:`window.__emberIsland.freeze(); window.__emberIsland.setIntro(1); window.__emberIsland.viewAt(5.4, 5.2, 11.8, 5.4, 4.7, 5.2);`});
await sleep(400);
let s = await send("Page.captureScreenshot",{format:"png"});
if (s.result?.data) writeFileSync(`${OUT}/ember-char-close.png`, Buffer.from(s.result.data,"base64"));
console.log("char close-up saved");
ws.close();edge.kill();process.exit(0);
