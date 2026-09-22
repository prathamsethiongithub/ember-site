import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const OUT = "C:/Users/fortn/AppData/Local/Temp";
const edge = spawn(EDGE, ["--headless=new","--disable-gpu","--use-gl=swiftshader","--remote-debugging-port=9341","--user-data-dir="+OUT+"/edge-em","--window-size=1280,800","about:blank"], { stdio: "ignore" });
async function t(){for(let i=0;i<30;i++){try{const r=await fetch("http://127.0.0.1:9341/json/list");const l=await r.json();const p=l.find(x=>x.type==="page");if(p)return p.webSocketDebuggerUrl;}catch{}await sleep(400);}throw new Error("no target");}
const ws=new WebSocket(await t());await new Promise(r=>ws.onopen=r);
let id=0;const pend=new Map();ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id&&pend.has(m.id)){pend.get(m.id)(m);pend.delete(m.id);}};
const send=(m,p={})=>{const i=++id;ws.send(JSON.stringify({id:i,method:m,params:p}));return new Promise(r=>pend.set(i,r));};
await send("Runtime.enable");await send("Page.enable");
await send("Page.navigate",{url:"file:///C:/Users/fortn/ember-site/index.html"});await sleep(4000);
await send("Runtime.evaluate",{expression:`window.scrollTo(0,1100)`});await sleep(900); // ~50%
const res = await send("Runtime.evaluate",{expression:`(() => {
  const c = document.querySelector('#s1 canvas');
  const t = document.createElement('canvas'); t.width=c.width; t.height=c.height;
  const ctx = t.getContext('2d'); ctx.drawImage(c, 0, 0);
  const W=t.width,H=t.height; const d = ctx.getImageData(0,0,W,H).data;
  let orange=0, cream=0, teal=0, total=0;
  let maxSat=0, maxSatColor=null;
  for (let y=0;y<H;y+=2) for (let x=0;x<W;x+=2) {
    const i=(y*W+x)*4; const r=d[i],g=d[i+1],b=d[i+2];
    const lum=r+g+b; if (lum<50) continue; total++;
    if (r>g && g>b && (r-b)>40) { orange++; if ((r-b)>maxSat){maxSat=r-b; maxSatColor=[r,g,b];} }
    else if (r>200&&g>190&&b>150&&Math.abs(r-g)<40) cream++;
    else if (g>=r && b>r-20) teal++;
  }
  return JSON.stringify({total, orange, cream, teal, maxSat, maxSatColor});
})()`,returnByValue:true});
console.log(res.result?.result?.value);
ws.close();edge.kill();process.exit(0);
