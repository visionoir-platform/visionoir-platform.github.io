# Formato di progetto FREQUENCY

Un file `.vfreq` è un documento JSON UTF-8. Contiene i dati necessari a riaprire e modificare il brano. Nel menu **Libreria** si possono importare il documento, la sua copia con estensione `.json` o l’archivio `.zip` esportato dallo studio.

| Campo | Interpretazione |
| --- | --- |
| `version`, `name`, `bpm`, `swing`, `seed` | Il formato nativo attuale è `2`. L’editor e l’esportazione JSON compatibile usano la versione `1`. Il tempo è espresso in battiti al minuto, da 40 a 300. `seed` governa le scelte pseudocasuali del sequencer. |
| `tracks` | Ogni traccia ha un `id` stabile e un `instrument` del registro di sintesi. I valori in `params` e i lock delle note sono normalizzati da 0 a 1. Gain, pan, inserti, mandate e bus determinano il mix. |
| `scenes[].patterns` | I pattern seguono l’ordine delle tracce. `length` è la lunghezza del ciclo in sedicesimi. In versione 1 una cella `null` indica una pausa. In versione 2 un intero da 1 a 128 conta i passi consecutivi di pausa. Una pausa singola scritta come `null` è accettata anche in lettura. Una nota contiene altezza MIDI e velocity e può includere gate, accordo, offset, probabilità o ripetizioni. |
| `arrangement` | Ogni parte indica l’indice della scena, a partire da zero, e la durata in battute. Può aggiungere marker, sorgenti diverse per canale, automazioni e regioni audio. Le automazioni usano l’ID della traccia. I limiti `from` e `to` delle regioni sono frame del campione sorgente, con `to` escluso. |
| `tracks[].sample` | Il campione incorporato porta nome, frequenza del PCM incluso (`rate`) e dati `pcm` in Base64. Il lettore usa valori mono PCM a 16 bit, little endian. I dati viaggiano nel progetto. |
| `master`, `buses` | Comprendono i livelli e le impostazioni di uscita. Negli inserti `fx`, `id` seleziona l’effetto e `amount` la regolazione della macro. L’inserto `eq` può conservare `eq.frequency` in Hz, `eq.gain` in dB e `eq.q`. |
| `midiMappings`, `visual`, `workspace`, `exportInfo` | Conservano rispettivamente associazioni MIDI, stato del Visual Rack con memorie e cambi scena, scena aperta e metadati di esportazione. I vecchi progetti che precedono questi campi continuano ad aprirsi. |

Il lettore accetta un documento fino a 80.000.000 byte e controlla le strutture musicali prima di sostituire la sessione. La specifica eseguibile è [model.js](audio/model.js). La lettura di un archivio cerca `project.vfreq` alla radice e ne verifica dimensione e CRC. Supporta i membri ZIP32 memorizzati senza compressione e, nei browser con decoder `deflate-raw`, quelli ricompressi con Deflate. I WAV degli stem sono disponibili anche per il montaggio in un’altra DAW.

## Passare da una versione all’altra

Apri un vecchio file nella Libreria e scegli **Esporta → .vfreq · v2** per salvare la nuova rappresentazione. Il backup della Libreria e il documento incluso negli ZIP usano lo stesso formato. Per aprire il brano su una precedente installazione di FREQUENCY scegli **Esporta → JSON · v1**. Entrambe le versioni contengono tutte le note, anche quelle nascoste quando si accorcia un pattern. Il file di origine resta disponibile.

Ad esempio, due pause, una nota e altre tre pause diventano nella v2 una sequenza di tre elementi, il numero 2, l’oggetto nota e il numero 3. Il lettore espande le pause prima della validazione musicale. Il salvataggio locale conserva le celle modificabili e può essere riaperto anche dalle precedenti installazioni che supportano le funzioni musicali usate nel brano.

## Leggere un progetto senza il sito

Dalla radice del repository, con Node.js, questo comando valida un proprio file `.vfreq` e scrive nome, tempo, numero di tracce e durata in battute. Il comando accede in sola lettura al file indicato.

```sh
node --input-type=module - './brano.vfreq' <<'JS'
import { readFile } from 'node:fs/promises';
import { readProject, totalBars } from './frequency/audio/model.js';
const project = await readProject(new Blob([await readFile(process.argv[2])]));
console.log(project.name, project.bpm, project.tracks.length, totalBars(project));
JS
```

Per il trasferimento in un’altra workstation, importa gli stem WAV partendo dalla stessa battuta e usa il MIDI per tempo, note, marker e automazioni supportate. Conserva il `.vfreq` accanto al mix per poter modificare in seguito la sintesi e le scene. Il [manuale del motore](audio/README.md) include anche il rendering locale da riga di comando.
