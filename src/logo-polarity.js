// Keep one moving development line on the mark. No full-screen flash or post-processing pass.
export const logoPolarityFragment = `
uniform float uLogoNegative;
vec3 developNegative(vec3 positive, vec3 p, float rim) {
  float slice = clamp(.5 + .16*p.x - .12*p.y, .085, .915);
  float developed = smoothstep(slice - .08, slice + .08, uLogoNegative);
  vec3 negative = max(1. - clamp(positive, 0., 1.), vec3(.48*rim));
  return mix(positive, negative, developed);
}`;

export function logoPolarity(root) {
  const state = () => Number(root.classList.contains('logo-negative'));
  const uniform = { value: state() };
  let target = uniform.value;
  return {
    uniform,
    refresh() { target = state(); },
    update(seconds, animate) {
      if (!animate) uniform.value = target;
      else {
        const travel = seconds / .52;
        uniform.value += Math.sign(target - uniform.value) * Math.min(Math.abs(target - uniform.value), travel);
      }
    }
  };
}

export function setLogoNegative(enabled) {
  const classes = document.documentElement.classList;
  if (classes.contains('logo-negative') === enabled) return;
  classes.toggle('logo-negative', enabled);
  window.dispatchEvent(new Event('visionoir:logo-negative'));
}
