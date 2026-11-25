// The sculpture keeps its authored pose. Only the angle around its centre changes.
export const turn = Math.PI * 2;
export const turnDuration = 18_000;
export function createPortraitSpin(now = () => performance.now()) {
  let angle = 0, started = null;
  const wrap = value => ((value % turn) + turn) % turn;
  const value = () => wrap(angle + (started === null ? 0 : (now()-started)*turn/turnDuration));
  return {
    value,
    get running() { return started !== null; },
    setRunning(run) {
      if (run === (started !== null)) return;
      angle = value();
      started = run ? now() : null;
    },
    set(value) { angle = wrap(value); if (started !== null) started = now(); },
  };
}
