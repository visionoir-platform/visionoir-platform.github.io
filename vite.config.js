import { resolve } from 'node:path';
import { homedir } from 'node:os';
import { defineConfig } from 'vite';
import { localFanPreview } from './game/studio/fan-preview.mjs';
export default defineConfig(({command})=>{
  if(command==='build' && process.env.VITE_UNSEEN_PROFILE==='fan'){
    const out=process.env.UNSEEN_PRIVATE_OUTPUT;
    if(!out || !resolve(out).startsWith(resolve(homedir(),'sites/visionoir-qa/private-unseen-build-')) || !process.argv.includes(out))throw Error('Use npm run game:build:fan for a private output directory.');
  }
  return {
  plugins: [localFanPreview()],
  worker: { format: 'es' },
  base: process.env.VISIONOIR_BASE || '/',
  build: { rollupOptions: { input: { site: 'index.html', unseen: 'unseen/index.html', portals:'support/index.html', frequency:'frequency/index.html' } } },
  };
});
