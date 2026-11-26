import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { renderSite } from '../src/site.js';
import { names, parents, parseCatalogue } from '../src/locales.js';
import { copyInstagramUsername } from '../src/instagram.js';

test('all 19 homepages open the official Instagram profile natively and expose its exact handle', async () => {
  const locales = Object.keys(names);
  assert.equal(locales.length, 19);
  const sources = new Map(await Promise.all(locales.map(async lang => [lang,parseCatalogue(
    await readFile(new URL('../src/locales/' + lang + '.txt', import.meta.url), 'utf8'))])));
  for (const lang of locales) {
    const dict = {...sources.get(parents[lang]), ...sources.get(lang)};
    for (const key of ['instagramCopy','instagramCopied','instagramManual']) assert.ok(dict[key], lang + '/' + key);
    const page = renderSite({lang,dict,available:locales,enabledTracks:[],base:'/'});
    const link = page.match(/<a class="social"[^>]+>/)?.[0];
    assert.match(link, /href="https:\/\/www\.instagram\.com\/visionoir_\/"/);
    assert.doesNotMatch(link, /\b(?:target|onclick)=/);
    assert.match(page, /id="instagram-username"[^>]*value="@visionoir_" readonly/);
  }
});

test('copy confirms the exact username only after a successful clipboard write', async () => {
  const writes = [];
  const key = await copyInstagramUsername({value:'@visionoir_'},{clipboard:{writeText:async value=>writes.push(value)}});
  assert.deepEqual(writes,['@visionoir_']);
  assert.equal(key,'instagramCopied');
});

test('missing or denied clipboard leaves the whole handle selected for manual copying', async () => {
  for(const browser of [{},{clipboard:{writeText:async()=>{throw Error('denied');}}}]) {
    const events = [];
    const field = { value:'@visionoir_', focus:opts=>events.push(opts), select:()=>events.push('select'),
      setSelectionRange:(start,end)=>events.push([start,end]) };
    assert.equal(await copyInstagramUsername(field,browser),'instagramManual');
    assert.deepEqual(events,[{preventScroll:true},'select',[0,field.value.length]]);
  }
});
