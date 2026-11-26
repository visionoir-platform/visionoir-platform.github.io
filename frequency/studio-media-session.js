// Register only after the musician starts transport. Browsers may support a subset
// of the native controls; the workstation remains playable from its own transport.
export function studioMediaSession(session, Metadata, origin, handlers) {
  let active = false;
  let currentTitle;
  const actions = Object.keys(handlers);
  const artwork = [
    {src:new URL('/assets/visionoir-original-cover-v1-192.png', origin).href, sizes:'192x192', type:'image/png'},
    {src:new URL('/assets/visionoir-original-cover-v1-512.png', origin).href, sizes:'512x512', type:'image/png'},
  ];
  function bind(enabled) {
    for (const name of actions) {
      try { session.setActionHandler(name, enabled ? handlers[name] : null); }
      catch { /* This action is optional on the current device. */ }
    }
  }
  function clear() {
    if (!active) return;
    bind(false);
    active = false;
    currentTitle = undefined;
    session.metadata = null;
    session.playbackState = 'none';
  }
  return {
    sync(state, title) {
      if (!session) return;
      if (state === 'none') return clear();
      if (!active) {
        if (state !== 'playing') return;
        bind(true);
        active = true;
      }
      if (Metadata && currentTitle !== title) {
        session.metadata = new Metadata({title, album:'VISIONOIR: FREQUENCY', artwork});
        currentTitle = title;
      }
      session.playbackState = state;
    },
    clear,
  };
}
