# FREQUENCY audio

One project describes both a live performance and a reproducible offline bounce. `model.js` exposes the four main compositions, the empty session and the validated version 1 session format. `library.js` implements 124 instrument patches, 28 effect chains and 12 additional editable sessions. The built-in sounds use original synthesis, including the struck-glass factory sample. No microphone or network request is required to play them.

## Editing

Create a project with `createProject('forge')`. Other primary IDs are `glass`, `relay` and `rift`. Omitting the ID gives an empty sequencer. The public browser API is `index.js`.

- Each track selects a registry instrument, normalized parameters, stereo mixer settings, two send levels, a destination bus and an ordered insert rack. The optional sidechainBus selects a one-sample-delayed detector for rumble/sub ducking and sidechain inserts. Split a voice between dry and return paths with `sendDelay` and `sendReverb`.
- Acid 303 has separate filter decay and amplifier release controls. Filter decay ranges from 2.625 to 672 ms, with a 42 ms midpoint that reproduces existing sessions and presets. Both controls accept per-note locks.
- Each scene contains one pattern per track. An empty step is `null`. A note supplies MIDI pitch and velocity. Gate and signed offset use sixteenth-note units. Optional locks apply to the note. Relative chord intervals, swing, probability, repeat conditions, ratchets, flam, glide and accent are rendered by the native scheduler. The seed persists in the project.
- Arrangement entries set a scene and bar count. Per-track `trackScenes` entries select a different source scene, inherit with `null`, or silence with `-1`. An optional marker becomes an SMF marker. Loop bars use a zero-based, end-exclusive range.
- To add a factory instrument, add its parameter schema and defaults in `model.js`, implement its signal generation in `voice.js`, then supply a targeted impulse/note test. To add a patch, edit the family or chain list in `library.js` and check that it changes the printed signal.
- Imported samples are stored inside a session as base64 PCM16 mono. The importer bounds file size and duration. Preserve a separate copy of the source recording when stereo or archival precision is required.
- Arrangement parts can contain optional `audioRegions`. Each region references a channel ID carrying an imported sample, a zero-based sixteenth-note `step`, and PCM frame bounds `from` (inclusive) and `to` (exclusive). Each part allows 64 regions, with 512 per session. Editing or moving a region preserves the original PCM. Playback follows tempo for placement and preserves source pitch and time after launch. Part boundaries stop a region. Its channel mixer, effects, master, audio stems and offline audio exports receive the same PCM. The notes-only MIDI format cannot represent recorded waveforms. Native projects and exported audio/stems preserve them.

### Arrangement automation and sampling

Each arrangement part can store `automation` lanes. A lane identifies a channel by its stable `track` ID, a `target` of `volume` (0–1) or `pan` (−1 through +1), and sorted `points` with integer `step` and numeric `value`. A part accepts up to 64 distinct lanes, each with up to 128 points. A session accepts 8,192 points total. Track controls apply before the first point. The mixer interpolates adjacent points per sample, holds the last value through the part and restores the manual mix at its end. Automation reaches wet sends, audio exports and stems. MIDI exports represent the ramp with seven-bit CC7 and CC10 events.

The sampler and audio regions use the same band-limited interpolator. It filters the source before decimation. Octave levels prepared at sample decode bound the filtering work for transposed material. Trim boundaries restrict reads to the selected original frames. Reverse playback and short loops preserve fractional position on wrap. The Freeze insert waits for audible input before capturing its tempo-sized window. Disable and enable the insert to capture a new window.

The local composer offers Hard techno, Acid techno, Warehouse dub, Broken beat, Schranz, Hardgroove, Industrial techno and Neo rave. Seed, tempo, tonality, intensity and complexity are editable. Generated notes, rhythm, timbre and arrangement stay in the native session.

## Playback and recording

