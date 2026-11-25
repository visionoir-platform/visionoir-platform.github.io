// A fresh browser origin serves the compiled studio. Corrupt exactly one response
// and remove two cached files to exercise recovery without touching an installed app.
const assert = require('node:assert/strict');
const {readFile} = require('node:fs/promises');
const {createServer} = require('node:http');
const path = require('node:path');
const {chromium} = require('playwright-core');

async function main() {
  const root = path.resolve(process.argv[2] || 'dist');
  const sw = await readFile(path.join(root,'frequency/sw.js'),'utf8');
  const [,version,assets] = sw.match(/CACHE='([^']+)', ASSETS=(\[[^;]+\]);/);
  const urls = JSON.parse(assets);
  const missing = [urls.find(u=>/\/processor-[^/]+\.js$/.test(u)), '/frequency/licenses/LAME-notice.txt'];
  assert(missing.every(u=>urls.includes(u)));
  const allowed = new Set([...urls,'/frequency/sw.js']);
  const requests = [];
  let corrupt;
  const types = {'.js':'application/javascript','.html':'text/html','.json':'application/json','.webmanifest':'application/manifest+json','.css':'text/css','.svg':'image/svg+xml','.woff2':'font/woff2','.png':'image/png'};
  const server = createServer(async (req,res)=>{
    try {
      const url = new URL(req.url,'http://localhost').pathname;
      const file = url==='/frequency/' ? '/frequency/index.html' : url;
      if (!allowed.has(file)) { res.writeHead(404);res.end();return; }
      requests.push(file);
      res.writeHead(200,{'Content-Type':types[path.extname(file)] || 'text/plain','Cache-Control':'no-store'});
      res.end(file===corrupt ? 'unavailable revision' : await readFile(path.join(root,file)));
    } catch {res.destroy();}
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  let browser;
  try {
    browser = await chromium.launch({executablePath:process.env.FREQUENCY_BROWSER_EXEC});
    const context = await browser.newContext({reducedMotion:'reduce'});
    const page = await context.newPage(), errors=[];
    page.on('pageerror', error=>errors.push(error.message));
    const click = id => page.locator('[data-action="'+id+'"]').first().click();
    const texts = JSON.parse(await readFile(path.resolve(__dirname,'../locales/it.json'),'utf8'));
    const status = key => page.waitForFunction(value=>document.querySelector('#offline-status')?.textContent.startsWith(value),texts[key]);
    await page.goto('http://127.0.0.1:'+server.address().port+'/frequency/?lang=it');
    await click('library');
    const title = page.locator('[data-field="name"]');
    await title.fill('Ripresa dopo riparazione'); await title.press('Tab');
    await click('save-as');
    if (await page.locator('#panel').evaluate(e=>e.open)) await click('close');
    await click('settings'); await status('offlineNotSaved');
    await page.evaluate(()=>Object.defineProperty(navigator.storage,'estimate',{configurable:true,value:async()=>({usage:10,quota:11})}));
    await click('offline'); await status('offlineSpace');
    assert.equal(await page.evaluate(async()=>!!(await navigator.serviceWorker.getRegistration())),false);
    await page.evaluate(()=>delete navigator.storage.estimate);
    await click('offline'); await status('offlineReady');
    await page.waitForFunction(()=>!!navigator.serviceWorker.controller);
    const cacheHas = () => page.evaluate(async ([version,files])=>{
      const cache = await caches.open(version);
      return await Promise.all(files.map(async u=>!!(await cache.match(u))));
    },[version,missing]);
    assert.deepEqual(await cacheHas(),[true,true]);
    await page.evaluate(async ([v,files])=>{
      const cache=await caches.open(v); await Promise.all(files.map(u=>cache.delete(u)));
    },[version,missing]);
    await click('close'); await click('settings'); await status('offlineMissing');
    await click('preflight');
    assert((await page.locator('.preflight').innerText()).includes(texts.offlineMissing));
    await click('close'); await click('settings'); await status('offlineMissing');
    corrupt=missing[0]; const failedAt=requests.length;
    await click('offline'); await status('offlineRetry');
    assert(requests.slice(failedAt).includes(corrupt));
    assert.deepEqual(await cacheHas(),[false,false]);
    corrupt=undefined; const repairedAt=requests.length;
    await click('offline'); await status('offlineReady');
    assert.deepEqual(requests.slice(repairedAt).filter(u=>urls.includes(u)).sort(),[...missing].sort());
    assert.deepEqual(await cacheHas(),[true,true]);
    await context.setOffline(true); await page.reload();
    await click('library'); assert.equal(await title.inputValue(),'Ripresa dopo riparazione');
    await click('close'); await click('settings'); await status('offlineReady');
    await click('offline'); await status('offlineReady'); await click('close');
    await click('play');
    await page.waitForFunction(()=>document.documentElement.dataset.play==='on' && parseFloat(document.getElementById('db').textContent)>-70);
    const level = await page.locator('#db').innerText(); await click('stop'); assert.deepEqual(errors,[]);
    console.log(JSON.stringify({chrome:browser.version(),version,quotaBeforeInstall:true,incompleteReported:true,integrityFailureKeptBothMissing:true,repaired:missing,offlineSavedProject:true,offlineMaster:level}));
  } finally { if (browser) await browser.close(); await new Promise(resolve=>server.close(resolve)); }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
