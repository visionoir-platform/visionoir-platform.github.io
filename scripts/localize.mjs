import { generatePortals } from './portals.mjs';
import { readFile, readdir, writeFile, mkdir, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { names, parents, localePath, parseCatalogue, site } from '../src/locales.js';
import { escape, renderSite, direction, pageTitle } from '../src/site.js';
import { ecosystemLocale } from './ecosystem-locales.mjs';
import { tracks } from '../src/tracks.js';

const output = resolve(process.argv[2] || 'dist');
const sources = new URL('../src/locales/',import.meta.url);
const files = await readdir(sources);
const available = Object.keys(names).filter(lang => files.includes(lang+'.txt'));
if (process.env.VISIONOIR_ALL_LOCALES && available.length !== Object.keys(names).length) {
  throw new Error('Missing: ' + Object.keys(names).filter(lang=>!available.includes(lang)).join(', '));
}
const source = {};
for (const lang of available) source[lang] = parseCatalogue(await readFile(new URL(lang+'.txt',sources),'utf8'));
const keys = Object.keys(source.it);
const dictionaries = {};
for (const lang of available) {
  for (const key of Object.keys(source[lang])) if (!keys.includes(key)) throw Error(`${lang}: unknown key ${key}`);
  const dict = { ...source[parents[lang]], ...source[lang] };
  for (const key of keys) if (!dict[key]) throw Error(`${lang}: missing ${key}`);
  dictionaries[lang] = {...dict,...ecosystemLocale(lang)};
}

const enabledTracks = [];
for (const track of tracks) {
  try { if ((await stat(resolve(output,'assets',track.file))).size > 20000) enabledTracks.push(track.id); }
  catch(error) { if (error.code !== 'ENOENT') throw error; }
}
if (process.env.VISIONOIR_ALL_TRACKS && enabledTracks.length !== tracks.length) throw Error('Missing soundtrack assets');
const shell = await readFile(resolve(output,'index.html'),'utf8');
if (!shell.includes('<!-- VISIONOIR:APP -->')) throw Error('Build the Vite shell before prerendering');
const base = process.env.VISIONOIR_BASE || '/';
const contactEndpoint = process.env.VISIONOIR_CONTACT_ENDPOINT || '';
if (contactEndpoint && !/^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(contactEndpoint)) throw Error('Invalid studio contact deployment');
const geoEndpoint = process.env.VISIONOIR_GEO_ENDPOINT ?? '';
if (geoEndpoint && new URL(geoEndpoint).protocol !== 'https:') throw Error('GeoIP requires HTTPS');

for (const lang of available) {
  await mkdir(resolve(output,localePath(lang).slice(1)),{recursive:true});
  await mkdir(resolve(output,'locales'),{recursive:true});
  await writeFile(resolve(output,'locales',lang+'.json'),JSON.stringify(dictionaries[lang]));
}

const variants = [
  { route:'/', lang:'it' },
  ...available.map(lang=>({route:localePath(lang),lang})),
];
const alternates = [
  `<link rel="alternate" hreflang="x-default" href="${site}">`,
  ...available.map(lang=>`<link rel="alternate" hreflang="${lang}" href="${new URL(localePath(lang),site)}">`),
].join('\n');
for (const { route,lang } of variants) {
  const dict = dictionaries[lang];
  const url = new URL(route,site).href;
  const meta = `<title>${escape(pageTitle(dict))}</title>
<meta name="description" content="${escape(dict.description)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="VISIONOIR">
<meta property="og:title" content="${escape(pageTitle(dict))}">
<meta property="og:description" content="${escape(dict.description)}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${site}assets/studio-x-monochrome.jpg">
<meta name="twitter:card" content="summary_large_image">
<link rel="canonical" href="${url}">
${alternates}`;
  const config = JSON.stringify({ lang, available, enabledTracks, geoEndpoint, contactEndpoint, initial:dict }).replaceAll('<','\\u003c');
  const html = shell.replace('<html lang="it">',`<html lang="${lang}" dir="${direction(lang)}">`)
    .replace('<!-- VISIONOIR:META -->',()=>meta)
    .replace('<!-- VISIONOIR:APP -->',()=>renderSite({ lang, dict, available, enabledTracks, base, contactEndpoint }))
    .replace('<!-- VISIONOIR:CONFIG -->',()=>`<script type="application/json" id="site-config">${config}</script>`);
  await writeFile(resolve(output,route.slice(1),'index.html'),html);
}
const publicRoutes = variants.flatMap(({route}) => [route, '/legal' + route, '/support' + route]);
await writeFile(resolve(output,'sitemap.xml'),`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${publicRoutes.map(route=>`<url><loc>${new URL(route,site)}</loc></url>`).join('\n')}\n</urlset>\n`);
await writeFile(resolve(output,'robots.txt'),`User-agent: *\nAllow: /\nSitemap: ${site}sitemap.xml\n`);
console.log(`Prerendered ${variants.length} pages, ${available.length} locales, ${enabledTracks.length} tracks`);

const portalShell=await readFile(resolve(output,'support/index.html'),'utf8');
const portalModule=portalShell.match(/<script[^>]+src="([^"]+)"/)?.[1];
const portalStyle=portalShell.match(/<link[^>]+rel="stylesheet"[^>]+href="([^"]+)"/)?.[1];
if (!portalModule || !portalStyle) throw Error('Missing support build assets');
await generatePortals(output,dictionaries,base,portalModule,portalStyle,contactEndpoint);
