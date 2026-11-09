# Skoleuka – administrasjon av innsendte feilrapporter

## Formål

Administrasjonspanelet ligger på `https://www.skoleuka.no/admin/` etter produksjonsdeploy.
Ingen innsendte rapporter eller admin-token er innebygd i den offentlige HTML-en.
Foresatte bruker fortsatt `/api/report-issue` til å sende inn rapporter.

## Innlogging og tilgang

1. Logg inn med den eksisterende Supabase e-postkode-innloggingen.
   En eksisterende innlogging fra Skoleuka gjenbrukes.
2. `/api/admin-reports` validerer Bearer-token direkte via Supabase Auth
   (`/auth/v1/user`) på serveren ved **hver** forespørsel.
3. Brukerens bekreftede Supabase Auth-ID må samsvare med
   `FEEDBACK_ADMIN_USER_ID`, en hemmelig Netlify-miljøvariabel.
   Den må settes i **Production** med **Functions**-scope.
   Ved manglende/ugyldig verdi er panelet låst (503).
4. Andre innloggede foresatte får 403. Ugyldig/utløpt token får 401.
5. `FEEDBACK_ADMIN_TOKEN` brukes fortsatt kun til det eldre manuelle
   `/api/report-review`-endepunktet. Den skal ikke legges inn i en browser.

Finn den godkjente administratorens UUID under Supabase → Authentication → Users.
Ikke bruk e-postadresse eller Netlify-bruker-ID som verdi for `FEEDBACK_ADMIN_USER_ID`.
Ved flere administratorer må det etableres en egen godkjenningsmodell før brukere legges til.

## Funksjonalitet

- Rapporter fra de siste 7, 14 eller 30 dagene
- Filtrer på rapporttype, status og fritekst
- Vis originaltekst, feilbeskrivelse, skole/trinn/uke og original-PDF der lenken er godkjent
- Sett status til **Ny**, **Under arbeid** eller **Løst**
- Last ned JSON med rapportene i valgt periode og last opp til intern analyse

Originalrapporter er uforanderlige, lagret i det private Netlify Blobs-lageret
`ukeplan-feedback/reports/<dato>/<id>.json`. Administrative statuser lagres som
separate dokumenter `review/<dato>/<id>.json`. Panelvisningen har en
maksgrense på 300 rapporter per forespørsel, og svarene kan ikke caches.

## Sikkerhet og test

- Netlify beskytter `/admin/*` og `/api/admin-reports` med no-store, noindex,
  no-referrer og korrekt content-type.
- Administrasjonssiden har streng Content-Security-Policy.
- Frie rapporttekster vises med `textContent`, ikke `innerHTML`.
- PDF-lenker begrenses til godkjente skoleverter med HTTPS.
- Endringer av behandlingsstatus krever gyldig JWT, godkjent bruker,
  same-origin og at originalrapporten finnes.
- `npm test` kjører blant annet `tests/admin-reports.test.mjs`.

## Driftskontroll ved lansering

1. Kontroller at `FEEDBACK_ADMIN_USER_ID` er opprettet i Netlify Production
   og at en **ny produksjonsdeploy** er gjennomført etter endringen.
2. Bekreft at godkjent administrator kan åpne panelet etter innlogging.
3. Bekreft at en annen Supabase-konto får tilgang nektet (403).
4. Bekreft at rapportene listes, at statusendring lagres ved oppdatering,
   og at opprinnelig rapport ikke endres.
5. Bekreft at JSON-eksporten kan åpnes uten å inneholde admin-token.
6. Kontroller at eksisterende familieoversikt og offentlig feilrapportering
   fortsatt fungerer.
