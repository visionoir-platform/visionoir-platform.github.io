# FREQUENCY Chromatic Engine

The workstation sends a normalized master spectrum, sixteen voice envelopes, six bus meters, stereo RMS, tempo, beat and arrangement scene to a single visual stage. The stage can run silently from an external signal or a manual trigger. It does not request an audio input or create a playback context.

## Integration

`mountChromatic(host, {getSignal, state, locale, onChange})` returns an asynchronous controller. Keep the returned visual state in the project’s `visual` field. Use `setState` when opening a project, `setLocale` when switching language, `setMotion` to honour a site preference and `dispose` when leaving. `trigger(index, normalizedVelocity)` accepts the instrument’s stable index in the rack. `handleCC(channel, controller, normalizedValue)` handles MIDI Learn and stored mappings. `getCanvas()` returns the WebGL canvas while the stage is available.

The host starts the separate `mountVJ(host)` entry point when the URL identifies a projector window. A random per-output token, exact origin and opener checks keep frame messages between the two windows. The studio forwards the same manual instrument impulses and master signal to the visible WebGL output. Message delivery is limited to roughly 18 Hz and the child interpolates locally. The source keeps reading the master spectrum for a visible projector when the workstation is in the background, subject to browser suspension. When the projector closes, hides or loses WebGL it releases its monitoring subscription. An on-screen local meter and renderer can still share one analyser read per 70 ms. Spectral bands span 20–250 Hz, 250 Hz–4 kHz, and 4 kHz to Nyquist. Graph columns include the strongest bin in their logarithmic frequency interval. It never loads the studio’s audio engine. A double-click requests fullscreen when available.

The renderer stops when offscreen, hidden, paused for motion reduction, or unable to acquire WebGL2. In Chromatic Engine the fallback is the actual VISIONOIR logo. In The Creator the fallback is a WebP rendering of the same approved portrait. Requesting the surface again after context restoration reconstructs drawing from the original shape.

## Editing a scene

The ordinals in `model.js` are file-format and routing identifiers. Keep their meaning stable. A preset has a material/deformation in `shaders.js` and a physical score in `spatial.js`. Point seeds are deterministic samples on the real mesh. In `stage.js`, master bands and voice envelopes drive separate uniform values and converge towards the reference rest shape in silence. `history.js` supplies a bounded feedback pass to three presets when quality permits.

In The Unseen, the transport selects a chapter every eight beats. The arrangement scene offsets the sixteen-chapter cycle in `visual-score.js`. Each transition blends the material and its surrounding geometry together, including palette and echoes. Reduced motion holds The Unseen’s signature look.

Instrument signatures apply across logo presets. For example, the Rumble route pulls the surface inward, Acid draws green filaments, the Open Hi-Hat sweeps particles sideways, and Ride drops them through the reflection. Dark Atmosphere veils the surface and FM Machine produces interference bands. A sampler or any other instrument can take over a signature through the visual rack’s route selector.

The audio renderer latches the strongest audible attack per instrument between its 24 Hz reports. The same report carries accents, open gates, releases and post-bus levels. Short ratchets survive this interval; simultaneous notes on one route share an envelope. The projector receives at most one note packet per report, separate from the manual visual trigger. The worklet and buffered audio fallback share this behavior.

For the Creator, first verify the cleared source file. Generate static levels with:

```sh
python3 src/creator/tools/build-avatar.py "$PORTRAIT_SOURCE" public/creator --blender "$BLENDER_BIN"
```

Pillow and Blender are production tools only. The public geometry contains one mesh and no animation clips, bones or skeleton. Preserve the original photos and source GLB privately. The GLB output and portrait are covered by the separate public Creator credits. See [asset credits](../../public/creator/CREDITS.txt).

## Verification

Start the repository’s Vite dev server on loopback (port 4271 by default). Use a private output directory, installed Playwright and a compatible Chromium executable. Both scripts accept `CHROMATIC_ORIGIN`, `CHROMATIC_PROOF`, `PLAYWRIGHT_MODULE` and `BROWSER_BIN`.

```sh
node frequency/chromatic/qa/scene.cjs
node frequency/chromatic/qa/device.cjs
node frequency/chromatic/qa/voice-matrix.cjs
node frequency/chromatic/qa/playing-notes.cjs
```

The first captures sixteen presets and three portrait states and exercises the rack, saved preset and real VJ popup. The second checks deferred mobile LOD requests, reduced motion, context loss/recovery and fallback without WebGL. Its frame timing measures the browser’s requestAnimationFrame cadence in this laboratory configuration. The tests do not establish physical mobile GPU performance or MIDI hardware latency.

The voice matrix test renders the actual logo with identical camera, visual clock, bands and velocity for all sixteen routes. It compares the 120 pairs, checks for Acid’s green threads, reroutes the sampler, combines the voices and returns the logo to rest. `CHROMATIC_PROOF` saves a private contact sheet and pixel counts. For a controlled before/after comparison on a local Vite server, `CHROMATIC_BASELINE_SHADER` and `CHROMATIC_CANDIDATE_SHADER` accept paths to the corresponding shader modules.
