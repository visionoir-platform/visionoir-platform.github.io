const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const checkSamplerPad = require('./sampler-pad.cjs');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright-core');
const origin = process.argv[2] || 'http://127.0.0.1:4270';

async function check(browser) {
  const context = await browser.newContext({viewport:{width:390,height:844}});
  try {
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    const button = id => page.locator('[data-action="' + id + '"]').first();
    const field = id => page.locator('[data-field="' + id + '"]').first();
    async function snapshot() {
      await button('export').click();
      await field('format').selectOption('json');
      const ready = page.waitForEvent('download');
      await button('render').click();
      const data = JSON.parse(await fs.readFile(await (await ready).path(), 'utf8'));
      await button('close').click();
      return data;
    }
    async function compose(target, section) {
      await button('pattern-tools').click();
      await button('generator-' + target).click();
      await field('gen-genre').selectOption({label:'Dark electro'});
      await field('gen-section').selectOption(String(section));
      await field('gen-seed').fill('222');
      assert.equal(await field('gen-bpm').count(), 0);
      await button('compose').click();
    }
    await page.goto(new URL('/frequency/?lang=it',origin).href);
    await button('step').waitFor();
    await field('scene').selectOption('1');
    await page.locator('[data-action="channel"][data-index="2"]').click();
    const before = await snapshot();
    const scene = before.workspace.scene, channel = 2;
    await compose('pattern',3);
    const withPattern = await snapshot();
    const expectedPattern = structuredClone(before);
    expectedPattern.scenes[scene].patterns[channel] = withPattern.scenes[scene].patterns[channel];
    assert.deepEqual(withPattern, expectedPattern);
    assert.notDeepEqual(withPattern.scenes[scene].patterns[channel], before.scenes[scene].patterns[channel]);

    await button('patches').click();
    await field('gen-timbre-seed').fill('134');
    await button('design-timbre').click();
    assert((await page.locator('[data-timbre-status]').innerText()).includes('134'));
    await page.locator('dialog [data-action="preview"]').click();
    await button('close').click();
    const withTimbre = await snapshot();
    const expectedTimbre = structuredClone(withPattern);
    expectedTimbre.tracks[channel].params = withTimbre.tracks[channel].params;
    assert.deepEqual(withTimbre, expectedTimbre);
    assert.notDeepEqual(withTimbre.tracks[channel].params, withPattern.tracks[channel].params);
    await compose('scene',4);
    const breakdown = await snapshot();
    const expectedScene = structuredClone(withTimbre);
    expectedScene.scenes[scene].patterns = breakdown.scenes[scene].patterns;
    assert.deepEqual(breakdown, expectedScene);
    assert(breakdown.scenes[scene].patterns[0].steps.every(n=>!n));
    await button('undo').click();
    await page.reload();
    assert.deepEqual(await snapshot(), withTimbre);

    const panel = page.locator('#master-analysis');
    const summary = panel.locator('summary');
    await summary.focus();
    await summary.press('Enter');
    const ids = ['lufs-m','lufs-s','tp-max'];
    const readings = () => page.evaluate(ids=>ids.map(id=>document.getElementById(id).textContent),ids);
    assert.deepEqual(await readings(),['—','—','—']);
    await button('play').click();
    await page.waitForFunction(()=>Number.isFinite(Number(document.getElementById('lufs-m').textContent))
      && document.getElementById('lufs-s').textContent === '—');
    await page.waitForFunction(ids=>ids.every(id=>Number.isFinite(Number(document.getElementById(id).textContent))),ids);
    const master = await readings();
    await page.waitForFunction(()=>document.documentElement.dataset.play==='on' && Number.parseFloat(document.querySelector('#db')?.textContent)>-70);
    const meter = await page.locator('#db').innerText();
    await button('stop').click();
    await page.waitForTimeout(150);
    const stopped = await readings();
    await page.waitForTimeout(250);
    assert.deepEqual(await readings(),stopped);
    await summary.press('Enter');
    await page.waitForFunction(()=>!document.getElementById('master-analysis').open);
    await summary.press('Enter');
    await page.waitForFunction(()=>document.getElementById('lufs-s').textContent==='—');
    assert.deepEqual(await readings(),['—','—','—']);
    const imported = {...withTimbre, name:'Studio di prova · riapertura'};
    await page.locator('#project-file').setInputFiles({
      name:'riapertura.json', mimeType:'application/json', buffer:Buffer.from(JSON.stringify(imported))
    });
    await page.waitForFunction(name=>document.querySelector('#notice').textContent.includes(name),imported.name);
    await page.reload();
    assert.deepEqual(await snapshot(), imported);

    const midiEvents = Buffer.from([
      0, 255, 81, 3, 7, 161, 32,
      0, 176, 7, 80,
      0, 176, 10, 96,
      0, 144, 48, 96,
      0, 144, 55, 96,
      129, 112, 128, 48, 0,
      0, 128, 55, 0,
      129, 112, 144, 60, 101,
      120, 128, 60, 0,
      0, 255, 47, 0,
    ]);
    const header = Buffer.from('4d546864000000060000000101e04d54726b00000000', 'hex');
    header.writeUInt32BE(midiEvents.length, header.length - 4);
    const fileInput = page.locator('#project-file');
    await fileInput.setInputFiles({
      name:'rientro.mid', mimeType:'audio/midi', buffer:Buffer.concat([header, midiEvents]),
    });
    await page.waitForFunction(()=>document.querySelector('#notice').textContent.includes('rientro'));
    assert.equal(await page.locator('[data-tab="arrangement"]').getAttribute('aria-pressed'), 'true');
    const fromMidi = await snapshot();
    assert.equal(fromMidi.bpm, 120);
    assert.ok(fromMidi.tracks.every(track=>track.volume === 80/127 && track.pan === 32/63));
    assert.deepEqual(fromMidi.scenes[0].patterns.flatMap(pattern=>pattern.steps.filter(Boolean))
      .flatMap(note=>[note.note,...(note.chord ?? []).map(interval=>note.note+interval)])
      .sort((a,b)=>a-b), [48,55,60]);
    await button('undo').click();
    assert.deepEqual(await snapshot(), imported);
    await button('redo').click();
    assert.deepEqual(await snapshot(), fromMidi);
    await fileInput.setInputFiles({name:'incompleto.mid',mimeType:'audio/midi',buffer:header});
    await page.waitForFunction(()=>document.querySelector('#notice').textContent.includes('MIDI è danneggiato'));
    await page.reload();
    assert.deepEqual(await snapshot(), fromMidi);
    assert.deepEqual(errors, []);
    return {origin,browser:browser.version(),channel:before.tracks[channel].name,scene,seed:134,meter,master,
      editedPatternOnly:true,editedTimbreOnly:true,editedSceneOnly:true,undo:true,reopened:true,reopenedImport:true,
      midiImport:{bpm:fromMidi.bpm,tracks:fromMidi.tracks.length,undoRedo:true,invalidPreservesProject:true},errors};
  } finally { await context.close(); }
}

(async()=>{
  const browser = await chromium.launch({executablePath:process.env.FREQUENCY_BROWSER_EXEC});
  try {
    const composition = await check(browser);
    const result = JSON.stringify({...composition, samplerPad:await checkSamplerPad(browser, origin)},null,2);
    if (process.env.FREQUENCY_PROOF) await fs.writeFile(process.env.FREQUENCY_PROOF,result+'\n');
    console.log(result);
  } finally {await browser.close();}
})().catch(err=>{console.error(err);process.exitCode=1;});
