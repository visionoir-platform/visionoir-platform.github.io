const { chromium }=require(process.env.PLAYWRIGHT_PATH || 'playwright');
const fs=require('fs'),path=require('path');
const root=path.resolve(__dirname,'../..');
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROME_BIN,headless:true,args:['--no-sandbox']});
 try{
 const tab=await browser.newPage({viewport:{width:960,height:540}});
 const errors=[];tab.on('pageerror',e=>errors.push(e.message));
 await tab.route('https://art.test/**',route=>{
   const p=new URL(route.request().url()).pathname;
   if(p==='/')return route.fulfill({contentType:'text/html',body:'<style>body{margin:0;background:#050509}canvas{width:100vw;height:auto;image-rendering:pixelated;display:block}</style><canvas></canvas>'});
   const f=path.join(root,p.startsWith('/unseen/')?'public':'',p);
   return route.fulfill({path:f});
 });
 await tab.goto('https://art.test/');
 const result=await tab.evaluate(async()=>{
  const {createRenderer}=await import('/game/art/render.js');
  const {createRun,step}=await import('/game/engine/index.js');
  const c=document.querySelector('canvas'),renderer=await createRenderer(c);
  const ctx=c.getContext('2d'),digests=[];
  function signature(){const b=ctx.getImageData(0,0,480,270).data;let sig=0;for(let i=0;i<b.length;i+=17)sig=(sig*31+b[i])>>>0;return sig;}
  for(let i=0;i<5;i++){
   const run=createRun({stage:i*2,hero:i});renderer.draw(run);
   await new Promise(r=>setTimeout(r,80));
   const hashes=[];
   for(let n=0;n<80;n++){step(run,{right:true,jump:n>33&&n<44},1/60);renderer.draw(run);if(n%12===0)hashes.push(signature());}
   digests.push({hero:i,zone:run.stage.zone,unique:new Set(hashes).size,hash:hashes[0]});
  }
  const run=createRun({stage:0,hero:0});
  for(let n=0;n<91;n++)step(run,{right:true,jump:n===81},1/60);
  renderer.draw(run);window.renderer=renderer;window.run=run;
  return digests;
 });
 await tab.screenshot({path:root+'/game/art/proof/gameplay.png'});
 const cinematic=await tab.evaluate(async()=>{
  const {playCinematic}=await import('/game/art/cinematic.js');
  const c=document.querySelector('canvas');window.stopClip=playCinematic(c,{zone:6,kind:'boss',bossId:14});
  const signature=()=>{const d=c.getContext('2d').getImageData(0,0,480,180).data;let h=0;for(let i=0;i<d.length;i+=23)h=(h*31+d[i])>>>0;return h;};
  await new Promise(r=>setTimeout(r,400));const a=signature();
  await new Promise(r=>setTimeout(r,400));const b=signature();return {a,b};
 });
 await tab.locator('canvas').screenshot({path:root+'/game/art/proof/cutscene.png'});
 await tab.evaluate(()=>window.stopClip());
 if(cinematic.a===cinematic.b||errors.length||result.some(t=>t.unique<4))throw Error(JSON.stringify({cinematic,errors,result}));
 const report={cinematic,engine:'chromium',mode:'desktop viewport',canvas:'480x270',errors,result};fs.writeFileSync(root+'/game/art/proof/browser-check.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
