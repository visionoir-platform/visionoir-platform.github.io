# VISIONOIR — Materia e atmosfera

Due nuove composizioni complete, prodotte il 24 novembre 2026 sul ramo di lavoro locale. Non è stato effettuato alcun deployment da questo task. I quattro MP3 precedenti sono preservati.

| Modalità / ID | Brano | BPM | Durata PCM decodificata | Asset | Dimensione |
|---|---|---:|---:|---|---:|
| Lega / `alloy` | METALLOGRAM | 130 | 206,769229 s · 3:26,77 | `public/assets/visionoir-metallogram.mp3` | 4.137.446 byte |
| Aura / `aura` | VELUM | 84 | 205,714286 s · 3:25,71 | `public/assets/visionoir-velum.mp3` | 4.116.018 byte |

Entrambi i file sono MP3 stereo a 44,1 kHz / 160 kbit/s. I percorsi nel manifest sono relativi alla base del sito; il player deve applicare la propria `BASE_URL`.

## Composizioni e provenienza

**METALLOGRAM** è una partitura in Re minore di 112 battute: introduzione di risonatori metallici, ingresso progressivo del groove, basso sincopato, accordi dub, due frasi melodiche alternate, pausa centrale, ripresa e uscita. I transienti metallici hanno parziali superiori rapidamente smorzate; il basso resta al centro. Seme deterministico: `2026112401`.

**VELUM** è una partitura in Mi minore di 72 battute: accordi aperti, piano sintetico morbido, piccoli arpeggi, linea melodica lenta e pulsazione dimezzata. La struttura attraversa introduzione, sviluppo, sospensione, ripresa e dissolvenza. Seme deterministico: `2026112402`.

Le partiture e gli strumenti sono stati creati per VISIONOIR mediante sintesi DSP deterministica con assistenza AI. Non sono stati usati registrazioni esterne, sample pack, loop commerciali, audio trovato online o melodie interpolate da opere di riferimento. Non è stata condotta una ricerca universale di somiglianze musicali.

Pubblicazione e notice: **VISIONOIR**, con produzione da sintesi originale assistita. Contatto indicato per i diritti: **Flavio Giorgio Guarini**. L’attribuzione autoriale delle tracce esistenti resta distinta. Contatto unico: **visionoir.platform@gmail.com**. I crediti e la licenza sono inclusi nei tag ID3 e nel manifest. La licenza dedicata è `public/assets/AUDIO-PREMIUM-LICENSE.txt`: ascolto nel player VISIONOIR; ogni altro riutilizzo richiede autorizzazione scritta. Non è stata effettuata né dichiarata alcuna registrazione formale del copyright.

## Verifica dei file consegnati

Misure effettuate sull'MP3 interamente decodificato, dopo il mastering e la codifica. Loudness integrata e true peak sono rilevate da FFmpeg `loudnorm` (EBU R128); il true peak non è confuso con il solo picco dei campioni.

| Misura | METALLOGRAM | VELUM |
|---|---:|---:|
| Loudness integrata | −15,44 LUFS | −16,44 LUFS |
| True peak | −3,43 dBTP | −2,50 dBTP |
| Picco dei campioni | −3,438 dBFS | −2,498 dBFS |
| Loudness range | 8,4 LU | 6,9 LU |
| RMS stereo | −15,938 dBFS | −16,529 dBFS |
| Correlazione stereo globale | 0,94068 | 0,63737 |
| Variazione RMS in somma mono `(L+R)/2` | −0,131 dB | −0,869 dB |
| Rapporto energia Side/Mid 25–120 Hz | −68,518 dB | −52,258 dB |
| Loudness integrata del file mono | −18,37 LUFS | −20,95 LUFS |
| True peak del file mono | −3,63 dBTP | −3,09 dBTP |
| Salto campione iniziale/finale, ampiezza lineare | 0,00001325 | 0,000002414 |

Il valore LUFS di un file mono non va confrontato direttamente con quello stereo senza considerare il conteggio dei canali: la misura RMS del fold-down e il rapporto Side/Mid descrivono meglio l'eventuale cancellazione. Il rapporto basso è calcolato su 32 finestre di due secondi distribuite lungo ogni brano; non è una misura di ogni singola finestra possibile.

