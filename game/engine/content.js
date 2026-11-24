// Distances are logical pixels. Each route lists its actual districts in traversal order.
export const HEROES = [
  {id:0, name:'Vela',   accent:'#91d9ff', acceleration:430, speed:262, jump:277, mass:1,    ability:'velocity'},
  {id:1, name:'Offset', accent:'#ec6687', acceleration:535, speed:245, jump:265, mass:1.08, ability:'phase'},
  {id:2, name:'Ione',   accent:'#83f1db', acceleration:380, speed:227, jump:285, mass:.85,  ability:'gravity'},
  {id:3, name:'Maglio', accent:'#fa937e', acceleration:345, speed:235, jump:269, mass:1.21, ability:'impact'},
  {id:4, name:'Spola',  accent:'#ffca74', acceleration:395, speed:238, jump:278, mass:.92,  ability:'engineering'},
];

export const ZONES = [
 'Neon Horizon','Black Forge','Afterimage District','Frosted Zero','Aura Sanctuary','Orbital Ascension','Protocol X','The Unseen Moon',
];

// anchor, movement envelope, sequence of attacks, exposed time, HP
const machines = [
 ['Neon Crusher','piston',['slam','wave'],1.9,4],
 ['Highway Devourer','wheel',['drive','disc','drive'],1.5,4],
 ['Forge Sentinel','crane',['aim','drop','wave'],1.75,4],
 ['Liquid Titan','cauldron',['fountain','slam','mine'],1.8,5],
 ['Glitch Dealer','relay',['disc','cross','aim'],1.9,4],
 ['Phantom Jackpot','wheel',['drop','fan','drive'],1.65,5],
 ['Frost Reaper','wing',['shard','sweep','shard'],1.75,5],
 ['Abyssal Spider','walker',['mine','fan','drop'],1.7,5],
 ['Quantum Guardian','orb',['orbit','cross','fan'],1.65,5],
 ['Obsidian Doppelgänger','rival',['drive','aim','sweep'],1.45,5],
 ['Rocket Enforcer','wing',['sweep','drop','fountain'],1.55,5],
 ['Orbital Serpent','serpent',['orbit','shard','cross'],1.55,6],
 ['Larpking Prototype','piston',['slam','drop','aim'],1.85,4],
 ['Larpking Omega','crane',['sweep','fan','mine'],1.7,4],
 ['Larpking X','rival',['drive','orbit','fountain','cross'],1.6,5],
 ['The Unseen God Machine','crown',['orbit','slam','cross','fan','drive'],1.7,8],
 ['Chrome Prism','orb',['shard','wave'],2.0,2],
 ['Acid Membrane','cauldron',['fountain','mine'],1.95,2],
 ['Noir Veil','rival',['drive','aim'],1.85,2],
 ['Afterimage Relay','relay',['disc','cross'],1.8,3],
 ['Alloy Hammer','piston',['slam','drop'],1.8,3],
 ['Aura Loom','serpent',['orbit','fan'],1.75,3],
 ['Unseen Gate','crown',['sweep','mine','cross'],1.7,3],
];
export const BOSSES = machines.map(([name,body,attacks,window,hp],id)=>({id,name,body,attacks,window,hp}));

