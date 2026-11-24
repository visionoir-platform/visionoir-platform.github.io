# VISIONOIR

Creative direction, visual identity and sound on [VISIONOIR](https://visionoir-platform.github.io/).
Static Vite and Three.js site with localized HTML, same-document language changes and progressive audio and 3D.

## Work locally

1. Use Node 24 and run `npm ci`. Existing local master MP3s live in `public/assets`.
2. To recover MP3s from source, use Python 3.12 with `pip install -r scripts/audio-premium-requirements.txt`, Clang and FFmpeg with libmp3lame. Run the three `scripts/synthesize-*.py` scripts, using `--track all` for the premium pair. The hosted workflow provisions these tools. Portable paths are staged by `scripts/prepare-pages.py`.
3. Run `npm run build`, then `npm run preview`. Enforce a release with `VISIONOIR_ALL_LOCALES=1 VISIONOIR_ALL_TRACKS=1 npm run build` and `node --test tests/locales.test.mjs`.

## Maintenance

- Copy and metadata live in `src/locales/<language>.txt`, with one `key|value` per line. `src/locales/it.txt` is the schema. Base languages must cover every key. Regional variants override the fields that differ. Rebuild to update HTML, JSON and sitemap.
- Add a language in `src/locales.js`, give it a catalogue, and validate the build. Review script/font behavior and direction before publication. Rumantsch Grischun needs an independent language review.
- Services and EUR amounts live in `src/site.js`. Track titles and timing are in `src/tracks.js`; add the playable asset, a licence and sourcing entry, and choose a matching visual mode in `src/scene.js`.
- The neutral URL selects language with explicit preferences first, then approximate country and device preferences. Set `VISIONOIR_GEO_ENDPOINT=""` to disable GeoIP at build time. The production default is Country.is, with a 420 ms deadline and only the country code stored for six hours.
- Publish through the existing GitHub Pages Actions workflow. From the private working tree, `python3 scripts/prepare-pages.py /absolute/new/staging-dir` creates only the intended public files. The GitHub source tree builds all static pages and regenerates the six tracks.
- To roll back, revert the update commit through Git in the public repository and let the Pages workflow redeploy. Baseline before internationalization: `73ae19175fb6e8b833f1b786f3ce8d6ea167ec8f`. Keep the revert as forward history.
