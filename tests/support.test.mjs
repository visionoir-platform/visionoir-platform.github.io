import test from 'node:test';
import assert from 'node:assert/strict';
import {supportAction,parseEuro,productionMode} from '../src/ecosystem/support-state.js';
import {ecosystemLocale} from '../scripts/ecosystem-locales.mjs';
import {names} from '../src/locales.js';
test('Disabled public support never creates a checkout. The local sandbox only previews cents.',()=>{
 assert.equal(productionMode,'DISABLED');
 for(const x of ['0.01','50','10000000000',null,'bad'])assert.deepEqual(supportAction(productionMode,x),{state:'disabled'});
 assert.equal(parseEuro('2,05'),205);assert.equal(parseEuro('1e4'),null);
 assert.deepEqual(supportAction('SANDBOX','5.50'),{state:'sandbox-preview',cents:550,currency:'EUR'});
 assert.equal(supportAction('SANDBOX','3000').state,'contact');assert.equal(supportAction('LIVE','1').state,'approval-required');
});
test('Every ecosystem language has copy, creator biography and portal controls',()=>{
 const keys=Object.keys(ecosystemLocale('it')).sort();
 for(const lang of Object.keys(names)){const d=ecosystemLocale(lang);assert.deepEqual(Object.keys(d).sort(),keys);assert.ok(d.bioC.includes('FREQUENCY'));assert.ok(d.ecoDoor);}
});

import {createSandbox} from '../scripts/support-sandbox.mjs';
test('Local contributions handle repeated actions, failure and refund without a provider',()=>{
 const s=createSandbox();assert.equal(s.preview('a','5,00').state,'pending');
 assert.equal(s.transition('a','succeeded').cents,500);assert.equal(s.preview('a','5').state,'succeeded');
 assert.throws(()=>s.preview('a','6'));assert.equal(s.transition('a','refunded').state,'refunded');
 assert.equal(s.transition('a','refunded').state,'refunded');assert.throws(()=>s.transition('a','succeeded'));
 s.preview('b','0.01');assert.equal(s.transition('b','failed').state,'failed');assert.throws(()=>s.transition('b','refunded'));
 assert.equal(s.preview('review','1000').state,'contact');assert.throws(()=>s.transition('review','succeeded'));
});

import {readFileSync} from 'node:fs';
import {parseCatalogue, parents} from '../src/locales.js';
import {policyPage} from '../scripts/policy-page.mjs';
test('Legal notices have 19 stable accessible targets, translated offline, across locales', () => {
  const catalog = lang => parseCatalogue(readFileSync(new URL('../src/locales/' + lang + '.txt', import.meta.url), 'utf8'));
  let expected;
  for (const lang of Object.keys(names)) {
    const d = {...(parents[lang] ? catalog(parents[lang]) : {}), ...catalog(lang), ...ecosystemLocale(lang)};
    const html = policyPage(lang, d, '/', true);
    const articles = [...html.matchAll(/<article id="([^"]+)" tabindex="-1">/g)].map(m => m[1]);
    const anchors = [...html.matchAll(/<li><a href="#([^"]+)"/g)].map(m => m[1]);
    expected ??= articles;
    assert.equal(new Set(articles).size, 19);
    assert.deepEqual(articles, expected);
    assert.deepEqual(anchors, articles);
    assert.ok(articles.includes('requests'));
    assert.ok(html.includes('href="/frequency/licenses/index.html"'));
    assert.ok(html.includes('/' + lang.toLowerCase() + '/#contatto'));
    assert.ok(!html.includes('undefined'));
  }
});

import {mkdtemp, readFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {portalPath} from '../src/locales.js';
import {contact, escape, renderSite} from '../src/site.js';
import {generatePortals} from '../scripts/portals.mjs';
import {parseSupportEstimate, supportInquiryHref} from '../src/ecosystem/support-state.js';

test('localized studio, support portal and draft retain language, amount and email intent', async t => {
  const workspace = await mkdtemp(join(tmpdir(),'visionoir-localized-support-'));
  t.after(()=>rm(workspace,{recursive:true,force:true}));
  const languages = Object.keys(names);
  const load = lang => parseCatalogue(readFileSync(new URL('../src/locales/'+lang+'.txt',import.meta.url),'utf8'));
  const dictionaries = Object.fromEntries(languages.map(lang=>[lang,{
    ...(parents[lang] ? load(parents[lang]) : {}), ...load(lang), ...ecosystemLocale(lang)
  }]));
  await generatePortals(workspace,dictionaries,'/','/portal.js','/portal.css',false);
  for (const lang of languages) {
    const dict = dictionaries[lang], target = portalPath('support',lang);
    const home = renderSite({lang,dict,available:languages,enabledTracks:[],base:'/'});
    assert.equal(home.split('data-portal="support" href="'+target+'"').length-1,2,lang);
    const page = await readFile(join(workspace,target,'index.html'),'utf8');
    const draft = new URL(supportInquiryHref(contact, dict.ecoSupport, dict.ecoAmount, lang));
    assert.equal(draft.searchParams.get('subject'),dict.ecoSupport);
    assert.equal(draft.searchParams.has('body'),false);
    assert.equal(draft.protocol,'mailto:'); assert.equal(draft.pathname,contact);
    assert.ok(page.includes('href="'+escape(draft.href)+'"'),lang);
    assert.ok(page.includes(escape(dict.ecoClosed)) && page.includes(escape(dict.ecoContact)),lang);
    assert.ok(dict.ecoNoAmount && page.includes('value="" checked><span>'+escape(dict.ecoNoAmount)),lang);
    const suggested = new URL(supportInquiryHref(contact,dict.ecoSupport,dict.ecoAmount,lang,1250));
    assert.equal(suggested.searchParams.get('body'), dict.ecoAmount+' · '+
      new Intl.NumberFormat(lang,{style:'currency',currency:'EUR'}).format(12.50));
  }
  for (const value of ['12,50','12.50','١٢٫٥٠','۱۲٫۵۰','１２．５０']) assert.equal(parseSupportEstimate(value),1250);
  for (const value of ['', 'abc', '−5', '0.00']) assert.equal(parseSupportEstimate(value),null);
});
