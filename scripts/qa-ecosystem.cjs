const assert = require('node:assert/strict');
const {chromium,firefox,webkit} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs/promises');
const url = new URL(process.env.VISIONOIR_QA_URL || 'http://127.0.0.1:4192/');
const report = [];
const cases = [
  ['Chromium',chromium,process.env.CHROME_PATH],
  ['Firefox',firefox,process.env.FIREFOX_PATH],
  ['WebKit',webkit,process.env.WEBKIT_PATH]
];
async function run([name, engine, executablePath]) {
  const scratch = name==='Firefox' && process.platform==='darwin'
    ? await fs.mkdtemp(require('node:path').join(require('node:os').tmpdir(),'visionoir-firefox-')) : null;
  let browser;
  try {
    browser = await engine.launch({headless:true,executablePath,env:scratch?{...process.env,CFFIXED_USER_HOME:scratch}:process.env});
  } catch(error) {
    if(scratch) await fs.rm(scratch,{recursive:true,force:true});
    throw error;
  }
  try {
    const context = await browser.newContext({hasTouch:name!=='Firefox', viewport:{width:390,height:844},reducedMotion:'reduce'});
    // A controlled destination lets CI check the browser target without
    // contacting Instagram or claiming to verify the account's public status.
    const social = await context.newPage();
    const profile = 'https://www.instagram.com/visionoir_/';
    await context.route(profile, route => route.fulfill({status:200,contentType:'text/plain',body:'QA navigation'}));
    await social.goto(new URL('/it/',url).href);
    const instagram = social.getByRole('link',{name:/Instagram/i}).first();
    assert.equal(await instagram.getAttribute('href'),profile);
    await instagram.click();
    await social.waitForURL(profile);
    assert.equal(context.pages().length,1);
    await social.close();
    await context.unroute(profile);
    const page = await context.newPage();
    const external = new Set(), errors = [], outlineRequests = [];
    page.on('request',request=>{
      const target = new URL(request.url());
      if (/^https?:$/.test(target.protocol) && target.origin !== url.origin) external.add(target.origin);
      if (target.pathname === '/assets/logo-geometry.json') outlineRequests.push(request.url());
    });
    page.on('pageerror',error=>errors.push(error.message));
    await page.goto(new URL('/it/',url).href);
    const logo = page.locator('#logo-scene');
    await logo.scrollIntoViewIfNeeded();
    const activate=()=>name==='Firefox'?logo.click():logo.tap();
    await activate(); await activate();
    assert.equal(new URL(page.url()).pathname,'/it/');
    await activate();
    await page.waitForURL('**/frequency/**');
    await page.locator('#studio button').first().waitFor();
    assert.equal(await page.locator('html').getAttribute('lang'),'it');
    await page.goto(new URL('/ar/',url).href);
    await page.locator('#logo-scene').focus();
    await page.keyboard.press('Enter');await page.keyboard.press('Enter');await page.keyboard.press('Enter');
    await page.waitForURL('**/frequency/**');
    await page.locator('#studio button').first().waitFor();
    assert.equal(await page.locator('html').getAttribute('dir'),'rtl');
    await page.goto(new URL('/it/',url).href);
    await page.locator('#unseen-door').click();
    await page.waitForURL('**/unseen/**');
    await page.locator('button[data-action="start"], .title-screen .start').first().waitFor();
    const support=page.locator('a[href*="/support/"]').first();
    await support.click();
    await page.waitForURL('**/support/it/**');
    await page.locator('input[value="custom"] + span').click();
    await page.locator('#custom-amount').fill('12,50');
    const inquiry = page.locator('#support-inquiry');
    const draft = new URL(await inquiry.getAttribute('href'));
    assert.equal(draft.protocol,'mailto:');
    assert.equal(draft.pathname,'visionoir.platform@gmail.com');
    assert.equal(draft.searchParams.get('subject'),'Sostieni VISIONOIR');
    assert.match(draft.searchParams.get('body'),/12,50/);
    await page.locator('input[name="amount"][value=""] + span').click();
    assert.equal(new URL(await inquiry.getAttribute('href')).searchParams.has('body'),false);
    await page.locator('footer a[href*="/legal/"]').first().click();
    await page.waitForURL('**/legal/it/**');
    for(const width of [360,390,768,1024,1440,1920]){
      await page.setViewportSize({width,height:width<768?800:960});
      assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2),'legal overflow '+width);
    }
    assert.deepEqual([...external],[]);assert.deepEqual(errors,[]);
    assert.deepEqual(outlineRequests, [], 'Rapid navigation must not start a separate outline JSON request');
    report.push({name,version:browser.version(),touchEmulation:name!=='Firefox',pointerEntry:true,entryKeyboard:true,gameEntry:true,legalSupport:true,widths:[360,390,768,1024,1440,1920],external:[...external],errors});
  } finally {await browser.close();if(scratch)await fs.rm(scratch,{recursive:true,force:true,maxRetries:3}).catch(error=>{if(!['EACCES','EPERM'].includes(error.code))throw error;console.warn('macOS retained a system-protected file in the temporary Firefox profile');});}
}
(async()=>{
 for(const row of cases.filter(row=>!process.env.QA_ENGINE||row[0]===process.env.QA_ENGINE)){try{await run(row);}catch(error){report.push({name:row[0],error:error.message.slice(0,650)});}}
 console.log(JSON.stringify(report,null,2));
 if(process.env.VISIONOIR_QA_REPORT)await fs.writeFile(process.env.VISIONOIR_QA_REPORT,JSON.stringify(report,null,2)+'\n');
 if(report.some(r=>r.error))process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=1});
