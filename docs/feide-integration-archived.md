# Feide-integrasjonen er arkivert (19.11.2026)

Den komplette Feide-implementasjonen, inkludert fungerende OIDC, barne-/foresattkobling, UI, funksjoner, dokumentasjon og tester, er bevart på [archive/feide-complete-2026-11-19](https://github.com/morronetlab/fagerholt/tree/archive/feide-complete-2026-11-19), commit `f8e2670c4a6f3dcd4df3c1dbfefda047fe3ce0a3`.

Aktiv `main` har ingen Feide-innlogging eller Feide-API-ruter. QR-invitasjon, barnas ukeplan, familieinnlogging, lekseprogresjon og gruppebasert filtrering er beholdt.

**Historiske databaseressurser:** To Feide-relaterte migrasjonsfiler under `supabase/migrations/` beholdes fordi de allerede er anvendt. Det unngår avvik mellom migrasjonshistorikken og databasen samt unødvendig sletting av tidligere koblingsdata. De gamle tabellene er RLS-beskyttet, og appen har ingen endepunkter som bruker dem. Produksjon har `FEIDE_ENABLED=false` i Netlify; innstillingene og hemmelige nøkler lagres ikke i Git.

**Hvis Feide senere gjeninnføres:** Opprett en ny PR fra oppdatert `main`, porter relevante komponenter fra arkivbranchen, revider OIDC/Feide-tillatelsene og databasekoblingen, og kjør full regresjonstesting av familie/QR. Ikke merge hele arkivbranchen blindt, da den også inneholder eldre versjoner av annen kode.
