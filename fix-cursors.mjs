/* tightens each cursor SVG to its content bbox and sizes it for a visible cursor */
import { readFileSync, writeFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
const OUT = "C:/Users/fortn/AppData/Local/Temp";
const DIR = "C:/Users/fortn/ember-site/assets/brand/";
const FILES = ["main.svg","hand cursor.svg","type.svg","hourglass.svg","diagonal.svg","resize horizontal.svg","resize vertical.svg"];
const edge = spawn("C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  ["--headless=new","--remote-debugging-port=9389","--user-data-dir="+OUT+"/edge-cu","about:blank"], { stdio: "ignore" });
async function t(){for(let i=0;i<40;i++){try{const r=await fetch("http://127.0.0.1:9389/json/list");const l=await r.json();const p=l.find(x=>x.type==="page");if(p)return p.webSocketDebuggerUrl;}catch{}await sleep(400);}throw new Error("no target");}
const ws=new WebSocket(await t());await new Promise(r=>ws.onopen=r);
let id=0;const pend=new Map();
ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id&&pend.has(m.id)){pend.get(m.id)(m);pend.delete(m.id);}};
const send=(m,p={})=>{const i=++id;ws.send(JSON.stringify({id:i,method:m,params:p}));return new Promise(r=>pend.set(i,r));};
await send("Runtime.enable");await send("Page.navigate",{url:"about:blank"});
for (const f of FILES) {
  const svg = readFileSync(DIR + f, "utf8");
  const r = await send("Runtime.evaluate", {
    expression: `(function(){ var d=document.createElement('div'); d.style.position='absolute'; d.style.left='-9999px'; d.innerHTML=${JSON.stringify(svg)}; document.body.appendChild(d);
      var sv = d.querySelector('svg'); var bb = sv.getBBox();
      return JSON.stringify({x:bb.x,y:bb.y,w:bb.width,h:bb.height}); })()`,
    returnByValue: true,
  });
  const bb = JSON.parse(r.result.result.value);
  const max = 40;
  const scale = max / Math.max(bb.w, bb.h);
  const w = Math.round(bb.w * scale), h = Math.round(bb.h * scale);
  let out = svg
    .replace(/viewBox="[^"]*"/, `viewBox="${bb.x} ${bb.y} ${bb.w} ${bb.h}"`)
    .replace(/width="[^"]*"/, `width="${w}"`).replace(/height="[^"]*"/, `height="${h}"`);
  writeFileSync(DIR + f, out);
  console.log(f, "->", `viewBox tight ${Math.round(bb.w)}x${Math.round(bb.h)} → ${w}x${h}px`);
}
ws.close();edge.kill();process.exit(0);
