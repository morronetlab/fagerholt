# Ukeplanen – white-label prototype

Ukeplanen er kildekodeprosjektet `morronetlab/fagerholt`, publisert på Netlify som `skolesekken.netlify.app`. `morronetlab/skolesekken` er kun en referanse og endres ikke. Større funksjoner utvikles i egne feature-grener og må gjennomgås før merge til `main`.

## Test forhåndsvisningen

Åpne `docs/forhandsvisning.html` direkte i en nettleser. Denne er helt selvstendig, har ingen API-kall og bruker **tydelig merkede, fiktive eksempeldata**. Her kan du teste klassevalg, dagvelger, avkrysning og kompakt oppdrag etter fullføring. Eksempeldata fra denne filen er ikke del av produksjonsappen.

## Lokal funksjonell test

1. Installer Node.js 20 eller nyere.
2. Kjør `npm install` fra prosjektmappen. `pdfjs-dist` kreves bare ved ekte PDF-lesing.
3. Kjør `npm test` for automatiserte tester.
4. Kjør `npx netlify dev` for lokal test med Netlify Functions og API-ruter (Netlify CLI kreves). Å starte lokal utviklingsserver oppretter ingen ny Netlify-side.
5. Åpne adressen fra Netlify CLI og velg ett trinn.

Merk at en ren statisk server kan vise klassevelgeren, men kan ikke levere `/api/plan` eller `/api/weather` uten serverfunksjonene.

## Oppsett for en annen skole

Oppdater **kun** `public/site-config.mjs` for skolens navn, farger, trinnsidene, lovlige kildeverter og koordinater. Serverfunksjonene importerer samme konfigurasjon. Kildesidene må være gyldige HTTPS-adresser. Bare aktuelle, offisielle PDF-lenker fra valgt trinnside hentes. Trinnet lagres i nettleseren under en nøkkel som inneholder `school.id`, og kan byttes med knappen **Bytt klassetrinn**.

Ingen personlig gruppe, aktiviteter, barnenavn eller sjåførrotasjoner er konfigurert. Eventuelle skolespesifikke regler må modelleres eksplisitt, ikke hardkodes inn i standardproduktet.

## Filoversikt

- `public/site-config.mjs`: skole, merkevare, trinnlenker og funksjonsflagg
- `public/app.js`: nettleserapplikasjon (velger trinn før noen API-kall)
- `public/shared/`: modulene som både klienten og serveren bruker
- `lib/plan-core.mjs`: ekstrahering fra PDF-tekst og geometriske dagstabeller
- `lib/weather-core.mjs`: sammenfatning av MET-varsel for 08–15
- `netlify/functions/plan.mjs`: API som bare henter gjeldende PDF for valgt trinn
- `netlify/functions/weather.mjs`: MET-vær-API med mellomlagring
- `tests/`: isolerte Node-tester uten live-nettverk
- `docs/forhandsvisning.html`: interaktiv offline-prototype med eksempeldata

## Kvalitet og kjente begrensninger

- Automatisk PDF-tolkning er heuristisk: tabeller og overskrifter varierer mellom klassetrinn. Manglende eller uleselige planer gir ærlig status; innhold fylles aldri fra eksempeldata.
- Oppgaven «Frivillig oppdrag» vises når PDF-en inneholder et oppdrag. Det opprettes ikke fiktive oppdrag, temaer eller lekser.
- Ikke alle klassetrinn publiserer ny ukeplan i tide. Systemet viser ikke en eldre PDF som om den gjaldt aktuell uke.
- Avkrysning lagres lokalt per skole, klassetrinn og ISO-uke. Den sendes ikke til serveren.
- Testene bruker mockede HTML-/PDF-data; de beviser **ikke** at PDF-uttrekk fungerer for alle sju publiserte PDF-formater.
- PDF-avhengigheten kan ikke installeres i dette offline-miljøet. Installer og kjør Netlify-funksjonene i et miljø med npm-tilgang før lansering.
- Visuell gjennomgang på telefon/nettbrett og faktisk Netlify-build gjenstår.

## Før produksjon

