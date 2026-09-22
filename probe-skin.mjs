import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";
const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const OUT = "C:/Users/fortn/AppData/Local/Temp";
const edge = spawn(EDGE, ["--headless=new","--remote-debugging-port=9370","--user-data-dir="+OUT+"/edge-skin","--window-size=1440,900","about:blank"], { stdio: "ignore" });
async function t(){for(let i=0;i<40;i++){try{const r=await fetch("http://127.0.0.1:9370/json/list");const l=await r.json();const p=l.find(x=>x.type==="page");if(p)return p.webSocketDebuggerUrl;}catch{}await sleep(400);}throw new Error("no target");}
const ws=new WebSocket(await t());await new Promise(r=>ws.onopen=r);
let id=0;const pend=new Map();const errors=[];
ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id&&pend.has(m.id)){pend.get(m.id)(m);pend.delete(m.id);}
if(m.method==="Runtime.exceptionThrown")errors.push(m.params.exceptionDetails?.text);
if(m.method==="Log.entryAdded"&&m.params.entry.level==="error")errors.push(m.params.entry.text);};
const send=(m,p={})=>{const i=++id;ws.send(JSON.stringify({id:i,method:m,params:p}));return new Promise(r=>pend.set(i,r));};
await send("Runtime.enable");await send("Log.enable");await send("Page.enable");
await send("Page.navigate",{url:"file:///C:/Users/fortn/ember-site/index.html"});await sleep(6000);
let r = await send("Runtime.evaluate",{expression:`JSON.stringify({skinData: typeof window.EMBER_SKIN, builder: typeof window.buildSkinCharacter, charCanvas: !!document.querySelector('.character-scene canvas'), charSceneDisplay: getComputedStyle(document.querySelector('.character-scene')).display})`,returnByValue:true});
console.log("state:", r.result?.result?.value);
// scroll to character section, screenshot viewport
const pos = await send("Runtime.evaluate",{expression:`Math.round(document.querySelector('.character-stage').getBoundingClientRect().top + scrollY) - 150`,returnByValue:true});
await send("Runtime.evaluate",{expression:`window.scrollTo(0, ${pos.result.result.value})`});
await sleep(1200);
const s = await send("Page.captureScreenshot",{format:"png"});
if (s.result?.data) writeFileSync(`${OUT}/ember-skin-view.png`, Buffer.from(s.result.data,"base64"));
console.log("viewport shot saved at", pos.result.result.value);
// canvas pixel probe
r = await send("Runtime.evaluate",{expression:`(() => {
  const c = document.querySelector('.character-scene canvas');
  if (!c) return 'no canvas';
  const t = document.createElement('canvas'); t.width=c.width; t.height=c.height;
  const x = t.getContext('2d'); x.drawImage(c, 0, 0);
  const d = x.getImageData(0,0,t.width,t.height).data;
  let lit=0, colored=0;
  for (let i=0;i<d.length;i+=16){ const l=d[i]+d[i+1]+d[i+2]; if(l>40)lit++; if(Math.abs(d[i]-d[i+1])>15||Math.abs(d[i+1]-d[i+2])>15)colored++; }
  return JSON.stringify({size:[t.width,t.height], lit, colored});
})()`,returnByValue:true});
console.log("canvas probe:", r.result?.result?.value);
console.log("errors:", errors.length?errors.slice(0,4):"NONE");
ws.close();edge.kill();process.exit(0);
