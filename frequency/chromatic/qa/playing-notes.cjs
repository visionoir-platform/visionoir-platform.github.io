const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

async function fixture() {
  const { createProject, projectFile } = await import('../../audio/model.js');
  const p = createProject('blank');
  p.name = 'QA · Chromatic note gates';
  p.bpm = 150;
  p.metronome = false;
  const dark = { mode:'spectral-echo', quality:'low', warp:.1, light:.2, color:'#000000', rebuild:0 };
  const bright = { ...dark, warp:.9, light:.8, color:'#ffffff' };
  const automation = [{ scene:1, mode:dark.mode, look:dark }];
  p.visual = { presetBank:{ selected:0, slots:[dark, { ...bright, automation }] } };
  const note = { note: 45, velocity: .6, gate: .035 };
  p.scenes[0].patterns[2].steps[0] = note;
  p.scenes[0].patterns[2].steps[2] = { ...note, accent: true };
  p.scenes[0].patterns[6].steps[0] = note;
  p.tracks[6].mute = true;
  p.scenes[0].patterns[8].steps[0] = { ...note, probability: 0 };
  return Buffer.from(await projectFile(p).arrayBuffer());
}

function observe(buffered) {
  const report = window.gateProof = { packets: 0, attack: 0, accent: 0, release: 0, combined: 0, other: 0, shader: 0, frames: 0, contexts: 0, worklets: 0, buffers: 0 };
  const createBuffered = BaseAudioContext.prototype.createScriptProcessor;
  BaseAudioContext.prototype.createScriptProcessor = function(...args) {
    report.buffers++;
    return createBuffered.apply(this,args);
  };
  if (window.AudioWorkletNode) {
    const orig = window.AudioWorkletNode;
    window.AudioWorkletNode = new Proxy(orig,{construct(t,a,n) {
      report.worklets++;
      const node = Reflect.construct(t,a,n);
      node.port.addEventListener('message', event => {
        if (Number.isFinite(report.testLoad) && event.data?.type === 'tick') event.data.data.dspLoad = report.testLoad;
      });
      return node;
    }});
  }
  if (buffered && window.AudioWorklet) AudioWorklet.prototype.addModule = async () => { throw Error('QA buffered fallback'); };
  window.AudioContext = new Proxy(window.AudioContext,{construct(t,a,n) { report.contexts++; return Reflect.construct(t,a,n); }});
  const gl = WebGL2RenderingContext.prototype;
  const draw = gl.drawArrays, lookUniforms = new WeakMap();
  gl.drawArrays = function(mode, first, count) {
    if (report.inspectQuality && mode === this.POINTS) {
      report.visual = { width: this.drawingBufferWidth, points: count,
        history: Boolean(this.getParameter(this.DRAW_FRAMEBUFFER_BINDING)) };
    }
    if (report.lookFrames && mode === this.POINTS && report.lookFrames.length < 200) {
      const program = this.getParameter(this.CURRENT_PROGRAM);
      if (!lookUniforms.has(program)) lookUniforms.set(program,
        ['uWarp','uLight','uTint'].map(name => this.getUniformLocation(program, name)));
      const [warp, light, tint] = lookUniforms.get(program).map(loc => this.getUniform(program, loc));
      report.lookFrames.push([warp, light, ...tint]);
    }
    return draw.call(this, mode, first, count);
  };
  const slots = new WeakSet(), get = gl.getUniformLocation, set = gl.uniform1fv;
  gl.getUniformLocation = function(program,name) {
    const loc = get.call(this,program,name);
    if (loc && /^uVoices(?:\[0\])?$/.test(name)) slots.add(loc);
    return loc;
  };
  gl.uniform1fv = function(loc,values,...args) {
    if (slots.has(loc)) report.shader = Math.max(report.shader,values[2]);
    return set.call(this,loc,values,...args);
  };
  addEventListener('message', e => {
    if (!window.opener || e.source !== window.opener || e.origin !== location.origin ||
        e.data?.id !== new URL(location.href).searchParams.get('output')) return;
    if (e.data.type === 'visionoir.visual.frame') {
      report.frames++;
      report.limited = e.data.signal.audioPressure;
    }
    if (e.data.type !== 'visionoir.visual.notes') return;
    const { attacks, gates, releases, accents } = e.data;
    report.packets++;
    for (let i=0;i<attacks.length;i++) if (i!==2 && attacks[i]) report.other++;
    const kind = accents & 4 ? 'accent' : 'attack';
    if (attacks[2]) report[kind] = Math.max(report[kind], attacks[2]);
    if (releases & 4) report.release++;
    if (attacks[2] && !gates[2] && (releases & 4)) report.combined++;
  });
}

async function verifyAudioPriority(desk, output) {
  await desk.evaluate(() => { window.gateProof.testLoad = .2; });
  await desk.locator('.chromatic-rack summary').click();
  await desk.getByLabel('Qualità', {exact:true}).selectOption('high');
  await desk.getByLabel('Scena visiva', {exact:true}).selectOption('spectral-echo');
  await output.bringToFront();
  await output.evaluate(() => { window.gateProof.inspectQuality = true; });
  await output.waitForFunction(() => !window.gateProof.limited && window.gateProof.visual?.history);
  const full = await output.evaluate(() => window.gateProof.visual);
  await desk.evaluate(() => { window.gateProof.testLoad = .85; });
  await output.waitForFunction(base => {
    const {limited, visual} = window.gateProof;
    return limited && !visual.history && visual.width < base.width * .7 && visual.points < base.points * .5;
  }, full);
  const limited = await output.evaluate(() => ({ ...window.gateProof.visual, notes: window.gateProof.packets }));
  await desk.evaluate(() => { window.gateProof.testLoad = .2; });
  await output.waitForFunction(base => {
    const {limited, visual} = window.gateProof;
    return !limited && visual.history && visual.width === base.width && visual.points === base.points;
  }, full);
  assert.ok(await output.evaluate(n => window.gateProof.packets > n, limited.notes));
  assert.equal(await desk.getByLabel('Qualità', {exact:true}).inputValue(), 'high');
  return { full, limited, recovered: await output.evaluate(() => window.gateProof.visual) };
}

