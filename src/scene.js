import { trackAccents } from './palette.js';
import * as THREE from 'three';

const BANDS = ['bass', 'mid', 'high', 'level'];
const MODES = ['chrome', 'acid', 'noir', 'alloy', 'aura'];
const unit = value => Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;

// Apply the same continuous transform to coincident vertices, preserving bevel
// seams and the eye opening. Audio silence restores the original mesh exactly.
export function deformLogoVertices(base, output, time, audio = {}, weights = { chrome: 1 }, intensity = 1) {
  const amount = unit(intensity);
  const bass = unit(audio.bass) * amount, mid = unit(audio.mid) * amount;
  const high = unit(audio.high) * amount, level = unit(audio.level) * amount;
  const values = MODES.map(mode => unit(weights[mode]));
  const divisor = Math.max(1, values.reduce((sum, value) => sum + value, 0));
  const [chrome, acid, noir, alloy, aura] = values.map(value => value / divisor);
  const t = Number.isFinite(time) ? time : 0;
  if (bass + mid + high + level < .00001) { output.set(base); return; }
  for (let i = 0; i < base.length; i += 3) {
    const x = base[i], y = base[i + 1], z = base[i + 2];
    let dx = 0, dy = 0, dz = 0;
    if (chrome > .001) {
      const wave = Math.sin(y * 1.55 - x * .68 - t * 1.7);
      const ripple = Math.sin(x * 2.05 + y * .85 - t * 2.2);
      dx += chrome * (x * bass * .026 + wave * mid * .025);
      dy += chrome * (y * bass * .018 + ripple * high * .013);
      dz += chrome * (wave * (bass * .105 + level * .07) + ripple * mid * .052);
    }
    if (acid > .001) {
      const twist = y * (bass * .085 + mid * .07) * (.76 + .24 * Math.sin(t * 1.85));
      const c = Math.cos(twist), s = Math.sin(twist);
      dx += acid * (x * c + z * s - x + Math.sin(y * 1.8 + t * 2.4) * mid * .055);
      dy += acid * (Math.sin(x * 1.5 - t * 2.3) * (bass * .055 + mid * .035) + y * level * .018);
      dz += acid * (-x * s + z * c - z + Math.sin(y * 2.2 - x * .5 - t * 2.7) * mid * .1
        + Math.sin(x * 2.8 + y * 1.6 - t * 2) * high * .014);
    }
    if (noir > .001) {
      const flow = Math.sin(y * .9 + x * .48 - t * .75);
      const weight = (2.3 - y) / 4.6;
      dx += noir * (flow * level * .068 + y * bass * .022);
      dy += noir * (-weight * bass * .055 + Math.sin(x * .8 - t * .65) * level * .028);
      dz += noir * ((x * x * .06 - .12) * bass + flow * level * .14
        + Math.sin(y * .7 - t * .55) * mid * .06 + Math.cos(x * 2.3 + y - t * .6) * high * .008);
    }
    if (alloy > .001) {
      // Titanium: compressed vertical weight and opposing, rolling metal folds.
      const fold = Math.sin(x * 1.65 + y * .45 - t * 1.15);
      dx += alloy * (y * mid * .034 + Math.sin(y * 1.2 - t) * high * .012);
      dy += alloy * (-y * bass * .025 + fold * mid * .025);
      dz += alloy * (fold * mid * .15 + Math.cos(y * 1.15 - t * .9) * bass * .085
        + Math.sin(x * 2.6 - y * .7 - t * 1.5) * high * .018 + x * level * .025);
    }
    if (aura > .001) {
      // Opalescent silver: outward breathing and gentle concentric surface waves.
      const radius = Math.hypot(x * .9, y * .8);
      const halo = Math.sin(radius * 2.15 - t * .9);
      dx += aura * (x * bass * .021 + y * mid * .012 * Math.sin(t * .65));
      dy += aura * (y * bass * .021 + Math.sin(x * 1.1 - t * .6) * mid * .025);
      dz += aura * (halo * level * .14 + Math.sin(y * 1.3 + x * .5 - t) * mid * .055
        + Math.cos(radius * 3.1 - t * 1.2) * high * .012);
    }
    output[i] = x + dx; output[i + 1] = y + dy; output[i + 2] = z + dz;
  }
}

