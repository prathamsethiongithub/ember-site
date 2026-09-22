/* verify.mjs v2 — full protocol for the rebuilt site */
import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";
const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const URL = "file:///C:/Users/fortn/ember-site/index.html";
const OUT = "C:/Users/fortn/AppData/Local/Temp";
const edge = spawn(EDGE, ["--headless=new","--remote-debugging-port=9360","--user-data-dir="+OUT+"/edge-v2v","--window-size=1440,900","about:blank"], { stdio: "ignore" });
async function t(){for(let i=0;i<40;i++){try{const r=await fetch("http://127.0.0.1:9360/json/list");const l=await r.json();const p=l.find(x=>x.type==="page");if(p)return p.webSocketDebuggerUrl;}catch{}await sleep(400);}throw new Error("no target");}
const ws=new WebSocket(await t());await new Promise(r=>ws.onopen=r);
let id=0;const pend=new Map();const errors=[];
ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id&&pend.has(m.id)){pend.get(m.id)(m);pend.delete(m.id);}
if(m.method==="Runtime.exceptionThrown")errors.push(m.params.exceptionDetails?.text);
if(m.method==="Log.entryAdded"&&m.params.entry.level==="error")errors.push(m.params.entry.text);};
const send=(m,p={})=>{const i=++id;ws.send(JSON.stringify({id:i,method:m,params:p}));return new Promise(r=>pend.set(i,r));};
await send("Runtime.enable");await send("Log.enable");await send("Page.enable");
await send("Page.navigate",{url:URL});await sleep(5000);

// reduced motion
await send("Emulation.setEmulatedMedia",{features:[{name:"prefers-reduced-motion",value:"reduce"}]});
await send("Page.navigate",{url:URL});await sleep(4000);
let r = await send("Runtime.evaluate",{expression:`JSON.stringify({js: document.documentElement.classList.contains('js'), heroCanvas: !!document.querySelector('.hero-scene canvas'), charCanvas: !!document.querySelector('.character-scene canvas'), sub: getComputedStyle(document.querySelector('.hero-sub')).color})`,returnByValue:true});
console.log("reduced-motion:", r.result?.result?.value);

// no-JS
await send("Emulation.setScriptExecutionDisabled",{value:true});
await send("Page.navigate",{url:URL});await sleep(2000);
r = await send("Runtime.evaluate",{expression:`JSON.stringify({js: document.documentElement.classList.contains('js'), heroText: document.querySelector('.hero-title').innerText.slice(0,20), statVisible: getComputedStyle(document.querySelector('.stats')).opacity})`,returnByValue:true});
console.log("no-JS:", r.result?.result?.value);
await send("Emulation.setScriptExecutionDisabled",{value:false});

// perf sweep with both scenes live
await send("Emulation.setEmulatedMedia",{features:[]});
await send("Page.navigate",{url:URL});await sleep(5000);
await send("Runtime.evaluate",{expression:`window.__f=[];(function(){var l=performance.now();function k(t){window.__f.push(t-l);l=t;if(window.__f.length<1400)requestAnimationFrame(k);}requestAnimationFrame(k);})();window.scrollTo(0,0);`});
for (let y=0;y<=5800;y+=55){ await send("Runtime.evaluate",{expression:`window.scrollTo(0,${y})`}); await sleep(14); }
await sleep(400);
r = await send("Runtime.evaluate",{expression:`(()=>{var f=window.__f.filter(x=>x>0&&x<500);var s=f.slice().sort((a,b)=>a-b);return JSON.stringify({n:f.length,p95:(s[Math.floor(s.length*0.95)]||0).toFixed(1),max:Math.max.apply(null,f).toFixed(1),over20:f.filter(x=>x>20).length});})()`,returnByValue:true});
console.log("perf:", r.result?.result?.value);

// mobile pass
await send("Emulation.setDeviceMetricsOverride",{width:390,height:844,deviceScaleFactor:2,mobile:true});
await send("Page.navigate",{url:URL});await sleep(4500);
for (const [name,sel,off] of [["m-hero",null,0],["m-oracle","#oracle",-80],["m-app","#app",-80]]) {
  if (sel) { const p = await send("Runtime.evaluate",{expression:`Math.round(document.querySelector('${sel}').getBoundingClientRect().top+scrollY)${off}`,returnByValue:true}); await send("Runtime.evaluate",{expression:`window.scrollTo(0,${p.result.result.value})`}); }
  await sleep(800);
  const s = await send("Page.captureScreenshot",{format:"png"});
  if (s.result?.data) writeFileSync(`${OUT}/ember-v2-${name}.png`, Buffer.from(s.result.data,"base64"));
  console.log(name,"saved");
}
await send("Emulation.clearDeviceMetricsOverride");
console.log("console errors:", errors.length===0?"NONE":errors.slice(0,6));
ws.close();edge.kill();process.exit(0);
