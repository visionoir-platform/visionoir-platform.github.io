#!/usr/bin/env node
/** Offline studio CLI. Prints a named original demo or an existing local session. */
import { writeFile, readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { createProject, validateProject, DEMOS, projectFile } from './model.js';
import { EXTRA_DEMOS } from './library.js';
import { renderOffline } from './offline.js';
import { renderMidi } from './formats.js';
export async function run(args) {
  const [source, filename, ...flags] = args;
  if (!source || !filename)
    throw Error(
      'Usage: node print.mjs <demo-id | project.vfreq> <out.wav|flac|aiff|mp3|mid|vfreq> [--scene N] [--bars N] [--startBar N] [--track N] [--sampleRate HZ] [--bits N] [--bitrate N] [--channels N] [--tail SEC]',
    );
  const ids = ['blank', ...DEMOS.map((x) => x.id), ...EXTRA_DEMOS.map((x) => x.id)];
  const p = ids.includes(source)
    ? createProject(source)
    : validateProject(JSON.parse(await readFile(source, 'utf8')));
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
      blob = projectFile(p);
      break;
    case 'mid':
      blob = renderMidi(p);
      break;
    case 'wav':
    case 'mp3':
    case 'flac':
    case 'aiff':
      blob = await renderOffline(p, { ...opts, format: ext });
      break;
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
