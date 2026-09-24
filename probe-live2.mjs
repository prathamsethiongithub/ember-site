import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";
const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const OUT = "C:/Users/fortn/AppData/Local/Temp";
const edge = spawn(EDGE, ["--headless=new","--remote-debugging-port=9412","--user-data-dir="+OUT+"/edge-live2","--window-size=1900,940","about:blank"], { stdio: "ignore" });
async function t(){for(let i=0;i<40;i++){try{const r=await fetch("http://127.0.0.1:9412/json/list");const l=await r.json();const p=l.find(x=>x.type==="page");if(p)return p.webSocketDebuggerUrl;}catch{}await sleep(400);}throw new Error("no target");}
const ws=new WebSocket(await t());await new Promise(r=>ws.onopen=r);
let id=0;const pend=new Map();
ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id&&pend.has(m.id)){pend.get(m.id)(m);pend.delete(m.id);}};
const send=(m,p={})=>{const i=++id;ws.send(JSON.stringify({id:i,method:m,params:p}));return new Promise(r=>pend.set(i,r));};
await send("Runtime.enable");await send("Page.enable");
await send("Page.navigate",{url:"https://prathamsethiongithub.github.io/ember-site/"});
await sleep(8000);
// instant scroll to the absolute bottom
for (let k = 0; k < 8; k++) {
  await send("Runtime.evaluate",{expression:`window.scrollTo({top: document.documentElement.scrollHeight, behavior: 'instant'})`});
  await sleep(500);
}
const st = await send("Runtime.evaluate",{expression:`JSON.stringify({y: Math.round(window.scrollY), h: document.documentElement.scrollHeight, vh: innerHeight})`,returnByValue:true});
console.log("scroll:", st.result?.result?.value);
await sleep(1800);
let s = await send("Page.captureScreenshot",{format:"png"});
if (s.result?.data) writeFileSync(`${OUT}/live-footer.png`, Buffer.from(s.result.data,"base64"));
console.log("footer shot saved");
ws.close();edge.kill();process.exit(0);
