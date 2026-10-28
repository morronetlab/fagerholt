# Ukeplanen – white-label prototype

Ukeplanen er et eget prototypeprosjekt for `morronetlab/fagerholt`. `morronetlab/skolesekken` er kun en referanse og endres ikke. Endringer utvikles i GitHub-grenen `prototype/ukeplanen-white-label`; ingen Netlify-side er opprettet.

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
