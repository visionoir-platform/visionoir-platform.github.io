/** Original patch recipes. Each family and variant changes the sound-producing parameters. */
const blend=(base,change,depth)=>Object.fromEntries(Object.entries(base).map(([key,value])=>[key,Math.max(0,Math.min(1,value+(change[key]??0)*depth))]));
const ranges={
 kick:[['Kiln',{pitch:.32,sweep:.77,punch:.84,body:.85,decay:.52,distortion:.34,saturation:.50,drive:.71}],['Mortar',{pitch:.18,sweep:.36,body:.92,decay:.74,tail:.82,drive:.55}],['Wire',{pitch:.47,click:.87,transient:.90,decay:.22,body:.38,drive:.41}],['Hammer',{pitch:.41,punch:.92,sweep:.92,tail:.26,drive:.83,harmonics:.52}],['Freight',{pitch:.23,body:.8,harmonics:.47,decay:.58,distortion:.65}],['Brake',{pitch:.53,click:.50,tail:.15,decay:.21,saturation:.70}]],
 rumble:[['Basement',{tone:.13,feedback:.56,decay:.8,drive:.76,phase:.38,sidechain:.81}],['Conduit',{tone:.54,delay:.72,feedback:.62,decay:.57}],['Concrete',{tone:.27,delay:.28,drive:.94,width:.58}],['Vault',{tone:.18,decay:.9,width:.35,phase:.14}]],
 acid:[['Citrus wire',{wave:.13,resonance:.88,cutoff:.42,env:.78,drive:.64}],['Square teeth',{wave:.87,glide:.63,resonance:.59,cutoff:.32}],['Capillary',{wave:.29,env:.27,decay:.67,glide:.67}],['Silver gate',{wave:.68,env:.91,resonance:.76,decay:.21}]],
 industrial:[['Rotor',{ratio:.28,mod:.85,decay:.36,drive:.65}],['Grid iron',{ratio:.78,mod:.57,cutoff:.26,drive:.84}]],
 sub:[['Bedrock',{tone:.1,phase:.43,decay:.72,sidechain:.82}],['Bearing',{tone:.78,phase:.16,decay:.43,sidechain:.36}]],
 schranz:[['Rivet',{metal:.82,body:.40,drive:.89,decay:.35}],['Bearing hit',{metal:.39,body:.88,drive:.48,decay:.54}]],
 closed:[['Fine wire',{color:.82,metal:.27,decay:.19}]],open:[['Vent',{color:.54,metal:.48,decay:.64}]],
 snare:[['Switchglass',{clap:.83,body:.3,noise:.85,decay:.53}]],ride:[['Nickel',{bell:.82,shimmer:.61,decay:.71}]],
 stab:[['Saw pillars',{color:.55,detune:.68,chord:.28,decay:.36}],['Fifth floor',{color:.7,detune:.26,chord:.85,decay:.65}]],
 lead:[['Night cable',{wave:.29,cutoff:.26,detune:.31,decay:.46}],['Arc runner',{wave:.82,cutoff:.7,detune:.18,decay:.57}]],
 atmos:[['Mist chamber',{attack:.58,drift:.84,color:.48,decay:.77}],['Magnetic dusk',{attack:.23,drift:.44,color:.71,decay:.63}],['Blue steel',{attack:.64,drift:.23,color:.22,decay:.86}]]
};
const changes={pitch:.20,sweep:-.19,attack:.15,punch:.13,body:-.20,tail:.22,click:.32,decay:.32,drive:.26,cutoff:.23,
 tone:.35,phase:.3,feedback:.25,delay:-.3,width:.32,sidechain:-.31,wave:.14,glide:.32,resonance:-.23,env:.31,
 ratio:.27,mod:-.28,color:.35,body:.2,metal:.31,noise:-.31,clap:.21,bell:-.3,shimmer:.27,detune:.32,chord:.38,drift:.34};
