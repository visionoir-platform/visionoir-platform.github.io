/** Standalone media integration check using the installed Playwright library. */
const {chromium,webkit}=require(process.env.PLAYWRIGHT_LIB||'playwright');
const {createServer}=require('node:http');
const {createReadStream,statSync,existsSync,writeFileSync}=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const web=path.resolve(__dirname,'../../public/unseen/audio');
const pageHtml='<button id="unlock">Begin audio test</button><script type="module">import{createGameAudio}from"/unseen/audio/engine.js";window.a=createGameAudio();await a.load();document.querySelector("button").onclick=()=>{window.started=a.play("07")};window.ready=true</script>';
const server=createServer((req,res)=>{
  if(req.url==='/'){res.setHeader('Content-Type','text/html');return res.end(pageHtml);}
  const file=path.join(web,path.basename(req.url));
  if(!existsSync(file)||!statSync(file).isFile()){res.writeHead(404);return res.end();}
  const size=statSync(file).size;
  res.setHeader('Content-Type',file.endsWith('.m4a')?'audio/mp4':file.endsWith('.json')?'application/json':'application/javascript');
  res.setHeader('Accept-Ranges','bytes');
  const match=/bytes=(\d+)-(\d*)/.exec(req.headers.range||'');
  if(match){const start=Number(match[1]),end=match[2]?Math.min(Number(match[2]),size-1):size-1;
    if(start>end){res.writeHead(416);return res.end();}
    res.writeHead(206,{'Content-Range':`bytes ${start}-${end}/${size}`,'Content-Length':end-start+1});
    createReadStream(file,{start,end}).pipe(res);
  }else{res.setHeader('Content-Length',size);createReadStream(file).pipe(res);}
});
(async()=>{
  await new Promise((ok,fail)=>server.once('error',fail).listen(0,'127.0.0.1',ok));
  const result={};
  try{
    for(const [engine,launch] of Object.entries({chromium,webkit})){
      const options={headless:true};
      if(engine==='chromium'&&process.env.CHROME_BIN)options.executablePath=process.env.CHROME_BIN;
      if(engine==='webkit'&&process.env.WEBKIT_BIN)options.executablePath=process.env.WEBKIT_BIN;
      const browser=await launch.launch(options);
      try {
        const page=await browser.newPage({viewport:{width:390,height:844},hasTouch:true});
        const errors=[];page.on('pageerror',error=>errors.push(error.message));
        await page.goto('http://127.0.0.1:'+server.address().port+'/');await page.waitForFunction(()=>window.ready);
        await page.locator('button').click();await page.evaluate(()=>window.started);
        await page.waitForFunction(()=>a.state().time>.12 && a.bands().some(v=>v>.005));
        const counts=await page.evaluate(async()=>{
          const counts={music:0,effects:0};
          for(const song of a.music){await a.play(song.id,{immediate:true});if(a.state().id!==song.id)throw Error(song.id);counts.music++;}
          a.pause();if(!a.state().paused)throw Error('pause');await a.resume();a.seek(1);a.setRepeat(true);
          a.setIntensity(.8);a.transform(true);a.special(3);a.setVolume(.5,.7,.6);
          for(const entry of a.effects){await a.previewEffect(entry.id);if(a.state().id!==entry.id)throw Error(entry.id);counts.effects++;}
          for(const id of ['jump','ring','checkpoint','hit','transform','victory','menu-select'])await a.sfx(id);
          await a.play('21');a.seek(3);await new Promise(r=>setTimeout(r,130));counts.seek=a.state().time;
          a.setRepeat(true);a.seek(a.state().duration-.24);
          const wrapStarted=performance.now();let wrapped=false;
          while(performance.now()-wrapStarted<3500){
            await new Promise(r=>setTimeout(r,45));
            if(a.state().time<.8&&!a.state().paused){wrapped=true;break;}
          }
          if(!wrapped)throw Error('Loop did not wrap');counts.loopWrapped=true;
          const schedule=[];
          for(const id of ['jump','ring','hit']){
            const before=performance.now();await a.sfx(id);schedule.push(+(performance.now()-before).toFixed(2));
          }
          counts.warmScheduleMs=schedule;
          let unknown=false;try{await a.sfx('missing-effect-check');}catch(e){unknown=e instanceof RangeError;}
          if(!unknown)throw Error('Missing effect error not reported');
          a.stop();if(a.state().id||!a.state().paused)throw Error('stop');
          a.dispose();return counts;
        });
        assert.equal(counts.music,39);assert.equal(counts.effects,118);assert(counts.seek>2.5);assert.deepEqual(errors,[]);
        result[engine]={version:browser.version(),...counts,analyserResponded:true,unhandledErrors:errors};
        console.log(engine,result[engine]);
      }finally{await browser.close();}
    }
  }finally{server.close();if(process.env.AUDIO_QA_REPORT)writeFileSync(process.env.AUDIO_QA_REPORT,JSON.stringify(result,null,2)+'\n');}
})().catch(e=>{console.error(e.message);process.exitCode=1;});
