import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import test from 'node:test';
import * as audio from '../audio/model.js';
import { renderEditor } from '../views.js';

const path = new URL('../locales/', import.meta.url);
const catalog = code => JSON.parse(readFileSync(new URL(code + '.json', path), 'utf8'));
const regional = { 'de-CH':'de', 'fr-CH':'fr', 'it-CH':'it' };

function markup(code = 'en', overrides = {}) {
  const p = audio.createProject();
  p.tracks[0].name = 'A & B';
  p.scenes[0].patterns[0] = {length:2, steps:[null, {note:61, velocity:.625, accent:true}, {note:87, velocity:1}]};
  const dict = {...catalog(regional[code] || code), ...catalog(code)};
  const s = {p, scene:0, channel:0, page:0, step:1, bank:0, bankSize:8, view:'sequencer', ...overrides};
  const html = renderEditor(s, key => dict[key] ?? key, audio, code);
  return s.view === 'sequencer' ? html.split('<div class="bar-tools">')[0] : html;
}

test('the matrix exposes actual positions, pressed state and localized pitch and velocity in every language', () => {
  const langs = readdirSync(path).filter(f => f.endsWith('.json')).map(f => f.slice(0,-5));
  assert.equal(langs.length, 19);
  for (const lang of langs) {
    const html = markup(lang);
    const dict = {...catalog(regional[lang] || lang), ...catalog(lang)};
    assert.ok(dict.gridKeys.includes('F2'), lang);
    assert.ok(html.includes('aria-describedby="grid-help"'), lang);
    assert.ok(html.includes('role="grid"') && html.includes('role="rowheader"') && html.includes('role="columnheader"'), lang);
    const percent = new Intl.NumberFormat(lang, {style:'percent', maximumFractionDigits:1}).format(.625);
    assert.ok(html.includes('data-pos="1" data-beat="1" aria-label="A &amp; B · ' + dict.step + ' 2 · ' + dict.note + ' C♯4 · ' + dict.velocity + ' ' + percent + ' · ' + dict.accent + '" aria-pressed="true"'),lang);
    assert.ok(html.includes('data-pos="2" data-beat="2" aria-label="A &amp; B · ' + dict.step + ' 3" aria-pressed="false" aria-keyshortcuts="F2" tabindex="-1" disabled'), lang);
    assert.equal(html.match(/tabindex="0"/g)?.length,1,lang);
    assert.match(html,/aria-rowcount="17" aria-colcount="17"/);
  }
});

test('cursor has a single enabled destination on shortened rows and across pages or banks', () => {
  assert.match(markup('en',{gridFocus:{channel:0,pos:15}}),/data-channel="0" data-pos="1"[^>]+tabindex="0"/);
  const later = markup('en',{page:1,bank:1,gridFocus:{channel:0,pos:8}});
  assert.match(later,/role="row" aria-rowindex="10"/);
  assert.match(later,/role="gridcell" aria-colindex="18"/);
  assert.match(later,/data-action="channel" data-index="8" tabindex="0"/);
  assert.equal(later.match(/tabindex="0"/g).length,1);
});

test('every mixer channel has a named, tabbable selector and only the selected channel is pressed', () => {
  const html = markup('en',{view:'mixer', channel:2});
  const buttons = html.match(/<button[^>]+data-action="channel"[^>]*>[^<]*<\/button>/g);
  assert.equal(buttons.length,16);
  assert.match(buttons[0],/>A &amp; B<\/button>/);
  for (const [index, button] of buttons.entries()) {
    assert.ok(button.includes('data-index="' + index + '"'));
    assert.ok(button.includes('aria-pressed="' + (index === 2) + '"'));
    assert.doesNotMatch(button,/tabindex="-1"|disabled/);
  }
});
