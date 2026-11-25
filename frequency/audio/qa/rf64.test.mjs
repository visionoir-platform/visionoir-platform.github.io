import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { mkdtemp, open, rm, writeFile } from 'node:fs/promises';
import { wavHeader, zipFiles } from '../formats.js';
import { renderOffline, estimateExport } from '../offline.js';
import { createProject } from '../model.js';

function probe(file) {
  return JSON.parse(
    execFileSync(
      'ffprobe',
      [
        '-v',
        'error',
        '-show_entries',
        'stream=codec_name,sample_rate,channels,duration_ts',
        '-of',
        'json',
        file,
      ],
      { encoding: 'utf8' },
    ),
  ).streams[0];
}
test('automatic transition uses exact RIFF size including title and odd data padding', () => {
  const opts = { channels: 1, bits: 24, sampleRate: 48000, title: 'Frequenza ∷' };
  const overhead = wavHeader({ ...opts, frames: 0 }).length - 8;
  const last = Math.floor((0xfffffffe - overhead) / 3);
  assert.equal(Buffer.from(wavHeader({ ...opts, frames: last })).toString('ascii', 0, 4), 'RIFF');
  const h = Buffer.from(wavHeader({ ...opts, frames: last + 1 })),
    data = (last + 1) * 3;
  assert.equal(h.toString('ascii', 0, 4), 'RF64');
  assert.equal(h.toString('ascii', 12, 16), 'ds64');
  assert.equal(h.readUInt32LE(4), 0xffffffff);
  assert.equal(h.readUInt32LE(h.length - 4), 0xffffffff);
  assert.equal(h.readBigUInt64LE(20), BigInt(h.length + data + (data % 2) - 8));
  assert.equal(h.readBigUInt64LE(28), BigInt(data));
  assert.equal(h.readBigUInt64LE(36), BigInt(last + 1));
  assert.equal(h.readUInt32LE(44), 0);
});
test('over-4 GiB sparse RF64 is probed at its 64-bit duration and actually decodes the final stereo frames', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'frequency-rf64-'));
  try {
    const sampleRate = 192000,
      frames = 2 ** 32 / 8 + 32,
      file = join(dir, 'large.wav');
    const h = Buffer.from(
      wavHeader({ frames, sampleRate, bits: 32, channels: 2, title: 'Sparse audio QA' }),
    );
    const f = await open(file, 'wx');
    try {
      await f.write(h, 0, h.length, 0);
      await f.truncate(2 * 1024 * 1024);
      const probeStat = await f.stat();
      if (!Number.isFinite(probeStat.blocks) || probeStat.blocks * 512 >= 256 * 1024) {
        t.skip('the host filesystem does not report sparse allocation');
        return;
      }
      const end = h.length + frames * 8;
      await f.truncate(end);
      const tail = Buffer.alloc(32 * 8);
      for (let i = 0; i < 32; i++) {
        tail.writeFloatLE(0.375, i * 8);
        tail.writeFloatLE(-0.25, i * 8 + 4);
      }
      await f.write(tail, 0, tail.length, end - tail.length);
      const stat = await f.stat();
      assert.ok(stat.size > 2 ** 32);
      assert.ok(stat.blocks * 512 < 1024 * 1024, 'fixture must remain sparse');
    } finally {
      await f.close();
    }
    const stream = probe(file);
    assert.equal(stream.codec_name, 'pcm_f32le');
    assert.equal(stream.duration_ts, frames);
    assert.equal(stream.channels, 2);
    assert.equal(+stream.sample_rate, sampleRate);
    const decoded = execFileSync('ffmpeg', [
      '-v',
      'error',
      '-sseof',
      '-0.01',
      '-i',
      file,
      '-acodec',
      'pcm_f32le',
      '-f',
      'f32le',
      '-',
    ]);
    assert.ok(decoded.length >= 32 * 8);
    assert.equal(decoded.readFloatLE(decoded.length - 8), 0.375);
    assert.equal(decoded.readFloatLE(decoded.length - 4), -0.25);
    console.log('RF64 decoded tail, frames:', frames, 'bytes:', h.length + frames * 8);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
test('real worker renderer emits decodable RF64 PCM/float and default RIFF; estimates account for every byte', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'frequency-rf64-print-')),
    p = createProject('forge');
  try {
    for (const [bits, rf64] of [
      [16, true],
      [24, true],
      [32, true],
      [24, false],
    ]) {
      const opt = {
        format: 'wav',
        sampleRate: 48000,
        channels: 1,
        scene: 6,
        bars: 0.125,
        bits,
        tail: 0,
        rf64,
      };
      const blob = await renderOffline(p, opt),
        b = Buffer.from(await blob.arrayBuffer()),
        file = join(dir, 'print.wav');
      await writeFile(file, b);
      assert.equal(b.toString('ascii', 0, 4), rf64 ? 'RF64' : 'RIFF');
      assert.equal(b.length, estimateExport(p, opt).bytes);
      const info = probe(file);
      assert.equal(info.duration_ts, estimateExport(p, opt).frames);
      const pcm = execFileSync('ffmpeg', ['-v', 'error', '-i', file, '-f', 'f32le', '-']);
      let peak = 0;
      for (let n = 0; n < pcm.length; n += 4) peak = Math.max(peak, Math.abs(pcm.readFloatLE(n)));
      assert.ok(peak > 0.1);
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('oversized ZIP32 archive rejects before it starts the file checksum', async () => {
  const fake = {
    size: 0xfffffffe,
    stream() {
      throw Error('already reading');
    },
  };
  await assert.rejects(zipFiles([{ name: 'master.wav', blob: fake }]), /export.zipLimit/);
});
