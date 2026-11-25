# VISIONOIR · Registro pubblico di rilascio

## Candidato del 25 novembre 2026

La versione di riferimento prima di FREQUENCY è `27500a6f44e0d6deab0f8f97448bc5641946a9bf`. Il sito, il gioco e lo studio musicale hanno ingressi distinti. La parola «unseen.» nel footer apre il gioco. Tre attivazioni del logo di studio entro un secondo e mezzo aprono FREQUENCY.

Il candidato include il sequencer, gli strumenti, i preset visivi, i due modelli statici del ritratto, i cataloghi e i portali tradotti. Il portale di supporto presenta i contatti. I contributi monetari sono disattivati. Le licenze del codice, delle produzioni musicali e degli asset sono descritte in [COPYRIGHT.md](COPYRIGHT.md) e [ASSET_LICENSES.md](ASSET_LICENSES.md).

Il modulo mostra il riepilogo e il prezzo indicativo del pack. Pack X richiede una quotazione individuale. L’invio diretto viene abilitato impostando la variabile di distribuzione `VISIONOIR_CONTACT_ENDPOINT` sull’indirizzo del ricevitore pubblico dello studio. In assenza della configurazione la pagina espone la consegna manuale. Le credenziali e le richieste dei clienti restano nei sistemi privati dello studio.

## Verifica e ripristino

La pipeline ricostruisce le tracce del sito, controlla i cataloghi e le risorse audio, testa il punto di ripresa del gioco e pubblica la build statica. L’esito e il commit distribuito sono consultabili nel [registro dei rilasci](https://github.com/visionoir-platform/visionoir-platform.github.io/actions/workflows/pages.yml). Il collaudo su dispositivi fisici aggiuntivi è differito. Per ripristinare una versione usare un nuovo revert dei commit interessati e verificare la distribuzione risultante. Le procedure di compilazione e manutenzione sono nel [README](README.md).
