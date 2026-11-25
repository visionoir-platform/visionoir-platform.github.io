import {contact, escape} from '../src/site.js';
import {policyLocale} from './ecosystem-locales.mjs';

const repo = 'https://github.com/visionoir-platform/visionoir-platform.github.io/blob/main/';
const providers = [
  ['GitHub Pages', 'https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement#international-data-transfers'],
  ['Google', 'https://policies.google.com/privacy/frameworks'],
  ['Wikimedia / Wikidata', 'https://foundation.wikimedia.org/wiki/Policy:Privacy_policy'],
  ['Garante per la protezione dei dati personali', 'https://www.garanteprivacy.it/'],
];
function link(label, url) {
  return '<a href="' + escape(url) + '">' + escape(label) + '</a>';
}
function references(entries) {
  return '<p class="policy-links">' + entries.map(([title, url]) => link(title, url)).join(' · ') + '</p>';
}
function paragraphs(...texts) {
  return texts.map(value => '<p>' + escape(value) + '</p>').join('');
}
export function policyPage(lang, d, base, endpoint) {
  const {titles, copy} = policyLocale(lang);
  const email = '<p dir="ltr"><a href="mailto:' + contact + '">' + contact + '</a></p>';
  const repoLink = (label, path) => references([[label, repo + path]]);
  const terms = [
    ['requests', 'privacy', '<h3>' + escape(d.inquiryPrivacy) + '</h3>' + paragraphs(d.req_processing, d.req_choices, d.req_researchSource, d.req_retention, d.req_tools, d.req_transfers, endpoint ? d.inquiryDirect : d.inquiryManual) + references(providers)],
    ['storage', 'storage', paragraphs(d.ecoLocalData, d.legal_availability, copy.storage)],
    ['terms', 'terms', paragraphs(copy.use, copy.commission)],
    ['operator', 'operator', paragraphs(d.studioCopy) + email],
    ['ip', 'intellectual', paragraphs(d.rights, d.logoCredit) + repoLink(titles.intellectual, 'ASSET_LICENSES.md')],
    ['licenses', 'licenses', paragraphs(d.ecoRights) + repoLink('MIT · FREQUENCY', 'frequency/LICENSE')],
    ['third-party', 'thirdParty', references([['Three.js · MIT', repo+'THIRD_PARTY_NOTICES.md'], ['LAME / lamejs · LGPL', repo+'frequency/audio/vendor/NOTICE.md'], ['Manrope · Bebas Neue · Anton (OFL)', repo+'public/assets/']])],
    ['accessibility', 'accessibility', paragraphs(d.legal_access) + email],
    ['support', 'support', paragraphs(d.ecoSupportText, d.ecoClosed) + references([[d.ecoSupport, base+'support/'+lang.toLowerCase()+'/']])],
    ['payments', 'payments', paragraphs(copy.refunds)],
    ['security', 'security', paragraphs(copy.self) + repoLink(titles.security, 'SECURITY.md')],
    ['disclosure', 'disclosure', paragraphs(copy.report) + email],
    ['copyright', 'copyright', paragraphs(copy.claim) + email],
    ['your-music', 'music', paragraphs(d.legal_user, d.ecoRights) + repoLink(titles.music, 'USER_CONTENT_POLICY.md')],
    ['availability', 'availability', paragraphs(d.legal_availability)],
    ['live-safety', 'live', paragraphs(d.legal_live)],
    ['data-rights', 'data', paragraphs(d.req_tools, d.req_retention) + email + references([providers[3]])],
    ['credits', 'credits', paragraphs(d.logoCredit, d.musicCredit, d.creditsNew) + repoLink(titles.credits, 'CREDITS.md')],
    ['services', 'services', paragraphs(copy.commission, d.prices, d.deliveryA) + references([[d.contact, base+lang.toLowerCase()+'/#contatto']])],
  ];
  const index = terms.map(([id, name]) => '<li>' + link(titles[name], '#'+id) + '</li>').join('');
  const body = terms.map(([id, name, html]) => '<article id="'+id+'" tabindex="-1"><h2>'+escape(titles[name])+'</h2>'+html+'</article>').join('');
  return '<h1>'+escape(d.ecoLegal)+'</h1><details class="policy-index"><summary>'+escape(titles.contents)+'</summary><nav aria-label="'+escape(titles.contents)+'"><ul>'+index+'</ul></nav></details>'+body;
}
