# Søndagsoppsummering på e-post (PR #70)

## Brukerflyt

En foresatt logger inn med verifisert e-post og går til **Min konto → Søndagsoppsummering på e-post**. På-/avmelding er eksplisitt og reversibel. Innstillingen kan ikke aktiveres før drift har konfigurert leverandør og hemmelige nøkler. Ingen e-postadresse fylles inn på nytt.

Denne innstillingen bruker Supabase Auth og `public.weekly_digest_subscriptions` med egne RLS-regler for hver foresatt. Tabellen lagrer **ikke** e-postadresse eller barnenavn; e-postadressen leses ved sending fra verifisert konto i Supabase Auth. Uten familietilknytning eller barn sendes ingen oppsummering. Hver foresatt melder seg på individuelt, også når to foresatte er i samme familie.

## Før utrulling

1. Legg inn migrasjonen `supabase/migrations/20261031_sunday_digest_optin.sql` i Supabase (samme prosjekt som eksisterende familiekontoer).
2. Bekreft SELECT/INSERT/DELETE med en testbruker, samt at en annen innlogget bruker ikke kan se eller endre vedkommendes rad.
3. Konfigurer følgende **server-side** miljøvariabler i Netlify:
   - `SUPABASE_URL` – eksisterende prosjektadresse
   - `SUPABASE_SERVICE_ROLE_KEY` – hemmelig nøkkel, **aldri** publiserbar eller klienteksponert
   - `RESEND_API_KEY` – fra e-postleverandør
   - `EMAIL_FROM` – verifisert avsenderadresse på eget domene, f.eks. `Skoleuka <varsler@skoleuk.no>`
   - `WEEKLY_DIGEST_SEND_ENABLED=true` – **siste bryter**, skal forbli `false` frem til alle testene er godkjent.
4. Konfigurer SPF, DKIM og eventuelt DMARC for domenet hos avsenderleverandøren. Test levering til egen bekreftet foreldrekonto før utsending til andre.
5. Kontroller at Netlify viser `sunday-digest` som Scheduled Function med tidsplan. Den kjøres hver 15. minutt søndag 17:00–18:45 UTC, altså omtrent kl. 18–20 norsk vintertid og kl. 19–21 sommertid.
6. Test **minst ett** helt forløp: registrer frivillig påmelding, se kildebelagt testmelding og slå av abonnementet. Etter avmelding skal ingen nye e-poster sendes.

Netlify Scheduled Functions kjører ikke automatisk på deploy previews eller branch-deploys. Denne funksjonen er **avslått uten `WEEKLY_DIGEST_SEND_ENABLED=true`** selv på publisert produksjonsdeploy.

### Hvilke data inngår i e-posten?

- Kommunale fridager og dokumentert SFO-stenging, med lenke til skolerutas kilde og forbehold om lokale endringer
- Et lite utvalg praktiske beskjeder fra skolens PDF **bare når et konkret kildeutdrag er dokumentert i AI-planens provenance**
- Åpen opplysning om PDF-er som mangler, ikke er ferdigtolket eller om skolerutekilden ikke er nylig verifisert
- Lenke til Skoleuka og hvordan foresatte kan slå av oppsummeringen

Ukeplanen er kildegrunnlaget. E-postinnholdet skal ikke fylle inn manglende datoer, vaksiner eller SFO-status basert på sannsynlighet. Kun ren tekst, uten sporingspiksler eller skjult markedsføring.

## Utsendingsgarantier og begrensninger

- Hver søndag hentes opptil 200 aktive abonnenter. Jobben sender maks **tre mottakere per kjøring**; etterfølgende 15-minutterskjøringer fortsetter med usendte abonnenter.
- Før sending bekreftes medlemskap i en familie og at Supabase Auth-brukeren har verifisert e-post.
- Dedup-lås og sendtmarkør per mottaker/ISO-uke lagres privat i Netlify Blobs, uten e-postadresse. I tillegg sendes stabil idempotensnøkkel til Resend.
- Resend kan svare vellykket samtidig som vår lokale kvittering ikke blir lagret (for eksempel ved nettverksbrudd). Resend-idempotens minsker risikoen, men **absolutt nøyaktig én levering kan ikke garanteres** ved eksterne feil.
- Jobben har begrenset kjøretid. For mange abonnenter vil kreve en køløsning og paginering, ikke at sendebegrensningen fjernes ukritisk.
- Sikkerhet for service role: Arbeidsnøkkelen skal ikke legges i GitHub, offentlige JS-filer eller kontoinnstillingene, og ingen API-rute skal eksponere e-postlister.
- **Automatisk avmelding via e-postens egen lenke er foreløpig ikke bygget**; mottaker må logge inn og slå av i familiekontoen. Vurder en signert avmeldingslenke før større utrulling.

## Verifisering

- `npm run check`
- `npm run test:browser`
- Supabase RLS-test med **to ulike foreldrekontoer**; ikke bare databaseeier/service role
- Resend-avsender og domenekontroll
- Manuell produksjonstest med `WEEKLY_DIGEST_SEND_ENABLED=false` og deretter én testbruker med sann innmelding

PR #70 bygger på PR #69. Merge #69 først; så oppdater base for #70 til `main` før merge.
