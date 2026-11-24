/** Produce the private development profile outside this checkout. */
import { homedir } from 'node:os';
import { join,resolve } from 'node:path';
import { mkdir,mkdtemp,readFile,writeFile,copyFile,stat } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { catalogs } from '../ui/catalogs.mjs';
const repo=process.cwd(), development=resolve(homedir(),'sites/visionoir-qa');
const source=process.env.UNSEEN_FAN_ART||join(development,'unseen-fan-art');
const files=['portraits.png',...Array.from({length:10},(_,i)=>'character-'+Math.floor(i/2)+'-'+(i%2)+'.png')];
for(const f of files)await stat(join(source,f));
await mkdir(development,{recursive:true});const dir=await mkdtemp(join(development,'private-unseen-build-'));
execFileSync(process.execPath,['node_modules/vite/bin/vite.js','build','--outDir',dir],{
  cwd:repo,env:{...process.env,VITE_UNSEEN_PROFILE:'fan',UNSEEN_PRIVATE_OUTPUT:dir},stdio:'inherit'});
await mkdir(join(dir,'__fan-art'),{recursive:true});
for(const f of files)await copyFile(join(source,f),join(dir,'__fan-art',f));
for(const [l,v] of Object.entries(await catalogs())){await mkdir(join(dir,'unseen/i18n'),{recursive:true});await writeFile(join(dir,'unseen/i18n',l+'.json'),JSON.stringify(v));}
execFileSync(process.execPath,['scripts/localize.mjs',dir],{stdio:'inherit'});
console.log('Private profile: '+dir);
