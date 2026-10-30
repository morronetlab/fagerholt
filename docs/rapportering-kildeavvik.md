# PR #67: Rapportering av feil og kildeavvik

Skoleuka lar foresatte rapportere tre typer feil fra familieoversikten eller den enkelte ukeplanen:

- **Feil dato eller dag**
- **Mangler viktig beskjed**
- **Feil tolkning eller innhold**

Fra en konkret beskjed fylles offentlig kildeutdrag og eventuelt sidetall ut automatisk. Familieoversikten har i tillegg en egen knapp for manglende beskjeder, også når selve listen er tom. Flere barn kan tilhøre ulike skoler og trinn; brukeren velger riktig skole/trinn i dialogen før innsending. Rapporteringen fungerer uten familiekonto.

## Data og personvern

En rapport inneholder kun feiltype, skole-ID, klassetrinn, år/uke, eventuelt offentlig MinSkole PDF-URL og sidetall, kildebeskjed, brukerens korte beskrivelse samt tidspunkt og tilfeldig rapport-ID.

Den inneholder **ikke** barnenavn, profil-ID, familiekonto-ID, påloggingsinformasjon, e-post, IP-adresse eller lekseprogresjon. Frontenden sender forespørsler med `credentials: 'omit'`. Tekstfeltene advarer mot personopplysninger og API-et avviser e-postadresser og lange telefon-/identitetsnummermønstre. Dette er en begrensning, **ikke en garanti** mot at en bruker skriver inn identifiserende fritekst. Gjennomgå personvern og rutiner for sletting før bred utrulling.

Alle rapporter lagres i en **privat Netlify Blobs-datastore** med navn `ukeplan-feedback` og egne nøkler `reports/YYYY-MM-DD/<id>.json`. Automatisk kildeaudit fra PDF-lesingen lagrer bare aggregerte avvik og offisielle kildereferanser under `alerts/YYYY-MM-DD/...`.

## Driftskonfigurasjon

- `AI_JOB_SECRET` (eksisterende) eller `FEEDBACK_HASH_SECRET` (ny, minst 24 tegn) må finnes for at rapporterings-API-et skal ta imot henvendelser. Denne brukes som salt i enveis HMAC for å begrense antall rapporter uten å lagre IP-adresser. Sett gjerne en egen `FEEDBACK_HASH_SECRET` før produksjon.
- `FEEDBACK_ADMIN_TOKEN` (ny, minst 24 tegn) må settes for å lese innsendte rapporter via administrator-API-et. Tokenet skal **aldri** legges i GitHub, JavaScript eller frontend. Uten token er lesetilgangen avslått, men innsending fungerer.
- Valgfritt: `AI_BLOBS_REGION` for samme region som eksisterende AI-data.

### Slik gjennomgår administratoren innmeldinger

Send et privat GET-kall til `/api/report-review?date=2026-10-30` med HTTP-header `Authorization: Bearer <FEEDBACK_ADMIN_TOKEN>`. Endepunktet returnerer `reports` og `sourceAlerts` for datoen. Kun de første 100 av hver kategori returneres; ved større volum trengs utvidet paginering eller en egen intern visning.

**Ikke legg tokenet i nettleserens kildekode eller i en delbar URL.** Bruk et godkjent administratorverktøy med hemmelig header.

### Avgrensning av misbruk

- Kun POST og JSON, med strenge feltsjekker og maks 2200 tegn i innsendt JSON.
- Kun validerte skoler/trinn, realistisk ISO-uke og dokumenter under tillatte, offisielle MinSkole-verter.
- Samme-origin-sjekk når Origin oppgis, ingen CORS-tilgang.
- Maks fem nye rapporter per UTC-døgn per anonymisert `x-nf-client-connection-ip` fra Netlify. Ikke stol på `x-forwarded-for` sendt av klienten. Uten Netlify-header blir alle slike forespørsler gruppert under en felles anonym identifikator, så konfigurasjonen må bekreftes i produksjon.
- Samme avsender og samme rapportinnhold lagres ikke gjentatte ganger samme dag.
- API-et kaller ikke OpenAI og foretar ikke nedlasting av PDF basert på brukerrapporter.

## Feilsøking og videre arbeid

Rapportene håndteres foreløpig manuelt. Prioriter falsk skolefri/stengt SFO, vaksine eller feil skolekalender høyere enn lekser og dagsprogram. Ved bekreftet feil: korriger parseren og legg til en regresjonstest med dokumentert PDF-kilde. En brukerinnmelding skal **aldri automatisk endre innholdet i ukeplanen**.

**Viktig før bred lansering:** Etabler en ansvarlig person for gjennomgang, innsyn/sletting av innmeldinger, behandlingsgrunnlag og en definert oppbevaringstid. Netlify Blobs sletter ikke automatisk disse rapportene etter en bestemt tidsgrense i denne PR-en.

Testdekning: `npm run check` og `npm run test:browser`. Nettlesertestene verifiserer at barnenavn og intern profil-ID ikke er med i API-payloaden; enhetstestene dekker avviste kilder, fritekst med e-post/telefon, fem-rapporter-grensen, duplikater, utilgjengelig lagring, admin-autentisering og private kildeavvik.