// Each area is an authored cross section. Upper and middle routes reconnect to the main route.
// A tuple uses distance/height fractions within the area; pits, where present, refer to fractions too.
export const DISTRICTS = {
 avenue: {length:1150, profile:[0,2,-4,-8,5,0], features:['deck','rail','enemy','loop'], enemy:'crawler'},
 roof: {length:980, profile:[0,-9,-34,-48,-27,0], features:['spring','roof','rail','secret'], enemy:'drone'},
 viaduct: {length:1260, profile:[0,10,27,12,-24,0], features:['ramp','lift','pit','portal'], enemy:'turret'},
 switchback: {length:1320, profile:[0,-35,-62,-18,8,0], features:['lift','rail','spring','cache'], enemy:'sentry'},
 toll: {length:890, profile:[0,0,0,5,-3,0], features:['barrier','conveyor','loop','shield'],enemy:'crawler'},
 furnace: {length:1080, profile:[0,14,25,16,-12,0],features:['press','conveyor','spring','cache'], enemy:'sentry'},
 slag: {length:1190,profile:[0,18,34,-14,-22,0],features:['pit','lift','ramp','shield'],enemy:'turret'},
 foundry: {length:1320,profile:[0,-25,-28,-8,20,0],features:['barrier','press','rail','secret'],enemy:'sentry'},
 pipe: {length:990,profile:[0,11,-27,-35,-4,0],features:['loop','conveyor','roof','charge'],enemy:'crawler'},
 inverter: {length:940,profile:[0,-24,-42,2,14,0],features:['spring','lift','terminal','secret'],enemy:'wisp'},
 cabinet: {length:850,profile:[0,-9,-15,-8,9,0],features:['bumper','roof','rail','cache'],enemy:'turret'},
 roulette: {length:1190,profile:[0,18,40,8,-30,0],features:['loop','bumper','ramp','pit'],enemy:'drone'},
 hologram: {length:1110,profile:[0,-31,-45,0,-12,0],features:['lift','float','terminal','shield'],enemy:'wisp'},
 glacier: {length:1370,profile:[0,-32,32,35,8,0],features:['ice','pit','ramp','rail'],enemy:'crawler'},
 shaft: {length:880,profile:[0,26,45,21,7,0],features:['lift','spring','roof','secret'],enemy:'drone'},
 flood: {length:1370,profile:[0,8,28,32,12,0],features:['water','lift','shield','spring'],enemy:'eel'},
 duct: {length:1020,profile:[0,-38,-24,5,22,0],features:['barrier','rail','water','secret'],enemy:'eel'},
 shrine: {length:1130,profile:[0,-17,-37,-30,4,0],features:['float','obelisk','roof','cache'],enemy:'wisp'},
 chasm: {length:1210,profile:[0,19,35,-10,-29,0],features:['pit','float','spring','secret'],enemy:'drone'},
 suspended: {length:1130,profile:[0,-33,-52,-19,-8,0],features:['gravity','lift','rail','shield'],enemy:'wisp'},
 grove: {length:945,profile:[0,-14,-18,-7,7,0],features:['obelisk','float','barrier','secret'],enemy:'sentry'},
 launch: {length:1420,profile:[0,15,19,-36,-48,0],features:['conveyor','ramp','rail','terminal'],enemy:'turret'},
 gantry: {length:1270,profile:[0,-34,-42,11,23,0],features:['lift','roof','press','pit'],enemy:'drone'},
 orbit: {length:1390,profile:[0,-20,-8,19,-18,0],features:['gravity','float','loop','cache'],enemy:'wisp'},
 vault: {length:1370,profile:[0,-24,-45,-22,-3,0],features:['terminal','barrier','press','secret'],enemy:'sentry'},
 reactor: {length:1320,profile:[0,19,-24,-36,-16,0],features:['ramp','conveyor','pit','shield'],enemy:'turret'},
 basalt: {length:1210,profile:[0,-21,-51,-11,15,0],features:['gravity','roof','rail','secret'],enemy:'wisp'},
 mirror: {length:1280,profile:[0,29,-4,-41,-7,0],features:['float','terminal','loop','portal'],enemy:'drone'},
};
const acts = [
 ['Chrome District',0,'avenue roof viaduct toll roof switchback avenue viaduct roof toll switchback roof shaft toll viaduct roof avenue launch roof toll',[0]],
 ['Midnight Highway',0,'toll viaduct switchback avenue toll gantry roof switchback viaduct launch gantry launch roof viaduct avenue toll switchback gantry launch viaduct',[1]],
 ['Industrial Core',1,'foundry pipe furnace slag foundry furnace pipe gantry foundry slag slag reactor furnace gantry foundry slag pipe reactor gantry furnace',[2]],
 ['Molten Circuit',1,'slag furnace gantry reactor pipe slag foundry reactor furnace pipe reactor foundry pipe slag gantry furnace pipe foundry reactor slag',[3]],
 ['Phantom Arcade',2,'cabinet inverter hologram avenue roulette cabinet roof hologram inverter switchback hologram roof cabinet shaft inverter roulette hologram cabinet roof roulette',[4]],
 ['Hologram Casino',2,'roulette cabinet hologram inverter roulette shaft cabinet inverter hologram roulette hologram shaft roulette inverter cabinet hologram roulette shaft inverter cabinet',[5]],
 ['Cryogenic Facility',3,'glacier shaft duct glacier roof shaft flood glacier gantry shaft flood shaft roof glacier duct shaft glacier gantry duct glacier',[6]],
 ['Submerged Memory',3,'duct flood shaft flood pipe glacier duct chasm shaft flood shaft duct glacier chasm flood duct shaft chasm flood glacier',[7]],
 ['Forgotten Monolith',4,'grove shrine chasm suspended grove shrine shaft grove chasm suspended shrine grove suspended mirror chasm grove shrine basalt chasm grove',[8]],
 ['Floating Ruins',4,'suspended chasm grove orbit shrine suspended mirror chasm grove orbit mirror grove orbit chasm suspended shrine orbit mirror suspended chasm',[9]],
 ['Larpking Rocket',5,'launch gantry reactor pipe gantry launch furnace gantry orbit launch gantry reactor pipe launch gantry furnace orbit gantry launch reactor',[10]],
 ['Celestial Machine',5,'orbit launch mirror suspended gantry orbit reactor chasm launch orbit gantry suspended reactor orbit mirror gantry launch orbit chasm mirror',[11]],
 ['Protocol X',6,'vault reactor foundry gantry pipe reactor vault mirror switchback reactor vault mirror foundry gantry vault reactor suspended foundry vault gantry reactor',[12,13,14]],
 ['The Unseen Moon',7,'basalt mirror orbit shrine basalt suspended mirror chasm basalt mirror orbit mirror chasm shrine basalt suspended shrine mirror orbit basalt',[15]],
];
const special = [
 ['Chrome Core','collect','avenue roof toll',0,7,75],
 ['Acid Core','bounce','cabinet roulette inverter',1,4,80],
 ['Noir Core','switch','vault pipe toll',2,4,88],
 ['Afterimage Core','chain','hologram cabinet inverter',3,8,84],
 ['Alloy Core','break','foundry furnace slag',1,5,86],
 ['Aura Core','air','suspended chasm shrine',4,5,90],
 ['Unseen Core','relay','basalt mirror orbit',7,7,88],
];
export const STAGES = [
 ...acts.map(([title,zone,plan,bosses],id)=>({id,title,zone,area:ZONES[zone],act:id<12?id%2+1:1,track:7+id,special:false,plan:plan.split(' '),bosses})),
 ...special.map(([title,objective,plan,zone,goal,limit],i)=>({id:i+14,title,zone,area:title,act:1,track:21,special:true,objective,goal,limit,plan:plan.split(' '),bosses:[16+i]})),
];
