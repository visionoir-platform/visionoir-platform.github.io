import {mkdir,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {DEMOS} from '../model.js';
import {run} from '../print.mjs';
if(!process.argv[2])throw Error('Provide a destination outside the public build');
const dir=resolve(process.argv[2]);await mkdir(dir,{recursive:true});const report=[];
for(const demo of DEMOS){
 const file=join(dir,demo.id+'.wav');await run([demo.id,file,'--sampleRate','48000','--bits','24']);
 const metric=await import('node:child_process').then(({spawnSync})=>spawnSync('ffmpeg',['-nostdin','-hide_banner','-nostats','-i',file,'-af','ebur128=peak=true:framelog=verbose','-f','null','-'],{encoding:'utf8'}));
 const summary=metric.stderr.split('Summary:').pop();const number=re=>Number(summary.match(re)?.[1]);const info=JSON.parse(execFileSync('ffprobe',['-v','error','-show_entries','format=duration','-of','json',file],{encoding:'utf8'}));
 report.push({id:demo.id,title:demo.name,seconds:Number(info.format.duration),integratedLUFS:number(/I:\s*(-?[\d.]+) LUFS/),loudnessRangeLU:number(/LRA:\s*([\d.]+) LU/),truePeakDBTP:number(/Peak:\s*(-?[\d.]+) dBFS/)});console.log(report.at(-1));
}
await writeFile(join(dir,'master-review.json'),JSON.stringify(report,null,2));
if(report.some(r=>!Number.isFinite(r.truePeakDBTP)||r.truePeakDBTP>-.9||!Number.isFinite(r.integratedLUFS)))throw Error('Master headroom or measurement failed');
