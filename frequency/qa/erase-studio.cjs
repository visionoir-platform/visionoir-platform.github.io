// Exercise the normal erasure workflow in a disposable browser context on a loopback build.
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const origin = new URL(process.env.FREQUENCY_URL || 'http://127.0.0.1:4248');
if (!['127.0.0.1', 'localhost', '[::1]'].includes(origin.hostname)) throw Error('A loopback build is required');

async function entries(page) {
  return page.evaluate(() => new Promise((resolve, reject) => {
    const request = indexedDB.open('visionoir-frequency-v1');
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction('projects');
      const keys = tx.objectStore('projects').getAllKeys();
      const rows = tx.objectStore('projects').getAll();
      tx.oncomplete = () => { db.close(); resolve(keys.result.map((key, i) => [key, rows.result[i]?.name])); };
    };
  }));
}
const button = (page, action) => page.locator('[data-action="' + action + '"]').first();
async function eraseDialog(page) {
  await button(page, 'settings').click();
  await button(page, 'erase').click();
}
async function saveNamed(page, name) {
  await button(page, 'library').click();
  const input = page.locator('[data-field=name]');
  await input.fill(name);
  await input.press('Tab');
  await button(page, 'save-as').click();
  if (await page.locator('#panel').evaluate(el => el.open)) await button(page, 'close').click();
}
(async () => {
  const browser = await chromium.launch({executablePath:process.env.FREQUENCY_BROWSER_EXEC});
  try {
    const context = await browser.newContext({reducedMotion:'reduce'});
    const errors = [];
    context.on('page', page => page.on('pageerror', error => errors.push(error.message)));
    const owner = await context.newPage();
    const url = new URL('/frequency/?lang=it', origin).href;
    await owner.goto(url);
    await saveNamed(owner, 'Synthetic before erase');
    const stale = await context.newPage();
    await stale.goto(url);
    await button(stale, 'library').click();
    assert.equal(await stale.locator('[data-field=name]').inputValue(), 'Synthetic before erase');
    const before = await entries(owner);
    assert(before.some(([k]) => String(k).startsWith('save:')));
    const prefs = ['visionoir-frequency-controls-v1','visionoir.frequency.chromatic.user-preset.v1'];
    await owner.evaluate(keys => {
      for (const key of keys) localStorage.setItem(key, '{"test":true}');
      localStorage.setItem('visionoir-unseen-save-v1', 'keep-game-save');
      localStorage.setItem('visionoir-language', 'it');
    }, prefs);
    await owner.evaluate(async () => {
      const root = await navigator.storage.getDirectory();
      const exports = await root.getDirectoryHandle('frequency-exports', {create:true});
      await exports.getFileHandle('synthetic-export.wav', {create:true});
      await root.getFileHandle('unrelated-file', {create:true});
    });
    await eraseDialog(owner);
    await owner.keyboard.press('Escape');
    assert.deepEqual(await entries(owner), before);
    assert(await owner.evaluate(keys => keys.every(key => localStorage.getItem(key)),prefs));
    await eraseDialog(owner);
    const safeFocus = await owner.evaluate(() => document.activeElement?.dataset?.action === 'cancel-erase');
    // An older non-cooperating tab keeps the upgrade pending until the visitor closes it.
    const blocker = await context.newPage();
    await blocker.goto(new URL('/favicon.svg', origin).href);
    await blocker.evaluate(() => new Promise((resolve, reject) => {
      const req = indexedDB.open('visionoir-frequency-v1', 1);
      req.onsuccess = () => { window.testConnection = req.result; resolve(); };
      req.onerror = () => reject(req.error);
    }));
    const navigations = [owner,stale].map(page => page.waitForEvent('framenavigated', {
      predicate: frame => frame === page.mainFrame() && frame.url() === url
    }));
    await button(owner, 'confirm-erase').click();
    await owner.locator('#panel [role=status]').filter({hasText:'Chiudi le schede'}).waitFor();
    await owner.keyboard.press('Escape');
    assert(await owner.locator('#panel').evaluate(panel => panel.open));
    assert(await owner.evaluate(keys => keys.every(key => localStorage.getItem(key)),prefs));
    await blocker.close();
    await Promise.all(navigations);
    await owner.waitForFunction(keys => keys.every(k=>localStorage.getItem(k)===null),prefs,{timeout:5000});
    await button(owner, 'play').waitFor();
    await button(stale, 'play').waitFor();
    assert.equal(await stale.locator('#panel').evaluate(panel => panel.open), false);
    assert.equal(await owner.evaluate(() => new Promise(resolve => {
      const attempt = indexedDB.open('visionoir-frequency-v1', 1);
      attempt.onerror = () => resolve(attempt.error.name);
      attempt.onsuccess = () => { attempt.result.close(); resolve('unexpected success'); };
    })), 'VersionError');
    assert.equal((await entries(owner)).length,0);
    assert.equal(await owner.evaluate(()=>localStorage.getItem('visionoir-unseen-save-v1')), 'keep-game-save');
    assert.equal(await owner.evaluate(()=>localStorage.getItem('visionoir-language')), 'it');
    assert.deepEqual(await owner.evaluate(async () => {
      const entries = [];
      for await (const key of (await navigator.storage.getDirectory()).keys()) entries.push(key);
      return entries.sort();
    }), ['unrelated-file']);
    await saveNamed(owner, 'Synthetic after erase');
    assert((await entries(owner)).some(([k,n])=>String(k).startsWith('save:') && n==='Synthetic after erase'));
    assert(safeFocus);
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({browser:browser.version(),cancelKeepsProjects:true,safeFocus,scope:'isolated Chromium profile',devicePreferencesCleared:true,temporaryExportsRemoved:true,
      blockedTabGuidance:true,bothTabsReloaded:true,legacyVersionRejected:true,errors,oldTabCannotRestoreErasedWork:true,gameAndLanguagePreserved:true,newWorkCanSave:true}));
  } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
