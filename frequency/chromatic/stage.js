import { deviceTilt } from '../../src/device-tilt.js';
import { logoPolarity } from '../../src/logo-polarity.js';
import * as T from 'three';
import outline from '../../public/assets/logo-geometry.json' with { type: 'json' };
import { TessellateModifier } from 'three/examples/jsm/modifiers/TessellateModifier.js';
import { MeshSurfaceSampler } from 'three/examples/jsm/math/MeshSurfaceSampler.js';
import { vertex, fragment } from './shaders.js';
import { makeHistory } from './history.js';
import { spatialScore } from './spatial.js';
import { advanceBlend, phraseMode, unseenMode } from './visual-score.js';
import { applyNoteEdges, defaultVisual, mixVisualVoices, modes, normalizeSignal, unit } from './model.js';

const base = import.meta.env?.BASE_URL || '/';
function logoAsset() {
  const { contours } = outline;
  const xyz = (curve) => curve.map(([x, y]) => new T.Vector2(x, -y));
  const shape = new T.Shape(xyz(contours[0]));
  for (const hole of contours.slice(1)) shape.holes.push(new T.Path(xyz(hole)));
  const rest = new T.ExtrudeGeometry(shape, {
    depth: 30,
    bevelEnabled: true,
    bevelSegments: 3,
    bevelSize: 5,
    bevelThickness: 5,
    steps: 1,
  });
  rest.center();
  rest.scale(0.00455, 0.00455, 0.00455);
  const out = new TessellateModifier(0.28, 7).modify(rest);
  rest.dispose();
  return { geometry: out };
}

