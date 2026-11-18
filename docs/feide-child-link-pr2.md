# PR 2 – Foresattgodkjent Feide-kobling til barn

**Status 18.11.2026:** Draft. Innlogging og RP-Initiated Logout er testet i PR #169. Koblingsflyten testes bare på Netlify Deploy Preview #170. **Ingen vanlig Feide-innlogging i produksjon.** PR-en er ikke merget.

## Bevisst bruk av eksisterende Supabase-produksjonsdatabase

Brukeren har uttrykkelig valgt å teste koblingen i eksisterende Supabase-prosjekt `ukeplanen` fordi løsningen foreløpig brukes av bare vedkommendes familie. Det ble ikke opprettet noen betalt Supabase branch/prosjekt.

Additiv migrasjon `20261118094522_feide_child_link_preview.sql` ble anvendt **18.11.2026** med samme version i Supabase migration history. Den oppretter bare `public.feide_link_requests` og `public.feide_child_links`. Bekreftet etter migrasjonen:

- Begge tabellene finnes; de hadde **0 rader** umiddelbart etter opprettelsen.
- RLS er på for begge, ingen klientpolicyer finnes.
- `anon` og `authenticated` har **ingen** SELECT/INSERT-rettigheter.
- Kun `service_role` har tabellrettigheter.
- Eksisterende `children`, `families`, QR-sesjoner og lekser er **ikke endret**.

**Viktig skille:** Databaseobjektene er i PROD, men Feide-koblings-API-et er eksplisitt begrenset til `https://deploy-preview-170--ukeplanen.netlify.app`. Feide-koblinger gir fortsatt **ingen** tilgang til barnedata eller lekser. Kun egne foresatte med gyldig Supabase Auth JWT og eksisterende RLS-tilgang til barnet kan starte, godkjenne og tilbakekalle kobling.

## Implementert funksjonsflyt

1. Foresatt logger inn i Skoleukas eksisterende familieprofil på PR170 og velger et barn på `/barn/feide/foresatt/`.
2. Foresatt starter en 10-minutters engangsinvitasjon (256-bit token, SHA-256 hash lagres).
3. Eleven åpner invitasjonslenken på egen enhet på `/barn/feide/koble/` og bruker Feide Authorization Code + PKCE mot PR170.
4. Netlify verifiserer det signerte Feide ID-tokenet. En server-side HMAC av `issuer + sub` knyttes til invitasjonen; ingen automatisk kobling basert på navn/e-post.
5. Eleven får en 6-sifret kode. Foresatt taster inn koden og godkjenner eksplisitt.
6. Bare én aktiv Feide-kobling er tillatt per barn og per Feide-identitet. Foresatt kan tilbakekalle koblingen.
7. Både QR-innlogging og foresatt-OTP fortsetter uendret. Feide-kontoen får **ingen elev-/familiedatarettigheter** i PR2.

## Manuell test

- <https://deploy-preview-170--ukeplanen.netlify.app/barn/feide/foresatt/>
- Feide-kundeportalen må ha **eksakt** `https://deploy-preview-170--ukeplanen.netlify.app/api/feide-oidc/callback` som login-redirect, og `https://deploy-preview-170--ukeplanen.netlify.app/api/feide-oidc/complete` som logout-redirect.
- Netlify **Deploy Previews → Functions** må ha `FEIDE_POC_ENABLED`, `FEIDE_POC_CLIENT_ID`, `FEIDE_POC_CLIENT_SECRET`, `FEIDE_POC_COOKIE_KEY`, `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY` konfigurert. Ingen secrets i frontend eller GitHub.
- Bruk eksisterende foresattprofil og en **dedikert Feide-testkonto**, ikke barnets reelle Feide-konto under første prøve. Velg en av egne barneprofiler som foresatt.
- Bekreft at engangslenke, Feide-login, PIN-godkjenning, tilbakekalling og full Feide-logout fungerer. Ikke send auth tokens eller invite-URL-er til andre.
- Test med feil PIN, allerede brukt invitasjon og manglende foresattlogin; ingen av disse må gi godkjent kobling.

## Sikkerhet og åpne oppgaver før merge

- Dette er en test på reelle familiedata; all funksjonalitet ligger bak preview-only origin, foresatt-RLS og eksplisitt godkjenning.
- API-et må gjennomgås for atomisk PIN-godkjenning og rasebetingelser før produksjonslansering. Eksisterende unike indeksregler forhindrer to aktive koblinger per barn / Feide-identitet.
- Nåværende HMAC-nøkkel er koblet til `FEIDE_POC_COOKIE_KEY`; den må erstattes av en separat rotasjonsstyrt identitetsnøkkel før full produksjon.
- Den endelige Feide-baserte barnesesjonen, data-API-tilgangen og SLO-invalidering er **ikke** implementert. Ikke tilby «Logg inn med Feide» for vanlige elever før egne tester.
- PR #170 inneholder PR #169-endringer; base er midlertidig `main` for å få Netlify Preview. **Ikke merge #170 før #169 er gjennomgått/merget**, og CI + manuelle tester er gjennomført.

Issue: #168. PR: #170.
