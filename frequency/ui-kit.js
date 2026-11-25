export const escape = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const attr = escape;
export const pad = n => String(n).padStart(2,'0');
export const noteName = n => ['C','C♯','D','D♯','E','F','F♯','G','G♯','A','A♯','B'][n%12]+(Math.floor(n/12)-1);
export const option = (value,label,selected=false)=>`<option value="${attr(value)}"${selected?' selected':''}>${escape(label)}</option>`;
export function act(id,label,{icon='',classes='',data='',title='',pressed,disabled=false}={}) {
  return `<button type="button" class="${classes}" data-action="${attr(id)}" ${data} ${title?'title="'+attr(title)+'" aria-label="'+attr(title)+'"':''} ${pressed===undefined?'':'aria-pressed="'+Boolean(pressed)+'"'} ${disabled?'disabled':''}>${icon?'<b aria-hidden="true">'+escape(icon)+'</b> ':''}${escape(label)}</button>`;
}
export function number(label,id,value,min,max,step=1) {
  return `<label class="field"><span>${escape(label)}</span><input type="number" data-field="${attr(id)}" value="${attr(value)}" min="${min}" max="${max}" step="${step}"></label>`;
}
export function slider(label,id,value,min=0,max=1,step=.01) {
  const pos=(value-min)/(max-min)*100;
  return `<label class="fader" style="--fill:${pos}%"><span>${escape(label)}</span><output>${Math.round(value*100)/100}</output><input type="range" data-field="${attr(id)}" min="${min}" max="${max}" step="${step}" value="${attr(value)}"></label>`;
}
export function dial(label,id,value) {
  return `<label class="fader dial" style="--fill:${Math.round(value*100)}%;--angle:${-132+value*264}deg"><span>${escape(label)}</span><output>${Math.round(value*100)/100}</output><i aria-hidden="true"></i><input type="range" data-field="${attr(id)}" min="0" max="1" step=".01" value="${attr(value)}"></label>`;
}
export function select(label,id,options){return `<label class="field"><span>${escape(label)}</span><select data-field="${attr(id)}">${options}</select></label>`;}
export function download(blob,name) {
  const url=URL.createObjectURL(blob), link=document.createElement('a');
  link.href=url; link.download=name; document.body.append(link); link.click(); link.remove();
  setTimeout(()=>URL.revokeObjectURL(url),60000);
}
export const newNote=(pitch=36)=>({note:pitch,velocity:.82,gate:1,probability:1,ratchet:1,offset:0,accent:false,slide:false,flam:false,condition:1,locks:{}});
export function resizePattern(pattern,length) {
  pattern.length=length;
  if(pattern.steps.length<length) pattern.steps.push(...Array(length-pattern.steps.length).fill(null));
}
export function seededVariation(pattern,seed,intensity,root,melodic=false) {
  let rng=seed|0; const rand=()=>((rng=Math.imul(rng,1664525)+1013904223|0)>>>0)/4294967296;
  const scale=[0,2,3,5,7,8,10];
  for(let i=0;i<pattern.length;i++) {
    if (rand()>intensity) continue;
    if (pattern.steps[i] && rand()<.32) {pattern.steps[i]=null; continue;}
    const note=pattern.steps[i]||newNote(root);
    note.note=melodic?root+scale[Math.floor(rand()*scale.length)]:root;
    note.velocity=Math.round((.4+rand()*.6)*100)/100; note.accent=i%4===0;
    note.ratchet=rand()<intensity*.18?2:1; pattern.steps[i]=note;
  }
}
