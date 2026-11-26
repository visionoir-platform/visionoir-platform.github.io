import { pianoView } from './piano.js';
import { audioRegionList } from './region-editor.js';
import { liveEffectIds, liveEffectRest } from './audio/live-effects.js';
import { samplerPanel } from './sampler-panel.js';
import {
  escape as h,
  attr,
  pad,
  noteName,
  option,
  act,
  number,
  slider,
  dial,
  instrumentParamLabel,
  instrumentParamStep,
  select,
} from './ui-kit.js';
const data = (key, n) => `data-${key}="${attr(n)}"`;
const scroller = (html, tabStop = true) => `<div class="scroll-zone"${tabStop ? ' tabindex="0"' : ''}>${html}</div>`;
export function renderEditor(state, t, audio, locale = 'it') {
  const { p, scene, channel, page, view } = state;
  const tr = p.tracks[channel],
    pat = p.scenes[scene].patterns[channel],
    ins = audio.INSTRUMENTS.find((i) => i.id === tr.instrument);
  const head = `<header class="panelhead"><div><small>${h(t(view === 'live' ? 'performance' : 'project'))} / ${h(p.name)}</small><h2>${h(t(view === 'live' ? 'performance' : view))}</h2></div><div class="zone-options">${select(t('scene'), 'scene', p.scenes.map((s, i) => option(i, pad(i + 1) + ' · ' + s.name, i === scene)).join(''))}</div></header>`;
  const rows = state.bank * Math.max(1, state.bankSize),
    cut = p.tracks.slice(rows, rows + state.bankSize);
  const rowLabel = (track, index, tabIndex) => act('channel', track.name, {
    classes:'row-label', pressed:index === channel,
    data:data('index', index) + (tabIndex === undefined ? '' : ' tabindex="' + tabIndex + '"'),
  });
  const ctrls = `<div class="matrix-commands">${act('bank-prev', '◂', { title: t('previous'), disabled: !state.bank })}<span>${pad(rows + 1)}–${pad(rows + cut.length)}</span>${act('bank-next', '▸', { title: t('next'), disabled: rows + cut.length >= p.tracks.length })}<i></i>${act('page-prev', '‹', { title: t('previous'), disabled: !page })}<span>${pad(page * 16 + 1)}–${pad(page * 16 + 16)}</span>${act('page-next', '›', { title: t('next'), disabled: page >= 7 })}</div>`;
  const stepGrid = () => {
    const start = page * 16;
    const cursor = state.gridFocus ?? { channel, pos: state.step };
    const activeRow = Math.max(rows, Math.min(rows + cut.length - 1, cursor.channel));
    const activeLength = p.scenes[scene].patterns[activeRow].length;
    const activePos = cursor.pos === -1 || activeLength <= start ? -1 :
      Math.max(start, Math.min(start + 15, activeLength - 1, cursor.pos));
    const percent = new Intl.NumberFormat(locale, {style:'percent', maximumFractionDigits:1});
    const columns = Math.max(start + 16, ...p.scenes[scene].patterns.map(pattern => pattern.length)) + 1;
    const numbers = Array.from({length:16}, (_, i) =>
      `<span role="columnheader" aria-colindex="${start + i + 2}" data-beat="${i}">${pad(start + i + 1)}</span>`).join('');
    const header = `<div role="row" aria-rowindex="1" class="step-row step-numbers"><span role="columnheader" aria-colindex="1">${h(t('instrument'))}</span>${numbers}</div>`;
    const lines = cut.map((tr,j) => {
      const ci = rows + j, pattern = p.scenes[scene].patterns[ci];
      const tab = pos => ci === activeRow && pos === activePos ? 0 : -1;
      const label = rowLabel(tr, ci, tab(-1));
      const cells = Array.from({length:16}, (_, i) => {
        const pos = start + i, outside = pos >= pattern.length;
        const event = outside ? null : pattern.steps[pos];
        const title = [tr.name, t('step') + ' ' + (pos + 1)];
        if (event) {
          title.push(t('note') + ' ' + noteName(event.note), t('velocity') + ' ' + percent.format(event.velocity));
          if (event.accent) title.push(t('accent'));
        }
        return `<div role="gridcell" aria-colindex="${pos + 2}"><button type="button" class="cell ${i % 4 === 0 ? 'downbeat' : ''} ${event ? 'on' : ''} ${event?.accent ? 'accent' : ''}" data-action="step" data-channel="${ci}" data-pos="${pos}" data-beat="${i}" aria-label="${attr(title.join(' · '))}" aria-pressed="${!!event}" aria-keyshortcuts="F2" tabindex="${tab(pos)}" ${outside ? 'disabled' : ''} style="--vel:${event?.velocity ?? 0}"></button></div>`;
      }).join('');
      return `<div role="row" aria-rowindex="${ci + 2}" class="step-row ${ci === channel ? 'selected' : ''}" style="--voice:${channelColor(ci)}"><div role="rowheader" aria-colindex="1">${label}</div>${cells}</div>`;
    }).join('');
    return `<p id="grid-help" class="step-grid-help">${h(t('gridKeys'))}</p>` +
      scroller(`<div role="grid" aria-label="${attr(t('sequencer'))}" aria-describedby="grid-help" aria-rowcount="${p.tracks.length + 1}" aria-colcount="${columns}" class="step-matrix" dir="ltr">${header}${lines}</div>`, false);
  };
  if (view === 'sequencer')
    return (
      head +
      ctrls +
      stepGrid() +
      `<div class="bar-tools">${select(
        t('length'),
        'length',
        [...new Set([8, 12, 15, 16, 24, 32, 48, 64, 96, 128, pat.length])]
          .sort((a, b) => a - b)
          .map((n) => option(n, n, n === pat.length))
          .join(''),
      )}${act('edit-step', t('edit') + ' ' + t('step'))}${act('inspect-step',t('select') + ' · ' + t('step'),{pressed:!!state.inspectStep})}${act('pattern-tools', t('tools'))}${act('add-channel', '+ ' + t('instrument'), { disabled: p.tracks.length >= 32 })}</div>` +
      instrumentPanel(state, t, audio)
    );
  if (view === 'piano') return pianoView(state,t,ctrls,head);
  if (view === 'arrangement') {
    let bar = 1;
    const clips = p.arrangement
      .map((clip, i) => {
        const at = bar;
        bar += clip.bars;
        return `<li class="clip" data-arrange-index="${i}"><button type="button" class="clip-no clip-grip" data-action="clip-move-to" data-index="${i}" data-grip="${i}" title="${attr(t('shift') + ' · ' + t('clip'))}" aria-label="${attr(t('shift') + ' · ' + t('clip') + ' ' + (i+1))}">⠿ ${pad(at)}</button>${select(t('scene'), 'clip-scene:' + i, p.scenes.map((s, j) => option(j, s.name, j === clip.scene)).join(''))}${number(t('bars'), 'clip-bars:' + i, clip.bars, Math.max(1,...(clip.audioRegions || []).map(r=>Math.floor(r.step/16)+1),...(clip.automation||[]).map(l=>1+Math.floor(Math.max(0,...l.points.map(p=>p.step))/16))), 4096)}<div>${act('clip-up', '↑', { title: t('previous'), data: data('index', i), disabled: i === 0 })}${act('clip-down', '↓', { title: t('next'), data: data('index', i), disabled: i === p.arrangement.length - 1 })}${act('clip-duplicate', '⧉', { title: t('duplicate'), data: data('index', i) })}${act('clip-delete', '×', { title: t('remove'), data: data('index', i), disabled: p.arrangement.length === 1 })}</div></li>`;
      })
      .join('');
    const timeline = scroller(
      `<div class="timeline" style="--count:${p.arrangement.length}" dir="ltr"><div class="timeline-row"><span>${h(t('bars'))}</span>${p.arrangement.map((clip, i) => `<button data-action="clip-marker" data-index="${i}" title="${attr(t('marker'))}">${pad(i + 1)} · ${h(clip.marker || p.scenes[clip.scene].name)}</button>`).join('')}</div>${p.tracks
        .map(
          (tr, ti) =>
            `<div class="timeline-row" style="--voice:${channelColor(ti)}"><span>${h(tr.name)}</span>${p.arrangement
              .map((clip, j) => {
                const source = clip.trackScenes?.[ti] ?? clip.scene;
                const evt = source >= 0 && p.scenes[source]?.patterns[ti]?.steps.some(Boolean);
                return `<button class="${evt ? 'clip-sounding' : ''}" data-action="clip-source" data-index="${j}" data-channel="${ti}" title="${attr(tr.name + ' · ' + t('source'))}">${source === -1 ? '—' : pad(source + 1)}</button>`;
              })
              .join('')}</div>`,
        )
        .join('')}</div>`,
    );
    return (
      head +
      timeline + audioRegionList(p, t) + '<div class="bar-tools">'+act('auto-open',t('automation'))+'</div>' +
      `<div class="bar-tools">${act('play-song', t('play') + ' · ' + t('arrangement'), { icon: '▶' })}${act('add-clip', '+ ' + t('scene'))} ${act('rename-scene', t('edit') + ' · ' + t('scene'))}<span>${bar - 1} ${h(t('bars'))}</span></div><ol class="clips">${clips}</ol>`
    );
  }
  if (view === 'mixer') {
    const buses = `<section class="instrument-panel"><h3>Bus</h3><div class="buses">${audio.BUSSES.map(
      (bus, i) => {
        const b = p.buses?.[bus] || { volume: 1, mute: false };
        return `<article><meter data-meter="bus:${i}" min="0" max="1" value="0" aria-label="${attr(bus)}"></meter>${slider(bus.toUpperCase(), 'bus:' + bus + ':volume', b.volume, 0, 2)}${act('bus-mute', 'M', { title: t('mute') + ' · ' + bus, data: data('id', bus), pressed: !!b.mute })}</article>`;
      },
    ).join('')}</div></section>`;
    return (
      head +
      scroller(
        `<div class="mixer">${p.tracks.map((tr, i) => `<article class="channel" style="--voice:${channelColor(i)}"><header><small>CH ${pad(i + 1)}</small>${rowLabel(tr, i)}</header><div class="meters"><meter data-meter="peak:${i}" min="0" max="1" value="0" title="Peak"></meter><meter data-meter="rms:${i}" min="0" max="1" value="0" title="RMS"></meter></div>${slider(t('gain'), 'track:' + i + ':gain', tr.gain ?? 1, 0, 2)}${slider(t('volume'), 'track:' + i + ':volume', tr.volume)}${slider('Pan', 'track:' + i + ':pan', tr.pan, -1, 1)}<div class="pair">${act('mute', 'M', { title: t('mute') + ' · ' + tr.name, pressed: tr.mute, data: data('index', i) })}${act('solo', 'S', { title: 'Solo · ' + tr.name, pressed: tr.solo, data: data('index', i) })}</div></article>`).join('')}</div>`,
      ) +
      buses +
      instrumentPanel(state, t, audio)
    );
  }
  if (view === 'live') {
    const liveChannel = '<div class="live-channel">' +
      select(t('instrument'),'channel',p.tracks.map((tr,i)=>option(i,pad(i+1)+' · '+tr.name,i===channel)).join('')) +
      '<meter data-meter="peak:'+channel+'" min="0" max="1" value="0" aria-label="'+attr(t('peak'))+'"></meter>'+
      slider(t('volume'),'track:'+channel+':volume',tr.volume) +
      act('mute',t('mute'),{pressed:tr.mute,data:data('index',channel)})+
      act('solo','Solo',{pressed:tr.solo,data:data('index',channel)})+
      act('track-settings','FX / I/O')+'</div>';
    return (
      head +
      `<div class="bar-tools">${act('protect', t('protectedMode'), { pressed: state.protect })}${act('add-scene', '+ ' + t('scene'))}${act('master-mute', t('mute') + ' · ' + t('master'), { pressed: !!p.master.mute })}${act('tap', 'Tap tempo')}${act('preflight', t('check'))}${number(t('sceneFade') + ' · ♩', 'crossfade-beats', p.crossfadeBeats ?? 1, 0, 4, 0.25)}</div><div class="scene-pads">${p.scenes.map((s, i) => act('launch', pad(i + 1) + ' / ' + s.name, { classes: 'scene-pad', pressed: state.playScene === i, data: data('index', i) })).join('')}</div><h3>${h(t('instrument'))}</h3><div class="pads">${p.tracks.map((tr, i) => `<button data-pad="${i}" style="--voice:${channelColor(i)}"><small>${pad(i + 1)}</small>${h(tr.name)}</button>`).join('')}</div><div class="live-faders"><div class="instrument-panel"><h3>Live FX</h3><div class="knobs">${liveEffectIds
        .map((id) => {
          const fx = p.master.fx?.find((e) => e.id === id);
          return slider(
            audio.EFFECTS.find((e) => e.id === id)?.name || id,
            'livefx:' + id,
            fx && !fx.bypass ? fx.amount : liveEffectRest(id),
          );
        })
        .join('')}</div></div>` +
      liveChannel + masterPanel(state, t) + '</div>'
    );
  }
  return head;
}
export function channelColor(i) {
  return [
    '#e5f997',
    '#9ad7bd',
    '#a8e5cc',
    '#b6cbe1',
    '#94b2da',
    '#e6ab91',
    '#ddd1ab',
    '#c1ad8b',
    '#d59d94',
    '#bdc9bb',
    '#a9bdf0',
    '#a4adf0',
    '#b99cd2',
    '#babfc8',
    '#9dd9d5',
    '#e1bd9c',
  ][i % 16];
}
export function masterPanel(state, t, showRackButton = true) {
  const m = state.p.master;
  return `<section class="instrument-panel"><div class="panelhead"><h3>${h(t('master'))}</h3><span class="meter-label">L / R</span></div><div class="knobs">${slider(t('volume'), 'master:volume', m.volume)}${slider('Limiter', 'master:ceiling', m.ceiling, 0.1, 0.999, 0.001)}</div>${showRackButton ? act('master-fx', t('master') + ' FX') : ''}</section>`;
}
function instrumentPanel(state, t, audio) {
  const tr = state.p.tracks[state.channel],
    params = Object.entries({ ...audio.PARAMETER_BANK[tr.instrument], ...tr.params })
      .filter(([key]) => tr.instrument !== 'sampler' || (key !== 'slice' && key !== 'slicePad'));
  return `<section class="instrument-panel"><header class="panelhead"><div><small>CH ${pad(state.channel + 1)} / ${h(tr.bus.toUpperCase())}</small><h3>${h(tr.name)}</h3></div><div>${act('preview', '▷', { title: t('play') + ' · ' + tr.name })} ${act('patches', t('presets')) + ' ' + act('track-settings', 'FX / I/O')}</div></header><div class="knobs">${params.map(([key, v]) => dial(instrumentParamLabel(tr.instrument, key, t), 'param:' + key, v, instrumentParamStep(tr.instrument, key))).join('')}</div>${tr.instrument === 'sampler' ? `<div data-sampler-panel>${samplerPanel(tr,t)}</div><label class="import-sample">${h(t('importFile'))} <input type="file" id="sample-file" accept="audio/*"></label>` : ''}</section>`;
}
