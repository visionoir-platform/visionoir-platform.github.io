// Relative pose only. Sensor readings stay in this document and expire when it is hidden.
export const deviceTilt = { x: 0, y: 0, yaw: 0 };
const radians = Math.PI / 180;
const limit = value => Math.max(-1, Math.min(1, value));
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

export function createPoseTracker() {
  let origin, lastHeading = null, accumulated = 0, headingAxis;
  function reset() { origin = null; lastHeading = null; accumulated = 0; }
  function read({ alpha, beta, gamma }, screenAngle) {
    if (!Number.isFinite(beta) || !Number.isFinite(gamma)) return null;
    const a = (Number.isFinite(alpha) ? alpha : 0) * radians, b = beta * radians, g = gamma * radians;
    const ca = Math.cos(a), sa = Math.sin(a), cb = Math.cos(b), sb = Math.sin(b), cg = Math.cos(g), sg = Math.sin(g);
    // Columns of the device-to-world Z-X-Y rotation, adjusted for viewport orientation.
    const right = [ca*cg - sa*sb*sg, sa*cg + ca*sb*sg, -cb*sg];
    const up = [-sa*cb, ca*cb, sb];
    const front = [ca*sg + sa*sb*cg, sa*sg - ca*sb*cg, cb*cg];
    const c = Math.cos(screenAngle * radians), s = Math.sin(screenAngle * radians);
    const screenUp = up.map((v,i) => v*c + right[i]*s);
    if (!origin || origin.angle !== screenAngle || origin.hasAlpha !== Number.isFinite(alpha)) {
      reset();
      origin = { angle: screenAngle, hasAlpha: Number.isFinite(alpha), right: right.map((v,i) => v*c - up[i]*s), up: screenUp };
      headingAxis = Math.abs(front[2]) < Math.abs(screenUp[2]) ? 'front' : 'up';
      // If both point upwards at a steep angle, the screen's right edge is a better compass axis.
      if (Math.abs(origin.right[2]) < Math.min(Math.abs(front[2]), Math.abs(screenUp[2]))) headingAxis = 'right';
    }
    if (Number.isFinite(alpha)) {
      const vector = headingAxis === 'front' ? front : headingAxis === 'up' ? screenUp : right.map((v,i) => v*c - up[i]*s);
      // Azimuth becomes ill-defined near vertical. Re-anchor after crossing that pole.
      if (Math.hypot(vector[0],vector[1]) < 0.18) lastHeading = null;
      else {
        const heading = Math.atan2(vector[1],vector[0]);
        if (lastHeading !== null) {
          const delta = heading - lastHeading;
          accumulated += Math.atan2(Math.sin(delta),Math.cos(delta));
        }
        lastHeading = heading;
      }
    }
    return { x: limit(dot(front,origin.right)*2), y: limit(-dot(front,origin.up)*2), yaw: accumulated };
  }
  return { read, reset };
}

let activeController;
export function recenterDeviceTilt() { activeController?.recenter(); }

export function mountDeviceTilt(onReading = () => {}) {
  const api = window.DeviceOrientationEvent;
  const validOrigin = window.isSecureContext && !!api;
  const preference = matchMedia('(prefers-reduced-motion: reduce)');
  const tracker = createPoseTracker();
  let enabled = false, listening = false, away = false, closed = false;
  let frame = 0, lastTime = 0;
  let target = { x: 0, y: 0, yaw: 0 };
  const rootStyle = document.documentElement.style;
  const allowed = () => validOrigin && enabled && !preference.matches && !away && !document.hidden && !closed;
  function publish() {
    rootStyle.setProperty('--device-tilt-x', deviceTilt.x.toFixed(4));
    rootStyle.setProperty('--device-tilt-y', deviceTilt.y.toFixed(4));
    window.dispatchEvent(new Event('visionoir:tilt'));
  }
  function advance(now) {
    frame = 0;
    if (!allowed()) return;
    const blend = 1 - Math.exp(-Math.min(80, lastTime ? now-lastTime : 16)/65);
    lastTime = now;
    let moving = false;
    for (const key of ['x','y','yaw']) {
      const delta = target[key]-deviceTilt[key];
      if (Math.abs(delta) < .0007) deviceTilt[key] = target[key];
      else { deviceTilt[key] += delta*blend; moving = true; }
    }
    publish();
    if (moving) frame = requestAnimationFrame(advance);
    else lastTime = 0;
  }
  function recenter() {
    tracker.reset();
    cancelAnimationFrame(frame);
    frame = lastTime = 0;
    target = { x: 0, y: 0, yaw: 0 };
    if (deviceTilt.x || deviceTilt.y || deviceTilt.yaw) {
      Object.assign(deviceTilt, target);
      publish();
    }
  }
  function accept(event) {
    if (!allowed()) return;
    const reading = tracker.read(event, window.screen?.orientation?.angle ?? window.orientation ?? 0);
    if (!reading) return;
    onReading();
    target = reading;
    if (!frame && ['x','y','yaw'].some(k => Math.abs(target[k]-deviceTilt[k]) > .0001)) frame = requestAnimationFrame(advance);
  }
  function refresh() {
    const next = allowed();
    if (next !== listening) {
      listening = next;
      if (next) window.addEventListener('deviceorientation', accept, { passive: true });
      else {
        window.removeEventListener('deviceorientation', accept);
        recenter();
      }
    }
  }
  const hide = () => { away = true; refresh(); };
  const show = () => { away = false; refresh(); };
  const display = window.screen?.orientation;
  document.addEventListener('visibilitychange', refresh);
  window.addEventListener('pagehide', hide);
  window.addEventListener('pageshow', show);
  window.addEventListener('orientationchange', recenter);
  display?.addEventListener?.('change', recenter);
  preference.addEventListener?.('change', refresh);
  const controller = {
    setEnabled(value) { if (enabled !== !!value) { enabled = !!value; refresh(); } },
    recenter,
    dispose() {
      closed = true;
      refresh();
      document.removeEventListener('visibilitychange', refresh);
      window.removeEventListener('pagehide', hide);
      window.removeEventListener('pageshow', show);
      window.removeEventListener('orientationchange', recenter);
      display?.removeEventListener?.('change', recenter);
      preference.removeEventListener?.('change', refresh);
      if (activeController === controller) activeController = null;
    }
  };
  activeController = controller;
  return controller;
}
