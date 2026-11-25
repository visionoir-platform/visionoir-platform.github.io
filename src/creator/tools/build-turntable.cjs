/* Render the same public sculpture and materials used by the site into on-demand
   24-view WebP atlases for devices without WebGL2. Usage: node build-turntable.cjs */
const fs = require('node:fs/promises');
const path = require('node:path');
const http = require('node:http');
const {build} = require('esbuild');
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname,'../../..');
const out = path.join(root,'public','creator');

async function run() {
  const bundle = await build({bundle:true,write:false,format:'esm',logLevel:'silent',stdin:{
    resolveDir:root,contents:`
    import { createPortraitStage } from './src/creator/stage.js';
    const host = document.querySelector('main');
    let yaw = 0, mode = 'metal', track = 'chrome';
    const scene = await createPortraitStage(host, {
      url:'/sculpture.glb', yaw:()=>yaw, pitch:()=>0, beat:()=>({}), playing:()=>false,
      track:()=>track, look:()=>mode, moving:()=>false, signal:new AbortController().signal, syncPoster(){}
    });
    const paint = () => new Promise(ok => requestAnimationFrame(() => requestAnimationFrame(ok)));
    await paint();
    window.renderAtlas = async (material, trackId) => {
      mode = material; track = trackId;
      const atlas = document.createElement('canvas');
      const model = host.querySelector('canvas'), w=model.width, h=model.height;
      atlas.width=w*6; atlas.height=h*4;
      const ctx = atlas.getContext('2d');
      for (let i=0;i<24;i++) {
        yaw = i*Math.PI/12;
        scene.invalidate();
        await paint();
        ctx.drawImage(model,(i%6)*w,Math.floor(i/6)*h,w,h);
      }
      return atlas.toDataURL('image/webp',.84).split(',')[1];
    };` }});
  const html = '<!doctype html><style>*{margin:0}main{width:288px;height:360px}</style><main></main><script type="module" src="/render.js"></script>';
  const model = await fs.readFile(path.join(out,'creator-mobile.glb'));
  const server=http.createServer((req,res)=>{
    const routes={'/':['text/html',html],'/render.js':['text/javascript',bundle.outputFiles[0].contents],
      '/sculpture.glb':['model/gltf-binary',model]};
    const body=Object.hasOwn(routes,req.url) && routes[req.url];
    if (!body){res.writeHead(404).end();return;}
    res.writeHead(200,{'Content-Type':body[0]}).end(body[1]);
  });
  await new Promise((ok,fail)=>server.once('error',fail).listen(0,'127.0.0.1',ok));
  let browser;
  try {
    browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_BIN,
      args:['--enable-unsafe-swiftshader']});
    const page=await browser.newPage({viewport:{width:350,height:430},deviceScaleFactor:1,reducedMotion:'reduce'});
    await page.addInitScript(()=>{
      const get=HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext=function(type,opts,...args){
        if(type==='webgl2')opts={...opts,preserveDrawingBuffer:true};
        return get.call(this,type,opts,...args);
      };
    });
    await page.goto('http://127.0.0.1:'+server.address().port);
    await page.waitForFunction(()=>typeof window.renderAtlas==='function');
    for(const track of ['chrome','acid'])for(const look of ['metal','natural','liquid']){
      if(track==='acid' && look==='natural')continue; // Photographic colours are identical.
      const data=await page.evaluate(([l,t])=>window.renderAtlas(l,t),[look,track]);
      const suffix=(track==='acid'?'-acid':'')+(look==='metal'?'':'-'+look);
      const bytes=Buffer.from(data,'base64');
      if(bytes.length<5000)throw Error('Empty atlas '+suffix);
      await fs.writeFile(path.join(out,'turntable'+suffix+'.webp'),bytes);
      console.log('turntable'+suffix+'.webp',bytes.length);
    }
  } finally {
    await browser?.close();
    await new Promise(ok=>server.close(ok));
  }
}
run().catch(e=>{console.error(e);process.exitCode=1;});
