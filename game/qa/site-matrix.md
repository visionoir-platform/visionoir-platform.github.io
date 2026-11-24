# VISIONOIR · sito e integrazione con il gioco

Collaudo del 24 novembre 2026 sul Mac di sviluppo, anteprima locale sulla porta 4197. I dettagli delle esecuzioni, inclusi i digest dei due fotogrammi della scena, sono in [site-evidence](site-evidence). La pubblicazione va controllata sul dominio con la procedura di release del progetto.

| Browser sul Mac | Scena della home | Interazione | Esito |
| --- | --- | --- | --- |
| Firefox Nightly 159.0, Playwright, headless | WebGL attivo, due fotogrammi diversi | Mouse, rotella, Acid tramite clic, pausa, Pack X | 19 lingue, zero errori JavaScript |
| Chrome 158.0.8127.38, Playwright, headless | WebGL attivo, due fotogrammi diversi | Come sopra, più gesto touch emulato in arabo | 19 lingue, zero errori JavaScript. Lo scroll nativo durante il gesto ha spostato la pagina di 481 CSS px |
| WebKit 27.2 su macOS, Playwright, headless | WebGL attivo, due fotogrammi diversi | Mouse, rotella, Acid tramite clic, pausa, Pack X | 19 lingue, zero errori JavaScript |
| LibreWolf 149.0-1, Gecko via Marionette | Apertura della pagina italiana | Controllo del titolo e conteggio dei sei servizi | Smoke test indipendente |

I tre controlli estesi hanno verificato che la scia si attivi, lasci passare gli eventi del puntatore e si spenga dopo il gesto. Il collegamento Instagram punta al profilo richiesto. Il pulsante della scheda Pack X preseleziona il servizio nel brief. Le pagine localizzate sono state provate alternando larghezze da 360 a 1920 CSS px. Durante la visita ordinaria il browser ha effettuato zero richieste verso il gioco. Per l’audio del sito è stata osservata la transizione del player in riproduzione e poi in pausa. Le verifiche non comprendono un ascolto attraverso altoparlanti fisici.

Firefox ha superato anche il percorso di `browser.cjs firefox` dalla parola nel footer alla selezione del personaggio e al gameplay, alle impostazioni in arabo, al cambio lingua, alla progressione temporale del Sound Test, alla libreria effetti e al salvataggio. Risultato di questa esecuzione: 19 lingue, zero errori di pagina, zero risposte locali mancanti. La cattura a 390 px documenta un viewport desktop ridotto.

## Dispositivi fisici e altri browser

Il controller USB del Mac ha elencato tre bus e un ricevitore USB. Non risultano telefoni o tablet collegati in tale inventario. L’istanza ADB avviata per l’enumerazione ha restituito una lista vuota. Il pacchetto Xcode installato non espone `devicectl`. Restano da effettuare i playtest su iPhone, iPad, Android, dispositivi Windows 11, browser interni delle app e controller fisici. La cattura di WebKit documenta l’engine desktop su macOS.

## Come ripetere

Eseguire `node game/qa/site-browser.cjs` con `BROWSER` uguale a firefox, chromium o webkit e `QA_URL` impostato all’anteprima desiderata. `PW_MODULE` può indicare un’installazione Playwright condivisa e `EXECUTABLE` il binario disponibile. `PROOF` sceglie la directory per i risultati. Per l’integrazione del gioco usare `node game/qa/browser.cjs firefox` con le variabili descritte in quel file. Su questo Mac, un percorso temporaneo vuoto in `CFFIXED_USER_HOME`, limitato al processo di test, ha consentito di avviare Firefox senza toccare i profili personali. L’errore riprodotto con il semplice profilo temporaneo era “Could not find profile folder.” [Segnalazione al progetto Playwright](https://github.com/microsoft/playwright/issues/42768)

## Glyph Instagram

La pagina di Meta indirizza al proprio Brand Resource Center per gli asset approvati. Il pacchetto è associato alla casella di accettazione delle linee guida e delle altre condizioni d’uso. Il percorso Brand Elements, verificato separatamente, reindirizzava al login. Le ricerche in Spotlight, nei download locali, nei materiali grafici e nel progetto non hanno individuato un pack riconducibile a Meta. La CTA testuale e il suo contenitore a rilievo sono operativi. Per aggiungere il glyph serve il file del pacchetto ufficiale ottenuto con accettazione delle condizioni da parte del titolare. [Risorse ufficiali Instagram](https://www.meta.com/brand/resources/instagram/instagram-brand/)
