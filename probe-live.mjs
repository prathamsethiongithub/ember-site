import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";
const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const OUT = "C:/Users/fortn/AppData/Local/Temp";
const edge = spawn(EDGE, ["--headless=new","--remote-debugging-port=9411","--user-data-dir="+OUT+"/edge-live1","--window-size=1900,940","about:blank"], { stdio: "ignore" });
async function t(){for(let i=0;i<40;i++){try{const r=await fetch("http://127.0.0.1:9411/json/list");const l=await r.json();const p=l.find(x=>x.type==="page");if(p)return p.webSocketDebuggerUrl;}catch{}await sleep(400);}throw new Error("no target");}
const ws=new WebSocket(await t());await new Promise(r=>ws.onopen=r);
let id=0;const pend=new Map();const errs=[];
ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id&&pend.has(m.id)){pend.get(m.id)(m);pend.delete(m.id);}
if(m.method==="Runtime.exceptionThrown")errs.push(m.params.exceptionDetails?.text);
if(m.method==="Log.entryAdded"&&m.params.entry.level==="error")errs.push(m.params.entry.text);};
const send=(m,p={})=>{const i=++id;ws.send(JSON.stringify({id:i,method:m,params:p}));return new Promise(r=>pend.set(i,r));};
await send("Runtime.enable");await send("Log.enable");await send("Page.enable");
await send("Page.navigate",{url:"https://prathamsethiongithub.github.io/ember-site/"});
await sleep(8000);
// top/hero shot
let s = await send("Page.captureScreenshot",{format:"png"});
if (s.result?.data) writeFileSync(`${OUT}/live-top.png`, Buffer.from(s.result.data,"base64"));
// bottom/footer shot
await send("Runtime.evaluate",{expression:`window.scrollTo(0, document.body.scrollHeight)`});
await sleep(2200);
s = await send("Page.captureScreenshot",{format:"png"});
if (s.result?.data) writeFileSync(`${OUT}/live-bottom.png`, Buffer.from(s.result.data,"base64"));
// footer measurements
const st = await send("Runtime.evaluate",{expression:`(function(){
  var lk = document.querySelector('.footer-lockup');
  var btns = Array.from(document.querySelectorAll('.btn-art img')).map(function(b){ var r=b.getBoundingClientRect(); return Math.round(r.width)+'x'+Math.round(r.height); });
  var old = document.querySelector('.footer-burn');
  return JSON.stringify({lockup: lk ? Math.round(lk.getBoundingClientRect().width)+'x'+Math.round(lk.getBoundingClientRect().height) : 'MISSING',
    lockupLoaded: lk ? lk.complete && lk.naturalWidth > 0 : false,
    buttons: btns, oldBurnSpan: old ? 'still present!' : 'removed'});
})()`,returnByValue:true});
console.log("state:", st.result?.result?.value);
console.log("errors:", errs.length ? errs.slice(0,4) : "NONE");
ws.close();edge.kill();process.exit(0);
