import { names, matchLocale } from '../locales.js';
import { parseSupportEstimate, supportInquiryHref } from './support-state.js';
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
  const inquiry=document.querySelector('#support-inquiry');
  const subject=document.querySelector('h1').textContent;
  const amountLabel=document.querySelector('fieldset legend').textContent;
  function updateInquiry() {
    const selected=document.querySelector('input[name=amount]:checked')?.value;
    const cents=selected==='custom' ? parseSupportEstimate(amount.value) : Number(selected);
    inquiry.href=supportInquiryHref(inquiry.dataset.address,subject,amountLabel,lang,cents);
  }
  for(const radio of radios)radio.addEventListener('change',()=>{
    amount.disabled=radio.value!=='custom';
    if(!amount.disabled)amount.focus();
    updateInquiry();
  });
  amount.addEventListener('input',updateInquiry);
  inquiry.addEventListener('click',event=>{
    if (!amount.disabled && !amount.reportValidity()) event.preventDefault();
  });
  window.addEventListener('pageshow',()=>{
    amount.disabled=document.querySelector('input[name=amount]:checked')?.value!=='custom';
    updateInquiry();
  });
}

if (root === 'legal') {
  function keepSection() {
    const hash = location.hash;
    for (const link of document.querySelectorAll('.languages a[hreflang]')) {
      link.hash = hash;
    }
  }
  keepSection();
  window.addEventListener('hashchange', keepSection);
}
