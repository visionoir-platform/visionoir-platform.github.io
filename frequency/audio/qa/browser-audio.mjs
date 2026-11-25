/** Isolated production bundle. Test the worklet and export worker without audio hardware. */
import assert from 'node:assert/strict';
import http from 'node:http';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { build } from 'vite';
const req = createRequire(import.meta.url);
const { chromium, webkit, firefox } = req(process.env.PLAYWRIGHT_MODULE || 'playwright');
const target = process.argv[2] || 'chromium',
  browserType = { chromium, webkit, firefox }[target];
if (!browserType) throw Error('Use chromium, webkit or firefox.');
const dest = await mkdtemp(join(tmpdir(), 'frequency-audio-browser-'));
const entry = fileURLToPath(new URL('../index.js', import.meta.url));
await build({
  configFile: false,
  base: './',
  logLevel: 'warn',
  worker: { format: 'es' },
  build: {
    outDir: dest,
    emptyOutDir: false,
    lib: { entry, formats: ['es'], fileName: () => 'audio-api.js' },
  },
});
await writeFile(
  join(dest, 'index.html'),
  `<!doctype html><meta charset="utf-8"><button>Audio test</button><script type="module">
import * as a from './audio-api.js';
const p=a.createProject('relay'), results={};let d;
document.querySelector('button').onclick=async()=>{
 try{
  d=a.createEngine({onTick:t=>{results.tick=t;},onError:e=>results.err=e.message});
  window.results=results;let project=structuredClone(p);
  await d.play(project,{scene:3});results.mode=d.mode;results.rate=d.context.sampleRate;
  const opts={scene:6,bars:.125,tail:0,bits:24,sampleRate:48000};
  for(const [k,render] of [['wav',a.renderWav],['flac',a.renderFlac],['aiff',a.renderAiff],['mp3',a.renderMp3]]){
   const blob=await render(project,opts),arr=await blob.arrayBuffer();results[k]={data:Array.from(new Uint8Array(arr))};
   try{const buf=await d.context.decodeAudioData(arr);
   const pcm=buf.getChannelData(0);let peak=0;for(const v of pcm)peak=Math.max(peak,Math.abs(v));
   Object.assign(results[k],{channels:buf.numberOfChannels,frames:buf.length,peak});}catch(e){results[k].decoderError=e.message;}
  }
  d.queueScene(6);results.queued=true;
 }catch(e){results.err=e.message;}
};
window.end=async()=>{d.stop();await d.dispose();};
</script>`,
);
const server = http.createServer(async (req, res) => {
  try {
    const path = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const file = resolve(dest, '.' + (path === '/' ? '/index.html' : path));
    if (!file.startsWith(dest + '/')) throw Error();
    const bytes = await readFile(file);
    res.writeHead(200, {
      'Content-Type': extname(file) === '.html' ? 'text/html' : 'application/javascript',
    });
    res.end(bytes);
  } catch {
    res.writeHead(404);
    res.end();
  }
});
await new Promise((r, j) => server.once('error', j).listen(0, '127.0.0.1', r));
let browser;
try {
  const env =
    target === 'firefox' && process.platform === 'darwin'
      ? { ...process.env, CFFIXED_USER_HOME: await mkdtemp(join(tmpdir(), 'frequency-audio-gecko-')) }
      : process.env;
  browser = await browserType.launch({
    headless: true,
    executablePath: process.env.FREQUENCY_BROWSER_EXEC || undefined,
    env,
  });
  const context = await browser.newContext();
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('http://127.0.0.1:' + server.address().port + '/');
  await page.locator('button').click();
  await page.waitForFunction(
    () => window.results?.err || (window.results?.queued && window.results.tick?.scene === 6),
    {},
    { timeout: 30000 },
  );
  const r = await page.evaluate(() => window.results);
  assert(!r.err, r.err);
  assert.equal(r.mode, 'worklet');
  assert(r.tick.masterPeak.some((v) => v > 0.001));
  for (const k of ['wav', 'flac', 'aiff', 'mp3']) {
    const file = join(dest, 'print.' + k);
    await writeFile(file, Buffer.from(r[k].data));
    const pcm = execFileSync('ffmpeg', [
      '-v',
      'error',
      '-i',
      file,
      '-acodec',
      'pcm_f32le',
      '-f',
      'f32le',
      '-',
    ]);
    let peak = 0;
    for (let i = 0; i < pcm.length; i += 4) peak = Math.max(peak, Math.abs(pcm.readFloatLE(i)));
    assert(peak > 0.01, k);
    if (!r[k].decoderError) {
      assert(r[k].peak > 0.01, k);
      assert.equal(r[k].channels, 2);
      assert(r[k].frames > 3000, k);
    } else
      assert.equal(k, 'aiff', 'Unexpected browser decoding failure: ' + k + ' ' + r[k].decoderError);
  }
  await page.evaluate(() => window.end());
  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify({
      browser: target,
      version: browser.version(),
      worklet: r.mode,
      rate: r.rate,
      crossfadeTo: r.tick.scene,
      nativeDecoders: Object.fromEntries(
        ['wav', 'flac', 'aiff', 'mp3'].map((k) => [k, !r[k].decoderError]),
      ),
      exportDecode: r.wav.frames,
      peak: r.tick.masterPeak,
      vendorMP3: r.mp3.peak,
      hardwareListening: false,
    }),
  );
} finally {
  await browser?.close();
  await new Promise((r) => server.close(r));
}
