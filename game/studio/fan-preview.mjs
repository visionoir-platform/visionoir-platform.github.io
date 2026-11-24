// The private profile is a loopback development feature, never part of a Pages build.
import { createReadStream, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { homedir } from 'node:os';
export function localFanPreview(){
  return {
    name:'unseen-private-fan-preview',apply:'serve',
    configureServer(server){
      if(process.env.VITE_UNSEEN_PROFILE!=='fan')return;
      const base=resolve(process.env.UNSEEN_FAN_ART || resolve(homedir(),'sites/visionoir-qa/unseen-fan-art'));
      server.middlewares.use('/__fan-art/',(req,res)=>{
        let leaf;try{leaf=new URL(req.url,'http://localhost').pathname.slice(1);}catch{}
        if(!['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress) ||
           !/^(portraits|character-[0-4]-[01])\.png$/.test(leaf||'')){
          res.statusCode=403;return res.end();
        }
        const file=resolve(base,leaf);
        if(!existsSync(file)){res.statusCode=404;return res.end();}
        res.setHeader('content-type','image/png');res.setHeader('cache-control','no-store');
        const stream=createReadStream(file);stream.on('error',()=>res.destroy());stream.pipe(res);
      });
    },
  };
}
