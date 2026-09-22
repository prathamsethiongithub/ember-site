import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";
const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const OUT = "C:/Users/fortn/AppData/Local/Temp";
const edge = spawn(EDGE, ["--headless=new","--disable-gpu","--remote-debugging-port=9336","--user-data-dir="+OUT+"/edge-s5","--window-size=1280,800","about:blank"], { stdio: "ignore" });
async function t(){for(let i=0;i<30;i++){try{const r=await fetch("http://127.0.0.1:9336/json/list");const l=await r.json();const p=l.find(x=>x.type==="page");if(p)return p.webSocketDebuggerUrl;}catch{}await sleep(400);}throw new Error("no target");}
const ws=new WebSocket(await t());await new Promise(r=>ws.onopen=r);
let id=0;const pend=new Map();ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id&&pend.has(m.id)){pend.get(m.id)(m);pend.delete(m.id);}};
const send=(m,p={})=>{const i=++id;ws.send(JSON.stringify({id:i,method:m,params:p}));return new Promise(r=>pend.set(i,r));};
await send("Runtime.enable");await send("Page.enable");
await send("Page.navigate",{url:"file:///C:/Users/fortn/ember-site/index.html"});await sleep(3000);
const top = await send("Runtime.evaluate",{expression:`Math.round(document.querySelector('.builder-lines').getBoundingClientRect().top + scrollY)`,returnByValue:true});
const y = top.result.result.value - 60;
await send("Runtime.evaluate",{expression:`window.scrollTo(0,${y})`});await sleep(900);
const s=await send("Page.captureScreenshot",{format:"png"});
if(s.result?.data) writeFileSync(`${OUT}/ember-s5-triad.png`,Buffer.from(s.result.data,"base64"));
console.log("saved at", y);
ws.close();edge.kill();process.exit(0);
