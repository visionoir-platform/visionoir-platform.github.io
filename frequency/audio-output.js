// Device labels stay in this tab. Only the output picker can change the sink.
export function createOutputRoute({devices, getContext, prepare, apply, changed}) {
  let context, selected, listed, authorized = false, choosing = false, revision = 0;

  function status() {
    if (!context || context.state === 'closed') return {key:'audioOff'};
    const sink = context.sinkId ?? selected?.deviceId ?? '';
    if (typeof sink === 'object' && sink.type === 'none') return {key:'outputSilent'};
    if (!sink || sink === 'default') return {key:'outputSystem'};
    if (listed === null) return {key:'outputUnverified'};
    if (listed && !listed.has(sink)) return {key:'unsupported'};
    const label = listed?.get(sink) || (selected?.deviceId === sink && selected.label);
    return label ? {label} : {key:'outputExternal'};
  }

  async function refresh() {
    const request = ++revision;
    if (!authorized || !selected) return;
    const sink = context?.sinkId ?? selected.deviceId;
    if (typeof sink !== 'string' || !sink || sink === 'default') return;
    listed = null;
    changed();
    if (!devices?.enumerateDevices) return;
    try {
      const entries = await devices.enumerateDevices();
      if (request !== revision) return;
      const outputs = entries.filter(d => d.kind === 'audiooutput');
      listed = outputs.some(d => !d.deviceId) ? null : new Map(outputs.map(d => [d.deviceId, d.label]));
    } catch {
      if (request !== revision) return;
      listed = null;
    }
    changed();
  }

  function sinkChanged() {
    changed();
    if (authorized) void refresh();
  }
  function observe() {
    const next = getContext();
    if (context === next) return;
    context?.removeEventListener('sinkchange', sinkChanged);
    revision++;
    selected = listed = undefined;
    context = next;
    context?.addEventListener('sinkchange', sinkChanged);
    changed();
  }
  async function choose() {
    if (choosing) return false;
    choosing = true;
    try {
      // Invoke the browser picker in the original activation, before any await.
      const [choice] = await Promise.all([devices.selectAudioOutput(), prepare()]);
      observe();
      await apply(choice.deviceId);
      revision++;
      selected = choice;
      listed = undefined;
      if (!authorized) {
        authorized = true;
        devices.addEventListener?.('devicechange', refresh);
      }
      changed();
      return true;
    } finally {choosing = false;}
  }
  function dispose() {
    revision++;
    context?.removeEventListener('sinkchange', sinkChanged);
    devices?.removeEventListener?.('devicechange', refresh);
    selected = listed = context = undefined;
    authorized = false;
  }
  return {observe, choose, status, refresh, dispose};
}
