import test from 'node:test';
import assert from 'node:assert/strict';
import {createShakeDetector, mountDeviceShake} from '../src/device-shake.js';
import {tiltLabels} from '../src/tilt-labels.js';
import {names} from '../src/locales.js';

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
test('passive acquisition, hidden/resume, disabled and disposed scopes',()=>{
  const sim=fakeDevice(); let toggles=0,statusChanges=0;
  const m=mountDeviceShake({onToggle:()=>toggles++,onStatus:()=>statusChanges++});
  try{
    assert.equal(statusChanges,0);
    assert.equal(m.status,'automatic');assert.equal(m.showControl,false);
    sim.send(20,0);sim.send(-20,90);
    sim.win.dispatchEvent(new Event('pagehide'));sim.send(20,180);
    sim.win.dispatchEvent(new Event('pageshow'));sim.send(20,200);
    assert.equal(toggles,0);
    sim.send(-20,295);sim.send(20,390);
    assert.equal(toggles,1);assert.equal(m.status,'receiving');
    m.setEnabled(false);sim.send(-20,480);sim.send(20,570);sim.send(-20,660);
    assert.equal(toggles,1);
    m.setEnabled(true);sim.doc.hidden=true;sim.doc.dispatchEvent(new Event('visibilitychange'));
    sim.send(20,750);sim.send(-20,840);sim.send(20,930);
    assert.equal(toggles,1);
    sim.doc.hidden=false;sim.doc.dispatchEvent(new Event('visibilitychange'));
    sim.send(20,1000);sim.send(-20,1100);sim.send(20,1200);assert.equal(toggles,2);
    m.dispose();sim.send(20,1400);sim.send(-20,1500);sim.send(20,1600);assert.equal(toggles,2);
  }finally{m.dispose();sim.close();}
});
test('permission is never requested on entry, deduplicates requests and ignores stale results',async()=>{
  let settle;const sim=fakeDevice({permissions:()=>new Promise(ok=>{settle=ok;})});
  const m=mountDeviceShake();
  try{
    assert.equal(sim.perms(),0);assert.equal(m.status,'ask');assert.equal(m.showControl,true);
    const a=m.request();await m.request();assert.equal(sim.perms(),1);
    m.setEnabled(false);settle('granted');await a;assert.equal(m.showControl,false);
    m.setEnabled(true);const b=m.request();settle('denied');await b;assert.equal(m.status,'unavailable');
    const c=m.request();settle('granted');await c;assert.equal(m.status,'waiting');
    sim.send(0,0);assert.equal(m.status,'receiving');assert.equal(m.showControl,false);
  } finally{m.dispose();sim.close();}
  for(const options of [{expose:false},{secure:false}]){
    const env=fakeDevice(options),unavailable=mountDeviceShake();
    try{assert.equal(unavailable.status,'unavailable');assert.equal(unavailable.showControl,false);await unavailable.request();}
    finally{unavailable.dispose();env.close();}
  }
});
test('nineteen locales expose independent shake controls and tilt labels',()=>{
  for(const lang of Object.keys(names)){
    const labels=tiltLabels(lang);
    for(const key of ['shakeEnable','shakeUnavailable','tiltEnable','tiltUnavailable','negativeLogo']) assert.ok(labels[key].trim(),lang);
    assert.notEqual(labels.shakeEnable,labels.tiltEnable);
  }
});
