# Feide – produksjonsklar teknisk utrulling (PR #172)

**Status: produksjonsforberedt kode, funksjonen AV på `www.skoleuka.no` til aktivering.** Denne PR-en bygger på åpne Draft-PR #169 (OIDC/SLO), #170 (kobling) og #171 (elevvisning). Base `main` brukes bare for Netlify Deploy Preview #172. **Ikke merge en stack direkte uten å kontrollere diff, CI og manuell test.**

## Endringer som er implementert
- Canonical production origin er **kun** `https://www.skoleuka.no`. Fast callback `/api/feide-oidc/callback` og logout-return `/api/feide-oidc/complete`, ikke dynamisk fra Host-/query-parameter.
- Produksjonsmode krever eksplisitt `CONTEXT=production`, `FEIDE_ENABLED=true`, `FEIDE_ORIGIN=https://www.skoleuka.no`, verifiserte credentials og alle tre hemmelige nøkler. Ingen fallback til POC-secrets eller preview-konfig.
- Preview-mode bruker kun PR172-adresse, og tidligere POC-miljøvariabler kan fremdeles brukes i forhåndsvisningen.
- Feide-ID-token valideres med signatur, issuer, audience, nonce, klokke og JWKS ved OIDC callback. Lokal browserøkt lagres i AEAD-beskyttet, HttpOnly, Secure, SameSite=Lax cookie, kryptografisk bundet til vertsnavnet.
- Lokal produksjonsøkt har **maks 2 timer**. ID-tokenet valideres ved login; gyldigheten til lokal økt er uavhengig av etterfølgende token-exp, men avgrenset av signert cookie-levetid. Reautentisering kreves etter utløp.
- Per request må `feide_child_links` ha én aktiv godkjent kobling. Serveren bestemmer family/child, ingen tilgang til foresatt-/søskenprofil, ingen QR-device-credentials.
- Foresatts 6-sifrede kode blir nå verifisert, feilforsøk telt, og aktiv kobling registrert i **én databaseoperasjon med SELECT FOR UPDATE**. SQL er `20261118105952_feide_atomic_link.sql`, **anvendt i Supabase 18.11.2026**. Funksjonen er SECURITY INVOKER og bare `service_role` har EXECUTE; `anon` og `authenticated` mangler EXECUTE.
- Foresatt kan fjerne koblingen og elevens neste API-kall nektes umiddelbart. Eleven kan logge ut også når koblingen er trukket tilbake.
- QR-innlogging, familieadministrasjon og dagens lekser/pakkeliste API er ikke flyttet til Feide og fungerer videre.

## Nettsted og Feide-admin – må gjøres av administrator før aktivering

I den **samme OIDC-konfigurasjonen som har riktig Client ID** på [kunde.feide.no](https://kunde.feide.no/) legges følgende til og lagres:

- Redirect URI etter innlogging: `https://www.skoleuka.no/api/feide-oidc/callback`
- Redirect URI etter utlogging: `https://www.skoleuka.no/api/feide-oidc/complete`

Ikke legg til wildcard. Den kanoniske `www`-adressen må brukes konsekvent ved innlogging og som Netlify primary domain. Registrerte preview-URI-er kan beholdes under sluttkontrollen, men bør fjernes når testmiljøer ikke lenger benyttes.

Kontroller Feides tjenestestatus, personvern-/tjenestebeskrivelse, nødvendige OIDC-scopes (`openid`) og at aktuell kommune/skole **har aktivert tjenesten**. En godkjent utviklerapplikasjon betyr ikke automatisk at reelle elever kan logge inn. Testbrukere skal skrus av før bredt produksjonsslipp.

## Netlify: nødvendige miljøvariabler

Opprett disse variablene for **Production, Functions** (server-side). Ikke legg hemmeligheter i GitHub, frontend, tickets eller chat.

| Variabel | Verdi / formål |
| --- | --- |
| `FEIDE_ENABLED` | `false` frem til produksjonstesten er bestått; deretter `true` |
| `FEIDE_ORIGIN` | `https://www.skoleuka.no` |
| `FEIDE_CLIENT_ID` | OIDC Client ID fra riktig Feide-konfigurasjon |
| `FEIDE_CLIENT_SECRET` | Feide Client Secret – **hemmelig** |
| `FEIDE_SESSION_COOKIE_KEY` | Ny kryptografisk tilfeldig 32-byte base64url |
| `FEIDE_SUBJECT_HASH_KEY` | Uavhengig, tilfeldig 32-byte base64url (se koblingsmigrering) |
| `FEIDE_LINK_PIN_KEY` | Uavhengig, tilfeldig 32-byte base64url |
| `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | Eksisterende verdier; service_role kun på server |

**Tilgangsbegrensning:** Netlify-integrasjonen i ChatGPT returnerte 403 ved forsøk på å opprette produksjonsvariabler, så dette må fullføres manuelt av Netlify-administrator. Variablene **er ikke konfigurert av denne PR-en**.

### Eksisterende kobling fra POC

Den eksisterende Feide-koblingen ble pseudonymisert med `FEIDE_POC_COOKIE_KEY`. Bruk av en **ny** dedikert `FEIDE_SUBJECT_HASH_KEY` i produksjon gir en annen hash for samme Feide `sub`. Dette er ønskelig for nøkkelseparasjon, men betyr at den gamle testkoblingen ikke gjenkjennes. Anbefalt: foresatt fjerner POC-koblingen, logger inn i produksjon med elevens Feide-identitet og **godkjenner ny kobling**. Ingen automatisk matching på e-post eller navn. Ikke bytt hash-nøkkel for eksisterende produksjonskoblinger uten en migreringsplan.

### Sikker aktivering

1. Gjennomgå PR #169–172 med rekkefølge på merge og eventuelle konflikter, og kontroller grønn GitHub unit + browser CI.
2. Verifiser at produksjonsmiljøet har korrekte server-only variabler, og at `FEIDE_ENABLED=false` gir skjult Feide-knapp og avviste API-forespørsler.
3. Registrer de to eksakte callback-adressene i Feide-admin og lagre.
4. Test Feide med dedikert konto i Deploy Preview #172 (egne preview-URI-er må også være registrert). Kontroller identitet, foreldregodkjenning, lekser, aktiviteter, pakkeliste, logout, re-login, feil PIN, expired invite, cross-family denial, revocation, QR og installert PWA (iPad + Android).
5. Først etter verifisering og godkjenning: merge, oppdater produksjonsvariabler, deploy på nytt, aktiver flagget for liten pilot.
6. Ta en manuell kontroll på `https://www.skoleuka.no/barn/`; dokumenter innloggingsstatus, logout og tilgangsfjerning på ekte enhet. Skru `FEIDE_ENABLED=false` og deploy på nytt ved feil. QR beholder tilgang uavhengig av Feide.

## Åpne godkjenningspunkter

- GitHub browser-test og reell OIDC E2E må være grønne etter siste endring.
- Safari/iPad installert webapp må kunne logge inn og ut uten å vise familiedata etter tilbakekalling. Feide-økt varer inntil 2 timer og krever ny login etterpå.
- Feide må godkjenne/tilby tjenesten til relevante skoler; særlig testbrukere vs ekte elever.
- Eget personvern-/databehandler- og informasjonsgrunnlag for elevers skoleidentiteter må vurderes før nasjonal utrulling.
- Prioriter logging av mislykkede innloggingsforsøk/Feide-logout uten å logge identitetsdata, tokens, PIN eller secrets.
