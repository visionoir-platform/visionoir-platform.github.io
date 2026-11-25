import { musicTags, id3Tag } from './metadata.js';
import { DSP } from './dsp.js';
import { validateProject, totalBars, clamp } from './model.js';
import { wavHeader, wavPCM, Dither } from './formats.js';
import { flacHeader, flacFrame, aiffHeader, bigPCM } from './lossless.js';
export const SAMPLE_RATES = [44100, 48000, 88200, 96000, 176400, 192000];
export const BIT_DEPTHS = [16, 24, 32];
export function exportLoop(project) {
  const loop = project.loop;
  if (!loop || !Number.isInteger(loop.start) || !Number.isInteger(loop.end) ||
      loop.start < 0 || loop.end <= loop.start || loop.end > totalBars(project)) return null;
  return loop;
}
export function estimateExport(project, opt = {}) {
  const sampleRate = opt.sampleRate ?? 48000,
    channels = opt.channels ?? 2,
    bits = opt.bits ?? 24;
  if (!SAMPLE_RATES.includes(sampleRate) || !BIT_DEPTHS.includes(bits) || ![1, 2].includes(channels))
    throw Error('export.format');
  const loop = opt.region === 'loop' ? exportLoop(project) : null;
  if (opt.region === 'loop' && !loop) throw Error('export.loop');
  const length = totalBars(project),
    scene = loop ? null : opt.scene ?? null,
    startBar = loop ? loop.start : Number(opt.startBar ?? 0);
  if (scene !== null && (!Number.isInteger(scene) || !project.scenes[scene]))
    throw Error('export.scene');
  const bars = loop ? loop.end - loop.start : Number(opt.bars ?? (scene === null ? length - startBar : 1)),
    tail = Number(opt.tail ?? (loop ? 0 : 0.35));
  if (
    !Number.isFinite(bars) ||
    bars <= 0 ||
    bars > 65536 ||
    !Number.isFinite(startBar) ||
    startBar < 0 ||
    !Number.isFinite(tail) ||
    tail < 0 ||
    tail > 30 ||
    (scene === null && startBar + bars > length + 0.000001)
  )
    throw Error('export.range');
  if (opt.track != null && (!Number.isInteger(opt.track) || !project.tracks[opt.track]))
    throw Error('export.track');
  const start = Math.round(((startBar * 240) / project.bpm) * sampleRate),
    musical = Math.round((((startBar + bars) * 240) / project.bpm) * sampleRate) - start,
    frames = musical + Math.round(tail * sampleRate);
  const pcmBytes = (frames * channels * bits) / 8;
  const wav = !opt.format || opt.format === 'wav';
  const tags = musicTags(project);
  const params = {frames, sampleRate, bits, channels, ...tags};
  const headerBytes = wav ? wavHeader({...params, rf64:opt.rf64}).length :
    opt.format === 'aiff' ? aiffHeader(params).length : opt.format === 'flac' ? flacHeader(params).length : 44;
  let bytes = headerBytes + pcmBytes + (wav ? pcmBytes % 2 : 0);
  if (opt.format === 'mp3') {
    const bitrate = opt.bitrate ?? 320;
    if (![128,192,256,320].includes(bitrate) || ![44100,48000].includes(sampleRate))
      throw Error('export.mp3Format');
    // MPEG-1 Layer III groups PCM into 1152-frame packets, including encoder priming and final padding.
    const packets = Math.ceil((frames + 1152) / 1152);
    bytes = id3Tag(tags).length + Math.ceil(packets * 144000 * bitrate / sampleRate);
  }
  return {
    sampleRate,
    channels,
    bits,
    scene,
    start,
    frames,
    ...tags,
    musical,
    seconds: frames / sampleRate,
    bytes,
  };
}
const block = 8192;
function pass(project, spec, opt, consume, onProgress) {
  const d = new DSP(project, spec.sampleRate, {
    track: opt.track,
    bus: opt.bus,
    mastering: opt.mastering,
    offline: true,
  });
  d.start({ scene: spec.scene ?? 0, arrangement: spec.scene === null });
  const l = new Float32Array(block),
    r = new Float32Array(block);
  return (async () => {
    let advanced = 0,
      peak = 0,
      reported = -1;
    const total = spec.start + spec.frames;
    while (advanced < total) {
      const isTail = advanced >= spec.start + spec.musical;
      if (isTail && d.running) {
        d.running = false;
        d.setAutomation(null, 0);
        d.events.clear();
      }
      const next = advanced < spec.start ? spec.start : !isTail ? spec.start + spec.musical : total;
      const n = Math.min(block, next - advanced, total - advanced);
      d.render(l, r, n);
      if (advanced >= spec.start) {
        if (consume) {
          await consume(l, r, n);
        } else
          for (let i = 0; i < n; i++) {
            const val =
              spec.channels === 1
                ? Math.abs((l[i] + r[i]) * 0.5)
                : Math.max(Math.abs(l[i]), Math.abs(r[i]));
            peak = Math.max(peak, val);
          }
      }
      advanced += n;
      const pct = Math.floor((advanced / total) * 100);
      if (pct !== reported) {
        reported = pct;
        onProgress(advanced / total);
      }
    }
    return peak;
  })();
}
export async function openWriter(handle, preferSync = false) {
  if (typeof handle.createWritable === 'function' && !(preferSync && handle.createSyncAccessHandle))
    return handle.createWritable();
  if (typeof handle.createSyncAccessHandle === 'function') {
    // Dedicated workers can stream directly into an origin-private file.
    const sync = await handle.createSyncAccessHandle();
    let offset = 0,
      closed = false;
    const close = () => {
      if (!closed) {
        closed = true;
        sync.close();
      }
    };
    return {
      write(chunk) {
        let pos = 0;
        while (pos < chunk.length) {
          const written = sync.write(chunk.subarray(pos), { at: offset });
          if (!written) throw Error('export.storageRequired');
          pos += written;
          offset += written;
        }
      },
      close() {
        try {
          sync.truncate(offset);
          sync.flush();
        } finally {
          close();
        }
      },
      abort: close,
    };
  }
  throw Error('export.storageRequired');
}
async function makeSink(spec, mime, opt) {
  if (opt.handle) {
    const writer = await openWriter(opt.handle);
    return {
      write: (chunk) => writer.write(chunk),
      finish: async () => {
        await writer.close();
        return opt.handle.getFile();
      },
      abort: () => writer.abort(),
    };
  }
  if (spec.bytes > 64 * 1024 * 1024 && globalThis.navigator?.storage?.getDirectory) {
    let dir, name;
    try {
      const root = await navigator.storage.getDirectory();
      dir = await root.getDirectoryHandle('frequency-exports', { create: true });
      for await (const [key, handle] of dir) {
        if (
          handle.kind === 'file' &&
          key.startsWith('print-') &&
          Number(key.split('-')[1]) < Date.now() - 86400000
        )
          await dir.removeEntry(key).catch(() => {});
      }
      name =
        'print-' +
        Date.now() +
        '-' +
        crypto.randomUUID() +
        '.' +
        { 'audio/mpeg': 'mp3', 'audio/wav': 'wav', 'audio/flac': 'flac', 'audio/aiff': 'aiff' }[mime];
      const fh = await dir.getFileHandle(name, { create: true }),
        writer = await openWriter(fh);
      return {
        write: (b) => writer.write(b),
        finish: async () => {
          await writer.close();
          return fh.getFile();
        },
        abort: async () => {
          try {
            await writer.abort();
          } finally {
            await dir.removeEntry(name).catch(() => {});
          }
        },
      };
    } catch (e) {
      if (dir && name) await dir.removeEntry(name).catch(() => {});
      if (spec.bytes > 192 * 1024 * 1024) throw Error('export.storageRequired', { cause: e });
    }
  }
  if (spec.bytes > 192 * 1024 * 1024) throw Error('export.storageRequired');
  const chunks = [];
  return {
    write: (b) => {
      chunks.push(b);
    },
    finish: () => new Blob(chunks, { type: mime }),
    abort: () => {
      chunks.length = 0;
    },
  };
}
export async function renderOffline(project, opt = {}, progress = () => {}, output = null) {
  validateProject(project);
  const format = opt.format ?? 'wav',
    mp3 = format === 'mp3';
  if (
    !['wav', 'mp3', 'flac', 'aiff'].includes(format) ||
    (['aiff', 'flac'].includes(format) && opt.bits === 32)
  )
    throw Error('export.format');
  const spec = estimateExport(project, opt);
  if (format === 'aiff' && spec.bytes >= 0xffffffff - 65536)
    throw Error('export.riffLimit');
  // Reject an impossible large print before the optional normalization pass starts.
  if (!output && !opt.handle && spec.bytes > 192 * 1024 * 1024 && !globalThis.navigator?.storage?.getDirectory)
    throw Error('export.storageRequired');
  if (format === 'wav' && !output && !opt.handle && spec.bytes >= 0xffffffff && globalThis.navigator?.storage?.estimate) {
    const budget = await navigator.storage.estimate().catch(() => null);
    if (Number.isFinite(budget?.quota) && Number.isFinite(budget.usage) && budget.quota - budget.usage < spec.bytes)
      throw Error('export.storageRequired');
  }
  let gain = 1,
    encoder = null;
  if (opt.normalize) {
    const peak = await pass(project, spec, opt, null, (v) => progress(v * 0.5));
    if (peak > 0) gain = 0.94 / peak;
  }
  if (mp3) {
    const { Mp3Encoder } = await import('./vendor/lamejs.js');
    encoder = new Mp3Encoder(spec.channels, spec.sampleRate, opt.bitrate ?? 320);
  }
  const mime = { mp3: 'audio/mpeg', wav: 'audio/wav', flac: 'audio/flac', aiff: 'audio/aiff' }[format];
  const sink = output ?? (await makeSink(spec, mime, opt));
  try {
    if (mp3) {
      const tag = id3Tag(spec);
      if (tag.length) await sink.write(tag);
    } else
      await sink.write(
        format === 'flac'
          ? flacHeader(spec)
          : format === 'aiff'
            ? aiffHeader(spec)
            : wavHeader({ ...spec, rf64:opt.rf64 }),
      );
    let position = 0;
    const random = new Dither();
    await pass(
      project,
      spec,
      opt,
      async (l, r, n) => {
        if (!mp3) {
          const pcm = wavPCM(l, r, n, spec.bits, spec.channels, gain, random);
          await sink.write(
            format === 'flac'
              ? flacFrame(pcm, spec.bits, spec.channels, n, position)
              : format === 'aiff'
                ? bigPCM(pcm, spec.bits)
                : pcm,
          );
          position += n;
          return;
        }
        const left = new Int16Array(n),
          right = spec.channels === 1 ? null : new Int16Array(n);
        for (let i = 0; i < n; i++) {
          left[i] = clamp(
            Math.round((right ? l[i] : (l[i] + r[i]) * 0.5) * gain * 32768),
            -32768,
            32767,
          );
          if (right) right[i] = clamp(Math.round(r[i] * gain * 32768), -32768, 32767);
        }
        const data = encoder.encodeBuffer(left, right || undefined);
        if (data.length) await sink.write(data);
      },
      (v) => progress(opt.normalize ? 0.5 + 0.5 * v : v),
    );
    if (mp3) {
      const last = encoder.flush();
      if (last.length) await sink.write(last);
    } else if (format !== 'flac' && ((spec.frames * spec.channels * spec.bits) / 8) % 2)
      await sink.write(new Uint8Array(1));
    return await sink.finish();
  } catch (e) {
    await sink.abort();
    throw e;
  }
}
