const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

async function calibrate() {
  const { buildStage } = await import('/frequency/chromatic/stage.js');
  const { spatialScore } = await import('/frequency/chromatic/spatial.js');
  const { defaultVisual, instruments, mixVisualVoices, routes } = await import('/frequency/chromatic/model.js');
  const host = document.body.appendChild(document.createElement('div'));
  host.style.cssText = 'width:288px;height:216px';
  const state = { ...defaultVisual(), freeze: true, quality: 'low', sensitivity: 1, kick: 1 };
  // Observe a real Three.js render, then reuse its exact geometry, materials and
  // camera. Holding time, RMS and overall energy fixed isolates each instrument.
  const reference = spatialScore(0);
  const line = Object.getPrototypeOf(reference.group.children[0]);
  const ownHook = Object.getOwnPropertyDescriptor(line, 'onBeforeRender');
  const before = line.onBeforeRender;
  let view, stage;
  line.onBeforeRender = function (renderer, scene, camera, ...rest) {
    view = { renderer, scene, camera };
    return before.call(this, renderer, scene, camera, ...rest);
  };
  try {
    stage = await buildStage(host, { getState: () => state });
    const deadline = performance.now() + 10000;
    while (!view && performance.now() < deadline) await new Promise(requestAnimationFrame);
    if (!view) throw Error('The production stage did not render its spatial score');
  } finally {
    if (ownHook) Object.defineProperty(line, 'onBeforeRender', ownHook);
    else delete line.onBeforeRender;
    reference.dispose();
  }
  const { renderer, scene, camera } = view;
  let uniforms;
  scene.traverse(obj => {
    const u = obj.material?.uniforms;
    if (obj.isMesh && u?.uVoices && u.uEcho.value === 0) uniforms = u;
  });
  const gl = renderer.getContext();
  const width = gl.drawingBufferWidth, height = gl.drawingBufferHeight;
  const sheet = document.createElement('canvas');
  sheet.width = width * 4;
  sheet.height = (height + 22) * 4;
  const pencil = sheet.getContext('2d');
  pencil.fillStyle = '#080a0e';
  pencil.fillRect(0, 0, sheet.width, sheet.height);
  pencil.font = '13px sans-serif';
  pencil.fillStyle = '#eceff4';
  uniforms.uTime.value = 2;
  uniforms.uSound.value.set(.28, .28, .28, .28);
  function frame(active, index, power = .62) {
    const levels = new Float32Array(16);
    for (const voice of active) levels[voice] = .82;
    mixVisualVoices(uniforms.uVoices.value, new Float32Array(16), new Float32Array(16), levels, state, 0);
    uniforms.uActive.value = power;
    renderer.render(scene, camera);
    const pixels = new Uint8Array(width * height * 4);
    gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    if (Number.isInteger(index)) {
      const x = index % 4 * width, y = Math.floor(index / 4) * (height + 22);
      pencil.drawImage(renderer.domElement, x, y, width, height);
      pencil.fillText(instruments[index], x + 8, y + height + 15);
    }
    return pixels;
  }
  const countGreen = pixels => {
    let total = 0;
    for (let i = 0; i < pixels.length; i += 4)
      if (pixels[i+3] > 128 && pixels[i+1] > Math.max(pixels[i],pixels[i+2]) + 20) total++;
    return total;
  };
  const countChanged = (a, b) => {
    let count = 0;
    for (let i = 0; i < a.length; i += 4)
      if (Math.max(Math.abs(a[i]-b[i]),Math.abs(a[i+1]-b[i+1]),Math.abs(a[i+2]-b[i+2]),Math.abs(a[i+3]-b[i+3])) > 8) count++;
    return count;
  };
  try {
    const rest = frame([], null, 0);
    const control = frame([]);
    const samples = routes.map((_, i) => frame([i], i));
    let closest = { count: Infinity };
    for (let i = 0; i < samples.length; i++) for (let j = i+1; j < samples.length; j++) {
      const count = countChanged(samples[i], samples[j]);
      if (count < closest.count) closest = { count, instruments: [instruments[i], instruments[j]] };
    }
    const composite = frame(routes.map((_, i) => i));
    state.mapping[15] = routes[2];
    const remapped = frame([15]);
    return {
      width, height, closest, changed: samples.map(p => countChanged(p,control)),
      green: { control:countGreen(control), acid:countGreen(samples[2]) },
      combinedToClosest: Math.min(...samples.map(p=>countChanged(p, composite))),
      samplerMatchesAcid: remapped.every((v,i)=>v===samples[2][i]),
      restRestored: frame([],null,0).every((v,i)=>v===rest[i]),
      png: sheet.toDataURL('image/png').split(',')[1],
    };
  } finally { stage.dispose(); }
}

async function main() {
  const browser = await chromium.launch({headless:true, executablePath:process.env.BROWSER_BIN,args:['--enable-unsafe-swiftshader']});
  try {
    const variants = [];
    if (process.env.CHROMATIC_BASELINE_SHADER) variants.push(['baseline', process.env.CHROMATIC_BASELINE_SHADER]);
    variants.push(['candidate', process.env.CHROMATIC_CANDIDATE_SHADER]);
    for (const [variant, shaderFile] of variants) await measureVariant(browser, variant, shaderFile);
  } finally { await browser.close(); }
}

async function measureVariant(browser, variant, shaderFile) {
  const page = await browser.newPage({viewport:{width:600,height:480},deviceScaleFactor:1,reducedMotion:'no-preference'});
  const errors = [];
  page.on('pageerror', e=>errors.push(e.message));
  page.on('console', msg=>{if(msg.text().includes('VISIONOIR shader:')) errors.push(msg.text());});
  let hash;
  if (shaderFile) {
    const source = await fs.readFile(shaderFile,'utf8');
    hash = createHash('sha256').update(source).digest('hex');
    await page.route(/\/frequency\/chromatic\/shaders\.js(?:\?|$)/, route=>route.fulfill({contentType:'text/javascript',body:source}));
  }
  await page.route('**/__voice-matrix__',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><body style="margin:0;background:#080a0e"></body>'}));
  await page.goto(new URL('/__voice-matrix__',process.env.CHROMATIC_ORIGIN || 'http://127.0.0.1:4271').href);
  const {png,...report} = await page.evaluate(calibrate);
  report.browser = browser.version();
  report.errors = errors;
  if (hash) report.shaderSHA256 = hash;
  if (process.env.CHROMATIC_PROOF) {
    const folder = path.join(process.env.CHROMATIC_PROOF,variant);
    await fs.mkdir(folder,{recursive:true});
    await fs.writeFile(path.join(folder,'voice-matrix.png'),Buffer.from(png,'base64'));
    await fs.writeFile(path.join(folder,'voice-matrix.json'),JSON.stringify(report,null,2));
  }
  console.log(variant,JSON.stringify(report));
  await page.close();
  assert.deepEqual(errors, []);
  if (variant === 'baseline') return;
  assert.ok(report.changed.every(pixels => pixels >= 30));
  assert.ok(report.closest.count >= 30);
  assert.ok(report.green.acid >= report.green.control + 50);
  assert.ok(report.combinedToClosest >= 30);
  assert.ok(report.samplerMatchesAcid && report.restRestored);
}
main().catch(error => {console.error(error);process.exitCode=1;});
