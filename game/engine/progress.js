const ids=(v,max)=>Array.isArray(v)?[...new Set(v.filter(x=>Number.isInteger(x)&&x>=0&&x<=max))].sort((a,b)=>a-b):[];
const bounded=(x,max)=>Number.isInteger(x)&&x>=0&&x<=max?x:0;
export function freshProgress() {
  return {version:1,cleared:[],cores:[],records:{},heroes:[],lastStage:0,lastHero:0,storyEnding:false,secretEnding:false};
}
export function sanitizeProgress(source) {
  const out=freshProgress();
  if(!source || source.version!==1)return out;
  out.cleared=ids(source.cleared,20);out.cores=ids(source.cores,6);out.heroes=ids(source.heroes,4);
  out.lastStage=bounded(source.lastStage,20);out.lastHero=bounded(source.lastHero,4);
  out.storyEnding=out.cleared.includes(12);out.secretEnding=out.cleared.includes(13);
  if(source.records && typeof source.records==='object'){
    for(const [key,row] of Object.entries(source.records)){
      if(!/^(story|time|rush):([0-9]|1[0-9]|20):[0-4]$/.test(key)||!row)continue;
      if(Number.isFinite(row.time)&&row.time>0&&row.time<86400&&Number.isInteger(row.score)&&row.score>=0&&/^[SABC]$/.test(row.rank))
        out.records[key]={time:row.time,score:row.score,rank:row.rank};
    }
  }
  return out;
}
export function canEnter(progress,stage,mode='story') {
  if(!Number.isInteger(stage)||stage<0||stage>20)return false;
  const p=sanitizeProgress(progress);
  if(mode==='rush')return p.storyEnding;
  if(stage===13)return p.storyEnding&&p.heroes.includes(0)&&p.cores.length===7;
  if(stage>=14)return p.cores.includes(stage-14)||p.cleared.includes(stage-14);
  return stage===0||p.cleared.includes(stage)||p.cleared.includes(stage-1);
}
export function rankOf(run) {
  if(run.retries || run.time>240)return 'C';
  if(run.time<150 && run.secrets>=1 && run.rings>=12)return 'S';
  return run.rings>=10?'A':'B';
}
export function finishRun(progress,run) {
  const out=sanitizeProgress(progress);
  if(!run || run.status!=='won')return out;
  const key=run.mode+':'+run.stageId+':'+run.character;
  const best=out.records[key];
  if(!best||run.time<best.time)out.records[key]={time:run.time,score:Math.floor(run.score),rank:rankOf(run)};
  if(run.mode!=='story')return out;
  if(!out.cleared.includes(run.stageId))out.cleared.push(run.stageId);
  if(run.stage.special&&!out.cores.includes(run.stageId-14))out.cores.push(run.stageId-14);
  if(run.stageId===12&&!out.heroes.includes(run.character))out.heroes.push(run.character);
  out.storyEnding=out.cleared.includes(12);out.secretEnding=out.cleared.includes(13);
  out.lastStage=run.stage.special?run.stageId-14:run.stageId===13?13:run.stageId===12?(canEnter(out,13)?13:12):run.stageId+1;
  out.lastHero=run.character;
  return out;
}