- Verifiser klassevalg, localStorage og reset på flere enheter.
- Test faktisk publiserte PDF-er for alle sju trinn, særlig andre oppsett enn vanlige uketabeller, og sjekk alle felter mot originalen.
- Kontroller PDF-nedlasting og MET-kontrakten på lokal Netlify CLI / deploy preview.
- Test mobil, nettbrett, desktop, tilgjengelighet og state ved natt-/ukeskifte.
- Bekreft at bare `public/` publiseres og at `docs/forhandsvisning.html` **ikke** serveres fra produksjonskatalogen.
- Netlify-deploy og sammenslåing til `main` skal ikke skje uten egen beslutning.

## Oppdatering v0.2 – 27. oktober 2026

Designet er oppdatert i `public/original-look.css` for å følge formspråket fra
originale Skolesekken 3.x: lys grønn spotlight, kompakt værkort, samlet dagvelger,
tydelig dagsprogram, mintgrønn pakkeliste og gul temaseksjon.

PDF-parseren er utvidet med disse strukturelle variantene:

- Fem parallelle dagskolonner, som i enkelte ukeplaner for småskolen.
- Tre kolonner: **Dag / På skolen / I lekse** (observasjon fra Fagerholt 5. trinns ukeplan uke 46).
- Vertikale dagsblokker med `Mandag på skolen` / `Hjemmelekse mandag`.
- Lekseskjema med ukedager som kolonner (`Ukas utfordringer` / `Lekser til`).
- Pakkeliste ut fra **eksplisitte** PDF-instruksjoner (`Ta med`, `Husk gymtøy`, `Husk innesko`), ikke fra antatt utstyr ut fra fag.

Testgrunnlag: 17 automatiserte tester, inkludert syntetiske koordinatfiksturer som
gjenskaper de ulike PDF-tabellene. Dette er **ikke** en garanti for alle publiserte PDF-er.
Kontroll av faktiske PDF-filer er nødvendig før produksjonssetting.
Ved gjennomgang 27.10.2026 var den tilgjengelige 4.-trinns-PDF-en fra uke 25
ikke mulig å åpne (404), 5. trinns tidligere PDF for uke 46 kunne inspiseres
som indeksert PDF-tekst, og den tilgjengelige 6.-trinnssiden viste ingen
ukeplan-PDF. Ingen av disse brukes som live-data i appen.


## Oppdatering v0.3 – kategorisering og 4.–6. trinn

- Frister som `Til torsdag:` vises aldri alene som en lekse. Etterfølgende oppgavetekst kobles til fristen der teksten kan leses.
- Innhold fanget under `Læringsmål` fordeles mer presist: reelle kompetansemål beholdes, lesing/oppgaver går til lekser, utstyrsinstruksjoner til pakkeliste, og praktiske beskjeder til beskjeder/dag.
- Dagsmeldinger som `Onsdag: ...` eller `Tirsdag – ...` flyttes til riktig dagsprogram. Ukespesifikke fag listes i et eget panel, ikke som «Ukas tema».
- Utvidet støtte for 5. trinns `Dag / På skolen / I lekse`, inkludert en defensiv reserveparser for fragmenterte PDF-overskrifter.
- Leksematriser med `Til tirsdag`/`Til torsdag` støttes også uten tittelen `Ukas utfordringer`, samtidig som ordinære ukedagstabeller ikke blir tolket som lekser.
- 24 isolerte automatiske Node-tester, deriblant nye regresjonstester for problemene i 4.–6. trinn.

**Datagrunnlag/begrensning:** Tilgjengelig nettindeksert Fagerholt-ukeplan for 5. trinn (uke 46, eldre) er brukt som formatreferanse. PDF for 4. trinn (uke 25) var ikke tilgjengelig (HTTP 404), og den tilgjengelige 6.-trinnssiden manglet ukeplan-PDF. Testene bruker derfor representative PDF-tekstkoordinater, ikke komplette faktiske PDF-er for disse trinnene. Før produksjon må resultater fra nåværende PDF-er verifiseres manuelt mot originalene.

## Uke 44: direkte kildelenker for 4. og 6. trinn (rapportert 27. oktober 2026)

