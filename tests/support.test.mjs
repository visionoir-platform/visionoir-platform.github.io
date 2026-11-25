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
