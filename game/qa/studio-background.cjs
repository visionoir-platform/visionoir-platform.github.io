// Real tab foregrounding needs a headed browser. Use an isolated profile and a served build.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const {spawn,execFileSync}=require('node:child_process');
const {tmpdir}=require('node:os');
const path=require('node:path');
const {setTimeout:delay}=require('node:timers/promises');
const base=process.env.QA_URL || 'http://127.0.0.1:4214';
const errors=[], proof={base,errors};
async function state(page) {
  return page.evaluate(()=>{
    const audio=[...document.querySelectorAll('audio')].find(a=>!a.paused);
    return {visibility:document.visibilityState,pressed:document.querySelector('#sound-toggle').getAttribute('aria-pressed'),
      time:audio?.currentTime,muted:audio?.muted,volume:audio?.volume,src:audio?.src,playing:[...document.querySelectorAll('audio')].filter(a=>!a.paused).length,
      metadata:navigator.mediaSession?.metadata?.title,mediaState:navigator.mediaSession?.playbackState};
  });
}
(async()=>{
  const profile=await fs.mkdtemp(path.join(tmpdir(),'visionoir-studio-browser-'));
  // Connect to an ordinary headed Chrome profile. Playwright's own launch mode
  // permanently focuses every page and disables some background throttling.
  const child=spawn(process.env.BROWSER_BIN||chromium.executablePath(),[
    '--user-data-dir='+profile,'--remote-debugging-port=0','--remote-debugging-address=127.0.0.1',
    '--no-first-run','--no-default-browser-check','about:blank',
  ],{stdio:'ignore'});
  let browser;
  try {
    let port;
    for(let attempt=0;attempt<100&&!port;attempt++){
      try{port=(await fs.readFile(path.join(profile,'DevToolsActivePort'),'utf8')).split('\n')[0];}
      catch{await delay(100);}
    }
    assert(port,'Timed out opening the isolated browser');
    browser=await chromium.connectOverCDP('http://127.0.0.1:'+port,{noDefaults:true});
    proof.browser=browser.version();const ctx=browser.contexts()[0];
    const p=await ctx.newPage();p.on('pageerror',e=>errors.push(e.message));p.setDefaultTimeout(12000);
    await p.goto(base+'/it/');const toggle=p.locator('#sound-toggle');
    // Do not alter autoplay policy. Start with a real click if the new profile requires it.
    await toggle.waitFor();await p.waitForFunction(()=>document.readyState==='complete');
    await p.waitForTimeout(350);proof.initial=await state(p);
    if(proof.initial.pressed!=='true')await toggle.click();
    await p.waitForFunction(()=>document.querySelector('#sound-toggle').getAttribute('aria-pressed')==='true');
    await p.locator('#track-select').selectOption('acid');
    await p.waitForFunction(()=>[...document.querySelectorAll('audio')].filter(a=>!a.paused).length===1 && [...document.querySelectorAll('audio')].some(a=>!a.paused&&a.src.includes('acid-mode')&&a.currentTime>.8));
    proof.beforeHide=await state(p);assert.equal(proof.beforeHide.metadata,'IMPULSO');
    // Open a genuine foreground tab. No fake visibility events or lifecycle overrides.
    const other=await ctx.newPage();await other.goto('about:blank');await other.bringToFront();
    await p.waitForFunction(()=>document.hidden,null,{polling:100});
    proof.hiddenStart=await state(p);await new Promise(r=>setTimeout(r,2800));proof.hiddenEnd=await state(p);
    assert.equal(proof.hiddenEnd.pressed,'true');assert.equal(proof.hiddenEnd.playing,1);
    assert(proof.hiddenEnd.time-proof.hiddenStart.time>2,'Native media clock did not advance in background');
    await p.bringToFront();await p.waitForFunction(()=>!document.hidden);
    if(process.env.QA_MAC_HIDE==='1' && process.platform==='darwin'){
      // Hide only the isolated browser we launched. macOS gives another app the foreground.
      const changeApp=action=>execFileSync('swift',['-e',`
        import AppKit
        import Foundation
        guard let app = NSRunningApplication(processIdentifier: Int32(CommandLine.arguments[1])!),
              ["com.google.Chrome","org.chromium.Chromium"].contains(app.bundleIdentifier ?? "") else {exit(2)}
        let hide = CommandLine.arguments[2] == "hide"
        if hide { _ = app.hide() } else { _ = app.unhide(); _ = app.activate() }
        RunLoop.current.run(until:Date().addingTimeInterval(0.4))
        print(app.isHidden, app.isActive)
      `,String(child.pid),action],{encoding:'utf8',timeout:15000}).trim();
      try {
        proof.backgroundApp=changeApp('hide');
        assert(proof.backgroundApp==='true false','macOS did not background the test browser');
        proof.appStart=await state(p);await delay(2300);proof.appEnd=await state(p);
        assert(proof.appEnd.time-proof.appStart.time>1.7 && proof.appEnd.playing===1);
      }finally{changeApp('show');await p.bringToFront();}
    }
    await p.locator('#mute').click();proof.muted=await state(p);assert.equal(proof.muted.muted,true);
    await other.bringToFront();await p.waitForFunction(()=>document.hidden,null,{polling:100});
    assert.equal((await state(p)).muted,true);
    await p.bringToFront();await p.locator('#mute').click();
    await toggle.click();await p.waitForFunction(()=>document.querySelector('#sound-toggle').getAttribute('aria-pressed')==='false');
    await other.bringToFront();await p.waitForFunction(()=>document.hidden,null,{polling:100});await p.bringToFront();
    proof.paused=await state(p);assert.equal(proof.paused.playing,0);
    await toggle.click();await p.waitForFunction(()=>document.querySelector('#sound-toggle').getAttribute('aria-pressed')==='true');
    // Observe actual pause and pagehide when travelling from the studio into the game.
    const lifecycle=[];
    await p.exposeFunction('captureStudioExit',value=>lifecycle.push(value));
    await p.evaluate(()=>{const capture=()=>window.captureStudioExit([...document.querySelectorAll('audio')].map(a=>({paused:a.paused,src:a.currentSrc.split('/').pop()})));
      document.querySelector('#unseen-door').addEventListener('click',capture);window.addEventListener('pagehide',capture);});
    await p.locator('#unseen-door').click();await p.waitForSelector('[data-act=start]');
    assert(lifecycle.some(batch=>batch.length>0&&batch.every(a=>a.paused)),'Studio decks still audible at game hand-off');
    proof.gameHandoff=lifecycle;proof.game=p.url();await p.close();assert(p.isClosed());await other.close();
    assert.deepEqual(errors,[]);console.log(JSON.stringify(proof));
    if(process.env.QA_PROOF)await fs.writeFile(process.env.QA_PROOF,JSON.stringify(proof,null,2)+'\n');
  }finally{
    await browser?.close();child.kill('SIGTERM');
    await fs.rm(profile,{recursive:true,force:true,maxRetries:3,retryDelay:200});
  }
})().catch(e=>{console.error(e);process.exitCode=1;});