De følgende filnavnene er kun **regresjonstestdata**, ikke produksjonskonfigurasjon.
Appen oppdager fortsatt PDF fra riktig trinnside basert på aktuell ISO-uke.

- 4. trinn: `https://www.minskole.no/fagerholt/seksjon/22637` — «Ukeplan uke 44», eksempel-PDF med filnavnet `854-fagerholt-Ukeplan-uke-44-93c849fa-ad01.pdf`.
- 6. trinn: `https://www.minskole.no/fagerholt/seksjon/22639` — «Ukeplan uke 44, 6. trinn», eksempel-PDF med filnavnet `854-fagerholt-_Ukeplan-uke-44-c435a642-e540.pdf`.

`tests/week44-official-links.test.mjs` kontrollerer kildevalg, eksakte URL-varianter, avvisning av eldre uker og at en PDF uten tekstlag ikke presenteres som en korrekt tolket plan. `allowedSourceHosts` inkluderer nå begge offisielle MinSkole-domenene, `minskole.no` og `minskule.no`. Store PDF-er får lengre HTTP-/klient-timeout.

**Gjenstår:** Direkte nedlasting av disse to PDF-ene var ikke tilgjengelig i arbeidsmiljøet. Derfor er **innholdet i uke-44-dokumentene ennå ikke verifisert**; verken dagsprogram, lekser, beskjeder eller pakkeliste kan erklæres korrekt ut fra URL-tester alene. Hvis PDF-ene er tilgjengelige lokalt, kjør f.eks. `npm install && node scripts/inspect-pdf.mjs 4 /path/uke44.pdf 44 2026`, og sammenlign JSON-feltene med den visuelle original-PDF-en. Dersom dokumentet er skannet uten tekstlag, må OCR vurderes før innhold kan trekkes ut.

## PDF-tilpasninger – dagsprogram, leksefrister og pakkeliste

- Tekst som visuelt fortsetter på en ny linje i en dagskolonne, samles til én aktivitet basert på PDF-koordinater. Nye fagoverskrifter og klokkeslett starter egne rader.
- For 4. trinn grupperes lekser under PDF-ens faktiske **Til mandag/tirsdag/onsdag/torsdag/fredag**-frister; hvert trinn og hver uke er fortsatt dynamisk.
- Pakkelisten hentes fra den valgte PDF-en. Eksplisitte instruksjoner beholdes, og generelle aktivitetsutledninger (f.eks. badetøy og håndkle ved oppført svømming) merkes som **forslag**. Dato, aktivitet og utstyr er aldri hardkodet for en bestemt uke. Gruppebegrensede og negert formulerte instruksjoner får ikke generelle pakkeforslag.
- Regresjonstester i `tests/wrapping-deadlines-and-gear.test.mjs` bruker representative tekstkoordinater, **ikke reelle PDF-filer**. Kilden `minskole.no` har ikke vært direkte tilgjengelig for nedlasting og fullstendig visuell verifisering her. Faktiske PDF-er må kontrolleres før produksjonssetting.

## AI-basert PDF-tolking (v0.5, krever konfigurasjon)

AI er nå primær parser **når Netlify-miljøvariablene er konfigurert**. PDF-en sendes med sidebilder og tekst til OpenAI Responses API (`gpt-4.1-mini` som standard), med strengt JSON-skjema. JSON valideres, filtreres etter kildehenvisninger og mappes til samme API-format som frontend allerede bruker. For 4. trinn samles lekser etter frist; dagsprogram, beskjed, fagoversikt, læringsmål og pakkeliste har separate kategorier. Foreslått utstyr fra aktiviteter merkes tydelig. Opplysninger uten kildeside/sitat forkastes.

### Miljøvariabler (kun server/runtime i Netlify)

- `OPENAI_API_KEY`: hemmelig OpenAI API-nøkkel; må aldri ligge i GitHub, `public/` eller klientkoden.
- `AI_JOB_SECRET`: egen tilfeldig hemmelighet med minst 24 tegn, brukt til å signere bakgrunnsjobber. Lag f.eks. med `openssl rand -hex 32`. Del den aldri med frontend.
- `OPENAI_MODEL` (valgfri): støttet multimodal modell, standard `gpt-4.1-mini`.
- `AI_BLOBS_REGION` (valgfri): Netlify Blobs-region; standard `eu-central-1` (må være identisk for alle deploys som deler cache).

