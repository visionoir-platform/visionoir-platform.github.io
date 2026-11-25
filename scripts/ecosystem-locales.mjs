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
const orbit = policyTable('portrait-orbit');
const [legalHeader,...legalRows]=rows('legal');
const legal=new Map(legalRows.map(([code,...entries])=>{
  if(entries.length!==legalHeader.length-1 || entries.some(x=>!x.trim()))throw Error('Incomplete legal copy '+code);
  return [code,Object.fromEntries(entries.map((text,i)=>['legal_'+legalHeader[i+1],text]))];
}));
const [inquiryHeader,...inquiryRows]=rows('inquiry');
const inquiry=new Map(inquiryRows.map(([lang,...values])=>{
  if(values.length!==inquiryHeader.length-1||values.some(value=>!value.trim()))throw Error('Incomplete inquiry language '+lang);
  return [lang,Object.fromEntries(values.map((value,i)=>[inquiryHeader[i+1],value]))];
}));
const [policyHead,...policyLines]=rows('request-policy');
const policies = new Map(policyLines.map(([code,...cells])=>{
  if(cells.length!==policyHead.length-1||cells.some(cell=>!cell.trim()))throw Error('Incomplete request notice '+code);
  return [code,Object.fromEntries(cells.map((text,i)=>['req_'+policyHead[i+1],text]))];
}));
export function ecosystemLocale(lang) {
  const code=copyMap.has(lang)?lang:parents[lang];
  if (!orbit.has(code)||!bios.has(code)||!copyMap.has(code)||!legal.has(code)||!inquiry.has(code)||!policies.has(code)) throw Error('Unknown ecosystem locale '+lang);
  const fields={...policies.get(code),...copyMap.get(code),...bios.get(code),...orbit.get(code),...legal.get(code),...inquiry.get(code)};
  if(lang==='de-CH')for(const key of Object.keys(fields))fields[key]=fields[key].replaceAll('ß','ss');
  return fields;
}

// Policy text is used only by the static portal, never in the home page payload.
function policyTable(name) {
  const [keys, ...records] = rows(name);
  const table = new Map();
  for (const [lang, ...values] of records) {
    if (table.has(lang) || values.length !== keys.length - 1 || values.some(value => !value.trim())) {
      throw Error('Invalid ' + name + ' row for ' + lang);
    }
    table.set(lang, Object.fromEntries(values.map((value, index) => [keys[index + 1], value])));
  }
  return table;
}
const sectionNames = policyTable('policy-sections');
const sectionCopy = policyTable('policy-copy');
export function policyLocale(lang) {
  const key = sectionNames.has(lang) ? lang : parents[lang];
  if (!sectionNames.has(key) || !sectionCopy.has(key)) throw Error('Missing policy locale ' + lang);
  function regional(fields) {
    return lang === 'de-CH' ? Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, v.replaceAll('ß', 'ss')])) : fields;
  }
  return {titles: regional(sectionNames.get(key)), copy: regional(sectionCopy.get(key))};
}
