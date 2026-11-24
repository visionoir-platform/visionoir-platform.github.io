# The Unseen Protocol

La pagina di gioco è `/unseen/`. Nel footer del sito, la parola «unseen.» apre il gioco nella lingua corrente. Il menu offre Storia, Continua, Contro il tempo, Mappa della città, Archivio, Opzioni e Crediti. La sequenza dei boss si sblocca terminando Protocol X. La Luna si apre dopo i sette nuclei e il completamento della fortezza con Vela.

## Avvio e modifiche

Dalla radice, eseguire `npm ci`, `npm run build` e `npm run preview -- --host 127.0.0.1`. Aprire l’indirizzo stampato con il percorso `/unseen/?lang=it`. L’hosting serve file statici. Il sito e il gioco hanno documenti, cicli di rendering e player distinti.

- Livelli e boss sono definiti in `game/engine/content.js`. Le unità fisiche e le entrate sono descritte in `game/engine/README.md`.
- I cataloghi modificabili sono in `game/ui/locales`. Conservare le colonne e i nomi propri, quindi ricostruire. I 19 dizionari statici sono generati da `game/ui/catalogs.mjs`.
- La pipeline grafica si rigenera con `python3 game/art/build.py` (Pillow). Le verifiche di trasparenza, limiti delle celle e variazione fra fotogrammi sono in `game/art/check.py`.
- Musica, effetti, stem e misure hanno procedure dedicate in `game/audio/README.md`. Quando si cambia un file audio, rigenerare il master, rifare la verifica di decodifica e aggiornare il corrispondente digest SHA-256 in `game/qa/audio-digests.json` soltanto dopo l’ascolto o l’analisi della nuova versione.
- Il controllo di produzione è `node --test tests/locales.test.mjs game/engine/engine.test.mjs game/qa/checkpoint.test.mjs`, poi `npm run build && node game/qa/release.mjs`. Il Sound Test legge entrambi i manifest. La build originale verifica la presenza delle 39 musiche, 118 effetti e nomi degli effetti in ogni lingua.
- I salvataggi locali e le impostazioni sono separati. Nelle Opzioni si può trasferire il file JSON su un altro browser. Il checkpoint di Storia riapre il marcatore già raggiunto. Non sono richiesti account.
- Il profilo privato si produce sul Mac con `npm run game:build:fan` quando sono presenti gli undici PNG di sviluppo. L’output viene creato in una cartella separata. Per lo sviluppo con Vite esiste `npm run game:fan`. L’interfaccia diagnostica per saltare ai livelli è disponibile solo con Vite su loopback e `?qa=1`. Entrambe le varianti condividono il motore.
- Per tornare alla versione precedente, creare un normale revert del merge del gioco sul ramo pubblico e attendere la pipeline Pages. La revisione pubblica precedente è `54b873dba77731e589344740029bec7812b81be4`. I salvataggi locali del gioco usano chiavi dedicate.

## Distribuzione

Crediti e condizioni d’uso sono in CREDITS.md e LICENSE.md. Consultare i termini del provider prima di cambiare la destinazione del sito o aggiungere transazioni. La copia statica è portabile mantenendo la radice del dominio e il percorso /unseen/. [GitHub Pages limits](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits)
