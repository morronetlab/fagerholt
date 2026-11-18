# Feide OIDC – PR 1: isolert test / beslutningsport for logout

**Status:** Proof-of-concept for deploy-preview only. **Ikke merge før oppfylte manuelle testkriterier.**
Se også [issue #168](https://github.com/morronetlab/fagerholt/issues/168).

## Hva PR 1 gjør

- Ny, selvstendig testside: `/barn/feide/`. Ingen lenker fra vanlige familie-/barnesider.
- Bruker Supabase Auth som OIDC-bro til Feide: `GET /auth/v1/authorize?provider=custom:feide&redirect_to=...`.
- Supabase kontrollerer Feide OIDC-token og utsteder en egen Supabase Auth-økt.
- Tilbakekomst skjer på **eksakt** `/barn/feide/callback` (Netlify 200-rewrite til samme testside).
- Testside fjerner umiddelbart query + hash fra adressefeltet; access-token holdes kun i minnet. Ingen localStorage, ingen barne-/familie-API.
- Slår opp `/auth/v1/user` med Supabase JWT og sjekker Feide-provider. Viser kun boolean-status; aldri identifikator, e-post, ID-token eller refresh token.
- Manuell testknapp kaller `POST /auth/v1/logout?scope=local`. **Dette er bare Supabase-utlogging, ikke Feide RP-Initiated Logout.**

## Konfigurasjon / prerequisites

1. I Feide-kundeportal: OIDC app med issuer `https://auth.dataporten.no`, klient-ID/secret og Supabase callback `https://qxejliyfgfeigvxsqupg.supabase.co/auth/v1/callback`. Tilgang til Feide testbrukere må være aktiv for pilot.
2. Supabase Authentication → Providers: `custom:feide`, auto discovery, `openid`, allow users without email, Feide Client ID/Secret.
3. Supabase Authentication → URL Configuration → Redirect URLs: `https://deploy-preview-*--ukeplanen.netlify.app/barn/feide/callback` (nøyaktig uten avsluttende skråstrek). Site URL for eksisterende app skal ikke endres i denne PR.
4. Netlify: `SUPABASE_URL` + `SUPABASE_PUBLISHABLE_KEY` eksponert for Functions i **Deploy Previews**. Bruk aldri service role eller Feide Client Secret i frontend.
5. Åpne `https://deploy-preview-<PRNR>--ukeplanen.netlify.app/barn/feide/` etter preview-deploy er ferdig.

**Produksjonsdatabasen er foreløpig også Supabase Auth-prosjektet.** Supabase kan automatisk koble identiteter ved lik verifisert e-post. For test: bruk **kun særskilt Feide-testkonto** uten e-post som overlapper eksisterende foreldrekontoer. Det tryggeste er et separat Supabase-testprosjekt og tilhørende Feide-client-registrering før man gjør tester med virkelige brukere. Ikke test med ekte barn.

## Manuelle akseptansetester

- [ ] Siden er blokkert på `www.skoleuka.no` og `ukeplanen.netlify.app`.
- [ ] Testside aktiveres på PR-deploy og informerer om ingen tilgang til barnedata.
- [ ] Feide-testbrukeren autentiseres gjennom Supabase og kommer tilbake på eksakt callback.
- [ ] Siden viser `Feide` autentisert uten å vise brukerdata. Inspiser nettleserens adressefelt etter innlogging: ingen tokens står der.
- [ ] Riktig `sub`-tilstedeværelse vises som boolsk indikator. Ikke anta at identitetsdata er tilstrekkelige for kontokobling før validering.
- [ ] Ved feilet Feide-innlogging: ingen aktiv appøkt, ingen familiedata vises.
- [ ] Ved overlappende Auth-identiteter: testen avbrytes; unngå automatisk e-post-linking ved å teste med isolert testbruker.
- [ ] Klikk `Avslutt Supabase-testøkten`; lokal revoke bekreftes av Supabase; Supabase JWT slettes fra testsiden.
- [ ] Sjekk om callback inneholder Feides *originale* `id_token` og om det kan verifiseres sikkert med riktig `iss` og `aud`. Status i POC viser bare om et ID-token-felt ble returnert, **ikke** om det faktisk er Feide-tokenet.
- [ ] **Feide RP-Initiated Logout:** krever `id_token_hint` fra original Feide-login og registrert `post_logout_redirect_uri`. Verifiser mot Feide end-session-endpoint i egen sikker serverbasert flyt. Ikke merk SLO ferdig uten vellykket ende-til-ende-test.
- [ ] CI `npm run check` og browser job bestått før merge.

## Sikkerhetsbegrensninger som er bevisst bevart

- Ingen endringer i `public/barn/child.mjs`, QR-tokenflyten, foreldrekonto-/OTP-klienten, RLS eller database.
- Testen lager ikke Feide→barn-kobling og gjør ingen kall til `/rest/v1/` eller `/api/child-access`.
- JWT er fortsatt gyldig inntil utløp etter revoke i Supabase; testappen oppretter ikke en langlivet lokal session.
- Full logout fra Feide er **ikke implementert**: `provider_token` er et tilgangstoken, ikke dokumentert som originalt Feide ID-token. En egen serverstyrt OIDC-bro kan bli nødvendig hvis Supabase ikke eksponerer originalt ID-token.
- Ikke merge eller markere som produksjonsklar før Feide-logout er avklart.

## Kilder

- https://supabase.com/docs/guides/auth/custom-oauth-providers
- https://supabase.com/docs/guides/auth/redirect-urls
- https://supabase.com/docs/guides/auth/signout
- https://docs.feide.no/service_providers/manage/openid_connect/redir_etter_logout.html
