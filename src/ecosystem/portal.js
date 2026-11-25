import { names, matchLocale } from '../locales.js';
import { storageValue } from '../geo.js';
const query=new URLSearchParams(location.search).get('lang');
const codes=Object.keys(names);
const root=document.documentElement.dataset.portal;
const lang=document.documentElement.lang;
if(document.documentElement.dataset.neutral==='true'){
  const desired=matchLocale(query,codes)||matchLocale(storageValue('visionoir-language'),codes)||
    (navigator.languages||[]).map(lang=>matchLocale(lang,codes)).find(Boolean)||'it';
  const dest=new URL(location.href);
  dest.pathname=dest.pathname.replace(/(?:index\.html)?\/?$/,'/')+desired.toLowerCase()+'/';
  dest.searchParams.delete('lang');
  location.replace(dest.href);
}
if(root==='support'){
  const amount=document.querySelector('#custom-amount');
  const radios=document.querySelectorAll('input[name=amount]');
  for(const radio of radios)radio.addEventListener('change',()=>{
    amount.disabled=radio.value!=='custom';
    if(!amount.disabled)amount.focus();
  });
}
