import test from 'node:test';
import assert from 'node:assert/strict';
import {createShakeDetector, mountDeviceShake} from '../src/device-shake.js';

const linear = (x,y=0,z=0) => ({acceleration:{x,y,z}});
const gravity = (x,y,z) => ({acceleration:{x:null,y:null,z:null},accelerationIncludingGravity:{x,y,z}});
function stream(detector, start, duration, interval, sample) {
  let count=0;
  for(let t=0;t<duration;t+=interval) if(detector.read(sample(t),start+t))count++;
  return count;
}
test('a deliberate sideways or diagonal shake toggles once until quiet, at 30/60/120 Hz',()=>{
  for (const interval of [33,17,8]) for(const vector of [[1,0,0],[0,.6,.8],[-.7,.7,.14]]) {
    const detect=createShakeDetector();
    const shake=t=>{
      const a=18*Math.sin(2*Math.PI*t/240);
      return linear(a*vector[0],a*vector[1],a*vector[2]);
    };
    assert.equal(stream(detect,0,1000,interval,shake),1);
    assert.equal(stream(detect,1000,200,interval,()=>linear(0)),0);
    assert.equal(stream(detect,1200,960,interval,shake),0);
    assert.equal(stream(detect,2160,750,interval,()=>linear(0)),0);
    assert.equal(stream(detect,2910,960,interval,shake),1);
  }
});
test('a constant pull, repeated taps on one side, minor vibration and erratic high-rate impulses do not toggle',()=>{
  for (const [interval,sample] of [
    [10,()=>linear(12)], [20,t=>linear(t%240<80?14:0)],
    [8,t=>linear(3*Math.sin(t/18),3*Math.sin(t/8),1)],
    [8,t=>linear(t%16?23:-23)], [16,t=>linear(t%1000<440?18:-18)],
  ]) assert.equal(stream(createShakeDetector(),0,2300,interval,sample),0);
  const d=createShakeDetector();
  assert.equal(d.read(linear(15),0),false);
  assert.equal(d.read(linear(-15),90),false);
  assert.equal(d.read(linear(15),700),false);
  assert.equal(d.read(linear(-15),700),false);
  assert.equal(d.read({acceleration:{x:NaN,y:1,z:3}},710),null);
});
test('gravity-inclusive phones reject rest and rotation, and recognise translation even on a tilted device',()=>{
  const detector=createShakeDetector();
  assert.equal(stream(detector,0,800,16,()=>gravity(0,4.905,8.496)),0);
  const shake=t=>gravity(18*Math.sin(t*2*Math.PI/230),4.905,8.496);
  assert.equal(stream(detector,800,1200,16,shake),1);
  // No opportunity to fire again by changing the API representation mid-gesture.
  assert.equal(stream(detector,2000,700,16,t=>linear(19*Math.sin(t*2*Math.PI/230))),0);
  for(const period of [230,1400,6000]){
    const rotate=t=>gravity(9.81*Math.sin(t*2*Math.PI/period),0,9.81*Math.cos(t*2*Math.PI/period));
    assert.equal(stream(createShakeDetector(),0,2500,16,rotate),0);
  }
});

