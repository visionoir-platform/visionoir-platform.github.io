import * as T from 'three';
import { loadPortrait } from './portrait.js';
import { makeEcho, makeFinish, makeShards } from './finish.js';
import { portraitProfile, easePortrait, scatterTarget } from './material-motion.js';
import { trackAccents } from '../palette.js';

const clamp = (v) => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0);
export async function createPortraitStage(host, { url, beat, playing, track, look, moving, signal, syncPoster, yaw, pitch }) {
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
  // Rotate the sculpture and all material effects together around its vertical centre.
  const u = {
    uLook: { value: 1 },
    uTime: { value: 0 },
    uProfile: { value: 0 },
    uScatter: { value: 0 },
    uLiquid: { value: 0 },
    uEcho: { value: 0 },
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
  const echo = makeEcho(asset.geometry, u);
  group.add(dust, echo);
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
    const seconds = Math.min(240, Math.max(16,dt)) / 1000;
    const mode = track(),
      value = look();
    u.uLook.value = value === 'natural' ? 0 : value === 'liquid' ? 2 : 1;
    const liquidTarget = Number(value === 'liquid');
    u.uLiquid.value = motion ? easePortrait(u.uLiquid.value, liquidTarget, seconds, .23) : liquidTarget;
    if (theme !== mode) {
      theme = mode;
      u.uProfile.value = portraitProfile(mode);
      u.uAccent.value.set(trackAccents[mode] || trackAccents.chrome);
      u.uAcid.value = Number(mode === 'acid');
      u.uNoir.value = Number(mode === 'noir');
      host.style.setProperty('--portrait-light', trackAccents[mode] || trackAccents.chrome);
    }
    const a = motion ? beat() || {} : {},
      current = u.uAudio.value;
    current.x = motion ? easePortrait(current.x, clamp(a.bass), seconds, .11) : 0;
    current.y = motion ? easePortrait(current.y, clamp(a.mid), seconds, .11) : 0;
    current.z = motion ? easePortrait(current.z, clamp(a.high), seconds, .11) : 0;
    current.w = motion ? easePortrait(current.w, clamp(a.level), seconds, .11) : 0;
    const particles = scatterTarget(u.uProfile.value, current.x, current.y, current.z, current.w);
    u.uScatter.value = motion ? easePortrait(u.uScatter.value, particles, seconds,
      particles > u.uScatter.value ? .13 : .31) : 0;
    dust.visible = u.uScatter.value > 0;
    const trail = Math.min(1, .64 * current.x + .72 * current.w);
    u.uEcho.value = motion && mode === 'afterimage'
      ? easePortrait(u.uEcho.value, trail, seconds, .26) : 0;
    echo.visible = u.uEcho.value > 0;
    if (motion && (current.w || current.x || current.y || current.z)) elapsed += seconds;
    else if (!u.uScatter.value && !u.uEcho.value) elapsed = 0;
    u.uTime.value = elapsed;
    if (motion && dt > 70) {
      if (++slow === 25 && quality > 0.67) {
        quality *= 0.83;
        slow = 0;
        resize();
      }
    } else slow = Math.max(0, slow - 1);
    group.rotation.set(pitch(), -.11 + yaw(), -.025, 'YXZ');
    gpu.render(scene, camera);
    host.dataset.render = 'webgl';
    const settling = current.x || current.y || current.z || current.w ||
      u.uScatter.value || echo.visible || u.uLiquid.value !== liquidTarget;
    if (motion && (playing() || settling)) schedule();
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
      echo.material.dispose();
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