function shaderUniforms() {
  return Object.fromEntries(
    Object.entries({
      uAlbedo: null,
      uTime: 0,
      uMode: 0,
      uNext: 0,
      uMix: 0,
      uActive: 0,
      uWarp: 0.45,
      uNoise: 0.32,
      uDist: 0.24,
      uCut: 0,
      uSize: 0.42,
      uPhase: 0,
      uDepth: 0.46,
      uEcho: 0,
      uParticle: 0,
      uRefract: 0.44,
      uReflect: 0.8,
      uLight: 0.65,
      uCreator: 0,
      uSound: new T.Vector4(),
      uVoices: new Float32Array(16),
      uTint: new T.Color(0xb4ddff),
    }).map(([k, value]) => [k, { value }]),
  );
}
function samples(geometry, n) {
  const sampler = new MeshSurfaceSampler(new T.Mesh(geometry)).build(),
    p = new T.Vector3(),
    normal = new T.Vector3();
  let seed = 17593;
  const rand = () => {
    seed = (1664525 * seed + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  sampler.setRandomGenerator(rand);
  const positions = new Float32Array(n * 3),
    normals = new Float32Array(n * 3),
    seeds = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    sampler.sample(p, normal);
    p.toArray(positions, 3 * i);
    normal.toArray(normals, 3 * i);
    seeds[i] = rand();
  }
  const g = new T.BufferGeometry();
  g.setAttribute('position', new T.BufferAttribute(positions, 3));
  g.setAttribute('normal', new T.BufferAttribute(normals, 3));
  g.setAttribute('aSeed', new T.BufferAttribute(seeds, 1));
  return g;
}
function gpuMaterial(uniforms, extra = {}) {
  return new T.ShaderMaterial({
    uniforms,
    vertexShader: vertex,
    fragmentShader: fragment,
    side: T.DoubleSide,
    ...extra,
  });
}
export async function buildStage(
  host,
  {
    getSignal = () => ({}),
    getState = () => defaultVisual(),
    assetLoader = logoAsset,
    creator = false,
    poster,
    canDraw = () => true,
    tilt = deviceTilt,
  } = {},
) {
  const abort = new AbortController();
  let closed = false,
    visible = true,
    recording = null,
    raf = 0,
    lost = false,
    failed = false,
    box = { width: 1, height: 1 };
  const fallback = document.createElement('img');
  fallback.className = 'chromatic-poster';
  fallback.src = poster || base + 'assets/logo.svg';
  fallback.alt = '';
  fallback.setAttribute('aria-hidden', 'true');
  host.append(fallback);
  host.dataset.render = 'fallback';
  let gpu;
  try {
    gpu = new T.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'low-power' });
  } catch {
    return {
      dispose() {
        closed = true;
        fallback.remove();
      },
      invalidate() {},
      trigger() {},
      getRenderState: () => host.dataset.render,
    };
  }
  const scene = new T.Scene(),
    camera = new T.PerspectiveCamera(35, 1, 0.08, 58),
    world = new T.Group();
  scene.add(world);
  const canvas = gpu.domElement;
  canvas.setAttribute('aria-hidden', 'true');
  canvas.className = 'chromatic-canvas';
  host.append(canvas);
  gpu.setClearColor(0x080a0e, 0);
  gpu.toneMapping = T.ACESFilmicToneMapping;
  gpu.outputColorSpace = T.SRGBColorSpace;
  const ambient = new T.HemisphereLight(0xfff8eb, 0x526078, 1.45);
  scene.add(ambient);
  const key = new T.DirectionalLight(0xffffff, 2.35);
  key.position.set(-3, 5, 5);
  scene.add(key);
  const rim = new T.DirectionalLight(0xafcbf3, 1.6);
  rim.position.set(3, 2, -2);
  scene.add(rim);
  const history = makeHistory(gpu);
  let historyOn = false;
  const u = shaderUniforms();
  const polarity = logoPolarity(document.documentElement);
  u.uLogoNegative = polarity.uniform;
  u.uCreator.value = Number(creator);
  u.uBuses = { value: new Float32Array(6) };
  let elapsed = 0,
    last = 0,
    drawnTiltX = 0,
    drawnTiltY = 0,
    lastState = null,
    quality = 1,
    slowFrames = 0,
    reduced = false;
  let geometry,
    points,
    solid,
    cloud,
    natural,
    assetCleanup,
    face,
    pointMat,
    echoMat,
    mood = 'metal';
  let echoes = [];
  const scores = new Map(),
    envelope = new Float32Array(16),
    hits = new Float32Array(16);
  const blend = { from: 0, to: 0, mix: 1 };
  const tempBands = new T.Vector4(),
    colorA = new T.Color(),
    colorB = new T.Color();
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const frameWindow = host.ownerDocument.defaultView || window;
  const cancel = () => {
    frameWindow.cancelAnimationFrame(raf);
    raf = 0;
    last = 0;
  };
  function request() {
    if (!closed && !failed && !raf && (visible || recording) && !lost && !document.hidden)
      raf = frameWindow.requestAnimationFrame(draw);
  }
  function resize() {
    // Keep the encoder's frame size stable while the studio layout changes.
    if (closed || recording) return;
    const rect = host.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    box = { width: Math.max(1, rect.width), height: Math.max(1, rect.height) };
    const aspect = box.width / box.height;
    camera.aspect = aspect;
    camera.updateProjectionMatrix();
    const state = getState() || {};
    const cap = state.quality === 'low' ? 0.85 : state.quality === 'high' ? 1.8 : 1.38;
    gpu.setPixelRatio(Math.min(devicePixelRatio || 1, cap) * quality);
    gpu.setSize(box.width, box.height, false);
    request();
  }
  function showFallback(reason) {
    host.dataset.render = reason;
    canvas.style.visibility = 'hidden';
    fallback.hidden = false;
  }
  function hit(i, v) {
    if (getState()?.freeze) return;
    if (Number.isInteger(i) && i >= 0 && i < 16) hits[i] = Math.max(hits[i], unit(v, 1));
    request();
  }
  const lose = (e) => {
    e.preventDefault();
    lost = true;
    cancel();
    showFallback('context-lost');
  };
  const restore = () => {
    lost = false;
    failed = false;
    resize();
  };
  canvas.addEventListener('webglcontextlost', lose);
  canvas.addEventListener('webglcontextrestored', restore);
  gpu.debug.onShaderError = (gl, program, vs, fs) => {
    failed = true;
    showFallback('shader-error');
    console.warn('VISIONOIR shader:', gl.getShaderInfoLog(vs), gl.getShaderInfoLog(fs));
  };
  const obs = new IntersectionObserver(([o]) => {
    visible = o.isIntersecting;
    if (visible || recording) request();
    else cancel();
  });
  obs.observe(host);
  const size = new ResizeObserver(resize);
  size.observe(host);
  const visibility = () => {
    if (document.hidden) cancel();
    else request();
  };
  document.addEventListener('visibilitychange', visibility);
  motion.addEventListener?.('change', request);
  function onPolarity() {
    polarity.refresh();
    lastTimeToken = -Infinity;
    request();
  }
  if (!creator) window.addEventListener('visionoir:logo-negative', onPolarity);
  function selectScore(index) {
    if (!scores.has(index)) {
      const score = spatialScore(index);
      scene.add(score.group);
      scores.set(index, score);
    }
    return scores.get(index);
  }
  let lastTimeToken = -Infinity;
  const currentSignal = normalizeSignal();
  function draw(now) {
    raf = 0;
    if (closed || lost || (!visible && !recording) || document.hidden || !solid || failed) return;
    const state = getState() || defaultVisual(),
      simple = state.reduced || motion.matches,
      frozen = state.freeze;
    const interval = last ? now - last : 16.6,
      dt = Math.min(0.08, interval / 1000);
    last = now;
    if (!canDraw()) return;
    if (!creator) polarity.update(dt, !simple && !frozen);
    else polarity.uniform.value = 0;
    const s = normalizeSignal(getSignal() || {}, currentSignal);
    const index = Math.max(
      0,
      modes.findIndex((m) => m[0] === state.mode),
    );
    if (host.dataset.visualMode !== state.mode) host.dataset.visualMode = state.mode;
    const changed = state !== lastState || simple !== reduced;
    if (simple && !changed && now - lastTimeToken < 220) {
      request();
      return;
    }
    lastTimeToken = now;
    if (!frozen || changed) {
      const inScore = !creator && !simple && index === unseenMode;
      const target = inScore ? phraseMode(s.beat, s.scene) : index;
      const transition = 0.45 + (1 - state.rebuild) * 0.85;
      // Phrase changes take up to two beats, even during a quiet passage.
      const duration = inScore ? Math.min(transition, 120 / s.bpm) : transition;
      advanceBlend(blend, target, simple ? 1 : dt / duration);
      const { from: fromMode, to: nextMode, mix } = blend;
      if (!frozen && !simple) elapsed += dt;
      const t = elapsed * (state.sync ? Math.min(2.4, s.bpm / 125) : 1);
      u.uTime.value = t;
      u.uPhase.value = state.phase + (state.sync ? (s.beat % 4) * 0.025 : 0);
      u.uMode.value = fromMode;
      u.uNext.value = nextMode;
      u.uMix.value = mix;
      const decay = Math.exp(-dt * (3.5 + (1 - state.decay) * 8));
      for (let i = 0; i < 6; i++) u.uBuses.value[i] = Math.max(u.uBuses.value[i] * decay, s.buses[i]);
      const voice = u.uVoices.value;
      mixVisualVoices(voice, envelope, hits, s.voices, state, decay);
      tempBands.set(
        unit(s.bass * state.bass * 1.35 * state.sensitivity),
        unit(s.mid * state.sensitivity),
        unit(s.high * state.treble * 1.45 * state.sensitivity),
        unit(s.level * state.sensitivity),
      );
      u.uSound.value.lerp(tempBands, simple ? 1 : 1 - Math.exp(-dt * 16));
      const peak = voice.reduce((a, b) => Math.max(a, b), 0);
      u.uActive.value =
        state.intensity *
        (simple ? 0.16 : 1) *
        Math.min(1, 0.55 * u.uSound.value.w + 0.58 * u.uSound.value.x + 0.65 * peak);
      u.uWarp.value = state.warp;
      u.uNoise.value = state.turbulence;
      u.uDist.value = state.distortion;
      u.uSize.value = state.size;
      u.uCut.value = simple ? 0 : state.dissolve;
      u.uRefract.value = state.refraction;
      u.uReflect.value = state.reflection;
      u.uLight.value = state.light;
      u.uDepth.value = state.depth;
      colorA.set(modes[fromMode][2]);
      colorB.set(modes[nextMode][2]);
      u.uTint.value.copy(colorA.lerp(colorB, mix));
      if (state.color) u.uTint.value.set(state.color);
      const ghost =
        (Number(fromMode === 9) * (1 - mix) + Number(nextMode === 9) * mix) *
        (!simple && mood !== 'natural' ? 1 : 0);
      for (let i = 0; i < echoes.length; i++) echoes[i].visible = ghost > (i + 1) * 0.18;
      points.setDrawRange(
        0,
        Math.max(
          0,
          Math.round(points.attributes.position.count * state.density * quality * (simple ? 0.18 : 1)),
        ),
      );
      if (!creator) {
        for (const [i, score] of scores) {
          if (i !== nextMode && i !== fromMode) {
            score.dispose();
            scene.remove(score.group);
            scores.delete(i);
          }
        }
        if (fromMode !== nextMode)
          selectScore(fromMode).update(1 - mix, t, u.uActive.value, u.uTint.value, state.depth);
        selectScore(nextMode).update(mix, t, u.uActive.value, u.uTint.value, state.depth);
      }
      world.rotation.y = creator
        ? -0.24 + Math.sin(t * 0.22) * 0.08 * state.camera
        : -0.3 + Math.sin(t * 0.28) * state.rotation * 0.68;
      world.rotation.x = creator ? 0.015 : -0.095 + Math.sin(t * 0.3) * state.camera * 0.1;
      // Freezing stops sensor delivery. Retain the pose that reached this renderer.
      if (!frozen || simple) {
        drawnTiltX = simple ? 0 : tilt.x;
        drawnTiltY = simple ? 0 : tilt.y;
      }
      world.rotation.y += drawnTiltX * .48;
      world.rotation.x += drawnTiltY * .26;
      world.rotation.z = creator ? 0 : -0.095 + Math.sin(t * 0.2) * state.rotation * 0.055;
      const portrait = box.width / box.height;
      camera.position.set(
        (creator ? .07 : 0) + drawnTiltX * .33,
        (creator ? .48 : 0) - drawnTiltY * .17,
        creator ? Math.max(3.34, 2.02 / portrait) : Math.max(6.85, 6.35 / portrait),
      );
      camera.lookAt(0, creator ? 0.24 : 0, 0);
    }
    lastState = state;
    reduced = simple;
    const persistent =
      !creator && !simple && state.quality !== 'low' && quality > 0.71 && [9, 14, unseenMode].includes(index);
    if (persistent) {
      history.render(scene, camera, box.width, box.height, 0.65 + 0.17 * state.decay);
      historyOn = true;
    } else {
      if (historyOn) {
        history.release();
        historyOn = false;
      }
      gpu.render(scene, camera);
    }
    if (!failed) {
      canvas.style.visibility = 'visible';
      fallback.hidden = true;
      if (host.dataset.render !== 'webgl') host.dataset.render = 'webgl';
    }
    if (!simple && !frozen && state.quality === 'auto') {
      slowFrames = interval > 35 ? Math.min(60, slowFrames + 1) : Math.max(0, slowFrames - 0.35);
      if (slowFrames > 38 && quality > 0.62) {
        quality = Math.max(0.6, quality - 0.16);
        slowFrames = 0;
        resize();
      }
    }
    if (!simple && !frozen) request();
  }
  function captureCanvas() {
    return solid && !closed && !lost && !failed ? canvas : null;
  }
  function startRecording(fps) {
    if (recording || !captureCanvas()?.captureStream) throw Error('Video unavailable');
    const stream = canvas.captureStream(fps);
    const stop = () => {
      for (const track of stream.getTracks()) track.stop();
      if (recording !== stop) return;
      recording = null;
      resize();
      if (!visible) cancel();
    };
    if (!stream.getVideoTracks().length) {
      stop();
      throw Error('Video unavailable');
    }
    recording = stop;
    request();
    return { stream, stop };
  }
  function dispose() {
    if (closed) return;
    closed = true;
    recording?.();
    abort.abort();
    cancel();
    obs.disconnect();
    size.disconnect();
    motion.removeEventListener?.('change', request);
    if (!creator) window.removeEventListener('visionoir:logo-negative', onPolarity);
    document.removeEventListener('visibilitychange', visibility);
    canvas.removeEventListener('webglcontextlost', lose);
    canvas.removeEventListener('webglcontextrestored', restore);
    history.dispose();
    for (const s of scores.values()) s.dispose();
    geometry?.dispose();
    points?.dispose();
    face?.dispose();
    pointMat?.dispose();
    echoMat?.dispose();
    assetCleanup?.();
    gpu.dispose();
    canvas.remove();
    fallback.remove();
  }
  try {
    const asset = await assetLoader(abort.signal);
    if (closed) {
      asset.geometry.dispose();
      asset.dispose?.();
      return { dispose };
    }
    geometry = asset.geometry;
    assetCleanup = asset.dispose;
    natural = asset.natural;
    u.uAlbedo.value = natural?.map || null;
    geometry.setAttribute(
      'aSeed',
      new T.BufferAttribute(new Float32Array(geometry.attributes.position.count), 1),
    );
    face = gpuMaterial(u);
    solid = new T.Mesh(geometry, face);
    world.add(solid);
    points = samples(geometry, creator ? 9500 : 6200);
    pointMat = gpuMaterial(
      { ...u, uParticle: { value: 1 } },
      { transparent: true, depthWrite: false, blending: T.AdditiveBlending },
    );
    cloud = new T.Points(points, pointMat);
    cloud.frustumCulled = false;
    world.add(cloud);
    echoMat = gpuMaterial({ ...u, uEcho: { value: 1 } }, { transparent: true, depthWrite: false });
    for (let i = 0; i < 2; i++) {
      const echo = new T.Mesh(geometry, echoMat);
      echo.visible = false;
      echo.position.set(-0.22 * i, 0.08 * i, -0.2 * i);
      world.add(echo);
      echoes.push(echo);
    }
    resize();
    request();
  } catch (error) {
    if (error.name !== 'AbortError') {
      showFallback('asset-error');
      console.warn('VISIONOIR scene:', error.message);
    }
  }
  return {
    getRenderState: () => host.dataset.render,
    captureCanvas,
    startRecording,
    dispose,
    resize,
    invalidate: request,
    trigger: hit,
    noteEdges(attacks, gates, releases) {
      if (!getState()?.freeze) {
        applyNoteEdges(hits, envelope, attacks, gates, releases);
        request();
      }
    },
    setLook(value) {
      mood = value === 'natural' && natural ? 'natural' : 'metal';
      if (solid) {
        solid.material = mood === 'natural' ? natural : face;
        cloud.visible = mood !== 'natural';
      }
      request();
    },
  };
}
