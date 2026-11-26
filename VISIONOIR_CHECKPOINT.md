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

## Copertine di sistema, scultura a 360° e finitura negativa

La copertina ufficiale delle sei tracce usa il simbolo e il nome VISIONOIR in nero su bianco. Il player la fornisce in tre dimensioni e ogni MP3 include una copia da 512 pixel. La home include anche l’icona Apple da 180 pixel. In fase di verifica Chrome e WebKit su macOS hanno riprodotto i sei titoli e decodificato le immagini dei rispettivi metadati. Il contenuto audio decodificato coincide con quello delle tracce prive di copertina.

La scultura di The Creator compie un giro automatico in circa 18 secondi mentre è visibile, anche a musica ferma. Il comando di pausa, la preferenza di movimento ridotto e l'uscita dal campo visivo fermano la rotazione. Le 24 viste del modello coprono il giro sui dispositivi senza WebGL. Uno scuotimento intenzionale alterna il materiale del logo tra normale e negativo. Il logo del player musicale conserva i colori del marchio originale. Le superfici native di iOS e i sensori fisici richiedono verifica su dispositivo.

## FREQUENCY · Filtro 303, voci e ritorni effetti

Nel rack di Acid 303 si può regolare la durata dell’inviluppo del filtro indipendentemente dal volume. Il valore centrale riproduce il decadimento originale di 42 ms. Noir Lead offre una modalità monofonica con priorità all’ultima nota tenuta. Il passa-alto del Ride agisce sulla componente di rumore. Le sessioni precedenti conservano i valori timbrici di origine. Il bus Returns include nella stampa le tracce collegate direttamente e nei misuratori le code di delay e riverbero. La coda del sequencer riusa gli eventi delle note anche in presenza di accordi e ratchet.

Nel candidato i test hanno confrontato campioni PCM, ordine di 1.650 attacchi, progetti precedenti, patch, inviluppi e stampe per bus. I 100 controlli automatici sono passati. Le prestazioni prolungate sono attribuibili alla versione e alla configurazione effettivamente misurate.

## Scuotimento del dispositivo

Il gesto è attivo all’ingresso nella home e all’apertura del Chromatic Engine. Il primo scuotimento inverte il logo, il successivo lo ripristina. La home, la modalità immersiva e il proiettore presentano il logo senza etichette o comandi dedicati al gesto. La pagina usa esclusivamente i campioni resi disponibili dal browser. Dove serve l’autorizzazione generale ai sensori, nella home si trova nelle preferenze del footer.

## Verifica Search Console

La home include il meta tag di verifica della proprietà HTTPS con prefisso URL su GitHub Pages. Il tag è statico e leggibile anche senza JavaScript.

## Ripresa di un progetto e controllo dei rack

La libreria di FREQUENCY riapre il documento modificabile incluso negli ZIP esportati con MIDI o stem. La lettura verifica l'integrità del documento e carica soltanto la parte dell'archivio necessaria. Un file danneggiato lascia aperto il progetto in uso.

I preset del Visual Rack e le impostazioni visive delle scene viaggiano con il progetto. Il proiettore segue qualità e assegnazioni agli strumenti, anche quando il trasporto è fermo. La sezione Master del mixer apre gli inserti. Ogni slot può richiamare un preset di fabbrica. L'EQ parametrico offre frequenza, guadagno e Q indipendenti. Il Rumble dispone di un controllo dei bassi dopo la distorsione. I valori precedenti vengono conservati alla riapertura delle sessioni esistenti. I crediti editoriali del sito, del gioco e dello studio includono la direzione di Flavio Giorgio Guarini.

In una prova di quattro ore della precedente build `frequency-2d63855e8b3907`, il segnale Web Audio a 48 kHz è stato presente in tutti i 47.999 campionamenti effettuati su Chrome per macOS. La prova ha attraversato otto cambi scena. L'ascolto fisico e le versioni successive hanno collaudi distinti.

## Ritratto a sei finiture e misuratori del mixer

Quando WebGL è indisponibile, il ritratto metallico del creatore segue ciascuna delle sei tracce anche nella rotazione a 24 viste. Il caricamento riguarda la finitura scelta. Nel mixer, i sei bus misurano la somma stereo dopo il fader. Il silenzio o un canale privo di segnale danno una correlazione indefinita, indicata da «—». L’indicatore CLIP rileva anche i sovraccarichi nella dissolvenza fra due scene.

