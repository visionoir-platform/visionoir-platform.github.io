import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {join, posix} from 'node:path';
import {fileURLToPath} from 'node:url';

const repository = fileURLToPath(new URL('../', import.meta.url));
const publicSource = 'https://github.com/visionoir-platform/visionoir-platform.github.io/blob/main/';
// Use stable public filenames so saved copies and existing references continue to work.
const files = new Map([
  ['frequency/LICENSE', 'FREQUENCY-MIT.txt'],
  ['ASSET_LICENSES.md', 'assets.txt'],
  ['USER_CONTENT_POLICY.md', 'user-music.txt'],
  ['TRADEMARKS.md', 'trademarks.txt'],
  ['game/LICENSE.md', 'game.txt'],
  ['public/creator/CREDITS.txt', 'portrait.txt'],
  ['public/assets/AUDIO-LICENSE.txt', 'site-audio.txt'],
  ['public/assets/AUDIO-PREMIUM-LICENSE.txt', 'site-audio-premium.txt'],
  ['THIRD_PARTY_NOTICES.md', 'third-party.txt'],
  ['public/assets/Manrope-LICENSE.txt', 'Manrope-OFL.txt'],
  ['public/assets/Bebas-Neue-LICENSE.txt', 'Bebas-Neue-OFL.txt'],
  ['public/assets/anton-OFL.txt', 'Anton-OFL.txt'],
  ['frequency/audio/vendor/NOTICE.md', 'MP3-encoder.txt'],
  ['frequency/audio/vendor/LGPL-3.0.txt', 'LGPL-3.0.txt'],
  ['frequency/audio/vendor/GPL-3.0.txt', 'GPL-3.0.txt'],
  ['frequency/audio/vendor/LAME-NOTICE.txt', 'LAME-notice.txt'],
  ['node_modules/three/LICENSE', 'Three-MIT.txt'],
  ['public/assets/earcut-ISC.txt', 'Earcut-ISC.txt'],
  ['node_modules/vite/LICENSE.md', 'Vite-NOTICES.txt'],
]);

export async function writeDistributionNotices(directory) {
  await mkdir(directory, {recursive:true});
  for (const [source, name] of files) {
    let contents = await readFile(join(repository,source),'utf8');
    // Only rebase links in our own explanatory documents. Keep upstream texts verbatim.
    if (source.endsWith('.md') && !source.startsWith('node_modules/')) {
      contents = contents.replace(/\]\(([^\s)]+)\)/g, (match, link) => {
        if (/^(?:[a-z]+:|#)/i.test(link)) return match;
        const referenced = posix.join(posix.dirname(source),link);
        return '](' + (files.get(referenced) || publicSource + referenced) + ')';
      });
    }
    await writeFile(join(directory,name),contents);
  }
  const entries = [...files.values()].map(name => `<li><a href="./${name}">${name}</a></li>`).join('');
  const title = 'FREQUENCY · MIT / LGPL / ISC / OFL';
  const index = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title></head>
<body><main><h1>${title}</h1><ul>${entries}</ul></main></body></html>`;
  await writeFile(join(directory,'index.html'),index);
}
