import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { ecosystemLocale } from '../../scripts/ecosystem-locales.mjs';
import { names } from '../../src/locales.js';

export async function catalogs() {
  const rows = {};
  for (const name of ['ui','story','extra','encounters','hud','save-controls']) {
    const lines=(await readFile(new URL('locales/'+name+'.tsv',import.meta.url),'utf8')).trim().split(/\r?\n/);
    const keys=lines.shift().split('\t').slice(1);
    for(const line of lines) {
      const [locale,...fields]=line.split('\t');
      if(fields.length!==keys.length || fields.some(v=>!v.trim())) throw Error(name+' '+locale+' '+fields.length+'/'+keys.length);
      Object.assign(rows[locale]??={},Object.fromEntries(keys.map((k,i)=>[k,fields[i]])));
    }
  }
  rows['de-CH']=Object.fromEntries(Object.entries(rows.de).map(([k,v])=>[k,v.replaceAll('ß','ss')]));
  rows['fr-CH']={...rows.fr};rows['it-CH']={...rows.it};
  for(const locale of Object.keys(names)) if(Object.keys(rows[locale]||{}).length!==Object.keys(rows.it).length)throw Error(locale+' missing game translations');
  for (const [lang, dictionary] of Object.entries(rows)) {
    const labels = ecosystemLocale(lang);
    Object.assign(dictionary, { supportPortal: labels.ecoSupport, legalPortal: labels.ecoLegal });
  }
  return rows;
}
if(process.argv[1]?.endsWith('catalogs.mjs')){
  const output=process.argv[2]||'public/unseen/i18n';
  await mkdir(output,{recursive:true});
  for(const [lang,dict] of Object.entries(await catalogs())) await writeFile(output+'/'+lang+'.json',JSON.stringify(dict));
}