const finishes=['Dry','Tension','Pressure','Afterglow'];
export const PATCHES=Object.entries(ranges).flatMap(([instrument,families])=>families.flatMap(([family,base],i)=>
 finishes.map((suffix,j)=>({id:instrument+'-'+i+'-'+j,name:family+' / '+suffix,instrument,params:blend(base,changes,[-.7,-.18,.42,.91][j])}))));
const recipes=[
 ['track','Tape knife','eq:.34 overdrive:.22 compressor:.28'],['track','Stairwell','filter:.32 industrialverb:.62'],['track','Billet','transient:.74 saturation:.48'],
 ['track','Resin','chorus:.55 reverb:.46'],['track','Chrome teeth','bitcrusher:.61 eq:.76'],['track','Half-step ghost','pingpong:.44 phaser:.26'],
 ['track','Strobe cut','gate:.35 repeat:.63'],['track','Crossfeed','stereo:.4 delay:.54'],['track','Collapsed wall','distortion:.36 industrialverb:.64'],
 ['track','Acid camera','resonant:.48 flanger:.27'],['track','Signal fold','waveshaper:.38 reduction:.21'],['track','Paper snare','hardclip:.36 transient:.53'],
 ['track','Underpass','sidechain:.77 filter:.33'],['track','Static prism','glitch:.71 chorus:.29'],['track','Dub latch','freeze:.42 reverb:.57'],['track','Vacuum','dj:.66 pingpong:.27'],
 ['master','Club ceiling','eq:.46 compressor:.32 limiter:.19'],['master','Mono check','stereo:0 limiter:.15'],['master','Warm press','saturation:.16 mastering:.19'],
 ['master','Iron weight','multiband:.31 softclip:.15 limiter:.12'],['master','Air trim','eq:.31 mastering:.26'],['master','Bass pocket','sidechain:.26 compressor:.19'],
 ['master','Needle room','eq:.71 stereo:.42 limiter:.13'],['master','Kick window','transient:.23 limiter:.22'],['master','Controlled grit','overdrive:.10 multiband:.34'],
 ['master','Dense master','compressor:.39 softclip:.13 limiter:.20'],['master','Open floor','stereo:.57 multiband:.21'],['master','Broadcast trim','eq:.47 gate:.05 mastering:.34']
];
export const CHAINS=recipes.map(([scope,name,desc],i)=>({id:'chain-'+i,name,scope,fx:desc.split(' ').map(pair=>{const [id,n]=pair.split(':');return{id,amount:Number(n),bypass:false};})}));
const pieces=[
 ['oblique','Oblique Press',159,33,5,3,[0,1,7,13,8,3,0,-2]],
 ['dross','Dross Bloom',152,29,7,1,[0,7,-2,3,5,1,0,10]],
 ['needle','Needle Exchange',164,36,9,4,[0,12,6,1,13,0,-1,6]],
 ['fog','Low Fog Transit',143,34,5,2,[0,3,7,10,14,7,5,3]],
 ['weld','Weld Sequence',157,30,8,5,[0,1,3,-5,7,8,1,0]],
 ['corona','Corona Dub',148,37,6,3,[0,5,12,10,7,5,3,2]],
 ['delta','Delta Chamber',154,31,7,6,[0,-5,0,8,3,1,10,7]],
 ['spoke','Spoke Wheel',161,32,11,2,[0,3,1,7,6,0,-2,1]],
 ['alba','Alba Terminal',145,38,5,7,[0,12,7,3,8,5,10,7]],
 ['clamp','Clamp Signal',168,28,9,1,[0,6,1,12,-5,6,7,1]],
 ['violet','Violet Static',150,35,7,4,[0,5,8,7,3,1,-2,3]],
 ['pier','Pier Nine',156,33,6,5,[0,-5,3,0,1,8,7,12]]
];
export const EXTRA_DEMOS=pieces.map(([id,name,bpm])=>({id,name,bpm}));
function euclid(n,hits,rotation,size=16){return ((n+rotation)*hits)%size<hits;}
export function additionalSession(blank,id){
 const d=pieces.findIndex(p=>p[0]===id);if(d<0)return null;
 const [,name,bpm,root,pulses,rotation,melody]=pieces[d],p=blank;p.name=name;p.bpm=bpm;p.seed=17000+d*757;p.swing=[.035,.11,.018,.09][d%4];
 const energy=[.25,.48,.75,1,.29,.63,.93,.4];const names=['Ingress','Motor','Pulse','Impact','Threshold','Lift','Return','Coda'];
 for(let k=0;k<p.tracks.length;k++){
  const t=p.tracks[k],list=PATCHES.filter(a=>a.instrument===t.instrument);if(list.length)Object.assign(t.params,list[(d*3+k)%list.length].params);
  t.sendDelay=[2,10,11,14].includes(k)?.18:0;t.sendReverb=[8,9,10,12,13].includes(k)?.22:0;t.pan=k<5?0:((d+k)%7-3)*.08;
  if(k===5||k===10)t.fx=structuredClone(CHAINS[(d+k)%16].fx);
 }
 for(let scene=0;scene<p.scenes.length;scene++){
  const s=p.scenes[scene];s.name=names[scene];s.patterns=p.tracks.map((t,k)=>{
   const length=k===14&&d%3===0?12:k===11||k===12||k===13?64:k===2||k===3?32:16;
   const steps=Array(length).fill(null);
   for(let n=0;n<length;n++){const beat=n%16,degree=melody[(Math.floor(n/2)+scene+d)%8];
    let hit=false,pitch=root,gate=.72;
    if(k===0){hit=scene===4?d%3===1&&beat===0:beat%(scene===0?8:4)===0;pitch=36;}
    else if(k===1){hit=energy[scene]>.4&&beat%4===1;gate=2.2;}
    else if(k===2||k===3){hit=energy[scene]>.42&&euclid(n,k===2?pulses:4,rotation+k+scene%3);pitch=root+degree+(k===2&&n>16?12:0);}
    else if(k===4){hit=scene===4&&beat%8===0;gate=6;pitch=root+((n>>3)%2?7:0);}
    else if(k===5){hit=energy[scene]>.46&&euclid(n,pulses-2,rotation*2);pitch=42+degree;}
    else if(k===6||k===7){hit=scene!==4&&(k===6?euclid(n,8+(d%4),rotation):beat%4===2&&energy[scene]>.45);pitch=73+k;gate=k===6?.45:1.4;}
    else if(k===8){hit=scene!==0&&scene!==4&&(beat===4||beat===12||scene===5&&beat>12);pitch=48+d%5;}
    else if(k===9){hit=energy[scene]>.71&&euclid(n,5,rotation+scene);pitch=70+d;}
    else if(k===10){hit=energy[scene]>.65&&euclid(n,3+(d%2),rotation+3);pitch=root+24+(beat<8?0:7);gate=1.6;}
    else if(k===11){hit=[3,4,6].includes(scene)&&euclid(n,5+d%3,rotation);pitch=root+36+degree;gate=1.6+d%3;}
    else if(k===12){hit=(scene===0||scene===4||scene===7)&&n%32===0;pitch=root+12+(n?7:0);gate=25;}
    else if(k===13){hit=(scene===1||scene===5)&&n===48;pitch=52;gate=15;}
    else if(k===14){hit=energy[scene]>.46&&euclid(n,3,rotation+1,length);pitch=root+24+degree;}
    else {hit=energy[scene]>.62&&beat===((d+5)%16);pitch=60+degree;}
    if(hit)steps[n]={note:pitch,velocity:k===0?.93:.54+((n*7+k*3+d)%11)*.031,gate,accent:beat===0||beat===10,probability:1,
      slide:k===2&&beat===6,ratchet:scene===5&&n%16===15?3:1,flam:k===8&&beat===12&&d%2===0,offset:0,condition:1,
      locks:k===2?{cutoff:.21+energy[scene]*.25+(n%5)*.04}:{}};
   }
   return {length,steps};
  });
 }
 p.arrangement=p.scenes.map((_,scene)=>({scene,bars:[8,8,16,16,8,8,16,8][scene]+(scene===6&&d%2?8:0)}));return p;
}
