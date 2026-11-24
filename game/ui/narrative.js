// These lookup keys change language with the rest of the page while a scene is playing.
const voices=['voiceVela','voiceOffset','voiceIone','voiceMaglio','voiceSpola'];
const trials=['goalChrome','goalAcid','goalNoir','goalImage','goalAlloy','goalAura','goalUnseen'];
export const heroLine=character=>voices[character]??'synopsis';
export const objectiveLine=stage=>trials[stage-14]??'help';
export function bossLine(id,aftermath=false){
  let family='Steel';
  if(id>=16)family='Guardian';
  else if(id===15)family='Moon';
  else if(id>=12)family='Protocol';
  else if(id>=10)family='Orbit';
  else if(id===4||id===5||id===9)family='Mirror';
  return (aftermath?'after':'before')+family;
}
