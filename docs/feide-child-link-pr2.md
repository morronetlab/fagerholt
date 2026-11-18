# Feide PR 2 – sikker kobling til eksisterende barneprofiler

**Status:** Utvikling pågår. Stablet oppå [PR #169](https://github.com/morronetlab/fagerholt/pull/169). Ikke produksjonsklar.

**GitHub PR-base:** `main` brukes midlertidig for automatisk Netlify Deploy Preview #170. Grenen inneholder fortsatt alle endringer fra PR #169; ikke merge #170 før #169 er gjennomgått og merget. Når #169 er merget, vil GitHub-diffen for #170 bli redusert til PR2-endringene.

## Sikkerhetsmodell
1. Foresatt må være logget inn i Supabase og ha tilgang til barnet via **eksisterende children-RLS**, verifisert på server ved hver handling.
2. Foresatt starter en engangsinvitasjon (tilfeldig 256-bit token, 10 minutter, SHA-256 hash lagres).
3. Barnet bruker Feide Authorization Code + PKCE på serveren (fra PR #169); verifisert `iss + sub` tilknyttes kun forespørselen, ikke barnet.
4. Barnet får en tilfeldig 6-sifret bekreftelseskode på egen enhet. Foresatt må taste denne og uttrykkelig godkjenne i sin innloggede familiekonto.
5. Først da registreres Feide-koblingen. Ingen automatisk matching på navn, e-post, skole eller klassetrinn.
6. Unike aktive koblinger på både `child_id` og pseudonymisert Feide-subjekt. Alle nye tabeller er server-only og har RLS uten grant til klientroller.
7. Slett/trekk tilbake kobling må kreve samme verifiserte foresatt-RLS.
8. **Ingen Feide-autentisert tilgang til ukeplan/lekser før separat tilgangsmodell og logout-integrasjon er ferdig kontrollert.** QR-pålogging forblir uendret.

## Status før implementasjon
- Supabase prosjekt `ukeplanen` er i bruk i produksjon – **ikke kjør ny migrasjon på prod** før isolert verifikasjon og godkjenning.
- Feide RP-Initiated Logout er testet i PR #169 med testbruker, men det er fortsatt en isolert test.
- PR 2 bruker eget Netlify Deploy Preview og må registrere egne eksakte Feide callback/logout URI-er; aldri åpne nye familiedata uten server-side autorisering.

## Akseptansekriterier
- [ ] To ulike familier kan ikke lese, koble eller godkjenne hverandres barn.
- [ ] Uautorisert forespørsel, utløpt token, gjenbruk, feil kode, feil Feide-sub eller feil CSRF-origin avvises.
- [ ] Brukeren må fysisk hente bekreftelseskoden fra elevens enhet og selv godkjenne koblingen.
- [ ] Feide-kobling gis ingen direkte Supabase- eller QR-tokens.
- [ ] Foresatt kan trekke tilbake koblingen.
- [ ] Tester og CI er grønne. Ingen merge til produksjon.

## Implementert i første PR 2-iterasjon
- `lib/feide-child-link.mjs` og Netlify `/api/feide-child-link` (kun forhåndsvisning #170).
- Foresatt-side `/barn/feide/foresatt/` (må være innlogget i familiens eksisterende Supabase-konto i samme preview). Lenke finnes også kun i QR-dialogen på PR170.
- Elev-side `/barn/feide/koble/` for Feide-testinnlogging og sekssifret engangskode. Alle token/ID-token-behandlinger skjer server-side.
- `supabase/migrations/20261118094522_feide_child_link_preview.sql` med to server-only RLS-tabeller. **Kun commit i GitHub, IKKE kjørt i Supabase.**
- Positiv og negativ enhetstest for invitasjon, RLS, engangskode, tilbakekalling og preview-kontroll.

**Ingen Feide-login gir tilgang til ukeplanen i denne PR.** Dette er bare bekreftet kontokobling til eksisterende barneprofil. Den faktiske elevsesjonen, lekse- og aktivitets-API, SLO-invalidering og iOS/PWA-regresjonstester kommer etter at koblingsflyten er validert.

### Eksterne steg før manuell ende-til-ende-test
1. **Opprett isolert Supabase-testprosjekt/branch**, eller godkjenn særskilt et migreringsmiljø som ikke berører produksjonsdata. Ikke bruk produksjonsdatabasen til denne første testen. Kjør/skjematest kun den nye migrasjonen i dette testmiljøet, og kontroller at `anon`/`authenticated` har null grants til de to tabellene.
2. Knytt Netlify Deploy Preview #170 til passende Supabase-testprosjekt (Functions-miljøvariabler `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY` må ha samme prosjekt og aldri eksponeres i frontend). Sett i tillegg `FEIDE_LINK_TEST_SUPABASE_REF` til **testprosjektets** 20-tegns prosjekt-ID, aldri produksjons-ID. Serverfunksjonen avviser eksplisitt `ukeplanen` sitt produksjonsprosjekt og alle uverifiserte konfigurasjoner.
3. Under Skoleukas Feide OIDC-konfigurasjon, legg til **to eksakte PR #170-URL-er**:
   - Login callback: `https://deploy-preview-170--ukeplanen.netlify.app/api/feide-oidc/callback`
   - Logout callback: `https://deploy-preview-170--ukeplanen.netlify.app/api/feide-oidc/complete`
4. Sørg for at `FEIDE_POC_ENABLED`, `FEIDE_POC_CLIENT_ID`, `FEIDE_POC_CLIENT_SECRET` og `FEIDE_POC_COOKIE_KEY` er tilgjengelige i **Deploy Previews / Functions**. Oppdater miljøvariabler manuelt i Netlify. Ikke del secrets i GitHub eller chat.
5. Logg inn som foresatt i PR170 og åpne `/barn/feide/foresatt/`. Velg en **fiktiv** barneprofil, opprett invitasjon.
6. Åpne invitasjonen på barnets test-enhet, logg inn med dedikert Feide-testkonto på PR170, vis PIN på elevsiden; foresatt skriver denne inn på egen side.
7. Verifiser at annen familie ikke kan godkjenne, at brukt/utløpt QR/invitasjon avvises, at koblingen kan trekkes tilbake, og at familiedata ikke blir tilgjengelige for eleven.

### Forutsetninger og åpne sikkerhetspunkter
- Eksempelimplementasjonen bruker en kortlivet, kryptert Feide-cookie (15 min); hvis `FEIDE_POC_COOKIE_KEY` roteres, vil eksisterende pseudonymiserte testkoblinger ikke gjenkjennes. Egen, rotasjonsstyrt identitetsnøkkel kreves før produksjon.
- Databasen sikrer unik aktiv kobling, men godkjenningen bruker foreløpig flere REST-operasjoner. Bør gjøres til én atomisk transaksjon før produksjon.
- 6-sifret kode har maks fem feilforsøk per forespørsel, og foresatt må ha en egen verifisert Supabase-økt.
- Ingen eksakte ID-token, Feide-sub, e-postadresser, Client Secret eller familieopplysninger returneres til andre parter.

## Feil ved første browser-test 18. november 2026

Feilmeldingen «Feide-databasetabeller er ikke klargjort» er forventet fordi `feide_link_requests` og `feide_child_links` **ikke finnes i produksjonsprosjektet**. SQL-filen er kun committet; database endres ikke ved en Netlify-deploy. Supabase sin nye testgren har ingen produksjons-brukere eller familie-/barnedata, så lag **fiktiv foresatt, familie og barn** i testmiljøet. Ikke bruk faktiske barn fra produksjon.

Fra og med denne PR-versjonen avvises alle koblingskall der Supabase-URL fortsatt peker mot produksjon, uavhengig av om tabellene senere skulle finnes der. Foresatt-testsiden viser heller ikke eksisterende produksjonsbarn. Dette gir en sikker sperre mens testmiljøet klargjøres.
