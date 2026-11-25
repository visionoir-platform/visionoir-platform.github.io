const scope = '/frequency/';

async function registration() {
  const reg = await navigator.serviceWorker?.getRegistration(scope);
  return reg?.scope === new URL(scope,location.origin).href ? reg : undefined;
}
function ask(worker, action) {
  return new Promise((resolve,reject) => {
    const channel = new MessageChannel();
    const finish = (fn,value) => { clearTimeout(timer); channel.port1.close(); fn(value); };
    const timer = setTimeout(()=>finish(reject,Error('offlineRetry')), action==='prepare' ? 120000 : 3000);
    channel.port1.onmessage = ({data}) => {
      if (data?.error) finish(reject,Error(data.error));
      else if (Number.isInteger(data?.missing) && Number.isFinite(data.bytes)) finish(resolve,data);
      else finish(reject,Error('offlineRetry'));
    };
    try { worker.postMessage('frequency.'+action,[channel.port2]); }
    catch (error) { finish(reject,error); }
  });
}
function installed(worker) {
  return new Promise((resolve,reject) => {
    const timeout = setTimeout(() => { worker.removeEventListener('statechange',changed); reject(Error('offlineRetry')); },120000);
    function changed() {
      if (!['installed','activating','activated','redundant'].includes(worker.state)) return;
      clearTimeout(timeout);
      worker.removeEventListener('statechange',changed);
      if (worker.state==='redundant') reject(Error('offlineRetry'));
      else resolve(worker);
    }
    worker.addEventListener('statechange',changed);
    changed();
  });
}
function status(result, reg) {
  return result.missing ? {key:'offlineMissing', bytes:result.bytes} :
    {key:reg.waiting && reg.active ? 'offlineWaiting' : 'offlineReady'};
}
export async function offlineStatus() {
  if (!('serviceWorker' in navigator)) return {key:'unsupported'};
  const reg = await registration();
  if (!reg?.active) return {key:reg?.installing || reg?.waiting ? 'offlinePreparing' : 'offlineNotSaved'};
  return status(await ask(reg.active,'inspect'),reg);
}

async function checkInitialSpace() {
  const space = await navigator.storage?.estimate?.().catch(()=>undefined);
  if (!Number.isFinite(space?.quota) || !Number.isFinite(space?.usage)) return;
  const response = await fetch(scope+'offline-package.json',{cache:'no-store'});
  if (!response.ok) throw Error('offlineRetry');
  const {bytes} = await response.json();
  if (Number.isFinite(bytes) && space.quota-space.usage < bytes) throw Error('offlineSpace');
}

export async function prepareOffline() {
  let reg = await registration();
  if (!reg) {
    await checkInitialSpace();
    reg = await navigator.serviceWorker.register(scope+'sw.js',{scope,updateViaCache:'none'});
  }
  // A waiting build gets its turn after all clients of the current one close.
  // Never force an update into a live session.
  if (reg.waiting && reg.active) {
    const next = await ask(reg.waiting,'prepare');
    return status(next,reg);
  }
  if (reg.installing && !reg.active) await installed(reg.installing);
  const worker = reg.active || reg.waiting || reg.installing;
  if (!worker) throw Error('offlineRetry');
  // A pre-upgrade worker only answers the old version query. Request the normal
  // browser update on failure, keeping the live worker if the network is down.
  try { return status(await ask(worker,'prepare'),reg); }
  catch (error) {
    if (error.message==='offlineSpace') throw error;
    await reg.update();
    const next = reg.installing || reg.waiting;
    if (!next) throw error;
    await installed(next);
    return status(await ask(next,'prepare'),reg);
  }
}

export function offlineError(error) {
  return {key:error?.message==='offlineSpace' || error?.name==='QuotaExceededError' ? 'offlineSpace' : 'offlineRetry'};
}
