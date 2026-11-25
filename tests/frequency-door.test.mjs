import test from 'node:test';
import assert from 'node:assert/strict';
import {bindFrequencyDoor} from '../src/frequency-door.js';

function gestureFixture() {
  const win = new EventTarget();
  const target = new EventTarget();
  target.contains = node => node === target;
  target.dataset = {};
  globalThis.window = win;
  let clock = 0, opened = 0;
  bindFrequencyDoor(target, {onOpen: () => opened++, now: () => clock});
  function dispatch(receiver, type, data = {}) {
    const event = new Event(type, {cancelable:true});
    for(const [key,value] of Object.entries(data)) Object.defineProperty(event,key,{value});
    receiver.dispatchEvent(event);
  }
  function pointer(type, extra = {}) {
    const data = {pointerId:1, button:0, isPrimary:true, clientX:80, clientY:70, target, ...extra};
    dispatch(type==='pointerup'||type==='pointercancel'?win:target,type,data);
  }
  const tap = () => {pointer('pointerdown'); pointer('pointerup');};
  const next = ms => {clock+=ms;};
  return {tap,next,pointer,opens:()=>opened, scroll:()=>dispatch(win,'scroll'),key:()=>dispatch(target,'click',{detail:0}),finish:()=>dispatch(win,'blur')};
}
test('Logo opens once on a deliberate triple tap or three keyboard activations',()=>{
  for(const method of ['tap','key']) {
    const f=gestureFixture();
    f[method]();f.next(200);f[method]();assert.equal(f.opens(),0);
    f.next(600);f[method]();f[method]();assert.equal(f.opens(),1);f.finish();
  }
});
test('Scroll, elapsed window, drags, long press and second finger reset the gesture',()=>{
  for(const interrupt of [
    f=>f.scroll(), f=>f.next(1600),
    f=>{f.pointer('pointerdown');f.pointer('pointermove',{clientX:110});f.pointer('pointerup',{clientX:110});},
    f=>{f.pointer('pointerdown');f.next(500);f.pointer('pointerup');},
    f=>{f.pointer('pointerdown');f.pointer('pointerdown',{pointerId:2,isPrimary:false});f.pointer('pointerup',{pointerId:2});f.pointer('pointerup');}
  ]) {
    const f=gestureFixture();f.tap();f.tap();interrupt(f);f.tap();assert.equal(f.opens(),0);f.finish();
  }
});
