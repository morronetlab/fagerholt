# Ukeplanen 2.1 – Familiekontoer, fase 1

**Status:** Dette er kode og en SQL-migrasjon til PR. Kontoer er ikke aktivert før Supabase er konfigurert. Ukeplanen uten konto er fortsatt tilgjengelig.

## Fase 1-funksjoner
- Foreldrekonto med e-post og engangskode (OTP), ingen passord.
- Opprett familie og barneprofiler, og bytt mellom ulike familier.
- Flere foreldre kan se samme familie via tidsbegrenset, e-postbundet engangsinvitasjon.
- Felles lekseavkrysning på tvers av enheter; progresjon er isolert per barn, skole, klasse, uke og år.
- Valgfri, eksplisitt import av lokale barneprofiler og fullførte lekser fra inneværende uke, uten å slette lokale data.
- Ingen konto er nødvendig for å bruke den opprinnelige Ukeplanen.

**Ikke med ennå:** barneinnlogging/QR, synkronisering av øveord, eldre uker, sanntidsabonnement eller automatisk overføring av profiler uten samtykke.

## Aktiver i et testmiljø
1. Opprett et eget Supabase-prosjekt i ønsket EU-region. Sjekk avtale og behandlingsgrunnlag for personopplysninger.
2. Gjennomgå og kjør SQL-migrasjonen i supabase/migrations/20261029_family_accounts.sql i Supabase SQL Editor. Ta backup før migrasjon på eksisterende database.
3. Slå på Email OTP i Supabase Auth. E-postmalen må inneholde Token-template-variabelen (Supabase {{ .Token }}), ikke bare magisk lenke.
4. Konfigurer SMTP, rate limits, Site URL og godkjente redirect URLs (spesifikt for test og produksjon).
5. Sett Netlify-miljøvariabler SUPABASE_URL og SUPABASE_PUBLISHABLE_KEY på test-/preview-området. Bruk kun publishable/anon-nøkkel, ALDRI service_role.
6. Redeploy; sjekk at /api/account-config bare viser publiserbar URL/nøkkel. Kontoskjerm blir tilgjengelig.
7. Test OTP-innlogging, familie-opprettelse, barneprofiler, to foreldre, import og synkronisering mellom to nettlesere. Ingen produksjonsutrulling før resultatene er gjennomgått.

## Sikkerhets- og personvernkrav (før ekte data)
- Test database-RLS med to separate testkontoer/familier: familie A må ikke kunne lese, endre, invitere eller slette data fra familie B.
- Test at direkte REST-innsetting av family_members og lesing av invitasjonstoken-hash feiler.
- Test at invitasjon ikke kan brukes av annen e-post, ikke kan brukes to ganger, og ikke kan brukes etter 48 timer.
- Test at endringer i child_id/family_id i API-forespørsler ikke kan brukes til å påvirke annen familie.
- Verifiser at to barn i samme klasse får ulik fremdrift, også når PDF-oppgaver skifter sortering.
- Vurder personvernkonsekvensvurdering, lagringsperiode, databehandleravtale, slettemekanisme og foresattkontroll før registrering av ekte barn.
- For barneinnlogging må det implementeres egen enhetstilgang med foreldreautorisasjon og egne, begrensede RLS-rettigheter i fase 2.

## Designvalg
- Netlify for offentlig ukeplan/PDF; Supabase Auth for foreldrekonto og PostgreSQL med RLS for familiens private data.
- Ingen egen service_role-nøkkel eller skjult databasepassord i frontend.
- Offentlig konfigurasjon leveres av serverfunksjonen account-config og er deaktivert uten to eksplisitte miljøvariabler.
- Familieprofilene i lokal nettleser beholdes som selvstendig modus ved utlogging.
- Import er begrenset til inneværende uke fordi eldre PDF-kilder ikke nødvendigvis er tilgjengelige. Lokalt arkiv bevares.
- Lekse-ID i sky er basert på kildebasert oppgavetekst og tidsperiode, ikke posisjonen i PDF-listen.

## Teststatus
GitHub Actions kan teste mockede REST-forespørsler og kildekode uten Supabase-legitimasjon. Dette er ikke det samme som å validere sikkerheten i en ekte Supabase-database. Database/RLS/SMTP må testes i tilkoblet prosjekt før produksjonssetting.
