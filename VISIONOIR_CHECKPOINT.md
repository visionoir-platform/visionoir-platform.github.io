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
