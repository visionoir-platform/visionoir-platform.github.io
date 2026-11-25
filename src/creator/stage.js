import * as T from 'three';
import { loadPortrait } from './portrait.js';
import { makeFinish, makeShards } from './finish.js';
import { trackAccents } from '../palette.js';

const clamp = (v) => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0);
export async function createPortraitStage(host, { url, beat, track, look, moving, signal, syncPoster }) {
  const gpu = new T.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'low-power' });
  const canvas = gpu.domElement;
  canvas.setAttribute('aria-hidden', 'true');
  canvas.className = 'chromatic-canvas';
  gpu.setClearColor(0x000000, 0);
  gpu.outputColorSpace = T.SRGBColorSpace;
  gpu.toneMapping = T.ACESFilmicToneMapping;
  gpu.toneMappingExposure = 1.02;
  let asset;
  try {
    asset = await loadPortrait(url, signal);
  } catch (e) {
    gpu.dispose();
    throw e;
  }
  if (signal.aborted) {
    asset.dispose();
    asset.geometry.dispose();
    gpu.dispose();
    return;
  }
  const scene = new T.Scene(),
    camera = new T.PerspectiveCamera(35, 1, 0.1, 32),
    group = new T.Group();
  scene.add(group);
  // A single oblique, slightly elevated photographic view. The baked skeleton never moves.
  group.rotation.y = -0.11;
  group.rotation.z = -0.025;
  const u = {
    uLook: { value: 1 },
    uTime: { value: 0 },
    uAcid: { value: 0 },
    uNoir: { value: 0 },
    uAccent: { value: new T.Color(trackAccents.chrome) },
    uAudio: { value: new T.Vector4() },
    uDpr: { value: 1 },
  };
  const finish = makeFinish(asset, u),
    solid = new T.Mesh(asset.geometry, finish);
  group.add(solid);
  const mobile = window.matchMedia('(max-width:800px)').matches;
  const dust = makeShards(asset.geometry, u, mobile);
  group.add(dust);
  let visible = true,
    closed = false,
    lost = false,
    raf = 0,
    elapsed = 0,
    previous = 0,
    slow = 0,
    quality = 1,
    dirty = true,
    theme = '';
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  function resize() {
    const { width, height } = host.getBoundingClientRect();
    if (!width || !height) return;
    camera.aspect = width / height;
    const dist = Math.max(4.05, 2.65 / camera.aspect);
    camera.position.set(0.08, 0.88, dist + 0.11);
    camera.lookAt(0.005, 0.025, 0);
    camera.updateProjectionMatrix();
    const pixelRatio =
      Math.min(window.devicePixelRatio || 1, mobile ? 1.4 : 1.65, 1550 / Math.max(width, height)) * quality;
    gpu.setPixelRatio(pixelRatio);
    u.uDpr.value = pixelRatio;
    gpu.setSize(width, height, false);
    invalidate();
  }
  function schedule() {
    if (!raf && !closed && !lost && visible && !document.hidden) raf = requestAnimationFrame(draw);
  }
  function invalidate() {
    dirty = true;
    schedule();
  }
  function pause() {
    cancelAnimationFrame(raf);
    raf = 0;
    previous = 0;
  }
  function draw(now) {
    raf = 0;
    if (closed || lost || !visible || document.hidden) return;
    const motion = moving() && !reduced.matches;
    const dt = previous ? now - previous : 0;
    if (!dirty && dt < (mobile ? 1000 / 24 : 1000 / 30)) {
      schedule();
      return;
    }
    dirty = false;
    previous = now;
    if (motion) elapsed += Math.min(80, dt) / 1000;
    const mode = track(),
      value = look();
    u.uLook.value = value === 'natural' ? 0 : value === 'liquid' ? 2 : 1;
    u.uTime.value = elapsed;
    if (theme !== mode) {
      theme = mode;
      u.uAccent.value.set(trackAccents[mode] || trackAccents.chrome);
      u.uAcid.value = Number(mode === 'acid');
      u.uNoir.value = Number(mode === 'noir');
      host.style.setProperty('--portrait-light', trackAccents[mode] || trackAccents.chrome);
    }
    const a = motion ? beat() || {} : {},
      current = u.uAudio.value;
    const blend = motion ? 1 - Math.exp(-Math.max(16, Math.min(100, dt)) / 130) : 1;
    current.x += (clamp(a.bass) - current.x) * blend;
    current.y += (clamp(a.mid) - current.y) * blend;
    current.z += (clamp(a.high) - current.z) * blend;
    current.w += (clamp(a.level) - current.w) * blend;
    if (motion && dt > 70) {
      if (++slow === 25 && quality > 0.67) {
        quality *= 0.83;
        slow = 0;
        resize();
      }
    } else slow = Math.max(0, slow - 1);
    gpu.render(scene, camera);
    host.dataset.render = 'webgl';
    if (motion) schedule();
  }
  function onLoss(e) {
    e.preventDefault();
    lost = true;
    host.dataset.render = 'context-lost';
    syncPoster();
    pause();
  }
  function onRestore() {
    lost = false;
    invalidate();
  }
  function onVisibility() {
    if (document.hidden) pause();
    else invalidate();
  }
  const view = new IntersectionObserver((entries) => {
    visible = entries.some((e) => e.isIntersecting);
    if (visible) invalidate();
    else pause();
  });
  view.observe(host);
  const size = new ResizeObserver(resize);
  size.observe(host);
  document.addEventListener('visibilitychange', onVisibility);
  reduced.addEventListener('change', invalidate);
  canvas.addEventListener('webglcontextlost', onLoss);
  canvas.addEventListener('webglcontextrestored', onRestore);
  host.append(canvas);
  resize();
  return {
    invalidate,
    dispose() {
      closed = true;
      pause();
      size.disconnect();
      view.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
      reduced.removeEventListener('change', invalidate);
      canvas.removeEventListener('webglcontextlost', onLoss);
      canvas.removeEventListener('webglcontextrestored', onRestore);
      dust.geometry.dispose();
      dust.material.dispose();
      finish.dispose();
      asset.geometry.dispose();
      asset.dispose();
      gpu.dispose();
      canvas.remove();
      host.dataset.render = 'fallback';
    },
  };
}
