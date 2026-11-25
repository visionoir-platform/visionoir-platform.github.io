import { names, resolveLocale } from '../src/locales.js';
export { names };
export const direction = locale => locale === 'ar' ? 'rtl' : 'ltr';
const files = import.meta.glob('./locales/*.json', {import:'default'});
const regional = {'de-CH':'de','fr-CH':'fr','it-CH':'it'};
const cache = new Map();
export function getInitialLocale() {
 let saved;
 try { saved = localStorage.getItem('visionoir-language'); } catch {}
 return resolveLocale({explicit:new URL(location.href).searchParams.get('lang'),saved,languages:navigator.languages,available:Object.keys(names)});
}
export async function translator(locale) {
 if(!Object.hasOwn(names,locale))locale='it';
 let dict=cache.get(locale);
 if(!dict){
  const ids=regional[locale]?[regional[locale],locale]:[locale];
  const loaded=await Promise.all(ids.map(id=>files['./locales/'+id+'.json']()));
  dict=Object.assign({},...loaded);cache.set(locale,dict);
 }
 return key=>dict[key]??key;
}
