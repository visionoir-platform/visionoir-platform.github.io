import { readFileSync } from 'node:fs';
import { parents } from '../src/locales.js';

function rows(name) {
  return readFileSync(new URL('../src/ecosystem/'+name+'.tsv',import.meta.url),'utf8').trim().split(/\r?\n/).map(line=>line.split('\t'));
}
const [header,...copy] = rows('copy');
const copyMap = new Map(copy.map(([lang,...cells])=>{
  if (cells.length!==header.length-1) throw Error('Incomplete ecosystem language '+lang);
  return [lang,Object.fromEntries(cells.map((value,i)=>['eco'+header[i+1][0].toUpperCase()+header[i+1].slice(1),value]))];
}));
const bios = new Map(rows('creator').map(([lang,bioA,bioB,bioC])=>[lang,{bioA,bioB,bioC}]));
const [legalHeader,...legalRows]=rows('legal');
const legal=new Map(legalRows.map(([code,...entries])=>{
  if(entries.length!==legalHeader.length-1 || entries.some(x=>!x.trim()))throw Error('Incomplete legal copy '+code);
  return [code,Object.fromEntries(entries.map((text,i)=>['legal_'+legalHeader[i+1],text]))];
}));
export function ecosystemLocale(lang) {
  const code=copyMap.has(lang)?lang:parents[lang];
  if (!bios.has(code)||!copyMap.has(code)||!legal.has(code)) throw Error('Unknown ecosystem locale '+lang);
  const fields={...copyMap.get(code),...bios.get(code),...legal.get(code)};
  if(lang==='de-CH')for(const key of Object.keys(fields))fields[key]=fields[key].replaceAll('ß','ss');
  return fields;
}
