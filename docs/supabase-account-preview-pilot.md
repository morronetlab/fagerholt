# Ukeplanen 2.1 – Supabase-pilot i Netlify Deploy Preview

**Status 30.10.2026:** Supabase-prosjekt `ukeplanen` (`qxejliyfgfeigvxsqupg`, EU Irland) er opprettet. Migrasjon `family_accounts_phase1` er brukt. Fem tabeller har RLS. Ingen familier eller persondata er registrert. Supabase-tilkobling er ennå **ikke aktivert i Netlify**.

Denne PR-en lager en ny isolert Deploy Preview for å prøve foreldrepålogging før produksjonsaktivering. **Ikke merge før ekte e-post-/RLS-/personverntester er bestått.**

## Netlify-konfigurasjon (kun Deploy Previews)

1. Åpne Netlify → prosjekt **ukeplanen** → **Project configuration → Environment variables**.
2. Opprett **to site variables**. Velg deploy context **Deploy Previews** (ikke `All`, `Production` eller alle kontekster). Scope må omfatte **Functions**. Standard `All scopes` er også akseptabelt.
   - `SUPABASE_URL` = `https://qxejliyfgfeigvxsqupg.supabase.co`
   - `SUPABASE_PUBLISHABLE_KEY` = den **publishable** nøkkelen som starter med `sb_publishable_`, hentet fra Supabase → Project Settings / API Keys.
3. **Aldri** legg `service_role`- eller `sb_secret_`-nøkler i denne innstillingen, og ikke skriv dem i GitHub.
4. **Kjør ny Deploy Preview etter at variablene er lagret.** Netlify Functions får miljøvariablene fra deploy-tidspunktet. PR-nummeret står i GitHub.
5. Kontroller `https://deploy-preview-<PRNR>--ukeplanen.netlify.app/api/account-config`: `enabled: true`. Dette API-et returnerer bare publishable config. Det skal fortsatt være `enabled: false` på `https://ukeplanen.netlify.app/api/account-config`.

## Påloggingstest (kun foresatte / fiktive barneprofiler)

1. Supabase **Authentication → Providers → Email** er på.
2. Supabase **Authentication → Email Templates → Magic Link** inneholder `{{ .Token }}` (6-sifret kode), ikke bare lenke.
3. Start med **én egen e-postadresse**; på preview velg **Logg inn**, be om kode, verifiser koden og opprett `Testfamilie`.
4. Legg til et fiktivt barn (f.eks. «Testbarn 1»), se ukeplan, merk en lekse og last siden på nytt. Kontrollér at avkrysningen er synlig.
5. Inviter en **annen** e-postadresse som bare du eier/tester. Test at lenken er bundet til den adressen, og at engangskoden ikke kan brukes igjen.
6. En uavhengig testkonto i en annen familie skal aldri kunne hente testfamilien, teste ved direkte REST-kall.
7. Slett testfamilier etter test; sjekk at antall rader er 0.

## Sikkerhetskontroll gjennomført

30.10.2026: Midlertidig SQL-transaksjon med familie A/B kontrollerte at A bare så A, og at INSERT i B ble blokkert av RLS. Transaksjonen ble rullet tilbake; alle tabeller og testkontoer ble deretter kontrollert tomme.

**Viktig avgrensning:** Dette er en transaksjonsbasert RLS-test, *ikke* en ekte gjennomført OTP / HTTP-klient-test mot to innloggede personer. Koden støtter ikke barneinnlogging ennå. Ikke bruk reelle barneopplysninger i piloten.

## Produktionskontroll

Ikke legg til Supabase-miljøvariabler for produksjon før full test og personvernkontroll. Selv om appkoden er flettet inn i `main`, er konto-knappen deaktivert uten variablene. Ingen service_role-nøkkel skal i nettleseren eller Netlify functions.
