import './portrait.css';
import {defaultVisual} from '../../frequency/chromatic/model.js';
import {trackAccents} from '../palette.js';

const moods={
 chrome:{mode:'chrome-pulse',refraction:.82,reflection:.97,warp:.36},
 acid:{mode:'acid-mutation',refraction:.92,warp:.95,turbulence:.76},
 noir:{mode:'obsidian-core',refraction:.32,light:.42,distortion:.72},
 afterimage:{mode:'spectral-echo',warp:.42,refraction:.85},
 alloy:{mode:'industrial-meltdown',warp:.74,reflection:.95,distortion:.61},
 aura:{mode:'atomic-disintegration',warp:.37,depth:.86,density:.92},
};
const base=import.meta.env?.BASE_URL||'/';
export function mountCreator(host,{getSignal=()=>({}),getMode=()=> 'chrome',modelURL,posterURL=base+'creator/poster.webp',reducedMotion=false}={}){
 let disposed=false,stage,loading=false,look='metal',modeId,visual,requestedMotion=!reducedMotion;
 host.classList.add('creator-render-surface');
 const onMotion=value=>{requestedMotion=!!value;modeId=null;stage?.invalidate();};
 const getState=()=>{
  const chosen=getMode(),mode=typeof chosen==='string'&&moods[chosen]?chosen:'chrome',key=mode+'/'+look+'/'+requestedMotion;
  if(key!==modeId){
   modeId=key;visual={...defaultVisual(),...moods[mode],color:trackAccents[mode],intensity:.89,rotation:.14,camera:.12,density:.85,size:.49,reduced:!requestedMotion};
   if(look==='liquid'){visual.mode='liquid-collapse';visual.warp=.95;visual.refraction=.95;}
  }
  return visual;
 };
 function signal(){
  const a=getSignal()||{};
  // The studio player exposes recorded spectral envelopes on the original soundtrack.
  return {...a,voices:[a.bass,look==='liquid'?a.level:0,getMode()==='acid'?a.mid:0,0,0,0,a.high,0,0,0,0,0,a.mid],beat:0};
 }
 async function start(){
   if(loading||disposed)return;loading=true;
   try{
    const [{buildStage},{loadPortrait}]=await Promise.all([import('../../frequency/chromatic/stage.js'),import('./portrait.js')]);
    if(disposed)return;
    const preferSmall=window.matchMedia('(max-width: 800px)').matches||navigator.connection?.saveData;
    const url=modelURL||base+'creator/creator-'+(preferSmall?'mobile':'desktop')+'.glb';
    const mounted=await buildStage(host,{creator:true,getSignal:signal,getState,poster:posterURL,assetLoader:s=>loadPortrait(url,s)});
    if(disposed){mounted.dispose();return;}stage=mounted;stage.setLook?.(look);
   }catch{host.dataset.render='fallback';}
 }
 const near=new IntersectionObserver(entries=>{if(entries.some(e=>e.isIntersecting)){near.disconnect();void start();}},{rootMargin:'160px'});
 near.observe(host);
 const refresh=()=>{modeId=null;stage?.invalidate();};window.addEventListener('visionoir:audio',refresh);
 return {setMotion:onMotion,setLook(value){look=['metal','natural','liquid'].includes(value)?value:'metal';modeId=null;stage?.setLook?.(look);},dispose(){disposed=true;window.removeEventListener('visionoir:audio',refresh);near.disconnect();stage?.dispose();}};
}
