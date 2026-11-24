# THE UNSEEN PROTOCOL · audio di gioco

**VISIONOIR: THE UNSEEN PROTOCOL — ORIGINAL GAME SOUNDTRACK** dura 1 h 07 min 36 s. Le 39 composizioni e i 118 effetti hanno registri separati. Gli arrangiamenti usano 3/4, 4/4, 5/4, 6/4 e 7/4. Le voci combinano FM, additive, rumore sintetizzato, percussioni e riflessioni a tempo. Ogni composizione ha una linea melodica scritta, un ritmo, un percorso armonico e un arrangiamento per sezioni. Il tema dei titoli di coda riprende intenzionalmente il motivo della schermata iniziale.

## Modificare e rigenerare

Occorrono Python 3.12 o successivo, NumPy, FFmpeg e ffprobe con codificatore AAC nativo. Dalla directory del sito:

```sh
python3 game/audio/render.py
python3 game/audio/render_effects.py
python3 game/audio/stems.py
python3 game/audio/names.py
python3 game/audio/verify.py
```

Modificare `score.py` per melodia, battute, armonia, orchestrazione e forma di una traccia. Il manifesto viene aggiornato al termine del rendering. Modificare `effects.score` per le voci sovrapposte, il tempo di entrata, la durata e l’escursione in frequenza di un effetto. Le etichette localizzate sono in `effect-names.tsv` e `names.py`. Per la consegna statica si può richiamare `python3 game/audio/verify.py --web-only`. Il parametro `--report` indica dove scrivere i risultati.

Il percorso predefinito degli asset di produzione è `~/Music/VISIONOIR/The Unseen Protocol`. Le sottocartelle `OST` e `SFX` custodiscono i master stereo WAV PCM 24 bit a 48 kHz. Ogni cue musicale ha un MIDI tipo 1 con tempo, metrica, melodia, basso, armonia, controcanto e percussioni. I 194 stem stereo FLAC a 24 bit sono in `Stems/01` … `Stems/39`; il brano 33 prevede quattro parti. Si possono trascinare le parti con la stessa origine temporale in una DAW. Gli stem precedono la saturazione e il guadagno complessivi del master.

I file del gioco sono `public/unseen/audio/*.m4a`. I 157 file audio occupano insieme 56.12 MB decimali. Ciascun registro contiene percorso, durata, categoria, funzione, provenienza e crediti. I punti di loop sono espressi in secondi dalla prima posizione PCM fino alla fine, con estremità aperta. Le code degli effetti sono già comprese nella durata. I jingle e i finali sono a riproduzione singola.

## Riproduzione

Importare `createGameAudio` da `/unseen/audio/engine.js`; chiamare `load()` quando si entra nel gioco e `play(id)` dal gesto che avvia l’esperienza. Le due copie del player servono al passaggio morbido tra brani. La libreria degli effetti conserva al massimo 32 buffer e limita a dieci le voci simultanee. La sospensione della scheda interrompe la riproduzione. Il motore della pagina principale del sito resta separato.

Il controllo `special(1..7)` imposta il disegno melodico associato al nucleo; `transform(true, heroIndex)` sceglie il timbro e la figura della forma potenziata; `setIntensity(0..1)` regola gli accenti ritmici sulle suddivisioni della traccia. Le tre bande del visualizzatore derivano dal segnale del bus principale.

Il controllo di trasporto in browser è `browser-qa.cjs` e usa una copia di Playwright già installata. Le variabili facoltative sono `PLAYWRIGHT_LIB`, `CHROME_BIN`, `WEBKIT_BIN` e `AUDIO_QA_REPORT`. Il test apre un server sulla sola interfaccia di loopback, prova l’intera libreria, quindi chiude i browser. I risultati misurati sono in `audio-qa.json` e `browser-results.json`.

Per creare il reel di ascolto indicizzato e la tavola spettrale: installazione esistente di Pillow, poi `python3 game/audio/review.py`. La scrittura avviene nella cartella locale `Review` dei master. Il controllo sui diffusori fisici e la revisione da parte del direttore creativo restano aperti. Ableton Live 12 Suite è presente sul Mac, ma la superficie MCP non era collegata al set: questa produzione usa il motore DSP locale. In `public/unseen/audio/NOTICE.txt` si trovano crediti, provenienza e condizioni d’uso.
