# VISIONOIR

Created, designed and developed by Flavio Giorgio Guarini.

Creative direction, visual identity and sound on [VISIONOIR](https://visionoir-platform.github.io/).
Static Vite and Three.js site with localized HTML, same-document language changes and progressive audio and 3D.

## Work locally

1. Use Node 24 and run `npm ci`. Existing local master MP3s live in `public/assets`.
2. To recover MP3s from source, use Python 3.12 with `pip install -r scripts/audio-premium-requirements.txt`, Clang and FFmpeg with libmp3lame. Run the three `scripts/synthesize-*.py` scripts, using `--track all` for the premium pair. The hosted workflow provisions these tools. Portable paths are staged by `scripts/prepare-pages.py`.
3. Run `npm run build`, then `npm run preview`. Enforce a release with `VISIONOIR_ALL_LOCALES=1 VISIONOIR_ALL_TRACKS=1 npm run build` and `node --test tests/locales.test.mjs`.

## Maintenance

- Open `tools/editor-visionoir.html` locally to edit catalogue text with labelled controls. Open a locale file, edit and save a copy, then replace the intended catalogue and rebuild. Build-time configuration, images, URLs and source changes remain in the source workflow.
- Copy and metadata live in `src/locales/<language>.txt`, with one `key|value` per line. `src/locales/it.txt` is the schema. Base languages must cover every key. Regional variants override the fields that differ. Rebuild to update HTML, JSON and sitemap.
- Add a language in `src/locales.js`, give it a catalogue, and validate the build. Review script/font behavior and direction before publication. Rumantsch Grischun needs an independent language review.
- The background and silver trail remain neutral across all languages. Adjust the six synchronized UI/scene accent colors in `src/palette.js`.
- Services and EUR amounts live in `src/site.js`. Track titles and timing are in `src/tracks.js`; add the playable asset, a licence and sourcing entry, and choose a matching visual mode in `src/scene.js`. After changing the MP3s, run `python3 scripts/analyze-studio-audio.py` with FFmpeg and NumPy installed. The logo reads these measured frequency envelopes at the native player’s current position. The release workflows regenerate them from the distributed recordings.
- The neutral URL uses the saved language and browser language preferences. The default build sends no GeoIP requests. The optional studio inquiry receiver is set through VISIONOIR_CONTACT_ENDPOINT. It accepts only a deployed Google Apps Script URL. Without that setting, visitors can review the quote and send it manually. An operator may configure an HTTPS country endpoint explicitly after reviewing the accompanying privacy disclosure.
- Publish through the existing GitHub Pages Actions workflow. From the private working tree, `python3 scripts/prepare-pages.py /absolute/new/staging-dir` creates only the intended public files. The GitHub source tree builds all static pages and regenerates the six tracks.
- To roll back, revert the update commit through Git in the public repository and let the Pages workflow redeploy. Baseline before internationalization: `73ae19175fb6e8b833f1b786f3ce8d6ea167ec8f`. Keep the revert as forward history.

## FREQUENCY, The Creator and support

Three activations of the studio logo within 1.5 seconds open FREQUENCY. The existing footer word “unseen.” opens The Unseen Protocol. The language travels with both entrances. The Creator portrait is loaded near its section and uses the active studio soundtrack.

The build generates the localized site, support portal, factual legal information and the offline FREQUENCY shell. Run `node --test tests/*.test.mjs game/engine/engine.test.mjs game/qa/checkpoint.test.mjs` before the production build. To test the simulated support lifecycle locally run `node scripts/support-sandbox.mjs 25 refunded`. Public contributions are disabled. Deployment and rollback use reviewed commits through the GitHub Pages workflow. To roll back, revert the release merge in a new pull request and verify the resulting deployment.

[Software and asset permissions](LICENSE) · [Credits](CREDITS.md) · [User music](USER_CONTENT_POLICY.md) · [Third-party notices](THIRD_PARTY_NOTICES.md)