### Kjøring

1. `/api/plan?grade=4` finner aktuell PDF på den offisielle trinnsiden, laster den ned og lager SHA-256 av innholdet.
2. Dersom ferdig AI-resultat for **PDF-hash + klassetrinn + ISO-uke + modell + skjemaversjon** finnes i Netlify Blobs, returneres dette straks.
3. Ved cache-miss startes `netlify/functions/ai-plan-background.mjs` via en server-signert intern POST. API-et svarer med regelbasert PDF-tolking mens bakgrunnsjobben kjører. Frontend prøver igjen hvert 15. sekund (maks åtte ganger), uten nye AI-kall for samme aktive lås.
4. Bakgrunnsjobben laster ned og verifiserer den **samme** PDF-en (hash), kjører Responses API, validerer og lagrer ferdig JSON i site-wide Netlify Blobs. Ingen PDF-fil eller API-nøkkel legges i blob-lageret.
5. Hvis API-nøkkel eller bakgrunnslager ikke er konfigurert, fortsetter dagens regelbaserte parser å virke. AI-feil har 5 minutters kjølepause før nytt forsøk.

**Viktig ved første deploy:** Sett begge hemmelighetene i Netlify miljøvariabler for Functions, og deploy så med en Netlify Background Function. Ingen OpenAI-nøkkel er satt av denne kodeendringen. Ingen faktisk AI-analyse er gjennomført under utvikling; vi bruker mockede API-svar i tester. Det er derfor nødvendig å kvalitetssikre et par reelle ukeplan-PDF-er mot originalen i deploy preview. Dersom offisielle PDF-er inneholder personopplysninger, vurder personvern og leverandøravtale før de sendes til tredjepart. Responses-kallet bruker `store:false`, men dette alene innebærer ikke at ingen API-logger oppbevares.

### Funksjons- og lagringskostnader

Kun én AI-analyse skal normalt utføres per unik PDF-versjon. Den samme PDF-en gjenbrukes fra Netlify Blobs, men selve skolesiden/PDF-en blir fortsatt kontrollert ved en ny API-forespørsel for å oppdage kildeendringer. Kildesitat og sidereferanse ligger i den interne normaliseringen; UI viser bare kategoriserte elev-/foreldreopplysninger. Den gamle parseren beholdes som reserve og brukes mens analysen pågår.

## Hotfix v0.6 – OpenAI-filopplasting og feilhåndtering (28. oktober 2026)

- Feilen `Invalid file data: input[1].content[1].file_data` ved direkte Base64-PDF er håndtert ved å laste opp PDF via OpenAI Files API (`purpose=user_data`) og sende `file_id` til Responses API. Midlertidige OpenAI-filer forsøkes slettet umiddelbart etter analyse (også ved feil). Kontroller OpenAI File Storage ved eventuelle oppryddingsfeil.
- Background-analyse med feil registrerer et fem minutters retry-vindu i Netlify Blobs; `/api/plan` returnerer `aiStatus: failed` istedenfor evig `processing`, og viser regelbaserte data så langt de kan tolkes.
- API-nøkkel forblir bare på serversiden. Det kreves ingen nye miljøvariabler i Netlify.
- Enhets-/integrasjonstester med simulert OpenAI Files + Responses API er ikke en live-test med reelle PDF-er. Kontroller bakgrunnslogger og `aiStatus: ready` etter deploy.


## v0.6 – Alle kommunale barneskoler i Kristiansand

