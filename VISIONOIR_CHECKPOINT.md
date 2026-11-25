# VISIONOIR · Registro pubblico di rilascio

## Candidato del 25 novembre 2026

La versione di riferimento prima di FREQUENCY è `27500a6f44e0d6deab0f8f97448bc5641946a9bf`. Il sito, il gioco e lo studio musicale hanno ingressi distinti. La parola «unseen.» nel footer apre il gioco. Tre attivazioni del logo di studio entro un secondo e mezzo aprono FREQUENCY.

Il candidato include il sequencer, gli strumenti, i preset visivi, i due modelli statici del ritratto, i cataloghi e i portali tradotti. Il portale di supporto presenta i contatti. I contributi monetari sono disattivati. Le licenze del codice, delle produzioni musicali e degli asset sono descritte in [COPYRIGHT.md](COPYRIGHT.md) e [ASSET_LICENSES.md](ASSET_LICENSES.md).

Il modulo mostra il riepilogo e il prezzo indicativo del pack. Pack X richiede una quotazione individuale. L’invio diretto viene abilitato impostando la variabile di distribuzione `VISIONOIR_CONTACT_ENDPOINT` sull’indirizzo del ricevitore pubblico dello studio. In assenza della configurazione la pagina espone la consegna manuale. Le credenziali e le richieste dei clienti restano nei sistemi privati dello studio.

## Verifica e ripristino

