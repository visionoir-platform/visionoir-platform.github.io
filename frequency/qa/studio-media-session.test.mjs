import test from 'node:test';
import assert from 'node:assert/strict';
import { studioMediaSession } from '../studio-media-session.js';

test('native media controls belong to this project only during playback and pause', () => {
  const bound = new Map(), invoked = [];
  const session = {setActionHandler(name, handler) {
    if (name === 'stop') throw new Error('unsupported native action');
    bound.set(name, handler);
  }};
  class Metadata { constructor(fields) { Object.assign(this, fields); } }
  const handlers = Object.fromEntries(['play','pause','stop'].map(name => [name, () => invoked.push(name)]));
  const media = studioMediaSession(session, Metadata, 'https://example.test', handlers);
  media.sync('none','Opening title');
  media.sync('paused','A different tab');
  assert.equal(bound.size,0);
  media.sync('playing','Original set');
  const data = session.metadata;
  assert.equal(data.title,'Original set');
  assert.deepEqual(data.artwork.map(image => new URL(image.src).pathname),[
    '/assets/visionoir-original-cover-v1-192.png','/assets/visionoir-original-cover-v1-512.png',
  ]);
  bound.get('pause')();
  media.sync('paused','Original set');
  assert.equal(session.playbackState,'paused');
  assert.equal(data,session.metadata);
  bound.get('play')();
  media.sync('playing','Second title');
  assert.equal(session.metadata.title,'Second title');
  assert.deepEqual(invoked,['pause','play']);
  media.clear();
  assert.equal(session.metadata,null);
  assert.equal(session.playbackState,'none');
  assert.equal(bound.get('play'),null);
  assert.doesNotThrow(() => studioMediaSession(undefined,undefined,'https://example.test',handlers).sync('playing','Untitled'));
});
