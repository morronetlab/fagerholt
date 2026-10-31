# Familiens ukeplan 2.0 – aktiviteter v1

## Omfang
- Aktiviteter på familieoversikten, mandag–søndag for den aktive skoleuken.
- Enkeltstående aktivitet eller **ukentlig gjentakelse**; valgfri sluttdato.
- Valgfritt barn (ett barn) eller hele familien; dato, tid, sted, ansvarlig og merknad.
- Opprett, rediger og slett. Endringer i en ukentlig aktivitet gjelder hele serien.
- Uten innlogging: kun lokal nettleserlagring (`ukeplanen.family.activities.v1`). Lokale aktiviteter overføres **ikke automatisk** til en familiekonto.
- Med innlogging: kun Supabase/PostgREST via foreldrenes JWT og RLS, delt for alle foresatte som har tilgang til **samme familie**.

## Status 31. oktober 2026 – rettelse for manglende tabell
- Det var bare **ett** tilkoblet Supabase-prosjekt (`ukeplanen`), ingen separat staging-database.
- PR #79 sin migrasjon ble kjørt via Supabase-migrasjonsverktøyet på dette prosjektet etter at feil om manglende `public.family_activities` ble rapportert. En ekstra `NOTIFY pgrst, 'reload schema'` er inkludert for Data API.
- Kontroll etter migrasjon: tabell finnes, RLS aktiv, 4 policyer, `anon` har ikke SELECT/INSERT, `authenticated` har nødvendige SELECT/INSERT/DELETE/kolonneoppdateringer, og kan **ikke** oppdatere `family_id`.
- Supabase sikkerhetsrådgiver ga ingen nye varsler for `family_activities`; øvrige varsler gjelder eksisterende, andre deler av databasen.
- Transaksjonelle autorisasjonstester med simulerte JWT-kontekster ble utført og rullet tilbake; ingen testaktiviteter er lagret. Det gjenstår å teste samhandling mellom **to faktiske ulike foreldre-/familiekontoer**.
- **PR er fortsatt draft, frontend ikke merget i main.** Bruk Netlify deploy-preview for ny test etter oppfriskning.
- Ved senere opprettelse av stagingmiljø: migrasjonen må gjøres der også; statusen her betyr ikke at staging ble verifisert.

## Databasen – bevisst deploy-rekkefølge
1. Kjør migrasjonen `supabase/migrations/20261031_family_activities_v1.sql` først i **staging/test** og kontroller migrasjonen manuelt.
2. Verifiser RLS med *to forskjellige* innloggede foresatte i samme familie samt en tredje bruker uten medlemskap:
   - Begge foresatte kan lese og redigere familiens aktiviteter.
   - En utenforstående får ingen rader, og forsøk på INSERT/UPDATE/DELETE avvises eller påvirker null rader.
   - Det skal ikke være mulig å sette `child_id` til et barn som tilhører en annen familie. Composite FK `(child_id,family_id)` gir dette ekstra vernet, også ved privilegerte kall.
   - Ikke-anonyme brukere med foreldrerolle kan opprette, mens anonyme ikke kan det.
   - Bare aktivitetenes redigerbare felt kan oppdateres; hverken `id`, `family_id` eller `created_by` kan endres fra klienten.
3. Kjør `get_advisors` for sikkerhet/ytelse, kontroller Data API-tillatelser.
4. Først etter godkjent stagingkontroll: apply migrasjonen i **produksjonsdatabasen**, deretter merge/deploy appen. Deploy ikke klienten mot en database uten tabellen.
5. Test én aktivitet og én ukentlig aktivitet på to kontoer i samme familie. Trykk **Oppdater** for å hente endringer gjort på en annen enhet.

## Kilde- og personvernhensyn
Aktiviteter legges inn manuelt av foresatt, og er **ikke** automatisk faktaverifisert mot skolens PDF. De står separat fra «Praktisk å huske». Appen sender aldri service-role-key til nettleseren. Den bruker eksisterende Supabase Auth med RLS og setter `family_id` basert på valgt familiekonto, aldri fra et fritt skjema. Brukeren kan bare velge barn fra familien.

## Begrensninger og videre arbeid
- Én aktivitet kan gjelde **ett barn eller hele familien**; flere utvalgte barn kan komme i neste versjon.
- Kun ukentlig/engangsgjentakelse. Unntak (avlyst enkeltforekomst), månedlige avtaler og individuelle forekomster er ikke bygget ennå.
- Datoer er lokale kalenderdager og klokkeslett er lokal tid i Norge. Tidsforflytning ved sommer-/vintertid påvirker ikke valgt ukedag.
- Ingen sanntidsabonnement; endringer fra andre foresatte hentes ved Oppdater, inngang til familieoversikten og når siden får fokus.
- Ingen automatisk import eller eksport til ekstern kalender i denne versjonen.
- Aktivitetene går ikke inn i søndagsoppsummeringen ennå.

## Verifisering
- `npm run check`: dato-/ukelogikk, gjentakelse, validering, PostgREST-anrop, og RLS-skjemakontrakt.
- `npm run test:browser`: mobilbredde, lokal CRUD, gjentakelse, lagring over reload, validering.
- Manuell kontroll: begge foresatte, familien med flere barn, innlogget/utlogget, ukeovergang, nyttår, og stor familievisning.