La pipeline ricostruisce le tracce del sito, controlla i cataloghi e le risorse audio, testa il punto di ripresa del gioco e pubblica la build statica. L’esito e il commit distribuito sono consultabili nel [registro dei rilasci](https://github.com/visionoir-platform/visionoir-platform.github.io/actions/workflows/pages.yml). Il collaudo su dispositivi fisici aggiuntivi è differito. Per ripristinare una versione usare un nuovo revert dei commit interessati e verificare la distribuzione risultante. Le procedure di compilazione e manutenzione sono nel [README](README.md).

## Rilascio pubblico verificato

Il commit `87f26b74311668445d9c0b76c6c4244ac1578dfc` è stato pubblicato sul dominio VISIONOIR. Il [rilascio del modulo](https://github.com/visionoir-platform/visionoir-platform.github.io/actions/runs/45656856827) abilita il ricevitore dello studio. Una prova dal sito pubblico, con il pack Brand Sprint e il prezzo di 450 EUR, ha prodotto la conferma sul sito, un’unica richiesta nel registro privato e il corrispondente messaggio nella Posta in arrivo dello studio. La verifica ha utilizzato dati sintetici. Accessi amministrativi e registri di collaudo sono custoditi privatamente.

## Navigazione degli avvisi dello studio

La pagina Informazioni e diritti offre un indice con 19 argomenti nelle 19 localizzazioni. I collegamenti alla singola sezione restano validi cambiando lingua. L’informativa sui preventivi descrive separatamente recapito, ricerca aziendale facoltativa e conservazione. Il portale specifica inoltre i permessi dei preset, la procedura per segnalare una vulnerabilità, i diritti sulla musica del visitatore e lo stato dei pagamenti. Nel rilascio precedente il [test degli ingressi](https://github.com/visionoir-platform/visionoir-platform.github.io/actions/runs/45658798398) ha accompagnato la correzione da tastiera.

## Edizione live di FREQUENCY e ritratto

Il piano roll gestisce trascinamento delle note e delle durate. Il mixer supporta l’automazione di volume e pan per clip. Le sessioni si possono riaprire con le modifiche e gli accordi inseriti. Il sampler usa ricampionamento a banda limitata. I bounce WAV di grandi dimensioni possono utilizzare RF64. Il motore live adatta il lavoro ausiliario quando misura pressione persistente sul callback audio.

Il ritratto The Creator ha una posa statica, un’illuminazione reattiva e immagini di riserva coordinate per finitura naturale, scultorea e metallica. Il gioco include esportazione ed eliminazione del salvataggio con conferma. Il collaudo di cancellazione ha controllato anche l’annullamento, il mantenimento delle impostazioni e la riapertura del gioco dal footer.


## Controlli sul dominio del 25 novembre

La [pubblicazione di c249ed8](https://github.com/visionoir-platform/visionoir-platform.github.io/actions/runs/45666026866) ha completato la distribuzione. Sono stati confrontati con la build undici file serviti da Pages, inclusi entrambi i modelli del creatore e il processore audio. Nel browser sono stati verificati l’apertura di un articolo in arabo a partire dalla stessa sezione italiana, le modifiche a note e clip, l’automazione del mixer e la riapertura della sessione musicale. La finestra di prova continuativa del motore audio ha un registro separato con l’identificativo della build.

## Proiezione, MIDI e comandi dello studio

Nel test con due finestre Chromium, il proiettore ha ricevuto sia i colpi manuali sia le variazioni di spettro quando la workstation era nascosta. La visibilità delle finestre è stata simulata. Un segnale sintetizzato a 15 kHz ha attivato la banda alta. Il test con due ingressi MIDI simulati ha verificato la selezione di una sola sorgente per il tempo. Le impostazioni di scala e dei tasti per trasporto e pad si conservano tra aperture dello studio. La guida spiega come preparare l’app offline e collegare le uscite di linea al mixer.


## Esportazione, scultura reattiva e gestione dei dati locali

Il pannello di esportazione consente di scegliere nome del file, titolo musicale e artista. I crediti Unicode sono stati letti nei file WAV, AIFF, FLAC e MP3 prodotti. La prova completa di Furnace Ledger ha generato 16 stem stereo a 48 kHz e 24 bit in un archivio da 629.612.291 byte. Tutti i WAV sono stati decodificati fino alla fine.

Nella sezione The Creator la traccia controlla sei comportamenti della superficie. Le prove Chrome hanno misurato la deformazione e la ricostruzione della sagoma in pausa. WebKit ha verificato gli ingressi a FREQUENCY e al gioco con passaggi rapidi in italiano e arabo. I contorni originali del logo sono ora inclusi nel modulo grafico che li usa.

Il comando di cancellazione dello studio rimuove anche preferenze, preset personali e stampe temporanee. Il test su più schede ha controllato l’annullamento, la protezione dai salvataggi obsoleti e la possibilità di iniziare un nuovo progetto. Il gioco conserva il proprio salvataggio. I file scaricati sul dispositivo rimangono disponibili.


## Affidabilità della performance

Il tasto Play può ricostruire il processore audio dopo un errore del worklet. Nel collaudo con errore indotto in Chrome, il segnale PCM è tornato sulla stessa uscita, mantenendo progetto, tempo e scena. L’inversione di polarità ora comprende entrambi i canali del Rumble Engine. Un segnale stereo sommato alla sua copia invertita si annulla nel test.

Il file video registrato continua a ricevere fotogrammi quando il musicista scorre la pagina o apre il mixer. La registrazione verificata contiene 367 fotogrammi VP8 e oltre 15 secondi di audio stereo. Il collaudo riguarda la pagina in primo piano.

Durante una prova con due build, il nuovo service worker ha atteso la chiusura dello studio mentre il master continuava a suonare. La nuova versione si è avviata offline alla riapertura. Il preflight distingue l’uscita confermata, quella scollegata e i casi in cui il browser non permette di verificare la periferica. La prova dei cambi di uscita usa dispositivi simulati.

## Movimento del dispositivo e ritratto a 360° · 25 novembre 2026

Nella home l’inclinazione guida il logo metallico, le orbite, la luce, la griglia e le superfici decorative. Il Chromatic Engine applica il movimento alla scena di FREQUENCY e trasmette lo spostamento visivo alla finestra VJ della stessa origine. Il modulo usa un orientamento relativo alla posizione iniziale. Quando il browser consegna già i dati, la reazione è automatica. Nei browser che richiedono un gesto, il controllo dedicato richiama il dialogo di sistema solo su richiesta del visitatore. I campioni del sensore restano in memoria e la lettura si sospende quando la pagina è nascosta o il movimento è ridotto.

La scultura di The Creator ruota di un giro completo con il trascinamento, i pulsanti o la tastiera. Si può anche compiere il giro fisicamente quando il sensore fornisce la direzione relativa. In assenza di WebGL il trascinamento seleziona tra 24 viste ricavate dal modello originale. Il test Chromium desktop con sensore e touch emulati ha verificato il ritorno alla matrice iniziale dopo 360°, lo scroll verticale, il pinch-to-zoom e l’accesso a gioco e studio. I dispositivi fisici e l’uscita audio su impianto rimangono prove distinte.

## Editing, loop e preferenze locali

Il piano roll offre due operazioni indipendenti sulla selezione. La quantizzazione temporale allinea le note ai sedicesimi conservando lo swing del progetto. Il comando Scala modifica l’altezza. In una prova da interfaccia con tre note, due selezionate, il salvataggio reale ha confermato che la terza è rimasta intatta anche dopo Annulla e Ripristina.

Il pannello di esportazione permette di usare i limiti del loop già salvato nell’arrangiamento. La dimensione prevista per l’MP3 segue il bitrate. Le prove confrontano i frame ai limiti di battuta e la stima con i file codificati. Nel footer, alla voce Privacy, il visitatore può scaricare in JSON le preferenze della home o cancellarle con conferma. Su un profilo temporaneo Chrome, la cancellazione ha preservato i progetti dello studio e il checkpoint del gioco. In un browser con archiviazione disabilitata è stato verificato il messaggio di errore anche in arabo.