Entrambi i master rispettano i limiti automatici del generatore: true peak ≤ −1,5 dBTP, loudness entro 1,25 LU dal target, Side/Mid basso ≤ −28 dB, perdita RMS mono inferiore a 4 dB, file inferiore a 4,5 MB. La codifica include header Xing/LAME; attacco e uscita sono smussati. I bordi sono numericamente controllati, ma una transizione percepita come perfettamente continua dipende anche dal browser/player e dalla scelta musicale di ripetere il brano completo. Non si dichiara un test di loop su ogni piattaforma.

È stata verificata la decodifica completa, la durata effettiva, i metadati e l'assenza di clipping digitale. Non è stata effettuata una sessione di ascolto critico su monitor, cuffie o dispositivi fisici: queste misure non sostituiscono una valutazione percettiva. Il player deve mantenere avvio volontario, volume moderato e controllo di pausa; la gestione delle transizioni fra tracce appartiene al motore audio del sito.

## Riproduzione su Linux e macOS

Dipendenze: Python **3.11 o successivo**, NumPy **2.4.2**, FFmpeg con encoder `libmp3lame`. Non servono compilatori, librerie DSP native specifiche di macOS, DAW, campioni esterni o accesso di rete durante la generazione. `FFMPEG` può indicare un eseguibile alternativo; altrimenti viene usato quello sul `PATH`.

```sh
python3 -m venv .venv-audio
.venv-audio/bin/python -m pip install -r scripts/audio-premium-requirements.txt
.venv-audio/bin/python scripts/synthesize-premium.py --track all --output-dir /tmp/visionoir-audio-build
```

Su un runner Linux già fornito di FFmpeg, questi sono gli stessi comandi. La directory di output separata evita di sovrascrivere i master approvati. Per rigenerare deliberatamente gli asset del sito:

```sh
.venv-audio/bin/python scripts/synthesize-premium.py --track all --force
```

Si può generare solo un brano con `--track alloy` o `--track aura`. Il generatore rifiuta una sovrascrittura se manca `--force`; non scrive mai i nomi degli altri quattro master. Produce audio uno alla volta, esegue FFmpeg con un thread, verifica prima di sostituire il file finale ed elimina i WAV temporanei al termine. `premium-soundtracks.json` contiene semi, struttura temporale, hash dei PCM e dei file MP3, hash del generatore, ambiente e risultati delle misure.

La sintesi a seme fisso è riproducibile; l'identità bit per bit fra sistemi diversi richiede anche le stesse versioni e implementazioni numeriche, FFmpeg e LAME. Il manifest documenta l'ambiente effettivo. Questa esecuzione è stata verificata su macOS 27.0.1 ARM64, Python 3.14.2, NumPy 2.4.2, FFmpeg 9.0.2. Il codice non contiene dipendenze specifiche di macOS; non si dichiara un'esecuzione Linux già effettuata. La pipeline di pubblicazione non è stata modificata da questo task.

## Risorse e preservazione

Campione iniziale Mac: `CONTINUE`, memoria disponibile 46%, load 7,57, disco libero 46,9 GiB. Campione durante la generazione seriale: `CONTINUE`, memoria disponibile 56%, load 1,79, disco libero 46,9 GiB. I sensori di pressione kernel e l'inventario processi non erano accessibili nel sandbox; questi numeri sono indicazioni osservate, non una garanzia di assenza di pressione.

SHA-256 dei master precedenti, confrontati prima e dopo questo lavoro:

```text
945788f852d5f629f0cc3df0938ce36adc30b6a5a8f6eeb047d4e39682b4d917  visionoir-acid.mp3
f76f5bd1c6b9ee915dcbddd6b086fc7fffb0c17f1bf82cf29b79334b6d1c2f96  visionoir-cromo.mp3
5a6d75be5073a6daa035274fd2a5b6503312a93ab998a85dea9c111d8c3d9716  visionoir-acid-mode.mp3
8f4362966d99602df9fc9b923921586a7c6a694c1e8c975755d9278bdace948a  visionoir-noir.mp3
```
