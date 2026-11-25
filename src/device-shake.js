// A material change is an intentional gesture. All measurements are ephemeral.
const hasXYZ = a => a && Number.isFinite(a.x) && Number.isFinite(a.y) && Number.isFinite(a.z);
const deltaGravity = 2.2; // m/s² away from 1 g, for gravity-inclusive readings

export function createShakeDetector() {
  let source, lastTime, gravity, quietSince, locked, axis, sign, pulseTime, firstTime, reversals, translated;
  function clearPulse() { axis = null; reversals = 0; translated = false; }
  function reset() {
    clearPulse();
    source = null; lastTime = null; gravity = null; quietSince = null; locked = false;
  }
  reset();
  function read(event, now) {
    if (!Number.isFinite(now)) return null;
    const kind = hasXYZ(event.acceleration) ? 'linear' : hasXYZ(event.accelerationIncludingGravity) ? 'gravity' : null;
    if (!kind) return null;
    if (kind !== source) {
      // Switching sensor representation within one burst must not release the latch.
      clearPulse(); lastTime = null; gravity = null; quietSince = null; source = kind;
    }
    const dt = lastTime === null ? 0 : now - lastTime;
    if (lastTime !== null && dt <= 0) return false;
    lastTime = now;
    if (dt > 320) {
      // A missing interval cannot supply one of the required changes of direction.
      clearPulse(); quietSince = null; gravity = null;
    }
    const input = kind === 'linear' ? event.acceleration : event.accelerationIncludingGravity;
    let {x,y,z} = input;
    let isTranslation = true;
    if (kind === 'gravity') {
      if (!gravity) { gravity = {x,y,z}; return false; }
      isTranslation = Math.abs(Math.hypot(x,y,z) - 9.81) >= deltaGravity;
      x -= gravity.x; y -= gravity.y; z -= gravity.z;
      // A low-pass estimate follows ordinary changes in the phone's resting orientation.
      const blend = 1 - Math.exp(-dt/280);
      gravity.x += x*blend; gravity.y += y*blend; gravity.z += z*blend;
    }
    const magnitude = Math.hypot(x,y,z);
    if (locked) {
      if (magnitude < 3) {
        if (quietSince === null) quietSince = now;
        if (now - quietSince >= 440) { locked = false; quietSince = null; }
      } else quietSince = null;
      return false;
    }
    if (axis && (now - firstTime > 700 || now - pulseTime > 300)) clearPulse();
    const impulse = kind === 'linear' ? 9 : 9.8; // m/s², excluding gravity
    if (magnitude < impulse) return false;
    function startPulse() {
      axis = {x:x/magnitude, y:y/magnitude, z:z/magnitude};
      sign = 1; firstTime = pulseTime = now; reversals = 0; translated = isTranslation;
    }
    if (!axis) { startPulse(); return false; }
    const projection = x*axis.x + y*axis.y + z*axis.z;
    if (Math.abs(projection) < impulse || Math.abs(projection) < .66*magnitude) return false;
    translated ||= isTranslation;
    const direction = Math.sign(projection);
    if (direction === sign) return false;
    // Rapid, contradictory sensor samples may not accumulate into a gesture.
    if (now - pulseTime < 50) { startPulse(); return false; }
    sign = direction; pulseTime = now; reversals++;
    if (reversals < 2 || !translated) return false;
    clearPulse(); locked = true; quietSince = null;
    return true;
  }
  return {read, reset};
}

export function mountDeviceShake({onToggle = () => {}, onStatus = () => {}} = {}) {
  const api = window.DeviceMotionEvent;
  const supported = window.isSecureContext && (!!api || 'ondevicemotion' in window);
  const needsGesture = supported && typeof api?.requestPermission === 'function';
  const detector = createShakeDetector();
  let enabled = true, away = false, closed = false, listening = false;
  const initial = !supported ? 'unavailable' : needsGesture ? 'ask' : 'automatic';
  let status = initial, epoch = 0, readingTimeout;
  const allowed = () => supported && enabled && !away && !closed && !document.hidden;
  function report(value) { if (status !== value) { status = value; onStatus(); } }
  function receive(event) {
    if (!allowed()) return;
    const shook = detector.read(event,event.timeStamp);
    if (shook === null) return;
    clearTimeout(readingTimeout);
    report('receiving');
    if (shook && allowed()) onToggle();
  }
  function refresh() {
    const active = !!allowed();
    if (active === listening) return;
    listening = active;
    if (active) window.addEventListener('devicemotion', receive, {passive:true});
    else {
      window.removeEventListener('devicemotion', receive);
      clearTimeout(readingTimeout); epoch++; detector.reset();
      if (status === 'waiting' || status === 'receiving') status = initial;
    }
  }
  const hide = () => { away = true; refresh(); onStatus(); };
  const show = () => { away = false; refresh(); onStatus(); };
  const visibility = () => { refresh(); onStatus(); };
  window.addEventListener('pagehide',hide);
  window.addEventListener('pageshow',show);
  document.addEventListener('visibilitychange',visibility);
  refresh();
  return {
    get status() { return status; },
    get showControl() { return !!allowed() && needsGesture && status !== 'receiving'; },
    setEnabled(next) { if (enabled !== !!next) { enabled = !!next; refresh(); onStatus(); } },
    async request() {
      if (!allowed() || !needsGesture || status === 'receiving' || status === 'waiting') return;
      const id = ++epoch;
      report('waiting');
      try {
        // Safari requires a genuine activation of the dedicated permission control.
        const result = await api.requestPermission();
        if (id !== epoch || !allowed() || status === 'receiving') return;
        if (result !== 'granted') { report('unavailable'); return; }
        readingTimeout = setTimeout(() => { if (status === 'waiting') report('unavailable'); },2400);
      } catch { if (id === epoch && allowed() && status !== 'receiving') report('unavailable'); }
    },
    dispose() {
      closed = true; refresh();
      window.removeEventListener('pagehide',hide);
      window.removeEventListener('pageshow',show);
      document.removeEventListener('visibilitychange',visibility);
    },
  };
}