async function verifyLookTransitions(desk, output) {
  const slot = desk.getByLabel('Memoria preset', {exact:true});
  const recall = desk.getByRole('button', {name:'Richiama preset', exact:true});
  const scene = desk.locator('[data-field=scene]').first();
  await scene.selectOption('0');
  await slot.selectOption('0');
  await output.bringToFront();
  const reset = () => output.evaluate(() => { window.gateProof.lookFrames = []; });
  const waitForWarp = value => output.waitForFunction(warp =>
    window.gateProof.lookFrames?.some(frame => Math.abs(frame[0] - warp) < .0001), value);
  await reset();
  await recall.evaluate(button => button.click());
  await waitForWarp(.1);
  async function transition(action, target) {
    await reset();
    await action();
    await waitForWarp(target);
    const frames = await output.evaluate(() => window.gateProof.lookFrames.splice(0));
    // For these two presets warp, light and linear RGB all follow the same mix.
    const intermediate = frames.find(([warp, light, r, g, b]) => {
      const mix = (warp - .1) / .8;
      return mix > .01 && mix < .99 && Math.abs(light - (.2 + .6 * mix)) < .001 &&
        [r,g,b].every(channel => Math.abs(channel - mix) < .001);
    });
    assert.ok(intermediate, 'missing intermediate WebGL draw: ' + JSON.stringify(frames));
    const final = frames.find(frame => Math.abs(frame[0] - target) < .0001);
    const expected = target === .9 ? [.9,.8,1,1,1] : [.1,.2,0,0,0];
    assert.ok(final.every((v,i) => Math.abs(v-expected[i]) < .001));
    return { intermediate, final };
  }
  await slot.selectOption('1');
  const preset = await transition(() => recall.evaluate(button => button.click()), .9);
  const sceneCue = await transition(() => scene.selectOption('1'), .1);
  await output.evaluate(() => { delete window.gateProof.lookFrames; });
  return { preset, sceneCue };
}

async function run(browser, project, buffered) {
  const context = await browser.newContext({viewport:{width:1000,height:750},serviceWorkers:'block'});
  const errors = [];
  try {
    await context.addInitScript(observe, buffered);
    context.on('page', p=>p.on('pageerror',e=>errors.push(e.message)));
    const desk = await context.newPage();
    await desk.goto(new URL('/frequency/?lang=it&client=private-fixture#private-fragment',process.env.CHROMATIC_ORIGIN || 'http://127.0.0.1:4271').href);
    await desk.locator('#project-file').setInputFiles({name:'gates.vfreq',mimeType:'application/json',buffer:project});
    await desk.waitForFunction(()=>document.querySelector('#notice')?.textContent.includes('QA · Chromatic'));
    const ready=desk.waitForEvent('popup');
    await desk.getByRole('button',{name:'Finestra proiettore',exact:true}).click();
    const output=await ready;
    await output.waitForFunction(()=>window.gateProof.frames>0);
    const target = new URL(output.url());
    assert.deepEqual([...target.searchParams.keys()].sort(), ['lang', 'output', 'view']);
    assert.equal(target.searchParams.get('lang'), 'it');
    assert.equal(target.hash, '');
    await desk.locator('[data-action=play]').first().click();
    await output.waitForFunction(()=>{const p=window.gateProof;return p.attack && p.accent && p.release && p.combined && p.shader>.04;},null,{timeout:18000});
    const audioPriority = buffered ? null : await verifyAudioPriority(desk, output);
    await desk.locator('[data-action=stop]').first().click();
    const lookTransitions = buffered ? null : await verifyLookTransitions(desk, output);
    const data = await output.evaluate(()=>window.gateProof);
    const engine = await desk.evaluate(()=>({worklets:window.gateProof.worklets,buffers:window.gateProof.buffers}));
    assert.ok(buffered ? engine.buffers > 0 : engine.worklets > 0);
    assert.equal(data.contexts, 0);
    assert.equal(data.other, 0);
    assert.ok(Math.abs(data.accent/data.attack-1.17)<.001);
    assert.deepEqual(errors,[]);
    return { buffered, engine, data, audioPriority, lookTransitions, errors };
  } finally { await context.close(); }
}

(async () => {
  const browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_BIN,args:['--mute-audio','--enable-unsafe-swiftshader']});
  try {
    const p=await fixture();
    const report={browser:browser.version(),worklet:await run(browser,p,false),buffered:await run(browser,p,true)};
    if (process.env.CHROMATIC_PROOF) {
      await fs.mkdir(process.env.CHROMATIC_PROOF,{recursive:true});
      await fs.writeFile(path.join(process.env.CHROMATIC_PROOF,'sequencer-gates.json'),JSON.stringify(report,null,2));
    }
    console.log(JSON.stringify(report));
  } finally { await browser.close(); }
})().catch(error=>{console.error(error);process.exitCode=1;});
