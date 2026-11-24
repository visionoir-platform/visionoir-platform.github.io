/** Restore only authored checkpoint coordinates. Discard unrecognised import data. */
export function checkpointOf(run){
  if(!run || run.mode!=='story' || run.stage.special)return null;
  const markers=run.objects.filter(o=>o.type==='checkpoint');
  const index=markers.findIndex(o=>o.x===run.checkpoint);
  if(index<0)return null;
  return {stage:run.stageId,hero:run.character,marker:index,time:run.time,score:run.score,rings:run.rings,energy:run.energy,secrets:run.secrets};
}
export function restoreCheckpoint(run,mark,groundAt){
  if(!mark || mark.stage!==run.stageId || mark.hero!==run.character || !Number.isInteger(mark.marker))return false;
  const markers=run.objects.filter(o=>o.type==='checkpoint');
  const at=markers[mark.marker];if(!at)return false;
  for(const o of run.objects)if(o.x<=at.x){
    if(o.type==='checkpoint')o.lit=true;
    if(['ring','secret','shield','battery'].includes(o.type))o.active=false;
  }
  const number=(v,max)=>Number.isFinite(v)&&v>=0?Math.min(v,max):0;
  run.checkpoint=at.x;run.player.x=at.x;const surface=groundAt(run,at.x);run.player.y=Number.isFinite(surface)?surface:at.y;run.camX=Math.max(0,at.x-140);
  run.time=number(mark.time,86400);run.score=Math.floor(number(mark.score,10000000));run.rings=Math.floor(number(mark.rings,999));
  run.secrets=Math.floor(number(mark.secrets,999));run.energy=number(mark.energy,100);return true;
}