La [PR 17](https://github.com/visionoir-platform/visionoir-platform.github.io/pull/17) ha superato 114 test automatici. Sul sito pubblico è stato possibile impostare lo studio offline, scollegare la rete del browser, riaprire uno ZIP esportato, recuperare il salvataggio precedente dopo un guasto simulato e ricaricare il progetto. Il [formato nativo](frequency/FORMAT.md) descrive come conservare e leggere i progetti fuori dal sito.

## Primo ritmo e arrangiamenti di fabbrica

In **Guida e info** si può ascoltare la scena corrente, modificare i primi sedici passi del canale scelto, salvare una copia nella libreria e ritrovare lo stesso canale nel sequencer. Una prova a 360 px, in italiano e in arabo, ha verificato suono digitale, annulla/ripristina, focus della tastiera e riapertura della copia.

Le dodici sessioni di fabbrica aggiuntive hanno sequenze di sezioni, durate, organici e finali specifici. Ogni arrangiamento ha da 85 a 94 battute. Un test ricarica anche un progetto salvato con il precedente arrangiamento a otto scene e confronta i dati modificati dal musicista.

## Progetti portabili, sampler e transizioni visive

Il formato nativo FREQUENCY 2 raggruppa le pause della griglia. Il lettore apre progetti v1 e v2 e l'esportazione JSON v1 consente lo scambio con vecchie installazioni. Una copia di Furnace Ledger generata dalla prima versione dello studio è passata da 86.344 a 71.894 byte. La conversione di ritorno ha ripristinato tutti i byte originali. Su una scena a 48 kHz il confronto dei primi 48.000 frame stereo ha prodotto lo stesso PCM.

Pitch e Reverse del sampler possono agire su una nota già in esecuzione. In THE UNSEEN, la frase musicale regola insieme geometria, materiale, echi e palette. Nella scultura del creatore la disgregazione segue una piega continua della manica. La soglia condivisa dalla superficie e dai frammenti consente al metallo di ricomporsi quando il segnale scende.

## Comporre nel progetto e misurare il master

In Strumenti si possono generare un pattern o una scena nel brano aperto. Il generatore usa un seme riproducibile e include il genere Dark electro. Per disegnare e ascoltare un nuovo timbro nella sola traccia selezionata si apre Preset. Una modifica discreta, Annulla e l’apertura di un progetto avviano subito il salvataggio locale.

Nel mixer, «Misure del master» analizza il segnale stereo dopo il fader. La lettura momentanea usa 400 ms, quella a breve termine 3 secondi. Il massimo true peak usa ricostruzione a 4×. Sui segnali di riferimento provati a 44,1, 48 e 96 kHz lo scarto maggiore rispetto a FFmpeg è stato di 0,06 LU e 0,01 dBTP.

Dalla pagina dei diritti si raggiunge l’indice delle 19 informative incluse nella copia offline dello studio. Comprende le licenze dei caratteri, della triangolazione Earcut e del codificatore MP3.

Le sedici voci del Chromatic Engine pilotano risposte visive dedicate. Un attacco breve e il relativo rilascio vengono trasmessi anche se cadono fra due letture dei livelli. Rack e proiettore ricevono velocità e accenti delle note effettivamente suonate. Il test del sequencer comprende note escluse per probabilità, canali e bus silenziati e voci polifoniche.

## FREQUENCY offline e accesso al sequencer

In Impostazioni e nel controllo prima del live, lo studio verifica quali risorse sono nella copia offline. La riparazione richiede i soli file mancanti e controlla la firma SHA-256 di ogni risposta. I progetti salvati sono conservati separatamente. Se il browser segnala spazio insufficiente, lo studio lo indica prima del download.

La griglia del sequencer si raggiunge con Tab. Le frecce spostano il focus tra tracce e passi, Spazio modifica un passo e F2 apre i suoi parametri. Il materiale Acid del ritratto concentra la luce verde sulle pieghe della giacca.

## Gesti su iOS, profilo Instagram e sostegno

Su iOS, toccare il logo o entrare nella scena immersiva permette di concedere l’accesso al movimento. Uno scuotimento cambia il materiale del marchio, il successivo ripristina la finitura. Anche il marchio nella testata segue lo stato quando si scorre la pagina.

Il profilo Instagram si apre nella stessa scheda. Accanto al collegamento è possibile copiare il nome utente @visionoir_. La home, il gioco e FREQUENCY collegano direttamente al portale di sostegno nella lingua attiva. Il portale prepara una richiesta allo studio con importo facoltativo. I pagamenti online sono sospesi.

## FREQUENCY · Continuità del set e ritratto

Il trasporto conserva la posizione dei due deck durante la pausa e riprende dal campione successivo. Il filtro DJ ha il centro neutro e due direzioni di taglio. La scultura del creatore usa porzioni triangolari del modello statico originale per le scaglie della manica. La CI verifica il trasporto, i campioni audio e le superfici visibili nel rendering. La prova con i comandi fisici delle cuffie e con lo schermo bloccato resta da eseguire.

## FREQUENCY · Loop, proiezione ed esportazione

Da ogni vista della workstation si possono impostare la prima e l’ultima battuta del loop e annullare o ripetere una modifica durante il set. La finestra VJ apre un indirizzo nuovo con la lingua e l’uscita selezionate. Nel pannello Esporta i formati progetto e i due archivi ZIP segnalano che includono anche i campioni importati e i loro nomi di file. Per condividere le sole note è disponibile il MIDI.
