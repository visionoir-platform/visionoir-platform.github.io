import {policyPage} from './policy-page.mjs';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {names,localePath,site} from '../src/locales.js';
import {direction,escape,contact,money} from '../src/site.js';
import {suggestedCents} from '../src/ecosystem/support-state.js';

export async function generatePortals(output,dictionaries,base,scriptPath,stylePath,contactEndpoint) {
  for(const portal of ['support','legal']){
    const portalURL = code => new URL(base + portal + '/' + (code ? code.toLowerCase() + '/' : ''), site).href;
    const alternates = [['x-default', null], ...Object.keys(dictionaries).map(code => [code, code])]
      .map(([tag, code]) => '<link rel="alternate" hreflang="'+tag+'" href="'+escape(portalURL(code))+'">').join('');
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
      const meta = '<link rel="canonical" href="'+escape(portalURL(variant))+'">'+alternates
        + '<meta name="description" content="'+text(portal==='support'?'ecoSupportText':'inquiryPrivacy')+'">';
      const html='<!doctype html><html lang="'+lang+'" dir="'+direction(lang)+'" data-neutral="'+String(!variant)+'" data-portal="'+portal+'"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"><meta name="author" content="Flavio Giorgio Guarini">'+meta+'<title>'+escape(title)+' · VISIONOIR</title><link rel="icon" href="'+base+'favicon.svg"><link rel="stylesheet" href="'+stylePath+'"><script type="module" src="'+scriptPath+'"></script></head><body><header><a href="'+studio+'">'+artwork+'VISIONOIR</a><a href="'+studio+'">'+text('ecoBack')+'</a></header><main>'+(portal==='support'?support:policyPage(lang,d,base,contactEndpoint))+'</main><footer><span lang="en">Created, designed and developed by Flavio Giorgio Guarini.</span><a href="'+url(portal==='support'?'legal':'support')+'">'+text(portal==='support'?'ecoLegal':'ecoSupport')+'</a><details class="languages"><summary>'+names[lang]+'</summary><nav>'+nav+'</nav></details></footer></body></html>';
      const target=resolve(output,portal,variant?lang.toLowerCase():'');
      await mkdir(target,{recursive:true}); await writeFile(resolve(target,'index.html'),html);
    }
  }
}
