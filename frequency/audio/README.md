# FREQUENCY audio

One project describes both a live performance and a reproducible offline bounce. `model.js` exposes the four main compositions, the empty session and the validated version 1 session format. `library.js` implements 124 instrument patches, 28 effect chains and 12 additional editable sessions. The built-in sounds use original synthesis, including the struck-glass factory sample. No microphone or network request is required to play them.

## Editing

Create a project with `createProject('forge')`. Other primary IDs are `glass`, `relay` and `rift`. Omitting the ID gives an empty sequencer. The public browser API is `index.js`.

- Each track selects a registry instrument, normalized parameters, stereo mixer settings, two send levels, a destination bus and an ordered insert rack. The optional sidechainBus selects a one-sample-delayed detector for rumble/sub ducking and sidechain inserts. Split a voice between dry and return paths with `sendDelay` and `sendReverb`.
- Each scene contains one pattern per track. An empty step is `null`. A note supplies MIDI pitch and velocity. Gate and signed offset use sixteenth-note units. Optional locks apply to the note. Relative chord intervals, swing, probability, repeat conditions, ratchets, flam, glide and accent are rendered by the native scheduler. The seed persists in the project.
- Arrangement entries set a scene and bar count. Per-track `trackScenes` entries select a different source scene, inherit with `null`, or silence with `-1`. An optional marker becomes an SMF marker. Loop bars use a zero-based, end-exclusive range.
- To add a factory instrument, add its parameter schema and defaults in `model.js`, implement its signal generation in `voice.js`, then supply a targeted impulse/note test. To add a patch, edit the family or chain list in `library.js` and check that it changes the printed signal.
- Imported samples are stored inside a session as base64 PCM16 mono. The importer bounds file size and duration. Preserve a separate copy of the source recording when stereo or archival precision is required.

## Playback and recording

Construct `createEngine({onState,onTick,onError})`. Start from an actual user gesture with `await engine.play(project,{scene:0})` or `{arrangement:true}`. Use `engine.update(project)` after a valid edit. For high-rate MIDI gestures, `engine.control(id,value)` updates master, track or synth parameters without cloning the full session. `engine.queueScene(index)` switches at the next bar using two decks, an equal-power fade and reusable effect buffers. Set `project.crossfadeBeats` between zero and four. The default is one beat. Use `engine.trigger(track,pitch,velocity,gateSeconds)` and `engine.release(track,pitch)` for live notes.

The AudioWorklet schedules by sample position. A buffered fallback exists where the browser exposes ScriptProcessor. The analyser and stereo MediaStream are available on `engine.analyser` and `engine.stream`. Meters report channel peaks/RMS, master stereo correlation and an overload flag measured before the output limiter. A physical output device may impose its own latency and interruption policy. Dispose the engine to release the audio context and stream.

## Files

| Output | Encoding and scope |
| --- | --- |
| WAV | 16/24-bit integer with triangular dither, or 32-bit IEEE float. Mono or stereo at 44.1, 48, 88.2, 96, 176.4 and 192 kHz. |
| FLAC | Lossless 16/24-bit PCM at the same six rates, with CRC-protected verbatim subframes. File size is close to PCM. |
| AIFF | Big-endian 16/24-bit PCM at the same six rates. |
| MP3 | LAME at 128, 192, 256 or 320 kbit/s, mono or stereo, 44.1 or 48 kHz. The encoder is loaded on demand. |
| MIDI | Standard MIDI File type 1 with per-track notes, CC7/10, song tempo and scene markers. Timbres and audio effects travel in the native session. |
| Native | JSON `.vfreq` preserves project data and embedded samples. ZIP packages can include a session, MIDI and individual WAV stems. |

Exports allow a scene, bar range, track or bus, tail and optional two-pass peak normalization. A separate worker renders at the target sample rate. Long prints use origin-private file storage when supported. Available storage, RIFF size and browser memory are checked before committing to large buffers. Integer renders are dithered, whereas float preserves the computed level. Stems processed through separate nonlinear chains need not sum to a mastered stereo print. Combine unmastered stems before applying a common master chain.

From the repository root with Node.js, FFmpeg, ffprobe and unzip installed:

```sh
node frequency/audio/print.mjs forge Furnace-Ledger.wav --sampleRate 48000 --bits 24
node frequency/audio/print.mjs glass glass-scene.flac --scene 6 --bars 4 --bits 24
node frequency/audio/print.mjs rift arrangement.mid
node frequency/audio/qa/dsp.test.mjs
node frequency/audio/qa/live.test.mjs
node frequency/audio/qa/master-review.mjs /path/to/private/masters
```

The suite checks all voices, presets, effect responses, bypass, MIDI events, sample editing and decoded PCM. The master review renders each entire primary arrangement and measures EBU R128 integrated loudness and true peak with FFmpeg. Fixtures and long renders belong outside the static site. The audio writer and CLI can run without any DAW. Human listening, physical devices and long-running browser endurance require separate evidence.

The workstation sources use the parent project's MIT licence. The MP3 library and imported recordings retain their respective terms. [MP3 library notice](./vendor/NOTICE.md) · [Workstation licence](../LICENSE).
