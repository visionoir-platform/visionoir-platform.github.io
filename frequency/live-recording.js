const videoFormats = ['video/webm;codecs=vp8,opus', 'video/mp4', 'video/webm'];
const audioFormats = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm'];

export function createLiveRecording({ prepare, captureVideo, changed, saved, failed }) {
  let take;

  function clear(record) {
    if (take !== record) return false;
    take = undefined;
    record.picture?.stop();
    changed();
    return true;
  }

  function stop() {
    if (!take) return;
    if (take.phase === 'starting') {
      clear(take);
    } else if (take.phase === 'recording') {
      take.phase = 'finishing';
      changed();
      if (take.recorder.state !== 'inactive') take.recorder.stop();
    }
  }

  async function toggle(video) {
    if (take) {
      if (take.phase === 'recording') stop();
      return;
    }
    if (!globalThis.MediaRecorder) throw Error('MediaRecorder');
    const record = take = { phase: 'starting', chunks: [], hadError: false };
    changed();
    try {
      const audioStream = await prepare();
      if (take !== record) return;
      if (!audioStream?.getAudioTracks().length) throw Error('MediaStream');
      let stream = audioStream;
      if (video) {
        record.picture = captureVideo?.();
        if (!record.picture) throw Error('Video');
        stream = new MediaStream([...audioStream.getAudioTracks(), ...record.picture.stream.getVideoTracks()]);
      }
      const mime = (video ? videoFormats : audioFormats).find(type => MediaRecorder.isTypeSupported(type));
      const recorder = record.recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      recorder.ondataavailable = ({data}) => {
        if (take === record && data.size) record.chunks.push(data);
      };
      recorder.onerror = ({error}) => {
        if (take !== record) return;
        record.hadError = true;
        record.phase = 'finishing';
        changed();
        failed(error);
      };
      recorder.onstop = () => {
        if (!clear(record)) return;
        if (record.chunks.length) {
          const type = recorder.mimeType || record.chunks[0].type || mime;
          const extension = type?.includes('mp4') ? (video ? 'mp4' : 'm4a') : 'webm';
          saved(new Blob(record.chunks, {type}), 'Frequency-live.' + extension, record.hadError);
        } else if (!record.hadError) {
          failed(Error('MediaRecorderEmpty'));
        }
      };
      recorder.start(1000);
      record.phase = 'recording';
      changed();
    } catch (error) {
      if (clear(record)) throw error;
    }
  }

  function cancel() {
    const record = take;
    if (!record) return;
    const recorder = record.recorder;
    if (recorder) {
      recorder.ondataavailable = recorder.onstop = recorder.onerror = null;
      if (recorder.state !== 'inactive') recorder.stop();
    }
    clear(record);
  }

  return { get phase() { return take?.phase ?? 'idle'; }, toggle, stop, cancel };
}
