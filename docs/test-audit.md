# Testgjennomgang – Ukeplanen (29. oktober 2026)

## Metode
Alle 35 Node-testfiler på `main` ble gjennomgått med testtitler, importer og tiltenkt regresjonsansvar. Vi fjerner bare klart overlappende testformål, ikke historiske feilscenarier bare fordi de bruker samme skole eller uke. Vurderingen er en gjennomgang av testansvar, ikke et målt mutation-testing-resultat.

## Fjernet overflødig dekning
- `tests/quality-baselines.test.mjs` (5 tester): Sjøstrand 2 dekkes i `sjostrand2-homework-routing`; Fagerholt 5 i `pdf-layouts` og `regression-classification`; AI-ordlisten i `verified-pdf-glossary-pipeline`; lese-/leksehjelp i `homework-help-eligibility`; riktig uke-PDF i `core`, `api` og `week44-official-links`.
- `tests/fixtures/week44-baselines.mjs`: Kun brukt av den fjernede baselinefilen.
- `tests/quiz-pdf-word-lists.test.mjs` (4 tester): Linjedelte og kommaseparerte ord, læringsmål og uønsket prosatekst dekkes av `educational-word-quiz`, `smart-week-quiz` og `verified-pdf-glossary-pipeline`. Særtesten for **norske ord med bare mellomrom** flyttes til `educational-word-quiz` før originalen slettes.

Utgangspunkt: **35 testfiler og 198 Node-tester**. Ni tidligere tester tas ut; én særtest flyttes og tre nye kontrakttester legges til. Fire nye nettlesertester rapporteres separat fra Node-suiten.

## Tester som beholdes med vilje
- `ai-integration`, `api`, `ai-status-readonly`, `fast-ai-status`, `homework-helper`: API-kontrakter, signerte bakgrunnsjobber, kildeisolerering, rate-limit og cache/feil.
- `schools`, `core`, `week44-official-links`, `real-school-pdf-regressions`: Skolevalg, klassetrinn, feil uke, ugyldig kilde og skannede PDF-er.
- `strict-source-evidence`, `group-progress-crop`, `shared-swimming-attendance`, `vaccine-blue-regressions`, `visual-region`: Kildebelegg, gruppeknytning, oppmøtetid, vaksinering og utsnitt.
- `sjostrand-5a-glossary-quiz`, `sjostrand2-homework-routing`, `verified-pdf-glossary-pipeline`: Forskjellige nivåer av PDF-uttrekk, klassifisering, normalisering og quiz.
- `pdf-layouts`, `regression-classification`, `round11-fixes`, `reading-homework-regression`, `weekly-routines-and-ai-wait`, `special-content-and-coverage`: Ulike kildeformater og konkrete tidligere feil.
- `feedback`, `mobile-layout-and-weather`, `new-ux-regressions`, `homework-helper-ui`, `client-timeout`, `smart-week-quiz`, `vocabulary-scope`, `educational-word-quiz`: Statusmeldinger, eldre layoutkontrakter, visning, språk og leksehjelp.

En del av UI-testene er tekst-/kildekodekontroller. De bør ikke fjernes automatisk ved innføringen av nettlesertester, fordi de kan dokumentere flere detaljer enn de nye røykprøvene. På sikt kan vi bytte ut spesielt skjøre statiske tester med tilsvarende browser-assertions i små PR-er.

## Ny testdekning
- **Chromium** med mockede `/api/grades`, `/api/plan` og `/api/weather`: skole- og klassetrinnsvalg, engelsk→norsk gloser, lesing/leksehjelp, dagsbeskjeder og pakkeliste, avkrysning over omlasting, mobil klassebytte og AI-status.
- **Felles routing-kontrakt**: AI og reserveparseren bruker samme tolkning av lekselinjer; de får fortsatt ulike kildekrav for frister og ulik presentasjonslogikk.
- **Ingen eksterne AI-/skolenettverkskall** fra Chromium-testene, og ingen PDF-binarparser testes av disse. Kildebaserte enhetstester forblir obligatoriske.

## Videre kriterier
Før hver videre testreduksjon: Identifiser eksakt overlapp, bevar særegne kilde-/feilscenarier, dokumenter hvorfor testen er overflødig, og kjør både Node- og Chromium-suitene. Refaktorering skal ikke endre API-data, localStorage-nøkler, gruppefiltrering eller hvilke oppgaver som tilbys leksehjelp.
