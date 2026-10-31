# Kildeovervåking (PR #69)

## Hva kontrolleres

Den publiserte Netlify Scheduled Function `calendar-monitor` kjører daglig kl. **06:15 UTC**. Den kontrollerer at kommunens offisielle skolerute faktisk kan nås og parses, at SFO-stenginger er dokumentert, og at særlig viktige datoer ikke er endret uventet.

Statusen lagres i privat Netlify Blobs-lager `ukeplan-source-monitor`. Public `GET /api/source-health` returnerer kun samlet status og sist verifiserte dato – **ikke** foreldrenes data. Kilden regnes som foreldet hvis ingen vellykket kontroll er gjort de siste 36 timene.

Ved utilgjengelig kilde, ugyldig format eller endrede kritiske datoer bevares siste vellykkede kontrolltidspunkt. Når kildeavvik oppdages, bruker skolerute-API-et den tidligere dokumenterte reserveversjonen for skoleåret 2026–27 i stedet for å vise uavklarte endringer som bekreftede fakta.

### Varsling til driftsansvarlig

Sett følgende i Netlify (hemmelig serverkonfigurasjon; aldri i offentlige filer):

- `SOURCE_ALERT_ENABLED=true` – explicit opt-in for alerts
- `SOURCE_ALERT_EMAIL` – mottaker hos driftsansvarlig
- `RESEND_API_KEY` – hemmelig nøkkel hos e-postleverandøren
- `EMAIL_FROM` – avsender fra verifisert domene (eksempelvis `Skoleuka <noreply@ditt-domene.no>`)

Ved et avvik sender jobben **én driftsmail per avviksepisode** med feilkategori og kildeadresse, ikke persondata. Meldingen sendes først når alle variablene er satt og funksjonen kjører etter publisering. Netlify-prosjektets API- og DNS-oppsett for e-post må være korrekt.

Netlify Scheduled Functions kjører bare automatisk på publiserte deploys, ikke PR-forhåndsvisninger. Bekreft at neste planlagte kjøring vises i Netlify Functions. Test gjerne via `Run now`, men gjør det med `SOURCE_ALERT_ENABLED=false` første gang.

### Å kontrollere

- `/api/source-health`: `verified`, `unavailable`, `unverifiable`, `changed` eller `not_monitored`, `lastCheckedAt`, `lastVerifiedAt`, `stale`.
- `/api/school-calendar?school=fagerholt&year=2026&week=45`: elevfri **6. november 2026** skal vises. SFO-status skal fortsatt være `unknown`.
- I familieoversikten vises kildevarsling med en lenke til offisiell kommunal skolerute.
- Ved kildefeil brukes bare en datert, kontrollert reserveversjon for 2026–2027. For andre år skal appen ikke fylle inn antatte fridager.
- E-postvarsler fra driftskontrollen bekrefter bare problemer med kilden; de er **ikke** en garanti for at det aldri forekommer lokale avvik på den enkelte skole.

Det er fortsatt viktig å sammenligne kildekontrollens status mot faktisk innhold i Netlify: en vellykket CI-jobb for unit- eller browser-tester er ikke det samme som et vellykket nettverksoppslag hos kommunen fra produksjonsmiljøet.

## Sikkerhet

Ingen API-nøkler, barnenavn, familieprofiler, skolelekser eller e-postmottakere publiseres i `source-health` eller loggene. Uventede endringer i kritiske datoer utløser manuell kontroll, ikke en automatisk endring som foreldrene kan feilaktig stole på. Manuell kildekontroll må dokumenteres før snapshotet endres.
