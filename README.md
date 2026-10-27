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

## Oppdatering: tekstlinjer, leksefrister og pakkeliste

Dagskolonner gjenforener tekst som fortsetter på neste PDF-linje når koordinatene viser at teksten tilhører samme aktivitet. For 4. trinn grupperes lekser per faktisk «Til ...»-frist. Utstyr utledes fra den valgte PDF-ens innhold; eventuelle generelle forslag, f.eks. ved svømming, merkes som forslag. Ingen aktiviteter er hardkodet til bestemte datoer. Gruppebegrensede eller negert formulerte beskjeder gir ikke generelle påminnelser.

**Begrensning:** De automatiserte testene bruker representative PDF-tekstkoordinater. Aktuelle PDF-er fra MinSkole kunne ikke lastes ned direkte for fullstendig visuell kontroll i denne kjøringen. Validering mot original-PDF-ene kreves før produksjon.
