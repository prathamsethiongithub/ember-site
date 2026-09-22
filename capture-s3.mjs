import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";
const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const URL = "file:///C:/Users/fortn/ember-site/index.html";
const OUT = "C:/Users/fortn/AppData/Local/Temp";
const edge = spawn(EDGE, ["--headless=new","--disable-gpu","--remote-debugging-port=9334","--user-data-dir="+OUT+"/edge-s3","--window-size=1280,800","about:blank"], { stdio: "ignore" });
async function t(){for(let i=0;i<30;i++){try{const r=await fetch("http://127.0.0.1:9334/json/list");const l=await r.json();const p=l.find(x=>x.type==="page");if(p)return p.webSocketDebuggerUrl;}catch{}await sleep(400);}throw new Error("no target");}
const ws=new WebSocket(await t());await new Promise(r=>ws.onopen=r);
let id=0;const pend=new Map();ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id&&pend.has(m.id)){pend.get(m.id)(m);pend.delete(m.id);}};
const send=(m,p={})=>{const i=++id;ws.send(JSON.stringify({id:i,method:m,params:p}));return new Promise(r=>pend.set(i,r));};
await send("Runtime.enable");await send("Page.enable");await send("Page.navigate",{url:URL});await sleep(3000);
const sec = await send("Runtime.evaluate",{expression:`JSON.stringify({s3: Math.round(document.querySelector('#s3').getBoundingClientRect().top + scrollY), s5: Math.round(document.querySelector('#s5').getBoundingClientRect().top + scrollY), h: document.body.scrollHeight})`,returnByValue:true});
console.log(sec.result?.result?.value);
const pos = JSON.parse(sec.result.result.value);
for (const [name,y] of [["s3",pos.s3-100],["s5",pos.s5-100]]) {
  await send("Runtime.evaluate",{expression:`window.scrollTo(0,${y})`});await sleep(800);
  const s=await send("Page.captureScreenshot",{format:"png"});
  if(s.result?.data) writeFileSync(`${OUT}/ember-${name}.png`,Buffer.from(s.result.data,"base64"));
  console.log(name,"saved at",y);
}
ws.close();edge.kill();process.exit(0);
