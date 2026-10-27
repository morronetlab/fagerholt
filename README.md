# Ukeplanen – white-label prototype

Ukeplanen er et eget prototypeprosjekt for `morronetlab/fagerholt`. `morronetlab/skolesekken` er kun en referanse og endres ikke. Det er ikke opprettet noen Netlify-side. Prototypen er pushet til egen GitHub-gren for gjennomgang.

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
- Oppgaven «Frivillig oppdrag» vises når PDF-en inneholder et oppdrag. Dersom PDF-en bare inneholder et tema, kan klienten vise et **tydelig merket forslag fra Ukeplanen**, ikke en skolebeskjed.
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
- GitHub-push til prototypegren er godkjent. Opprettelse av Netlify-prosjekt og produksjonssetting krever egen beslutning.
