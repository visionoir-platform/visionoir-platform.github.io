// Six columns by four rows. Each cell on the atlas is a separate rendering of the public GLB.
export function makeTurntable(host, base) {
  const layer = document.createElement('div');
  layer.className = 'creator-turntable';
  layer.setAttribute('aria-hidden','true');
  layer.hidden = true;
  host.append(layer);
  let requested = '', loaded = '', wanted = false;
  const failed = new Set();

  function hide() {
    wanted = false;
    layer.hidden = true;
  }
  function show(angle, variant) {
    const frame = ((Math.round(angle * 24 / (Math.PI * 2)) % 24) + 24) % 24;
    if (!frame) { hide(); return; }
    wanted = true;
    const url = base + 'creator/turntable' + variant + '.webp';
    layer.style.backgroundPosition = (frame % 6) * 20 + '% ' + Math.floor(frame / 6) * (100 / 3) + '%';
    if (loaded === url) { requested = url; layer.hidden = false; return; }
    if (requested === url || failed.has(url)) return;
    requested = url;
    const atlas = new Image();
    atlas.onload = () => {
      if (requested !== url || !layer.isConnected) return;
      loaded = url;
      layer.style.backgroundImage = 'url("' + url + '")';
      layer.hidden = !wanted;
    };
    atlas.onerror = () => { failed.add(url); if (requested === url) layer.hidden = true; };
    atlas.src = url;
  }
  return {show, hide, dispose: () => layer.remove()};
}