Kommunens offisielle oversikt (https://www.kristiansand.kommune.no/navigasjon/barnehage-og-skole/skole-og-sfo/grunnskole/) gir **26 barneskoler og 4 kombinerte 1.–10.-skoler**. Disse 30 er registrert med faktiske MinSkole-forsider i `public/site-config.mjs`. Ungdomsskoler uten barnetrinn, privatskoler og Kristiansand International School inngår ikke i kommunens barneskoleliste.

### Brukerflyt

1. Første visning viser **søkbar skoleliste**. Velg skole.
2. `/api/grades?school=<id>` oppdager skolens offisielle trinnsider fra navigasjonen på MinSkole. Om skolen ikke viser lenkene på forsiden brukes `/nettstedskart` som reserve. Ingen URL-er til seksjons-ID-er gjettes.
3. Trinnvelgeren viser bare publiserte lenker. Skoler som deler et trinn i flere egne klasser, f.eks. Sjøstrand 3A/3B, viser disse som separate valg i trinnvelgeren. Velg trinn/gruppe.
4. `/api/plan?school=<id>&grade=<code>` henter valgt trinns PDF for aktuell uke og gjenbruker AI-basert PDF-tolking. Eldre klienter med kun `?grade=4` fortsetter å bruke Fagerholt for kompatibilitet.
5. Skole-ID lagres som `ukeplanen.selectedSchool` og trinn lagres i `ukeplanen.grade.<schoolId>`. Avkrysning og AI-cache har også skole-ID, så data fra forskjellige skoler ikke blandes. **Bytt skole** og **Bytt klassetrinn** i toppmenyen.

### Sikkerhet, kildebegrensninger og drift

- API aksepterer bare skole-ID-er i konfigurasjonen, og bare trinnsider med `/skoleslug/seksjon/<id>` under den valgte skolens egen adresse og offisielle MinSkole-domener. PDF-lenker kan bare komme fra den valgte trinnsiden. Ingen vilkårlig HTTP-adresse fra klienten hentes.
- AI-bakgrunnsjobber er signert; mottakeren verifiserer skole-ID, klassetrinn og kildeside. SHA-256 cache-nøkkelen inneholder **skole-ID, trinn, uke og PDF-hash**. Gamle Fagerholt-only lenker og mellomlagrede AI-resultater støttes.
- Vær vises ved Fagerholt når de tidligere konfigurerte koordinatene brukes. For andre skoler er det foreløpig et **merket områdevarsel for Kristiansand**, ikke påstått vær nøyaktig ved skolen. Skolespesifikke koordinater kan legges inn etter verifisering.
- Skoler kan ha egne publiseringsmåter (ukeplan, ukebrev, separate klasseplaner) og enkelte publiserer ikke PDF for inneværende uke. Appen viser da en ærlig melding og lenke til skolen, aldri PDF fra en annen skole eller en eldre uke.
- 61 lokale Node-tester dekker kildeoppslag, A/B-klasser, uavhengig cache, gammelt Fagerholt-API, kildevalidering og eksisterende PDF/AI-regresjoner. **Ikke alle 30 skolers live PDF-er er verifisert**. Før produksjon: test en håndfull ulike skoler og grupper i Netlify Deploy Preview, samt mobilvisning, OpenAI-tilgang og faktisk publisert dokument.
- Denne oppdateringen introduserer `/api/grades` og endrer `/api/plan`, `/api/weather` og den signerte bakgrunnsfunksjonen. Deploy alle samtidig, aldri delvis.


## v0.7 – tydelig analyse- og ingen-PDF-visning

- Når serveren returnerer `aiStatus: processing`, viser forsiden en synlig grønn statusbrikke **«AI analyserer · foreløpig ukeplan»** med roterende indikator og et eget animert statuskort. Kortet sier at AI sorterer dagsprogram, lekser, pakkeliste og beskjeder, og at den regelbaserte visningen foreløpig kan være ufullstendig. Brukeren kan trykke **Sjekk AI-status** uten å bytte side. Animasjon reduseres når brukeren har valgt redusert bevegelse.
- Ved `unpublished`, `unavailable`, `unreadable` eller hentefeil får brukeren et tydelig resultatkort med **Åpne skolens nettside**, eventuell trinnside/original-PDF og **Prøv igjen**. Tomme ukeplan- og pakkekort skjules så de ikke framstår som fullstendige. Manglende PDF og nettverksfeil beskrives forskjellig.
- Dersom en skole ikke tilbyr oppdagbare trinnsider, vises en egen videre-handling til skolens hjemmeside allerede ved trinnvalget. Utgående lenker kommer fra skolekonfigurasjonen eller serverens kilde-URL, og åpnes sikkert i ny fane.
- 69 automatiserte Node-tester, inkludert egen ren tilstandsmodell og UI-regresjonstester. CSS/layout kontrollert med statisk Chromium-rendering ved 390px/1440px uten horisontal scroll. Kjøring av appens fulle lokale HTTP-flyt var blokkert av nettlesermiljøet; test ekte Netlify Deploy Preview før merge.

## v0.8 – Illustrasjoner og kompaktnotiser
- AI returnerer `specialContent` for konkrete spesialelementer (eksempel: «Lunde på linja» og «Kunnskapshjørnet») med kilde, sidenummer og flagg for ekte illustrasjon. Ingen spesialelementer -> ingen ekstra seksjon.
- Klienten viser original-PDF-siden for visuelle elementer med PDF.js fra samme origin. `/api/pdf-preview` er en sikret proxy som kun henter valgt skoles PDF for inneværende uke; den tar **aldri** en fritt angitt PDF-URL. Hvis rendering feiler, vises lenken til PDF.
- AI spørres eksplisitt om dokumentet er komplett. Antall ukedager alene avgjør ikke status, slik at en fagorganisert plan kan markeres komplett.
- Delvis status vises som en liten informasjonslinje uten å skyve ukeplanen langt ned.
- `AI_SCHEMA_VERSION=3` gjør at tidligere lagret innhold tolkes på nytt. Netlify build kjører `scripts/prepare-pdf-viewer.mjs` etter testene for å publisere PDF.js.
- Original-PDF-er fra skolene kunne ikke lastes ned i utviklingsmiljøet; innhold og bildebokser må kvalitetssikres i Netlify.

## v0.9: Separate PDF illustration crops (Presteheia/Lunde)
SpecialContent now includes validated per-item `visualRegion` (0–1000 top-left PDF coordinates). The browser renders only the region with a PDF.js canvas offset, rather than the full original page for every item. Overlapping/duplicate crops are de-duplicated while text and original-PDF links remain. Full-page and uncertain boxes are suppressed; the model must return distinct, tight crops. AI schema bumped to v4, so previously cached full-page visual references are regenerated. Tests cover separate Presteheia themes, Lunde's «Lunde på linja» and «Grublis», invalid crops and PDF.js transform geometry. **Original PDFs could not be downloaded in this environment; exact crop content must be checked in the Deploy Preview.**


## v0.10 – Gruppevarsler, tryggere originalbilder og lekseprogresjon
- AI-analysen markerer hvert kildebelagt element med `group` (for eksempel 5A, 5B, Rød gruppe eller Grønn gruppe) for aktiviteter, pakkelister, lekser, beskjeder, læringsmål og spesialstoff. Ingen gruppe skal utledes når det ikke finnes eksplisitt kildebelegg for akkurat opplysningen. Sitat og gruppe kontrolleres på server.
- Tydelige, fargekodede gruppemerker vises ved de aktuelle elementene. Utstyr med samme navn for ulike grupper dedupliseres ikke feilaktig.
- Bildeutsnitt har ekstra margin. Ved behov kan leseren åpne hele original-PDF-siden *i samme kort* via knappen «Vis hele PDF-siden», uten risiko for å miste bortklippet informasjon. Duplikatkontrollen er beholdt.
- Lekser og oppgaver har nå en 0–100 % fremdriftslinje, stjerner og vennlige meldinger. Oppdateres umiddelbart når lekser krysses av, og bruker eksisterende per-skole/per-trinn/per-uke lokal lagring. Ingen konto eller serverlagring.
- AI-cache-skjema oppgradert til v5, slik at gruppeinformasjonen reanalyseres på originale PDF-er. Dette medfører nye AI-kall for tidligere hurtiglagrede dokumenter.
- Regresjonstester dekker grupper ved svømming/oppmøte, overlappende pakkeutstyr, gruppebevis, fullsidebilde og lekseprogresjon. Faktiske PDF-illustrasjoner bør kontrolleres visuelt i Deploy Preview: dette kan ikke verifiseres sikkert mot eksterne MinSkole-PDF-er fra utviklingsmiljøet.
