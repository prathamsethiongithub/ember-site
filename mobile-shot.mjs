import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";
const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const URL = "file:///C:/Users/fortn/ember-site/index.html";
const OUT = "C:/Users/fortn/AppData/Local/Temp";
const edge = spawn(EDGE, ["--headless=new","--disable-gpu","--remote-debugging-port=9335","--user-data-dir="+OUT+"/edge-mob","about:blank"], { stdio: "ignore" });
async function t(){for(let i=0;i<30;i++){try{const r=await fetch("http://127.0.0.1:9335/json/list");const l=await r.json();const p=l.find(x=>x.type==="page");if(p)return p.webSocketDebuggerUrl;}catch{}await sleep(400);}throw new Error("no target");}
const ws=new WebSocket(await t());await new Promise(r=>ws.onopen=r);
let id=0;const pend=new Map();ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id&&pend.has(m.id)){pend.get(m.id)(m);pend.delete(m.id);}};
const send=(m,p={})=>{const i=++id;ws.send(JSON.stringify({id:i,method:m,params:p}));return new Promise(r=>pend.set(i,r));};
await send("Runtime.enable");await send("Page.enable");
await send("Emulation.setDeviceMetricsOverride",{width:390,height:844,deviceScaleFactor:2,mobile:true});
await send("Page.navigate",{url:URL});await sleep(3000);
const pos = await send("Runtime.evaluate",{expression:`JSON.stringify({ev: Math.round(document.querySelector('.oracle-evidence').getBoundingClientRect().top + scrollY), s5: Math.round(document.querySelector('#s5').getBoundingClientRect().top + scrollY)})`,returnByValue:true});
const p = JSON.parse(pos.result.result.value);
for (const [n,y] of [["m-ev",p.ev-150],["m-s5",p.s5-60]]) {
  await send("Runtime.evaluate",{expression:`window.scrollTo(0,${y})`});await sleep(900);
  const s=await send("Page.captureScreenshot",{format:"png"});
  if(s.result?.data) writeFileSync(`${OUT}/ember-${n}.png`,Buffer.from(s.result.data,"base64"));
  console.log(n,"saved");
}
ws.close();edge.kill();process.exit(0);
