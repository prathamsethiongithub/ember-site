import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const OUT = "C:/Users/fortn/AppData/Local/Temp";
const edge = spawn(EDGE, ["--headless=new","--disable-gpu","--use-gl=swiftshader","--remote-debugging-port=9340","--user-data-dir="+OUT+"/edge-lum","--window-size=1280,800","about:blank"], { stdio: "ignore" });
async function t(){for(let i=0;i<30;i++){try{const r=await fetch("http://127.0.0.1:9340/json/list");const l=await r.json();const p=l.find(x=>x.type==="page");if(p)return p.webSocketDebuggerUrl;}catch{}await sleep(400);}throw new Error("no target");}
const ws=new WebSocket(await t());await new Promise(r=>ws.onopen=r);
let id=0;const pend=new Map();ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id&&pend.has(m.id)){pend.get(m.id)(m);pend.delete(m.id);}};
const send=(m,p={})=>{const i=++id;ws.send(JSON.stringify({id:i,method:m,params:p}));return new Promise(r=>pend.set(i,r));};
await send("Runtime.enable");await send("Page.enable");
await send("Page.navigate",{url:"file:///C:/Users/fortn/ember-site/index.html"});await sleep(4000);
await send("Runtime.evaluate",{expression:`window.scrollTo(0,1440)`});await sleep(900);
const res = await send("Runtime.evaluate",{expression:`(() => {
  const c = document.querySelector('#s1 canvas');
  const t = document.createElement('canvas'); t.width=c.width; t.height=c.height;
  const ctx = t.getContext('2d'); ctx.drawImage(c, 0, 0);
  const W=t.width,H=t.height; const d = ctx.getImageData(0,0,W,H).data;
  let minY=1e9,maxY=-1;
  for (let y=0;y<H;y+=3) for (let x=0;x<W;x+=3) { const i=(y*W+x)*4; if (d[i]+d[i+1]+d[i+2]>40){ if(y<minY)minY=y; if(y>maxY)maxY=y; } }
  const bands=[];
  for (let b=0;b<8;b++) {
    const y0=Math.round(minY+(maxY-minY)*b/8), y1=Math.round(minY+(maxY-minY)*(b+1)/8);
    let sum=0,n=0;
    for (let y=y0;y<y1;y+=2) for (let x=0;x<W;x+=2) { const i=(y*W+x)*4; const l=d[i]+d[i+1]+d[i+2]; if(l>40){ sum+=l; n++; } }
    bands.push(n? Math.round(sum/n) : 0);
  }
  return JSON.stringify({bands, minY, maxY});
})()`,returnByValue:true});
console.log(res.result?.result?.value);
ws.close();edge.kill();process.exit(0);