function fakeDevice({permissions,expose=true,secure=true}={}) {
  const win=new EventTarget(), doc=new EventTarget();
  let n=0;
  Object.assign(win,{isSecureContext:secure});
  if(expose) win.DeviceMotionEvent = permissions ? {requestPermission:()=>{n++;return permissions();}} : {};
  doc.hidden=false;
  globalThis.window=win;globalThis.document=doc;
  return {win,doc,perms:()=>n,send(value,time) {
    const event=new Event('devicemotion');
    Object.defineProperties(event,{acceleration:{value:linear(value).acceleration},timeStamp:{value:time}});
    win.dispatchEvent(event);
  },close(){delete globalThis.window;delete globalThis.document;}};
}
test('two shakes toggle without a click or permission request; partial gestures reset when hidden',()=>{
  const sim=fakeDevice({permissions:()=>Promise.resolve('denied')});
  let toggles=0;
  const m=mountDeviceShake({onToggle:()=>toggles++});
  try{
    sim.send(20,0);sim.send(-20,90);sim.send(20,180);
    assert.equal(toggles,1);
    for (let t=200;t<900;t+=20) sim.send(0,t);
    sim.send(-20,920);sim.send(20,1010);sim.send(-20,1100);
    assert.equal(toggles,2);
    sim.doc.hidden=true;sim.doc.dispatchEvent(new Event('visibilitychange'));
    sim.send(20,1400);sim.send(-20,1500);sim.send(20,1600);assert.equal(toggles,2);
    sim.doc.hidden=false;sim.doc.dispatchEvent(new Event('visibilitychange'));
    sim.send(20,1800);sim.send(-20,1900);
    sim.win.dispatchEvent(new Event('pagehide'));sim.win.dispatchEvent(new Event('pageshow'));
    sim.send(20,2000);assert.equal(toggles,2);
    sim.send(-20,2100);sim.send(20,2200);assert.equal(toggles,3);
    assert.equal(sim.perms(),0);
    m.dispose();sim.send(-20,2300);sim.send(20,2400);sim.send(-20,2500);assert.equal(toggles,3);
  }finally{m.dispose();sim.close();}
});
test('unsupported and insecure contexts do not react to motion',()=>{
  for(const args of [{expose:false},{secure:false}]){
    const sim=fakeDevice(args);let toggles=0;
    const m=mountDeviceShake({onToggle:()=>toggles++});
    try{sim.send(20,0);sim.send(-20,90);sim.send(20,180);assert.equal(toggles,0);}
    finally{m.dispose();sim.close();}
  }
});

test('a moderate shake and a second burst after sensor silence each toggle exactly once',()=>{
  const detector=createShakeDetector();
  const wave=t=>linear(8.4*Math.sin(2*Math.PI*t/260));
  assert.equal(stream(detector,0,860,16,wave),1);
  // Some phones stop reporting at rest, so there need not be any zero samples.
  assert.equal(stream(detector,2200,690,16,wave),1);
});

test('motion access uses the accelerometer API from the gesture, tolerates duplicate taps and respects refusal',async()=>{
  const {createDeviceMotionAccess}=await import('../src/device-motion-access.js');
  let finish, requests=0;
  const win={isSecureContext:true,
    DeviceMotionEvent:{requestPermission(){requests++;return new Promise(resolve=>{finish=resolve;});}},
    DeviceOrientationEvent:{requestPermission(){throw Error('Wrong API for shake');}}};
  const access=createDeviceMotionAccess(win);
  access.observed('orientation');
  assert.equal(access.state,'ask');
  assert.equal(requests,0);
  const pending=access.request();
  assert.equal(requests,1);
  await access.request();
  finish('denied'); await pending;
  assert.equal(access.state,'unavailable');
  await access.request(); assert.equal(requests,1);
  const retry=access.request(true); assert.equal(requests,2);
  finish('granted'); await retry;
  assert.equal(access.state,'granted');
  await access.request(); assert.equal(requests,2);
  access.observed('motion');
  assert.equal(access.state,'receiving');
});

test('automatic motion streams and preauthorized motion do not open a permission prompt',async()=>{
  const {createDeviceMotionAccess}=await import('../src/device-motion-access.js');
  let count=0;
  const win={isSecureContext:true,DeviceMotionEvent:{requestPermission(){count++;return 'granted';}}};
  const granted=createDeviceMotionAccess(win);
  granted.observed('motion'); await granted.request(true); assert.equal(count,0);
  const automatic=createDeviceMotionAccess({isSecureContext:true,DeviceMotionEvent:{}});
  await automatic.request(); assert.equal(automatic.state,'automatic');
  const orient=createDeviceMotionAccess({isSecureContext:true,DeviceOrientationEvent:win.DeviceMotionEvent});
  await orient.request(); assert.equal(orient.state,'granted'); assert.equal(count,1);
});
