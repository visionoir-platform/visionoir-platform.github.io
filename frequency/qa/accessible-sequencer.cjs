const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright-core');

// Run against the served production build (origin is the first argument).
(async () => {
  const {createProject, validateProject} = await import('../audio/model.js');
  const project = createProject();
  project.name = 'QA · Griglia';
  project.tracks[0].name = 'Linea A';
  project.tracks[1].name = 'Linea B';
  project.scenes[0].patterns[0].length = 8;
  project.scenes[0].patterns[0].steps[0] = {note:60, velocity:.64, accent:true};
  validateProject(project);
  const browser = await chromium.launch({executablePath:process.env.FREQUENCY_BROWSER_EXEC});
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(new URL('/frequency/?lang=it', process.argv[2] || 'http://127.0.0.1:4270').href);
    const grid = page.getByRole('grid', {name:'Sequencer'});
    await grid.waitFor();
    await page.locator('#project-file').setInputFiles({
      name:'accessibilita.json', mimeType:'application/json', buffer:Buffer.from(JSON.stringify(project)),
    });
    await page.waitForFunction(name => document.getElementById('notice').textContent.includes(name), project.name);
    assert.equal(await grid.locator('button[tabindex="0"]').count(),1);
    const ax = await grid.ariaSnapshot();
    assert.match(ax,/rowheader/);
    assert.match(ax,/columnheader/);
    assert.match(ax,/gridcell/);
    const initial = grid.getByRole('button',{name:/Linea A · Step 1 · Nota C4 · Dinamica 64\s*% · Accento/,pressed:true});
    assert.equal(await initial.count(),1);
    const press = key => page.keyboard.press(key);
    async function focusIs(channel, pos) {
      const active = await page.evaluate(() => ({...document.activeElement.dataset}));
      assert.equal(active.channel,String(channel));
      assert.equal(active.pos,String(pos));
    }
    await page.locator('[data-action="page-next"]').focus();
    await press('Tab');
    await focusIs(0,0);
    await press('F2');
    const dialog = page.getByRole('dialog',{name:'Linea A / Step 1'});
    await dialog.waitFor();
    const pitch = dialog.getByRole('spinbutton',{name:/MIDI/});
    // The first two reachable buttons are close and next. Previous is disabled.
    await press('Tab'); await press('Tab');
    assert.ok(await pitch.evaluate(el => el === document.activeElement));
    await press('ControlOrMeta+a'); await page.keyboard.type('64'); await press('Tab');
    await press('Escape');
    await focusIs(0,0);
    assert.equal(await grid.getByRole('button',{name:/Linea A · Step 1 · Nota E4 · Dinamica 64\s*% · Accento/,pressed:true}).count(),1);
    await press('End'); await focusIs(0,7);
    await press('ArrowDown'); await focusIs(1,7);
    await press('ArrowRight'); await focusIs(1,8);
    await press('ArrowUp'); await focusIs(0,7);
    await press('Space'); await focusIs(0,7);
    const edited = grid.locator('[data-channel="0"][data-pos="7"]');
    assert.equal(await edited.getAttribute('aria-pressed'),'true');
    await press('Space');
    assert.equal(await edited.getAttribute('aria-pressed'),'false');
    assert.notEqual(await page.locator('html').getAttribute('data-play'),'on');
    await press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement.dataset.field),'length');
    await press('Shift+Tab'); await focusIs(0,7);
    await press('Home');
    assert.equal(await page.evaluate(() => document.activeElement.dataset.action),'channel');
    await press('ArrowRight'); await focusIs(0,0);
    const action = id => page.locator('[data-action="' + id + '"]').first();
    const format = page.locator('dialog [data-field="format"]');
    const note = page.locator('dialog #export-contents');
    const italian = require('../locales/it.json').exportProjectContents;
    await action('export').click();
    assert.equal(await format.getAttribute('aria-describedby'), 'export-contents');
    assert.equal(await note.innerText(), '');
    for (const choice of ['vfreq', 'json', 'zip', 'stems', 'midi', 'wav']) {
      await format.selectOption(choice);
      assert.equal(await note.innerText(), ['midi', 'wav'].includes(choice) ? '' : italian);
    }
    await format.selectOption('stems');
    await press('Escape');
    await action('settings').click();
    await page.locator('dialog [data-field="lang"]').selectOption('fr-CH');
    await page.waitForFunction(() => document.documentElement.lang === 'fr-CH');
    await press('Escape');
    await action('export').click();
    assert.equal(await format.inputValue(), 'stems');
    assert.equal(await note.innerText(), require('../locales/fr.json').exportProjectContents);
    assert.deepEqual(errors,[]);
    console.log(JSON.stringify({browser:browser.version(), tabStops:1, nativePress:true, pitch:'C4 → E4',
      velocity:.64, accentPreserved:true, shortPatternNavigation:true, exitAndReentry:true, accessibleRoles:true, errors}));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
