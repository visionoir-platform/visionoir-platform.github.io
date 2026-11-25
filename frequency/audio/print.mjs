#!/usr/bin/env node
/** Offline studio CLI. Prints a named original demo or an existing local session. */
import { writeFile, open, rename, unlink, stat } from 'node:fs/promises';
import { openAsBlob } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { createProject, DEMOS, projectFile, NATIVE_FILE_VERSION } from './model.js';
import { readProjectFile } from './project-archive.js';
import { EXTRA_DEMOS } from './library.js';
import { renderOffline } from './offline.js';
import { renderMidi } from './formats.js';
function fileSink(filename) {
  const temporary = filename + '.' + randomUUID() + '.partial';
  return {
    async createWritable() {
      const file = await open(temporary, 'wx');
      return {
        write: chunk => file.writeFile(chunk),
        async close() { await file.close(); await rename(temporary, filename); },
        async abort() {
          try { await file.close(); } finally { await unlink(temporary).catch(() => {}); }
        },
      };
    },
    getFile: () => stat(filename),
  };
}
export async function run(args) {
  const [source, filename, ...flags] = args;
  if (!source || !filename)
    throw Error(
      'Usage: node print.mjs <demo-id | project.vfreq | project.json | project.zip> <out.wav|flac|aiff|mp3|mid|vfreq|json> [--scene N] [--bars N] [--startBar N] [--track N] [--sampleRate HZ] [--bits N] [--bitrate N] [--channels N] [--tail SEC]',
    );
  const ids = ['blank', ...DEMOS.map((x) => x.id), ...EXTRA_DEMOS.map((x) => x.id)];
  const p = ids.includes(source)
    ? createProject(source)
    : await readProjectFile(await openAsBlob(source));
  const opts = {};
  for (let i = 0; i < flags.length; i += 2) {
    const key = flags[i].slice(2);
    if (
      ![
        'scene',
        'bars',
        'startBar',
        'track',
        'sampleRate',
        'bits',
        'bitrate',
        'channels',
        'tail',
      ].includes(key) ||
      !Number.isFinite(Number(flags[i + 1]))
    )
      throw Error('Unexpected parameter ' + key);
    opts[key] = Number(flags[i + 1]);
  }
  const ext = filename.split('.').pop().toLowerCase();
  let blob;
  switch (ext) {
    case 'vfreq':
    case 'json':
      blob = projectFile(p, ext === 'json' ? 1 : NATIVE_FILE_VERSION);
      break;
    case 'mid':
      blob = renderMidi(p);
      break;
    case 'wav':
    case 'mp3':
    case 'flac':
    case 'aiff':
      {
        const file = await renderOffline(p, { ...opts, format: ext, handle: fileSink(filename) });
        console.log(JSON.stringify({ project: p.name, file: filename, bytes: file.size }));
        return;
      }
    default:
      throw Error('Unknown output format');
  }
  await writeFile(filename, Buffer.from(await blob.arrayBuffer()));
  console.log(JSON.stringify({ project: p.name, file: filename, bytes: blob.size }));
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  run(process.argv.slice(2)).catch((e) => {
    console.error(e.message);
    process.exitCode = 1;
  });
