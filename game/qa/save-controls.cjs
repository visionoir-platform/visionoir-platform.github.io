// Run with Playwright against a local build, always in a fresh browser profile.
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const url = new URL(process.env.FREQUENCY_URL || 'http://127.0.0.1:4187/');
if (!['127.0.0.1','localhost','[::1]'].includes(url.hostname)) throw Error('Local test build required');
const save = 'visionoir-unseen-save-v1';
(async () => {
  const browser = await chromium.launch({headless:true, executablePath:process.env.CHROME_PATH});
  try {
    const page = await browser.newPage({viewport:{width:390,height:844},hasTouch:true,reducedMotion:'reduce'});
    const errors = [];
    page.on('pageerror', e=>errors.push(e.message));
    const click = id=>page.locator('[data-act="'+id+'"]').click();
    await page.goto(new URL('/it/',url).href);
    await page.locator('#unseen-door').click();
    await click('start');
    await click('options');
    const imported = {version:1,cleared:[],cores:[],records:{},heroes:[],lastHero:1,lastStage:0,
      checkpoint:{stage:0,hero:1,marker:0,time:22,score:600,rings:12,energy:40,secrets:0}};
    await page.locator('#import').setInputFiles({name:'user-save.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(imported))});
    await page.waitForFunction(key => JSON.parse(localStorage.getItem(key))?.checkpoint?.score===600,save);
    const before = await page.evaluate(key=>localStorage.getItem(key),save);
    await click('erase-save');
    assert(await page.locator('[data-act=keep-save]').evaluate(e=>e===document.activeElement));
    await page.keyboard.press('Escape');
    assert.equal(await page.evaluate(key=>localStorage.getItem(key),save),before);
    await click('back');
    assert(await page.locator('[data-act=continue]').isEnabled());
    await click('options');
    const settingsKey='visionoir-unseen-settings-v1';
    const settings=await page.evaluate(key=>localStorage.getItem(key),settingsKey);
    const dl = page.waitForEvent('download');
    await click('export');
    const download = await dl;
    const stream = await download.createReadStream();
    const chunks = [];
    for await(const part of stream) chunks.push(part);
    const backup = JSON.parse(Buffer.concat(chunks));
    assert.deepEqual(backup.checkpoint,imported.checkpoint);
    await click('erase-save');
    await click('confirm-erase');
    await page.waitForSelector('[data-act=continue]:disabled');
    assert.equal(await page.evaluate(key=>localStorage.getItem(key),save),null);
    assert.equal(await page.evaluate(key=>localStorage.getItem(key),settingsKey),settings);
    await page.reload();
    await click('start');
    assert(await page.locator('[data-act=continue]').isDisabled());
    assert.deepEqual(errors,[]);
    console.log(JSON.stringify({browser:browser.version(),platform:process.platform,footerEntry:true,checkpointImport:true,exportMatches:true,cancelKeepsSave:true,erasurePersists:true,settingsPreserved:true}));
  } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
