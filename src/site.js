import { localePath, names, site } from './locales.js';
import { tracks } from './tracks.js';

export const contact = 'visionoir.platform@gmail.com';
export const servicePrices = { brand:450, content:350, sound:250, retainer:600, experience:1200, packX:null };
export const escape = value => String(value).replace(/[&<>"']/g, ch => ({
  '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;',
})[ch]);
export const direction = lang => lang === 'ar' ? 'rtl' : 'ltr';
export const pageTitle = dict => `VISIONOIR — ${dict.title}`;
export const money = (lang, price) => new Intl.NumberFormat(lang, {
  style:'currency', currency:'EUR', maximumFractionDigits:0,
}).format(price);
export const globe = '<svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="4" ry="9"/><path d="M3 12h18"/></svg>';
const arrow = '<span class="arrow" aria-hidden="true">↗</span>';

export function renderSite({ lang, dict, available, enabledTracks, base }) {
  const t = (key, tag='span', attrs='') => `<${tag} data-text="${key}" ${attrs}>${escape(dict[key])}</${tag}>`;
  const a11y = key => `data-label="${key}" aria-label="${escape(dict[key])}"`;
  const asset = path => `${base}assets/${path}`;
  const choices = tracks.filter(track => enabledTracks.includes(track.id));
  const trackName = track => track.id === 'afterimage' ? escape(track.title) : t(track.id);
  const allLinks = available.map(tag => `<a href="${base.replace(/\/$/,'')}${localePath(tag)}" hreflang="${tag}" lang="${tag}" dir="${direction(tag)}" data-locale="${tag}"${tag===lang?' aria-current="true"':''}>${names[tag]}</a>`).join('');
  return `
${t('skip','a','class="skip" href="#contenuto"')}
<header class="topbar">
 <a href="#inizio" class="identity"><img src="${asset('logo.svg')}" width="28" height="28" alt=""><b>VISIONOIR</b></a>
 <nav id="navigation" ${a11y('nav')}>
  ${t('experience','a','href="#universo"')}${t('services','a','href="#servizi"')}${t('studio','a','href="#studio"')}${t('contact','a','href="#contatto"')}
 </nav>
 <div class="top-tools">
  <button id="menu-toggle" type="button" aria-controls="navigation" aria-expanded="false"><span aria-hidden="true">☰</span>${t('menu')}</button>
  <details class="languages"><summary>${globe}<span id="language-name" lang="${lang}">${names[lang]}</span><span class="sr-only">${t('language')}</span></summary>
   <div class="language-grid">${allLinks}</div>
  </details>
 </div>
</header>
<main id="contenuto">
 <section class="intro" id="inizio">
  <div class="intro-copy">
   <span class="kicker">VISIONOIR</span>
   <h1>${t('heroFirst')} ${t('heroAccent','em')}</h1>
   ${t('heroCopy','p')}
   <a class="cta" href="#contatto">${t('start')}${arrow}</a>
  </div>
  <div id="logo-scene" role="img" ${a11y('logo')}>
   <img class="scene-fallback poster" src="${asset('logo.svg')}" alt="" width="660" height="790" fetchpriority="high">
  </div>
 </section>
 <section class="section lab" id="universo">
  <div class="section-copy">${t('experience','p','class="kicker"')}${t('labTitle','h2')}${t('labCopy','p')}
   <button class="cta cta-secondary js-only" id="immersive">${t('scene')}${arrow}</button>
  </div>
  <div class="track-grid js-only" ${a11y('track')} role="group">
   ${choices.map(track => `<button class="track-card" data-track="${track.id}" aria-pressed="${track.id==='chrome'}"><i aria-hidden="true"></i><span>${trackName(track)}<small>${escape(track.title)} · <bdi>${track.bpm} BPM</bdi></small></span><span aria-hidden="true">▷</span></button>`).join('')}
  </div>
 </section>
 <section class="section service-section" id="servizi">
  <div class="section-copy">${t('services','p','class="kicker"')}${t('servicesTitle','h2')}${t('servicesCopy','p')}</div>
  <div class="services-grid">${Object.entries(servicePrices).map(([id,price])=>`<article class="service-card${id==='packX'?' service-card-custom':''}">
   ${t(id+'Name','h3')}${t(id+'Copy','p')}
   <div class="service-end"><div>${price===null ? t('packXPrice','strong') : `<bdi data-price="${price}">${money(lang,price)}</bdi>`}${id==='retainer'?t('month','small'):''}</div>
   <a class="underlink" href="#contatto" data-service="${id}">${t(id==='packX'?'packXChoose':'choose')}${arrow}</a></div>
  </article>`).join('')}</div>
  ${t('prices','p','class="fine"')}
 </section>
 <section class="section work-section" id="progetti">
  <div class="section-copy">${t('works','h2')}${t('workCopy','p')}</div>
  <figure class="studio-art"><img src="${asset('studio-x-monochrome.jpg')}" data-alt="workAlt" alt="${escape(dict.workAlt)}" loading="lazy" width="1983" height="793"><figcaption>STUDIO X</figcaption></figure>
 </section>
 <section class="section studio-section" id="studio">
  <div class="section-copy">${t('studio','p','class="kicker"')}${t('studioTitle','h2')}${t('studioCopy','p')}</div>
  <div class="people"><div><h3>Flavio Giorgio Guarini</h3>${t('flavio','p')}</div><div><h3>Maria Bellini</h3>${t('maria','p')}</div></div>
  <div class="method" id="metodo">${t('method','h3')}${t('methodCopy','p')}</div>
  <a class="social" href="https://www.instagram.com/visionoir_/" target="_blank" rel="noopener noreferrer">
    <span class="social-mark" aria-hidden="true">↗</span>
    <span>${t('instagram')}<small dir="ltr">@visionoir_</small></span>${arrow}
  </a>
 </section>
 <section class="section contact-section" id="contatto"><div class="section-copy">
  ${t('contact','p','class="kicker"')}${t('contactTitle','h2')}${t('contactCopy','p')}
  <a class="underlink" href="mailto:${contact}" dir="ltr">${contact}${arrow}</a>
 </div>
 <form id="brief-form" class="js-only" novalidate>
  <label>${t('name')}<input name="name" autocomplete="name" required maxlength="120" dir="auto" aria-describedby="error-name"><span class="error" id="error-name"></span></label>
  <label>${t('email')}<input name="email" type="email" autocomplete="email" required maxlength="180" dir="ltr" aria-describedby="error-email"><span class="error" id="error-email"></span></label>
  <label>${t('service')}<select name="service">${t('undecided','option','value=""')}${Object.keys(servicePrices).map(id=>t(id+'Name','option',`value="${id}"`)).join('')}</select></label>
  <label>${t('message')}<textarea name="message" required minlength="10" maxlength="4000" rows="3" dir="auto" aria-describedby="error-message"></textarea><span class="error" id="error-message"></span></label>
  ${t('formNote','p','class="fine"')}<button class="cta" type="submit">${t('prepare')}${arrow}</button>
 </form></section>
 <section class="section faq-section">${t('faq','h2')}<div>${['idea','remote','ai','delivery'].map(id=>`<details>${t(id+'Q','summary')}${t(id+'A','p')}</details>`).join('')}</div></section>
</main>
<footer class="footer">
 <b>VISIONOIR</b><span>© 2026</span>
 <details>${t('privacy','summary')}${t('privacyCopy','p')}<p id="geo-disclosure" hidden>${t('privacyGeo')}</p><a href="mailto:${contact}" dir="ltr">${contact}</a></details>
 <details>${t('credits','summary')}${t('logoCredit','p')}${t('musicCredit','p')}${enabledTracks.includes('alloy')||enabledTracks.includes('aura')?t('creditsNew','p'):''}${t('rights','p')}<a class="underlink" href="${asset('AUDIO-LICENSE.txt')}">${t('license')} · 01–04</a>${enabledTracks.includes('alloy')? ` <a class="underlink" href="${asset('AUDIO-PREMIUM-LICENSE.txt')}">${t('license')} · 05–06</a>` : ''}</details>
</footer>
<aside class="player js-only" ${a11y('audio')}>
 <button id="sound-toggle" type="button" aria-pressed="false"><span aria-hidden="true" class="sound-icon">▷</span><span id="sound-state">${escape(dict.sound)}</span></button>
 <label class="track-select"><span class="sr-only">${t('track')}</span><select id="track-select" ${a11y('track')}>${choices.map(track=>track.id==='afterimage'?'<option value="afterimage">AFTERIMAGE</option>':t(track.id,'option',`value="${track.id}"`)).join('')}</select></label>
 <div class="player-options"><button id="mute" type="button" aria-pressed="false">${escape(dict.mute)}</button>
 <label class="volume"><span class="sr-only">${t('volume')}</span><input id="volume" type="range" min="0" max="100" value="23" ${a11y('volume')}></label>
 <button id="motion-toggle" type="button" aria-pressed="false">${escape(dict.motionOff)}</button></div>
</aside>
<section id="immersive-view" hidden><button type="button" class="cta cta-secondary" id="exit-immersive">${t('exit')} <span aria-hidden="true">×</span></button></section>
<dialog id="brief-dialog" aria-labelledby="brief-heading">
 ${t('briefTitle','h2','id="brief-heading"')}
 <pre id="brief-text" dir="auto"></pre>
 <p id="brief-status" class="fine" role="status"></p>
 <div class="dialog-actions">${t('send','a','id="send-brief" class="cta"')}${t('copy','button','id="copy-brief" class="cta cta-secondary"')}${t('download','button','id="download-brief" class="cta cta-secondary"')}${t('close','button','id="close-brief" class="cta cta-secondary"')}</div>
</dialog>
<p id="status" class="status" role="status" aria-live="polite"></p>`;
}
export function updateMetadata(lang, dict, explicit) {
  document.documentElement.lang = lang;
  document.documentElement.dir = direction(lang);
  document.title = pageTitle(dict);
  for (const [selector, content] of Object.entries({
    'meta[name=description]':dict.description, 'meta[property="og:title"]':pageTitle(dict),
    'meta[property="og:description"]':dict.description,
    'meta[property="og:url"]':explicit ? new URL(localePath(lang),site).href : site,
  })) document.querySelector(selector)?.setAttribute('content',content);
  document.querySelector('link[rel=canonical]')?.setAttribute('href',explicit ? new URL(localePath(lang),site).href : site);
}
