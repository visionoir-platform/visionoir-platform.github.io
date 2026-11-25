// The original pose is fixed. All angles describe the viewer's orbit around it.
const turn = 2 * Math.PI;
const wrap = angle => (angle % turn + turn) % turn;
export const orbitDegrees = angle => Math.round(wrap(angle) * 360 / turn) % 360;

export function bindPortraitOrbit(host, controls, onChange, recenter, getAngle, toggleSpin) {
  let gesture = null;
  const abort = new AbortController(), options = {signal: abort.signal};
  host.tabIndex = 0;
  host.setAttribute('role', 'slider');
  host.setAttribute('aria-orientation', 'horizontal');
  host.setAttribute('aria-valuemin', '0');
  host.setAttribute('aria-valuemax', '359');
  host.setAttribute('aria-describedby', 'creator-orbit-hint');
  controls.hidden = false;

  function setAngle(next) {
    onChange(wrap(next));
    updateReadout();
  }
  function updateReadout() {
    const degrees = orbitDegrees(getAngle());
    if (host.dataset.angle === String(degrees)) return;
    host.dataset.angle = String(degrees);
    host.setAttribute('aria-valuenow', String(degrees));
    host.setAttribute('aria-valuetext', degrees + '°');
  }
  function step(direction) { setAngle(getAngle() + direction * turn / 12); }
  function reset() { recenter(); setAngle(0); }
  function release() {
    const pointer = gesture?.id;
    gesture = null;
    delete host.dataset.dragging;
    if (pointer !== undefined && host.hasPointerCapture(pointer)) host.releasePointerCapture(pointer);
  }
  host.addEventListener('pointerdown', e => {
    if (!e.isPrimary) { release(); return; }
    if (e.button !== 0) return;
    gesture = {id: e.pointerId, x: e.clientX, y: e.clientY, width: Math.max(1,host.clientWidth)};
  }, options);
  host.addEventListener('pointermove', e => {
    if (!gesture || gesture.id !== e.pointerId) return;
    const dx = e.clientX - gesture.x, dy = e.clientY - gesture.y;
    if (!host.dataset.dragging) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 5) return;
      if (Math.abs(dy) > Math.abs(dx)) { release(); return; }
      gesture.angle = getAngle();
      host.dataset.dragging = '1';
      host.setPointerCapture(e.pointerId);
    }
    setAngle(gesture.angle + dx / gesture.width * turn);
  }, options);
  for (const event of ['pointerup','pointercancel','lostpointercapture']) {
    host.addEventListener(event, e => { if (gesture?.id === e.pointerId) release(); }, options);
  }
  host.addEventListener('pointerleave', () => { if (!host.dataset.dragging) release(); }, options);
  host.addEventListener('keydown', e => {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') step(-1);
    else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') step(1);
    else if (e.key === 'Home') reset();
    else if (e.key === 'End') setAngle(359 * turn / 360);
    else return;
    e.preventDefault();
  }, options);
  controls.addEventListener('click', e => {
    const action = e.target.closest('[data-orbit]')?.dataset.orbit;
    if (action === 'left') step(-1);
    if (action === 'right') step(1);
    if (action === 'reset') reset();
    if (action === 'spin') toggleSpin();
  }, options);
  host.addEventListener('focus',updateReadout,options);
  updateReadout();
  return {updateReadout, dispose() {
    release();
    abort.abort();
    controls.hidden = true;
    host.removeAttribute('tabindex');
    host.setAttribute('role','img');
    for (const key of ['aria-orientation','aria-valuemin','aria-valuemax','aria-valuenow','aria-valuetext','aria-describedby','data-angle']) host.removeAttribute(key);
  }};
}
