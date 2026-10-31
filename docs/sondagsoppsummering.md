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
   - `EMAIL_FROM` – verifisert avsenderadresse på eget domene, f.eks. `Skoleuka <varsler@skoleuka.no>`
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

PR #70 er rettet mot `main`, men inneholder også endringene fra PR #69 inntil #69 er merget. **Merge #69 først**, og kontroller deretter at PR #70 bare viser de nye e-postendringene før den merges.

## Sikker test med én mottaker (PR #71)

Før ordinær sending, sett `WEEKLY_DIGEST_CANARY_USER_ID` til **UUID for testforelderens Supabase Auth-bruker**. Denne ID-en kan finnes under Supabase → Authentication → Users, men **ikke del ID eller hemmelige nøkler offentlig**. Om variabelen er satt til en ugyldig UUID, sendes ingen e-post. Hvis den er korrekt, blir kun akkurat denne kontoen vurdert – selv om andre foreldre har meldt seg på.

Dette gjør det mulig å prøve produksjonsjobben søndag kveld med `WEEKLY_DIGEST_SEND_ENABLED=true` og **en eksplisitt begrenset mottakergruppe på én**. Kontroller at kontoen selv har slått på abonnementet i Min konto, at Resend viser én levering og at e-posten kommer frem. Slå av abonnementet og bekreft at tilhørende rad for denne brukeren forsvinner fra `weekly_digest_subscriptions`. Kontroller også at ingen andre er tilsendt e-post. De samme `sent/`-markørene hindrer flere like e-poster samme skoleuke.

Før utsending til alle: slå `WEEKLY_DIGEST_SEND_ENABLED=false`, fjern `WEEKLY_DIGEST_CANARY_USER_ID` i Netlify, kontroller og gjennomfør en ny deploy, og aktiver vanlig utsending først etter en bevisst beslutning.

`SUPABASE_SERVICE_ROLE_KEY` beholder sitt eksisterende navn i Skoleuka, men kan settes til en nyere `sb_secret_...` nøkkel. Denne sendes **kun i HTTP-headeren `apikey`**, aldri som `Authorization: Bearer`. Den eldre `service_role` JWT-en krever `Authorization: Bearer`. Bruk helst en dedikert ny servernøkkel som kan roteres separat, ikke den offentlige `sb_publishable_`-nøkkelen.

**Viktig:** Scheduled Function er tidsstyrt, og normal utsending krever søndag kveld i Europe/Oslo. Vanlig manuell invokering utenfor sendetidsvinduet sender ingenting. For å teste mailleverandør og domenet isolert kan Resend-dashboardet brukes før søndagstesten av Skoleuka.

## Familievennlig HTML-oppsummering (PR #73)

Utsending sendes som både HTML og ren tekst. HTML-malen er bygget med e-postklient-kompatible tabeller og inline CSS, maks 600 px bredde, høy kontrast, tydelig skille per barn og en sentral lenke til den fullstendige ukeplanen.

For hvert skolebarn vises dokumenterte lekser og frister, utstyr som skal tas med, og viktige kildebelagte beskjeder. Ukeplanens offisielle PDF lenkes ved gyldig URL. Verifiserte leksedetaljer kan brukes når de er hentet fra PDF-tabellen, selv om andre PDF-beskjeder ikke er ferdig kvalitetssikret. Ikke-verifiserte opplysninger blir aldri fylt inn med antakelser. Alle tekstfelt HTML-escapes før utsending.

Ordinær søndagsutsending utsettes hvis minst én ukeplan ikke er ferdig behandlet og kildekontrollert. Den neste planlagte kjøringen prøver på nytt innenfor sendetidsvinduet. Hvis en plan fortsatt ikke er klar når vinduet er over, sendes ingen e-post den uken; testmail kan likevel vise delvis innhold tydelig merket. Se etter manglende kildebehandling i driftslogger og på Skoleuka. Ikke fjern kildekrav for å omgå dette.

Testmail sender HTML med tydelig TEST-merking, men beholder begrensningen én godkjent testmail per foreldrekonto per 24 timer. Manuell visuell verifisering i Gmail/Outlook (desktop og mobil) anbefales før ordinær utrulling.

### Ny test ved vesentlig endret e-postmal

Testmailens 24-timersbegrensning gjelder per innlogget forelder og **malversjon**. Etter innføringen av HTML-malen `rich-html-v2` er det derfor mulig å sende én ny test, selv om samme konto sendte en test av den gamle malen tidligere samme dag. De gamle sendemarkørene slettes ikke, og begge versjoner har uavhengige Resend-idempotensnøkler. Flere tester av samme HTML-versjon er fortsatt begrenset til én godkjent utsending per 24 timer. Dette er ikke en generell reset-knapp eller et unntak for andre mottakere.

## Kildekontroll og delvise søndagsbrev (PR #75)

Tidligere AI-resultater uten feltet `sourceAudit` blir kontrollert på nytt mot den **samme offisielle PDF-en**, direkte ved vanlig lesing av ukeplanen. AI-en kjøres ikke på nytt og en uverifisert PDF gis aldri en vellykket status automatisk. En godkjent kontroll med `sourceFacts: 0` er gyldig: det betyr bare at PDF-en ikke inneholder bestemte typer ekstraordinære beskjeder, ikke at ukeplanen mangler innhold.

Ved manglende PDF for ett trinn viser e-posten en presis melding og lenker til trinnets offisielle side. I den planlagte søndagsjobben forsøkes nye lesninger frem til klokken 20 lokal tid. Hvis minst én annen barneprofil er kontrollert og klar, sendes en tydelig merket **delvis** oppsummering fra klokken 20 og utover. Hvis ingen av profilene er klare, sendes ingenting. Sendemarkører og foreldrenes frivillige påmelding fungerer uendret.

Søndagsplanen sjekkes hvert kvarter 17:00–20:45 UTC, men selve utsendingsvinduet begrenses fortsatt til lokal søndag kl. 18–21. Ny test av den korrigerte e-postmalen bruker malversjonen `rich-html-v3` og forstyrrer ikke tidligere sendemarkører. Før normal utrulling kontrolleres både 3. trinns lekser mot PDF-kilden og 7. trinns eventuelt senere publisering.

Ved `sourceAudit: attention` kan kun lekser som er individuelt kontrollert mot original-PDF-ens tekstlag inngå i en delvis oppsummering. Gamle AI-poster uten kildepeker må ha en tilstrekkelig presis og lokal tekstmatch i dokumentet. Ikke-verifiserte lekser utelates, og en ikke dokumentert frist vises ikke som bekreftet. Den uavklarte viktige beskjeden markeres tydelig både i HTML og ren tekst, uten at beskjeden gjettes. Ukeplaner med ingen pålitelige detaljer regnes fortsatt som ikke klare.
