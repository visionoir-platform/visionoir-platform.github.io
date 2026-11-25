// Exercise one real studio recording; analyse the downloaded file rather than the preview.
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

const url = new URL('/frequency/?lang=it', process.env.FREQUENCY_URL || 'http://127.0.0.1:4187');
const proof = process.env.FREQUENCY_PROOF;
const surface = '#chromatic .chromatic-surface';
const decodeWidth = 80, decodeHeight = 48, sampleRate = 16000;

function exec(name, args) {
  return execFileSync(name, args, { maxBuffer: 64 * 1024 * 1024, timeout: 90000 });
}

function analyse(file, report) {
  const probe = (args) => JSON.parse(exec(process.env.FFPROBE || 'ffprobe', ['-v','error',...args,'-of','json',file]));
  report.streams = probe(['-show_entries','stream=index,codec_type,codec_name,width,height,sample_rate,channels,start_time']).streams;
  assert.deepEqual(report.streams.map(s => s.codec_type).sort(), ['audio','video']);
  const pts = probe(['-select_streams','v:0','-show_frames','-show_entries','frame=best_effort_timestamp_time']).frames
    .map(f => Number(f.best_effort_timestamp_time));
  assert.ok(pts.every(Number.isFinite), 'Video timestamps unavailable');
  const ffmpeg = args => exec(process.env.FFMPEG || 'ffmpeg',['-hide_banner','-loglevel','error','-nostdin','-i',file,...args,'pipe:1']);
  const gray = ffmpeg(['-map','0:v:0','-an','-vf',`scale=${decodeWidth}:${decodeHeight},format=gray`,
    '-fps_mode','passthrough','-f','rawvideo']);
  const pcm = ffmpeg(['-map','0:a:0','-vn','-af',`aresample=${sampleRate}:async=1:first_pts=0`,
    '-ac','1','-ar',String(sampleRate),'-f','f32le']);
  const pixels = decodeWidth * decodeHeight;
  assert.equal(gray.length, pts.length * pixels, 'Decoded pixels and media timestamps disagree');
  report.decodedVideoFrames = pts.length;
  report.decodedAudioSeconds = pcm.length / 4 / sampleRate;
  const failed = [];
  for (const phase of report.phases) {
    // Drop transition and encoder-start edges. Count native timestamps; never synthesize extra video frames.
    const from = phase.start.seconds + 0.45, to = phase.end.seconds - 0.35;
    const frames = pts.map((t,i) => ({t,i})).filter(f => f.t >= from && f.t <= to);
    const changes = [];
    let previous = frames[0]?.i;
    for (const {i,t} of frames.slice(1)) {
      let delta = 0;
      for (let p = 0; p < pixels; p++) delta += Math.abs(gray[i*pixels+p] - gray[previous*pixels+p]);
      if (delta / pixels >= 0.45) { changes.push(t); previous = i; }
    }
    const audioDb = [];
    for (let start = Math.ceil(sampleRate*from); start + sampleRate/4 <= Math.min(sampleRate*to,pcm.length/4); start += sampleRate/4) {
      let energy = 0;
      for (let i = start; i < start + sampleRate/4; i++) energy += pcm.readFloatLE(4*i) ** 2;
      audioDb.push(10*Math.log10(Math.max(1e-16,energy/(sampleRate/4))));
    }
    const middle = (from+to)/2;
    const before = changes.filter(t => t <= middle).length, after = changes.length-before;
    phase.encoded = {
      from, to, frames: frames.length, changedFrames: changes.length, changesPerHalf: [before,after],
      rmsDbfs250ms: audioDb.map(n => Math.round(n*10)/10),
    };
    if (before < 1 || after < 1 || changes.length < 3) failed.push(phase.name + ': frozen/absent video');
    if (audioDb.length < 3 || audioDb.filter(n => n > -55).length < audioDb.length*0.6) failed.push(phase.name + ': silent/short PCM');
  }
  report.failures = failed;
  assert.deepEqual(failed, [], 'The downloaded performance must carry moving pictures and audible PCM in every phase');
}

