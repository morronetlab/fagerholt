# Skoleuka – intern driftsoversikt og kildevarsler

## Hva vises
Åpne `https://www.skoleuka.no/drift/`. Siden er offentlig tilgjengelig som statisk HTML, men
**alle data krever serverautorisert tilgang** gjennom `/api/operations-health`.
Siden lagrer ikke administratornøkkelen i URL, cookies, localStorage eller sessionStorage.
Den beholdes i minnet til nettleserfanen stenges eller man velger «Lås oversikten».

API-et gir bare aggregerte offentlige data per skole og trinn:
- siste kildekontroll, siste vellykkede kildelesing og siste funn av aktuell PDF-lenke
- siste komplette ukeplan / vellykket AI-jobb, og siste feilkategori
- påfølgende adskilte feilkilder, med e-postvarsel fra tredje kontroll
- kommunal skolerute fra eksisterende `calendar-monitor`
- skoler uten observasjoner vises tydelig som **Ikke kontrollert**, ikke «grønne».

Ingen profilnavn, familie-ID, foreldrekontoer, enhetstoken, PDF-innhold, private
adresser, tilgangsnøkler, IP-adresser eller feilmeldinger fra brukerdata blir lagret.
Det er ikke en full driftsovervåker for Netlify, Resend og Supabase, kun
**skolekilder og AI/PDF-analyse**, pluss den eksisterende skolerutekontrollen.

## Miljøvariabler i Netlify
| Variabel | Bruk |
| --- | --- |
| `OPS_DASHBOARD_TOKEN` | Anbefalt: unik, hemmelig tilfeldig streng på minst 24 tegn. Kreves for data-API, alternativt eksisterende `FEEDBACK_ADMIN_TOKEN`. |
| `OPS_MONITOR_TARGETS` | Kommaseparert liste `schoolId:grade`. Maks 12, for eksempel `fagerholt:3,fagerholt:7,sjostrand:3`. Standard uten oppsett: `fagerholt:3,fagerholt:7`. |
| `SOURCE_ALERT_ENABLED` | Sett `true` for å aktivere e-postvarsel om gjentatte kildefeil. |
| `SOURCE_ALERT_EMAIL` | Intern mottakeradresse for kildefeil (ingen foresatte/barn). |
| `RESEND_API_KEY` / `EMAIL_FROM` | Eksisterende, verifisert e-postoppsett brukes. |
| `AI_BLOBS_REGION` | Eksisterende Netlify Blobs-region, hvis konfigurert. |

**Ikke** bruk et klienteksponert Vite-variabelnavn eller del nøkkelen i GitHub.
Vurder å beholde ops-token i en passordbehandler og rotere om den deles.
Tilgang mislykkes med HTTP 401 dersom sterk servernøkkel mangler.
Alle operasjons-API-svar er `no-store`, uten CORS-tillatelse for andre domener,
og /drift er `noindex`.

## Frekvens og belastning
`school-source-monitor` er en Netlify Scheduled Function som kjører annenhver
time (UTC). Den sjekker **kun eksplisitte trinn**, og leser offisiell trinnside
(og eventuell skolenavigasjon). Den **starter ikke AI-jobber og laster ikke
ned hele PDF-filer**. `pdf_found` betyr kun at lenken finnes.
Reelle forespørsler mot `/api/plan` supplerer med feil i PDF-nedlasting,
PDF-tolkning, delvis resultat og AI-status. Bakgrunnsfunksjonen for AI
rapporterer suksess eller feil etter avsluttet jobb.

Hver kontroll aggregeres til et Netlify Blobs-objekt per skole/trinn.
Samme resultat innen fem minutter telles ikke på nytt. Ved tre påfølgende
adskilte kontroller med feil og aktiv e-postkonfigurasjon sendes **ett**
varsel per feilperiode. Ny vellykket kontroll nullstiller feiltelleren.
Et utfall i Netlify Blobs skal aldri gjøre ukeplan-API-et utilgjengelig.
E-postfeil logges uten at private data kommer med.

## Verifisering før utrulling til flere skoler
1. Legg til unik serverhemmelig `OPS_DASHBOARD_TOKEN` i Netlify.
2. Bekreft `OPS_MONITOR_TARGETS` for skolene og klassetrinnene dere vil dekke.
3. Sett mottaker og `SOURCE_ALERT_ENABLED=true` når utsending er testet.
4. Kontroller at Scheduled Function faktisk kjører i produksjon, og at siste
   kildekontroll kommer inn på /drift/.
5. Test en kontrollert feil i et **lokalt testoppsett**, bekreft ett varsel
   etter tre adskilte forsøk og at frisk status nullstiller telleren.
6. Kontroller status i mobil- og desktopnettleser. Netlify Deploy Preview
   kan ha andre Blobs enn produksjon; test også produksjonsdashboardet.

Ikke test e-postalarm ved å gjøre reelle skolekilder utilgjengelige.
