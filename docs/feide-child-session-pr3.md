# Feide PR 3 – Feide-innlogging i barneappen (pilot)

Denne PR-en bygger videre på den godkjente Feide-identitetskoblingen i PR #170 og den serverstyrte inn-/utloggingen i PR #169.

## Sikkerhetsinvarianter
- **Ingen QR-bearer blir opprettet eller delt gjennom Feide.** Dagens QR-innlogging forblir uendret.
- Feide-økten lagres kun i kortlivet, kryptert HttpOnly-cookie og er låst til eksakt Netlify Deploy Preview for denne PR-en.
- Tilgang til barnedata krever en **aktiv `feide_child_links`-kobling på hver eneste API-forespørsel**. Ingen e-post/navn-matching, klientstyrt child/family-id eller ubetinget service-role-tilgang.
- Kun read-only child-data samt eksisterende validerte `set-progress` / `set-packing` API-operasjoner er tillatt. Ingen foresattfunksjoner eller device-administrasjon.
- RP-Initiated Logout avslutter lokal Feide-cookie før redirect til Feide, med `id_token_hint` og `state`.
- Revokert kobling må avvise neste request umiddelbart, selv om gammel ID-token-cookie eksisterer.
- Ikke endre produktions-`main` eller kjøre database-DDL før gjennomgang.

## Manuelle akseptansekriterier
- Barn med aktiv Feide-kobling kan logge inn i egen ukeplan og bare se sin skole, klasse, gruppe, aktiviteter og framdrift.
- Lekser og pakkeliste kan krysses av og synkroniseres med foresattsiden.
- Barn uten godkjent kobling får ikke adgang.
- Foresatt fjerner kobling -> videre child API kall avslås, og private data fjernes ved oppdatering.
- Feide-utlogging avslutter både lokal barnesesjon og Feide-økt. Ny login krever Feide-autentisering som forventet.
- QR-innlogging, QR-lagring og installert iOS/Android PWA fungerer uendret.
- Enhetstester, nettlesertester og Netlify Deploy Preview grønt. **Ingen merge uten manuell pilot.**

## Implementert

- `lib/feide-child-session.mjs`: validerer kun Feide-sessioncookie fra eksakt PR #171. Henter **aktiv** subject-hash → child-kobling fra Supabase på hvert API-kall og leser bare det koblede barnets profil. Oppslagene er server-only.
- `lib/child-access.mjs`: dagens QR-handler brukes uendret når QR-bearer finnes. Når det **ikke** er Authorization-header, kan samme avgrensede data-API benytte verifisert Feide-kontekst. Feide kan bare kalle `child`, `progress`, `packing`, `set-progress`, `set-packing`, ikke QR-create/redeem, enhetsadministrasjon eller `self-revoke`. Alle tidligere skoleuke-/task-/gruppekontroller gjenbrukes.
- Feide-lagring oppretter **aldri** `child_device_sessions` og setter nullable `updated_by_device` til `null`.
- `public/barn/child.mjs` åpner eksisterende barnevisning ved serververifisert Feide-innlogging. QR-brukere oppfører seg som før. I PR #171 vises egen Feide-login på oppsettssiden og «Logg ut fra Skoleuka og Feide» etter innlogging.
- `lib/feide-oidc.mjs` returnerer til barneappen for `return=child`, verifiserer signert opprinnelig ID-token og begrenser økten til tokenets faktiske utløp og maks 15 minutter. Ved logout fjernes lokal cookie før RP-Initiated Logout hos Feide; retur-state valideres.
- `tests/feide-child-session.test.mjs` kontrollerer koblet/ukoblet/revokert konto, familieavgrensning, fortsatt lekseprogresjon, feil origin og at QR-bearer ikke kan falle tilbake til Feide-cookie.

## Eksterne forutsetninger for PR #171

I Feide-admin for samme client ID, **legg til** (ikke erstatt tidligere adresser):

- Login redirect: `https://deploy-preview-171--ukeplanen.netlify.app/api/feide-oidc/callback`
- Logout redirect: `https://deploy-preview-171--ukeplanen.netlify.app/api/feide-oidc/complete`

Netlify Deploy Preview må ha eksisterende `FEIDE_POC_ENABLED`, `FEIDE_POC_CLIENT_ID`, `FEIDE_POC_CLIENT_SECRET`, `FEIDE_POC_COOKIE_KEY`, `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` og `SUPABASE_SERVICE_ROLE_KEY` på Functions. Ikke del hemmeligheter.

**Test:** Åpne `https://deploy-preview-171--ukeplanen.netlify.app/barn/` uten eksisterende QR-token. Velg «Logg inn med Feide» og benytt samme dedikerte Feide-testkonto som ble godkjent av foresatt i PR #170. Kontroller at barnets riktige ukeplan, aktiviteter, lekser, pakkeliste og synkronisering vises, og test deretter full logout. QR kan fortsatt brukes separat. Når et QR-token allerede finnes på enheten, prioriteres QR for å unngå å endre eksisterende sesjon.

## Gjenstående før produksjonsbruk

- Automatisk nettlesertest og manuell verifisering med **reell** Feide-login i PR #171, etter Feide callback-registrering.
- iPad/Safari, installert PWA og Android må testes separat. For denne piloten er Feide-økten begrenset til 15 minutter, og installasjonsprompten skjules for Feide-brukere. Langvarig elevinnlogging krever eget design.
- PR #170 sin foresattgodkjenning består ennå av flere REST-oppdateringer; transaksjonell/atomisk godkjenning og konsistent tilbakekalling må sikkerhetsgjennomgås før merge.
- Nøkkel for pseudonymisert Feide-sub bør skilles fra `FEIDE_POC_COOKIE_KEY` og få eksplisitt rotasjonsrutine før bred lansering.
- Feide-koblingen er lagret i det eksisterende Supabase-prosjektet etter brukerens godkjenning, men ingen nye databasetabeller eller migrasjoner brukes i **denne** PR-en.
- **IKKE merge PR #171 direkte til main**. Grenen inneholder endringene fra PR #169 og PR #170 som må gjennomgås og håndteres i riktig rekkefølge.