async function record(dir, report) {
  const browser = await chromium.launch({ executablePath: process.env.FREQUENCY_BROWSER_EXEC,
    args: ['--enable-unsafe-swiftshader','--mute-audio'] });
  report.browser = browser.version();
  try {
    const page = await browser.newPage({ viewport: {width: 720, height: 490}, reducedMotion: 'no-preference', acceptDownloads: true });
    page.on('pageerror', e => report.errors.push(e.message));
    // Observe native start timing. Do not substitute the stream, generate frames or alter any recording setting.
    await page.addInitScript(() => {
      const start = MediaRecorder.prototype.start;
      MediaRecorder.prototype.start = function (...args) {
        const result = Reflect.apply(start,this,args);
        window.recordingQA = { requested: performance.now() };
        this.addEventListener('start',() => { window.recordingQA.startedEvent = performance.now(); },{once:true});
        return result;
      };
    });
    await page.goto(url.href);
    const btn = id => page.locator('[data-action="' + id + '"]').first();
    const tab = id => page.locator('[data-tab="' + id + '"]');
    const stage = page.locator(surface);
    await btn('library').click();
    await page.locator('[data-action=demo][data-id=forge]').click();
    await page.waitForFunction(() => /Furnace Ledger/i.test(document.querySelector('.panelhead small')?.textContent));
    await tab('live').click();
    await stage.scrollIntoViewIfNeeded();
    await page.locator(surface+'[data-render=webgl] canvas').waitFor();
    await btn('settings').click();
    const mode = page.locator('[data-field=record-mode]');
    await mode.selectOption('video');
    assert.equal(await mode.inputValue(),'video');
    await btn('close').click();
    await page.locator('[data-action=launch][data-index="3"]').click();
    await page.waitForFunction(() => document.documentElement.dataset.play === 'on');
    await btn('record').click();
    await page.waitForFunction(() => document.querySelector('[data-action=record]').getAttribute('aria-pressed') === 'true');
    // Scrolling to the real transport may move the canvas off screen; return to it before measuring.
    await stage.scrollIntoViewIfNeeded();
    await page.waitForFunction(() => Number.isFinite(window.recordingQA?.startedEvent));
    report.startEventDelayMs = await page.evaluate(() => window.recordingQA.startedEvent - window.recordingQA.requested);
    async function snapshot() {
      return page.evaluate(selector => {
        const rect = document.querySelector(selector).getBoundingClientRect();
        const intersect = Math.max(0, Math.min(rect.bottom,innerHeight)-Math.max(rect.top,0));
        return {
          seconds: (performance.now()-window.recordingQA.requested)/1000, scrollY, top: rect.top, bottom: rect.bottom,
          visible: intersect > 0, view: document.querySelector('[data-tab][aria-pressed=true]')?.dataset.tab,
          motion: document.documentElement.dataset.motion, recording: document.querySelector('[data-action=record]').getAttribute('aria-pressed'),
          playing: document.documentElement.dataset.play, hidden: document.hidden,
        };
      },surface);
    }
    async function phase(name, view, visible, milliseconds) {
      const start = await snapshot();
      await page.waitForTimeout(milliseconds);
      const end = await snapshot();
      report.phases.push({name,start,end});
      for (const mark of [start,end]) {
        assert.deepEqual([mark.visible,mark.view,mark.motion,mark.recording,mark.playing,mark.hidden],
          [visible,view,'full','true','on',false], 'Unexpected geometry, playback or policy during '+name);
      }
    }
    const scrollOff = () => page.evaluate(() => window.scrollTo({top:0,behavior:'instant'}));
    await phase('visible','live',true,3100);
    await scrollOff();
    await phase('offscreen','live',false,4700);
    await tab('mixer').click();
    await scrollOff();
    await phase('mixer-offscreen','mixer',false,4000);
    await stage.scrollIntoViewIfNeeded();
    await phase('visible-again','mixer',true,3000);
    const [download] = await Promise.all([page.waitForEvent('download',{timeout:30000}), btn('record').click()]);
    await btn('stop').click();
    assert.match(download.suggestedFilename(), /^Frequency-live\.(webm|mp4)$/i);
    const file = path.join(dir,download.suggestedFilename());
    await download.saveAs(file);
    report.recording = path.basename(file);
    assert.deepEqual(report.errors, []);
    return file;
  } finally { await browser.close(); }
}

async function main() {
  const dir = proof || await fs.mkdtemp(path.join(os.tmpdir(),'frequency-av-'));
  await fs.mkdir(dir,{recursive:true});
  const report = {url:url.href,phases:[],errors:[]};
  try {
    const file = await record(dir,report);
    analyse(file,report);
    console.log('Verified PCM and moving images in all four phases.');
  } finally {
    await fs.writeFile(path.join(dir,'av-recording.json'),JSON.stringify(report,null,2)+'\n');
    console.log(dir);
  }
}
main().catch(error => { console.error(error); process.exitCode=1; });
