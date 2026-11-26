// WebKit uses the same native permission for relative orientation and motion.
// Prefer acceleration: an orientation event alone cannot establish that shaking works.
export function createDeviceMotionAccess(win, changed = () => {}) {
  const motion = win.DeviceMotionEvent;
  const api = typeof motion?.requestPermission === 'function' ? motion : win.DeviceOrientationEvent;
  const gated = win.isSecureContext && typeof api?.requestPermission === 'function';
  let state = gated ? 'ask' : 'automatic';
  function set(value) {
    if (state === value) return;
    state = value;
    changed();
  }
  return {
    get state() { return state; },
    observed(kind) {
      if (gated && (kind === 'motion' || api !== motion)) set('receiving');
    },
    async request(retry = false) {
      if (state !== 'ask' && !(retry && state === 'unavailable')) return;
      set('waiting');
      try {
        // Invoke while the user's tap is active, before awaiting navigation or graphics.
        const result = await api.requestPermission();
        if (state === 'waiting') set(result === 'granted' ? 'granted' : 'unavailable');
      } catch {
        if (state === 'waiting') set('unavailable');
      }
    }
  };
}
