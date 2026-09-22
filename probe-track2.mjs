import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const OUT = "C:/Users/fortn/AppData/Local/Temp";
const edge = spawn(EDGE, ["--headless=new","--disable-gpu","--use-gl=swiftshader","--remote-debugging-port=9343","--user-data-dir="+OUT+"/edge-tr2","--window-size=1280,800","about:blank"], { stdio: "ignore" });
async function t(){for(let i=0;i<30;i++){try{const r=await fetch("http://127.0.0.1:9343/json/list");const l=await r.json();const p=l.find(x=>x.type==="page");if(p)return p.webSocketDebuggerUrl;}catch{}await sleep(400);}throw new Error("no target");}
const ws=new WebSocket(await t());await new Promise(r=>ws.onopen=r);
let id=0;const pend=new Map();ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id&&pend.has(m.id)){pend.get(m.id)(m);pend.delete(m.id);}};
const send=(m,p={})=>{const i=++id;ws.send(JSON.stringify({id:i,method:m,params:p}));return new Promise(r=>pend.set(i,r));};
await send("Runtime.enable");await send("Page.enable");
await send("Page.navigate",{url:"file:///C:/Users/fortn/ember-site/index.html"});await sleep(4000);
await send("Runtime.evaluate",{expression:`window.scrollTo(0,1440)`});await sleep(800);
const dump = async (label) => {
  const d = await send("Runtime.evaluate",{expression:`JSON.stringify(window.__emberScene.debug().filter(c=>c.w===0.6).slice(0,6))`,returnByValue:true});
  console.log(label, d.result.result.value);
};
await dump("no pointer:  ");
await send("Input.dispatchMouseEvent",{type:"mouseMoved",x:1250,y:400});
await sleep(1600);
await dump("pointer RIGHT:");
await send("Input.dispatchMouseEvent",{type:"mouseMoved",x:30,y:400});
await sleep(1600);
await dump("pointer LEFT: ");
ws.close();edge.kill();process.exit(0);
