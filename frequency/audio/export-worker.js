import {renderOffline} from './offline.js';
self.onmessage=async({data:{project,options}})=>{
 try{const file=await renderOffline(project,options,value=>self.postMessage({progress:value}));self.postMessage({file});}
 catch(e){self.postMessage({error:e.message});}
};
