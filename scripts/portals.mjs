import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {names,localePath} from '../src/locales.js';
import {direction,escape,contact,money} from '../src/site.js';
import {suggestedCents} from '../src/ecosystem/support-state.js';

export async function generatePortals(output,dictionaries,base,scriptPath,stylePath,contactEndpoint) {
  for(const portal of ['support','legal']){
    for(const [variant,d] of [[null,dictionaries.it],...Object.entries(dictionaries)]){
      const lang=variant||'it';
      const url=route=>base+route+'/'+lang.toLowerCase()+'/';
      const studio=base.replace(/\/$/,'')+localePath(lang);
      const title=portal==='support'?d.ecoSupport:d.ecoLegal;
      const text=key=>escape(d[key]);
      const artwork='<img src="'+base+'assets/logo.svg" width="26" height="26" alt="">';
      const nav=Object.entries(names).map(([code,name])=>'<a href="'+base+portal+'/'+code.toLowerCase()+'/" lang="'+code+'" hreflang="'+code+'">'+name+'</a>').join('');
      const options=suggestedCents.map((c,i)=>'<label><input type="radio" name="amount" value="'+c+'" '+(i===1?'checked':'')+'><span>'+money(lang,c/100)+'</span></label>').join('');
      const support='<div class="layout"><div><h1>'+escape(title)+'</h1><p class="lead">'+text('ecoSupportText')+'</p></div><section class="panel"><fieldset><legend>'+text('ecoAmount')+'</legend><div class="amounts">'+options+'<label><input type="radio" name="amount" value="custom"><span>'+text('ecoCustom')+'</span></label></div><input id="custom-amount" class="custom" aria-label="'+text('ecoCustom')+' (EUR)" type="text" inputmode="decimal" maxlength="12" disabled placeholder="EUR"></fieldset><p>'+text('ecoClosed')+'</p><a class="contact" href="mailto:'+contact+'">'+text('ecoContact')+' ↗</a></section></div>';
      const links='<p><a href="https://github.com/visionoir-platform/visionoir-platform.github.io/blob/main/frequency/LICENSE">MIT License</a> · <a href="https://github.com/visionoir-platform/visionoir-platform.github.io/blob/main/ASSET_LICENSES.md">'+text('license')+'</a></p>';
      const inquiry='<article id="requests"><h2>'+text('inquiryPrivacy')+'</h2>'+['req_processing','req_choices','req_researchSource','req_retention','req_tools','req_transfers'].map(k=>'<p>'+text(k)+'</p>').join('')+'<p>'+text(contactEndpoint?'inquiryDirect':'inquiryManual')+'</p><p><a dir="ltr" href="mailto:'+contact+'">'+contact+'</a></p><p><a href="https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement#international-data-transfers">GitHub</a> · <a href="https://policies.google.com/privacy/frameworks">Google</a> · <a href="https://foundation.wikimedia.org/wiki/Policy:Privacy_policy">Wikimedia / Wikidata</a> · <a href="https://www.garanteprivacy.it/">Garante per la protezione dei dati personali</a></p></article>';
      const legal='<h1>'+escape(title)+'</h1>'+inquiry+'<article><h2>'+text('privacy')+'</h2><p>'+text('req_tools')+'</p><p>'+text('ecoLocalData')+'</p><p>'+text('legal_availability')+'</p><p>'+text(contactEndpoint?'inquiryDirect':'inquiryManual')+'</p><a href="https://docs.github.com/site-policy/privacy-policies/github-general-privacy-statement">GitHub Pages · '+text('privacy')+'</a></article><article><h2>'+text('credits')+'</h2><p>'+text('logoCredit')+'</p><p>'+text('ecoRights')+'</p><p>'+text('legal_user')+'</p>'+links+'</article><article><h2>'+text('ecoSupport')+'</h2><p>'+text('ecoClosed')+'</p><a href="'+url('support')+'">'+text('ecoSupport')+' ↗</a></article><article><h2>'+text('contact')+'</h2><p>'+text('legal_access')+'</p><p>'+text('legal_live')+'</p><p>'+text('legal_rightsHelp')+'</p><a href="mailto:'+contact+'" dir="ltr">'+contact+'</a></article>';
      const html='<!doctype html><html lang="'+lang+'" dir="'+direction(lang)+'" data-neutral="'+String(!variant)+'" data-portal="'+portal+'"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"><meta name="author" content="Flavio Giorgio Guarini"><title>'+escape(title)+' · VISIONOIR</title><link rel="icon" href="'+base+'favicon.svg"><link rel="stylesheet" href="'+stylePath+'"><script type="module" src="'+scriptPath+'"></script></head><body><header><a href="'+studio+'">'+artwork+'VISIONOIR</a><a href="'+studio+'">'+text('ecoBack')+'</a></header><main>'+(portal==='support'?support:legal)+'</main><footer><span lang="en">Created, designed and developed by Flavio Giorgio Guarini.</span><a href="'+url(portal==='support'?'legal':'support')+'">'+text(portal==='support'?'ecoLegal':'ecoSupport')+'</a><details class="languages"><summary>'+names[lang]+'</summary><nav>'+nav+'</nav></details></footer></body></html>';
      const target=resolve(output,portal,variant?lang.toLowerCase():'');
      await mkdir(target,{recursive:true}); await writeFile(resolve(target,'index.html'),html);
    }
  }
}
