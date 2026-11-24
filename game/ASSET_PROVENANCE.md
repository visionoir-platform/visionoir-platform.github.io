# Asset register

| Family | Editable source | Public metadata and verification |
|---|---|---|
| Characters, forms, machines, scenery and effects | game/art/*.py, hand-specified pixel coordinates and animation tables | public/unseen/art/provenance.json, sprites.json, animations.json, bosses.json, tilesets.json and objects.json; game/art/check.py |
| Original music | game/audio/score.py and render.py, private multitrack MIDI and WAV masters | public/unseen/audio/soundtrack.json; game/audio/audio-qa.json |
| Original effects | game/audio/effects.score and render_effects.py | public/unseen/audio/sound-effects.json; game/qa/audio-digests.json |
| Dialogue and text | game/ui/locales/*.tsv | game/ui/catalogs.mjs emits one catalog per language |
| Logo and website music | existing studio assets | ASSETS.md at the repository root and notices in public/assets |
| Studio templates | third-party MIT documentation | game/studio/LICENSE and THIRD_PARTY_NOTICES.md |

The build checks the original profile and hashes all compressed audio assets, verifies scene references, checks the artwork register, and excludes private fan paths, reference ZIPs, diagnostic controls and production masters. Printed numbers of animation cells include held frames. The private reference library and private character profile are outside the public source package.
