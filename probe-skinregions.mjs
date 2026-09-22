import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
const OUT = "C:/Users/fortn/AppData/Local/Temp";
const edge = spawn("C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  ["--headless=new","--remote-debugging-port=9390","--user-data-dir="+OUT+"/edge-sr","about:blank"], { stdio: "ignore" });
async function t(){for(let i=0;i<40;i++){try{const r=await fetch("http://127.0.0.1:9390/json/list");const l=await r.json();const p=l.find(x=>x.type==="page");if(p)return p.webSocketDebuggerUrl;}catch{}await sleep(400);}throw new Error("no target");}
const ws=new WebSocket(await t());await new Promise(r=>ws.onopen=r);
let id=0;const pend=new Map();
ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id&&pend.has(m.id)){pend.get(m.id)(m);pend.delete(m.id);}};
const send=(m,p={})=>{const i=++id;ws.send(JSON.stringify({id:i,method:m,params:p}));return new Promise(r=>pend.set(i,r));};
await send("Runtime.enable");await send("Page.enable");
await send("Page.navigate",{url:"file:///C:/Users/fortn/ember-site/index.html"});
await sleep(4000);
// sample the skin: front-face regions of each limb + tint them
const expr = `new Promise(function(res){
  var img = new Image();
  img.onload = function(){
    var c = document.createElement('canvas'); c.width = 64; c.height = 64;
    var x = c.getContext('2d'); x.drawImage(img, 0, 0);
    function avg(x0,y0,w,h){ var d = x.getImageData(x0,y0,w,h).data; var r=0,g=0,b=0,n=d.length/4;
      for(var i=0;i<d.length;i+=4){ r+=d[i]; g+=d[i+1]; b+=d[i+2]; }
      return [Math.round(r/n), Math.round(g/n), Math.round(b/n)]; }
    var out = {
      armR_front:  avg(44,20,4,12),   // skin right-arm front
      armL_front:  avg(36,52,4,12),   // skin left-arm front
      legR_front:  avg(4,20,4,12),
      legL_front:  avg(20,52,4,12),
      torso_front: avg(20,20,8,12),
      head_front:  avg(8,8,8,8),
      armR_jacket: avg(44,36,4,12),
      armL_jacket: avg(52,52,4,12),
    };
    res(JSON.stringify(out));
  };
  img.onerror = function(){ res('ERR'); };
  img.src = window.EMBER_SKIN_DATA || document.querySelector('img') && '';
})`;
// skin-data.js defines the data URL — find its global name first
const g = await send("Runtime.evaluate",{expression:`Object.keys(window).filter(function(k){return /skin/i.test(k)}).join(',')`,returnByValue:true});
console.log("skin globals:", g.result?.result?.value);
const r2 = await send("Runtime.evaluate",{expression: expr.replace('img.src = window.EMBER_SKIN_DATA || document.querySelector(\'img\') && \'\';',
  "img.src = window.EMBER_SKIN_URL || window.SKIN_DATA_URL || window.EMBER_SKIN_DATA_URL || (function(){for(var k in window){ if(typeof window[k]==='string'&&window[k].indexOf('data:image')===0) return window[k];} return '';})();"),
  awaitPromise:true, returnByValue:true});
console.log("regions:", r2.result?.result?.value);
ws.close();edge.kill();process.exit(0);
