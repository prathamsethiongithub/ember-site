import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const OUT = "C:/Users/fortn/AppData/Local/Temp";
const edge = spawn(EDGE, ["--headless=new","--remote-debugging-port=9361","--user-data-dir="+OUT+"/edge-perf","--window-size=1440,900","about:blank"], { stdio: "ignore" });
async function t(){for(let i=0;i<40;i++){try{const r=await fetch("http://127.0.0.1:9361/json/list");const l=await r.json();const p=l.find(x=>x.type==="page");if(p)return p.webSocketDebuggerUrl;}catch{}await sleep(400);}throw new Error("no target");}
const ws=new WebSocket(await t());await new Promise(r=>ws.onopen=r);
let id=0;const pend=new Map();
ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id&&pend.has(m.id)){pend.get(m.id)(m);pend.delete(m.id);}};
const send=(m,p={})=>{const i=++id;ws.send(JSON.stringify({id:i,method:m,params:p}));return new Promise(r=>pend.set(i,r));};
await send("Runtime.enable");await send("Page.enable");
await send("Page.navigate",{url:"file:///C:/Users/fortn/ember-site/index.html"});await sleep(6000);
// test rAF directly
let r = await send("Runtime.evaluate",{expression:`new Promise(res=>{let n=0;function k(){n++;if(n>=3)res('raf fired '+n);else requestAnimationFrame(k);}requestAnimationFrame(k);setTimeout(()=>res('timeout, n='+n),2000);})`,awaitPromise:true,returnByValue:true});
console.log("raf test:", r.result?.result?.value);
// now the sweep
await send("Runtime.evaluate",{expression:`window.__f=[];(function(){var l=performance.now();function k(t){window.__f.push(t-l);l=t;if(window.__f.length<1400)requestAnimationFrame(k);}requestAnimationFrame(k);})();`});
for (let y=0;y<=5800;y+=55){ await send("Runtime.evaluate",{expression:`window.scrollTo(0,${y})`}); await sleep(14); }
await sleep(500);
r = await send("Runtime.evaluate",{expression:`(()=>{var f=window.__f.filter(x=>x>0&&x<500);var s=f.slice().sort((a,b)=>a-b);return JSON.stringify({n:f.length,p95:(s[Math.floor(s.length*0.95)]||0).toFixed(1),max:f.length?Math.max.apply(null,f).toFixed(1):'-',over20:f.filter(x=>x>20).length});})()`,returnByValue:true});
console.log("perf:", r.result?.result?.value);
ws.close();edge.kill();process.exit(0);