/** Render the supplied VISIONOIR mark; all material/geometry stays local. */
export async function initScene(container, getAudioData = () => ({})) {
  const assetBase = import.meta.env?.BASE_URL || '/';
  const assetURL = name => `${assetBase}assets/${name}`;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  let requestedMotion = true, motion = !reduced.matches, intensity = 1, audioEnabled = true;
  let contextLost = false, disposed = false, failed = false, initialized = false;
  let visible = true, hasSize = false, frame = 0, mode = 'chrome';
  let renderer, envTarget, logoGeometry, basePositions, resizeObserver, intersectionObserver;
  let fallbackImage = container.querySelector('.scene-fallback, .logo-fallback, [data-scene-fallback]');
  let ownsFallback = false;
  const state = (value, reason = '') => {
    if (container.dataset.renderState === value && (container.dataset.renderError || '') === reason) return;
    container.dataset.renderState = value;
    if (reason) container.dataset.renderError = reason; else delete container.dataset.renderError;
    container.dispatchEvent(new CustomEvent('visionoir:scene', { bubbles: true, detail: { state: value, reason } }));
  };
  const showFallback = (reason = '') => {
    if (!fallbackImage) {
      fallbackImage = document.createElement('img'); ownsFallback = true;
      fallbackImage.src = assetURL('logo.svg'); fallbackImage.alt = 'Il simbolo Visionoir';
      fallbackImage.className = 'scene-fallback';
      Object.assign(fallbackImage.style, { width: '70%', height: '80%', objectFit: 'contain', position: 'absolute', inset: '10% 15%', filter: 'drop-shadow(0 0 30px #ffffff12)', pointerEvents: 'none' });
      container.append(fallbackImage);
    }
    fallbackImage.hidden = false; fallbackImage.style.visibility = 'visible';
    if (renderer) renderer.domElement.style.visibility = 'hidden';
    state(reason ? 'fallback' : 'loading', reason);
  };
  const stop = () => { if (frame) cancelAnimationFrame(frame); frame = 0; lastTime = 0; };
  const passiveAPI = { setMode() {}, setMotion() {}, setIntensity() {}, setAudioEnabled() {}, dispose() { disposed = true; } };
  showFallback();
  // A second configuration helps drivers that reject multisampled contexts.
  try { renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'low-power' }); }
  catch {
    try { renderer = new THREE.WebGLRenderer({ alpha: true, antialias: false, powerPreference: 'default' }); }
    catch { showFallback('webgl-unavailable'); return passiveAPI; }
  }
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.25;
  renderer.domElement.setAttribute('aria-hidden', 'true');
  Object.assign(renderer.domElement.style, { width: '100%', height: '100%', display: 'block', visibility: 'hidden' });
  container.append(renderer.domElement);
  const captureEarlyLoss = event => { event.preventDefault(); if (!initialized) { contextLost = true; showFallback('context-lost'); } };
  renderer.domElement.addEventListener('webglcontextlost', captureEarlyLoss);
  let shaderFailed = false;
  renderer.debug.onShaderError = () => { shaderFailed = true; };

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(34, 1, .1, 80);
  camera.position.set(0, 0, 10.5);
  const studio = new THREE.Scene(); studio.background = new THREE.Color('#202020');
  function panel(w, h, x, y, z, color, strength = 1) {
    const material = new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide });
    material.color.multiplyScalar(strength);
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), material);
    mesh.position.set(x, y, z); mesh.lookAt(0, 0, 0); studio.add(mesh);
  }
  panel(4, 10, -5, 3, 4, '#ffffff', 3); panel(3, 8, 6, 0, 2, '#e9e9e9', 2);
  panel(10, 2, 0, 6, 2, '#ffffff', 4); panel(1, 10, 1, -2, -6, '#f3f3f3', 2);
  panel(12, 1, 0, -5, 3, '#afafaf', 1.3); panel(1, 7, -3, 0, -4, '#ededed', .9);
  function restoreEnvironment() {
    const generator = new THREE.PMREMGenerator(renderer);
    try {
      const next = generator.fromScene(studio, .03, .1, 100);
      envTarget?.dispose(); envTarget = next; scene.environment = next.texture;
    } finally { generator.dispose(); }
  }
  const mark = new THREE.Group(); scene.add(mark);
  const metal = new THREE.MeshPhysicalMaterial({ color: '#c5c5c5', metalness: 1, roughness: .19, clearcoat: 1, clearcoatRoughness: .18, envMapIntensity: 2.4 });
  const surfaceFlow = { value: 0 };
  metal.onBeforeCompile = shader => {
    shader.uniforms.uSurfaceFlow = surfaceFlow;
    shader.vertexShader = 'varying vec3 vLogoPosition;\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvLogoPosition = position;');
    shader.fragmentShader = 'uniform float uSurfaceFlow; varying vec3 vLogoPosition;\n' + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace('#include <normal_fragment_begin>', '#include <normal_fragment_begin>\nnormal = normalize(normal + vec3(sin(vLogoPosition.y * 1.25 + uSurfaceFlow) * 0.24, cos(vLogoPosition.x * 1.4 - uSurfaceFlow * 0.65) * 0.16, 0.0));');
  };
  const edge = new THREE.MeshPhysicalMaterial({ color: '#c0c0c0', metalness: 1, roughness: .25, envMapIntensity: 2.8, clearcoat: 1 });
  const disposeGraph = graph => graph.traverse(object => {
    object.geometry?.dispose();
    if (object.material) for (const material of Array.isArray(object.material) ? object.material : [object.material]) material.dispose();
  });
  const abort = new AbortController();
  const fetchTimeout = setTimeout(() => abort.abort(), 12000);
  try {
    restoreEnvironment();
    const response = await fetch(assetURL('logo-geometry.json'), { signal: abort.signal });
    if (!response.ok) throw new Error('logo-unavailable');
    const { contours } = await response.json();
    if (!Array.isArray(contours) || !contours.length) throw new Error('logo-unavailable');
    const shape = new THREE.Shape(contours[0].map(([x, y]) => new THREE.Vector2(x, -y)));
    for (const contour of contours.slice(1)) shape.holes.push(new THREE.Path(contour.map(([x, y]) => new THREE.Vector2(x, -y))));
    logoGeometry = new THREE.ExtrudeGeometry(shape, { depth: 32, bevelEnabled: true, bevelSegments: 4, steps: 1, bevelSize: 5, bevelThickness: 5, curveSegments: 8 });
    logoGeometry.center(); logoGeometry.scale(.0061, .0061, .0061); logoGeometry.computeVertexNormals();
    basePositions = logoGeometry.attributes.position.array.slice();
    logoGeometry.attributes.position.setUsage(THREE.DynamicDrawUsage);
    logoGeometry.attributes.normal.setUsage(THREE.DynamicDrawUsage);
    logoGeometry.computeBoundingSphere(); logoGeometry.boundingSphere.radius += 1;
    mark.add(new THREE.Mesh(logoGeometry, [metal, edge]));
    if (contextLost && !renderer.getContext().isContextLost()) { restoreEnvironment(); contextLost = false; }
  } catch {
    showFallback('scene-unavailable'); disposeGraph(studio); disposeGraph(scene);
    metal.dispose(); edge.dispose(); envTarget?.dispose();
    renderer.domElement.removeEventListener('webglcontextlost', captureEarlyLoss); renderer.dispose(); renderer.domElement.remove();
    return passiveAPI;
  } finally { clearTimeout(fetchTimeout); }
  mark.rotation.set(-.08, -.28, -.1);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x282828, 1.2));
  const key = new THREE.DirectionalLight(0xffffff, 4); key.position.set(-3, 6, 5); scene.add(key);
  const rim = new THREE.DirectionalLight(0xf1f1f1, 2); rim.position.set(5, -2, -3); scene.add(rim);
  const orbitalRig = new THREE.Group(); scene.add(orbitalRig);
  const ringPoints = Array.from({ length: 181 }, (_, i) => {
    const angle = i / 180 * Math.PI * 2;
    return new THREE.Vector3(Math.cos(angle) * 3.08, Math.sin(angle) * 3.08, 0);
  });
  const ringMaterial = new THREE.LineBasicMaterial({ color: 0x7e7e7e, transparent: true, opacity: .25 });
  const ring = new THREE.Line(new THREE.BufferGeometry().setFromPoints(ringPoints), ringMaterial);
  ring.rotation.x = 1.11; ring.rotation.z = -.32; orbitalRig.add(ring);
  const ring2 = new THREE.Line(ring.geometry.clone(), new THREE.LineBasicMaterial({ color: 0x949494, transparent: true, opacity: .09 }));
  ring2.rotation.set(.25, .7, .3); ring2.scale.setScalar(1.14); orbitalRig.add(ring2);
  const node = new THREE.Mesh(new THREE.SphereGeometry(.035, 8, 8), new THREE.MeshBasicMaterial({ color: 0xefefef })); orbitalRig.add(node);
  const positions = new Float32Array(75 * 3);
  for (let i = 0; i < 75; i++) {
    const angle = i * 2.399963, radius = 2.9 + (i % 9) * .19;
    positions[i * 3] = Math.cos(angle) * radius; positions[i * 3 + 1] = Math.sin(angle) * radius; positions[i * 3 + 2] = Math.sin(i * 7) * 2.2 - 1.8;
  }
  const speckGeometry = new THREE.BufferGeometry(); speckGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const specks = new THREE.Points(speckGeometry, new THREE.PointsMaterial({ color: 0xc7c7c7, size: .013, transparent: true, opacity: .37, depthWrite: false })); scene.add(specks);
  const makePalette = (face, edgeColor, rimColor, line, roughness, exposure, environment, scale, light) => ({
    face: new THREE.Color(face), edge: new THREE.Color(edgeColor), rim: new THREE.Color(rimColor), line: new THREE.Color(line), roughness, exposure, environment, scale, light,
  });
  const palettes = {
    chrome: makePalette('#c5c5c5', '#c0c0c0', trackAccents.chrome, trackAccents.chrome, .19, 1.25, 2.4, 1, 1.6),
    acid: makePalette('#dfdfdf', '#8f8f8f', trackAccents.acid, trackAccents.acid, .22, 1.15, 2.1, 1.04, 2.5),
    noir: makePalette('#393939', '#7c7c7c', trackAccents.noir, trackAccents.noir, .13, 1.25, 3.2, .97, 3),
    alloy: makePalette('#c2c2c2', '#959595', trackAccents.alloy, trackAccents.alloy, .24, 1.2, 2.5, 1, 2.1),
    afterimage: makePalette('#b7b7b7', '#777777', trackAccents.afterimage, trackAccents.afterimage, .2, 1.18, 2.6, 1.026, 2.6),
    aura: makePalette('#d7d7d7', '#b0b0b0', trackAccents.aura, trackAccents.aura, .17, 1.2, 2.7, 1.015, 1.9),
  };
  let targetX = 0, targetY = 0, pointerX = 0, pointerY = 0, lastTime = 0, elapsed = 0;
  let needsRender = true, wasWarped = false, width = 0, height = 0;
  let pixelRatio = Math.min(window.devicePixelRatio || 1, 1.5), performanceStarted = 0;
  let samples = 0, slowFrames = 0, totalCost = 0, totalInterval = 0, fastWindows = 0;
  const scaleTarget = new THREE.Vector3();
  const warpAudio = { bass: 0, mid: 0, high: 0, level: 0 };
  const modeWeights = { chrome: 1, acid: 0, noir: 0, alloy: 0, aura: 0 };
  const envelopes = { bass: [18, 5], mid: [12, 6], high: [22, 8], level: [10, 4] };
  function ratioCeiling() {
    // Pixel budget, not a device/UA guess. Large canvases stay within 2.6M pixels.
    return Math.min(window.devicePixelRatio || 1, 1.75, Math.sqrt(2600000 / Math.max(1, width * height)));
  }
  function applyResolution() {
    pixelRatio = Math.min(pixelRatio, ratioCeiling());
    renderer.setPixelRatio(pixelRatio); renderer.setSize(width, height, false);
    container.dataset.renderPixelRatio = pixelRatio.toFixed(2);
  }
  function measurePerformance(interval, cost, now) {
    if (interval <= 0 || interval > 120 || now - performanceStarted < 700) return;
    samples++; totalCost += cost; totalInterval += interval;
    if (interval > 24) slowFrames++;
    if (samples < 90) return;
    const meanCost = totalCost / samples, meanInterval = totalInterval / samples;
    const ceiling = ratioCeiling(), floor = Math.min(.85, ceiling);
    let next = pixelRatio;
    if (slowFrames / samples > .25 || meanCost > 11) { next = Math.max(floor, pixelRatio - .15); fastWindows = 0; }
    else if (meanInterval < 19.5 && meanCost < 7) { if (++fastWindows >= 2) { next = Math.min(ceiling, pixelRatio + .1); fastWindows = 0; } }
    else fastWindows = 0;
    container.dataset.renderFrameMs = meanInterval.toFixed(1);
    samples = slowFrames = totalCost = totalInterval = 0;
    if (Math.abs(next - pixelRatio) > .04) { pixelRatio = next; applyResolution(); }
  }
  function intersectsViewport() {
    const bounds = container.getBoundingClientRect();
    return bounds.bottom > 0 && bounds.top < innerHeight && bounds.right > 0 && bounds.left < innerWidth;
  }
  function schedule() {
    if (!disposed && !failed && initialized && !contextLost && visible && hasSize && !document.hidden && !frame) frame = requestAnimationFrame(animate);
  }
  function invalidate() { needsRender = true; schedule(); }
  function resize() {
    if (disposed || failed) return;
    const bounds = container.getBoundingClientRect();
    const nextWidth = Math.floor(bounds.width), nextHeight = Math.floor(bounds.height);
    hasSize = nextWidth > 0 && nextHeight > 0;
    if (!hasSize) { stop(); return; }
    if (width !== nextWidth || height !== nextHeight) {
      width = nextWidth; height = nextHeight; applyResolution(); camera.aspect = width / height;
      camera.position.z = Math.max(10.5, 9.2 / Math.max(camera.aspect, .25)); camera.updateProjectionMatrix();
    }
    visible = intersectsViewport(); invalidate();
  }
  function suspend() { stop(); samples = slowFrames = totalCost = totalInterval = 0; performanceStarted = performance.now(); }
  const onPointer = event => {
    if (!motion || event.pointerType === 'touch') return;
    const bounds = container.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return;
    targetX = Math.max(-.13, Math.min(.13, ((event.clientX - bounds.left) / bounds.width - .5) * .25));
    targetY = Math.max(-.08, Math.min(.08, ((event.clientY - bounds.top) / bounds.height - .5) * .16));
    schedule();
  };
  const resetPointer = () => { targetX = targetY = 0; schedule(); };
  const onVisibility = () => {
    if (document.hidden) suspend();
    else { performanceStarted = performance.now(); visible = intersectsViewport(); resize(); }
  };
  const onContextLost = event => { event.preventDefault(); contextLost = true; suspend(); showFallback('context-lost'); };
  const onContextRestored = () => {
    if (disposed || failed) return;
    try { shaderFailed = false; restoreEnvironment(); contextLost = false; performanceStarted = performance.now(); resize(); }
    catch { showFallback('context-restore-failed'); }
  };
  const onReduce = () => { motion = requestedMotion && !reduced.matches; if (!motion) resetPointer(); invalidate(); };
  const onPageShow = () => { if (!disposed && !failed) { performanceStarted = performance.now(); resize(); } };
  function animate(now) {
    frame = 0;
    if (disposed || failed || contextLost || !visible || !hasSize || document.hidden) { lastTime = 0; return; }
    if (!motion && !needsRender) return;
    // High-refresh displays do not need duplicate 3D work above 60 draws/sec.
    if (motion && lastTime && !needsRender && now - lastTime < 1000 / 60 - .5) { schedule(); return; }
    const interval = lastTime ? now - lastTime : 0;
    const dt = Math.min(interval / 1000, .05); lastTime = now; needsRender = false;
    const start = performance.now();
    if (motion) elapsed += dt * (.55 + intensity * .45);
    let audio = {};
    if (motion && audioEnabled) { try { audio = getAudioData() || {}; } catch { /* A failed analyser must not hide the mark. */ } }
    let warpActive = false;
    for (const band of BANDS) {
      const target = motion && audioEnabled ? unit(audio[band]) * intensity : 0;
      const rate = target > warpAudio[band] ? envelopes[band][0] : envelopes[band][1];
      warpAudio[band] = motion ? warpAudio[band] + (target - warpAudio[band]) * (1 - Math.exp(-dt * rate)) : 0;
      if (warpAudio[band] < .0001) warpAudio[band] = 0;
      warpActive ||= warpAudio[band] > .0001;
    }
    for (const name of MODES) {
      const target = name === (mode==='afterimage'?'acid':mode) ? 1 : 0;
      modeWeights[name] = motion ? modeWeights[name] + (target - modeWeights[name]) * (1 - Math.exp(-dt * 6)) : target;
    }
    if (warpActive || wasWarped) {
      deformLogoVertices(basePositions, logoGeometry.attributes.position.array, elapsed, warpAudio, modeWeights);
      logoGeometry.attributes.position.needsUpdate = true; logoGeometry.computeVertexNormals(); wasWarped = warpActive;
    }
    const cycle = elapsed % 19, progress = Math.min(1, Math.max(0, (cycle - 10.5) / 6.5));
    const turn = Math.floor(elapsed / 19) * Math.PI * 2 + progress * progress * (3 - 2 * progress) * Math.PI * 2;
    const pointerBlend = 1 - Math.exp(-dt * 6);
    pointerX = motion ? pointerX + (targetX - pointerX) * pointerBlend : 0;
    pointerY = motion ? pointerY + (targetY - pointerY) * pointerBlend : 0;
    mark.rotation.set(-.08 + pointerY + (motion ? Math.sin(elapsed * .32) * .035 * intensity : 0), -.28 + (motion ? turn + pointerX : 0), -.1 + (motion ? Math.sin(elapsed * .24) * .035 * intensity : 0));
    mark.position.y = motion ? Math.sin(elapsed * .6) * .075 * intensity : 0;
    const palette = palettes[mode], blend = motion && dt ? 1 - Math.exp(-dt * 4) : 1;
    metal.color.lerp(palette.face, blend); edge.color.lerp(palette.edge, blend);
    surfaceFlow.value = motion ? elapsed * .19 + pointerX * .85 + warpAudio.mid * .3 : 0;
    metal.roughness += (palette.roughness - metal.roughness) * blend;
    metal.envMapIntensity += (palette.environment - metal.envMapIntensity) * blend;
    renderer.toneMappingExposure += (palette.exposure - renderer.toneMappingExposure) * blend;
    rim.color.lerp(palette.rim, blend); ringMaterial.color.lerp(palette.line, blend); node.material.color.lerp(palette.rim, blend);
    mark.scale.lerp(scaleTarget.setScalar(palette.scale + warpAudio.bass * .032), blend);
    orbitalRig.rotation.z = motion ? elapsed * .018 : 0;
    node.position.set(Math.cos(elapsed * .27) * 3.08, Math.sin(elapsed * .27) * 1.33, Math.sin(elapsed * .27) * 2.77);
    ringMaterial.opacity = .2 + warpAudio.mid * .12;
    specks.rotation.z = motion ? -elapsed * .012 : 0;
    specks.material.opacity = .28 + warpAudio.high * .1;
    rim.intensity = palette.light + warpAudio.level * .45;
    try {
      if (renderer.getContext().isContextLost()) { contextLost = true; showFallback('context-lost'); stop(); return; }
      renderer.render(scene, camera);
      if (shaderFailed) throw new Error('shader-unavailable');
      renderer.domElement.style.visibility = 'visible';
      if (fallbackImage) { fallbackImage.hidden = true; fallbackImage.style.visibility = 'hidden'; }
      state('webgl');
    } catch { failed = true; showFallback('render-unavailable'); stop(); return; }
    if (motion) { measurePerformance(interval, performance.now() - start, now); schedule(); }
  }
  resizeObserver = typeof ResizeObserver === 'function' ? new ResizeObserver(resize) : null;
  resizeObserver?.observe(container);
  if (typeof IntersectionObserver === 'function') {
    intersectionObserver = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      if (visible) { performanceStarted = performance.now(); resize(); } else suspend();
    }, { threshold: 0 });
    intersectionObserver.observe(container);
  }
  const onScroll = () => {
    const next = intersectsViewport();
    if (next === visible) return;
    visible = next; if (visible) { performanceStarted = performance.now(); invalidate(); } else suspend();
  };
  if (!intersectionObserver) window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', resize, { passive: true }); window.visualViewport?.addEventListener('resize', resize, { passive: true });
  window.addEventListener('pageshow', onPageShow); window.addEventListener('pagehide', suspend);
  document.addEventListener('visibilitychange', onVisibility);
  container.addEventListener('pointermove', onPointer, { passive: true }); container.addEventListener('pointerleave', resetPointer);
  renderer.domElement.addEventListener('webglcontextlost', onContextLost); renderer.domElement.addEventListener('webglcontextrestored', onContextRestored);
  reduced.addEventListener?.('change', onReduce);
  initialized = true; renderer.domElement.removeEventListener('webglcontextlost', captureEarlyLoss); performanceStarted = performance.now(); resize();
  return {
    setMode(value) { mode = Object.hasOwn(palettes, value) ? value : 'chrome'; invalidate(); },
    setMotion(value) { requestedMotion = !!value; motion = requestedMotion && !reduced.matches; invalidate(); },
    setIntensity(value) { intensity = value === 'subtle' ? .42 : value === 'full' || value === 'normal' ? 1 : unit(Number(value)); invalidate(); },
    setAudioEnabled(value) { audioEnabled = !!value; invalidate(); },
    dispose() {
      if (disposed) return;
      disposed = true; stop(); abort.abort(); resizeObserver?.disconnect(); intersectionObserver?.disconnect();
      window.removeEventListener('resize', resize); window.removeEventListener('scroll', onScroll);
      window.visualViewport?.removeEventListener('resize', resize); window.removeEventListener('pageshow', onPageShow); window.removeEventListener('pagehide', suspend);
      document.removeEventListener('visibilitychange', onVisibility); reduced.removeEventListener?.('change', onReduce);
      container.removeEventListener('pointermove', onPointer); container.removeEventListener('pointerleave', resetPointer);
      renderer.domElement.removeEventListener('webglcontextlost', onContextLost); renderer.domElement.removeEventListener('webglcontextrestored', onContextRestored);
      disposeGraph(scene); disposeGraph(studio); envTarget?.dispose(); renderer.dispose(); renderer.domElement.remove();
      if (ownsFallback) fallbackImage?.remove(); else if (fallbackImage) { fallbackImage.hidden = false; fallbackImage.style.visibility = 'visible'; }
      state('disposed');
    },
  };
}