Construct `createEngine({onState,onTick,onError})`. Start from an actual user gesture with `await engine.play(project,{scene:0})` or `{arrangement:true}`. Use `engine.update(project)` after a valid edit. For high-rate MIDI gestures, `engine.control(id,value)` updates master, track or synth parameters without cloning the full session. `engine.queueScene(index)` switches at the next bar using two decks, an equal-power fade and reusable effect buffers. Set `project.crossfadeBeats` between zero and four. The default is one beat. Use `engine.trigger(track,pitch,velocity,gateSeconds)` for timed cues. The MIDI input gateway uses token-owned held notes and releases the original voice even after a track change.

The AudioWorklet schedules by sample position. A buffered fallback exists where the browser exposes ScriptProcessor. The analyser and stereo MediaStream are available on `engine.analyser` and `engine.stream`. Meters report channel peaks/RMS, master stereo correlation and an overload flag measured before the output limiter. The live rack measures render-callback wall time against the sample budget in half-second windows. Three consecutive windows using at least 78% switch track and bus display meters to one sample in four and skip mathematically silent channel work. Twelve consecutive windows at or below 50% restore full resolution. Master peaks, overload detection, sidechains, notes, releases, timing, FX and exports retain their signal path. The worklet accepts the coarse wall clock only after observing short nonzero measurements. Unavailable timing leaves the load unknown. A physical output device may impose its own latency and interruption policy. Dispose the engine to release the audio context and stream.

## Files

| Output | Encoding and scope |
| --- | --- |
| WAV | 16/24-bit integer with triangular dither, or 32-bit IEEE float. Mono or stereo at 44.1, 48, 88.2, 96, 176.4 and 192 kHz. |
| FLAC | Lossless 16/24-bit PCM at the same six rates, with CRC-protected verbatim subframes. File size is close to PCM. |
| AIFF | Big-endian 16/24-bit PCM at the same six rates. |
| MP3 | LAME at 128, 192, 256 or 320 kbit/s, mono or stereo, 44.1 or 48 kHz. The encoder is loaded on demand. |
| MIDI | Standard MIDI File type 1 with per-track notes, CC7/10, song tempo and scene markers. Timbres and audio effects travel in the native session. |
| Native | JSON `.vfreq` preserves project data and embedded samples. ZIP packages can include a session, MIDI and individual WAV stems. |

Exports allow a scene, bar range, track or bus, tail and optional two-pass peak normalization. A separate worker renders at the target sample rate. Large WAV prints automatically use RF64 when the classic RIFF size would overflow. The header includes 64-bit data size, RIFF size and frame count. FLAC/AIFF/ZIP have separate format limits. Large WAVs need a writable file or sufficient origin-private file storage. The Node CLI streams to a temporary sibling file and renames it after success. ZIP32 rejects oversized stem archives before rendering; export their tracks individually. Browser quota estimates and write errors can still limit the usable duration. [EBU RF64 specification](https://tech.ebu.ch/publications/tech3306). Integer renders are dithered, whereas float preserves the computed level. Stems processed through separate nonlinear chains need not sum to a mastered stereo print. Combine unmastered stems before applying a common master chain.

From the repository root with Node.js, FFmpeg, ffprobe and unzip installed:

```sh
node frequency/audio/print.mjs forge Furnace-Ledger.wav --sampleRate 48000 --bits 24
node frequency/audio/print.mjs glass glass-scene.flac --scene 6 --bars 4 --bits 24
node frequency/audio/print.mjs rift arrangement.mid
node frequency/audio/qa/dsp.test.mjs
node frequency/audio/qa/live.test.mjs
node --test frequency/audio/qa/{arrangement-mix,audio-fidelity,composition,live-budget,rf64}.test.mjs
node frequency/audio/qa/master-review.mjs /path/to/private/masters
```

The suite checks all voices, presets, effect responses, bypass, MIDI events, sample editing and decoded PCM. The master review renders each entire primary arrangement and measures EBU R128 integrated loudness and true peak with FFmpeg. Fixtures and long renders belong outside the static site. The audio writer and CLI can run without any DAW. Human listening, physical devices and long-running browser endurance require separate evidence.

The workstation sources use the parent project's MIT licence. The MP3 library and imported recordings retain their respective terms. [MP3 library notice](./vendor/NOTICE.md) · [Workstation licence](../LICENSE).
