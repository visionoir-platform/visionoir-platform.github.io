import test from 'node:test';
import assert from 'node:assert/strict';
import { matchLocale, names, resolveLocale } from '../src/locales.js';
import { approximateCountry } from '../src/geo.js';
const available=Object.keys(names);
test('normalizes supported tags and preserves regional meaning',()=>{
  for (const [tag,expected] of Object.entries({
    'it-IT':'it','en-US':'en','de-DE':'de','zh-CN':'zh-Hans','pt':'pt-PT',
    'pt_BR':'pt-BR','de-ch':'de-CH','fr-ch':'fr-CH','rm':'rm-CH','zh-TW':null,'he':null,
  })) assert.equal(matchLocale(tag,available),expected,tag);
});
test('country precedes browser preferences only on neutral URLs without a saved choice',()=>{
  const resolve=options=>resolveLocale({available,languages:['en-US'],...options});
  assert.equal(resolve({manual:'de',explicit:'es',saved:'it',country:'BR'}),'de');
  assert.equal(resolve({explicit:'es',saved:'it',country:'BR'}),'es');
  assert.equal(resolve({saved:'it',country:'BR'}),'it');
  for (const [country,lang] of [['ES','es'],['BR','pt-BR'],['PT','pt-PT']]) {
    assert.equal(resolve({country}),lang);
  }
  assert.equal(resolve({country:'CH',languages:['fr-FR','de']}),'fr-CH');
  assert.equal(resolve({country:'CH',languages:['rm']}),'rm-CH');
  assert.equal(resolve({languages:['en-CA']}),'en');
  assert.equal(resolve({languages:['he']}),'it');
});
test('GeoIP falls back offline, does not retain IP, and ignores late results',async()=>{
  globalThis.localStorage={
    getItem(){throw new Error('Unavailable');},
    setItem(){throw new Error('Unavailable');},
  };
  globalThis.fetch=async()=>{throw new Error('Offline');};
  assert.equal(await approximateCountry('https://example.test',15),null);
  globalThis.fetch=()=>new Promise(resolve=>setTimeout(()=>resolve({ok:true,json:async()=>({country:'ES'})}),30));
  assert.equal(await approximateCountry('https://example.test',5),null);
  let stored;
  globalThis.localStorage={getItem(){return null;},setItem(key,value){stored=value;}};
  globalThis.fetch=async()=>({ok:true,json:async()=>({country:'BR',ip:'192.0.2.1'})});
  assert.equal(await approximateCountry('https://example.test',15),'BR');
  assert.equal(JSON.parse(stored).country,'BR');
  assert.equal(JSON.parse(stored).ip,undefined);
});
