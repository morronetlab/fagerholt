# Utviklingsrutine for Ukeplanen

Vi skal redusere unødvendige CI-kjøringer og varsler uten å miste testdekning.

## Før endringer sendes til GitHub

1. Jobb i en egen branch for én samlet feilretting eller funksjon.
2. Gjør ferdig sammenhengende kode, UI og regresjonstester **før** innsending. Unngå mange små prøvecommits.
3. Kontroller JavaScript-syntaks i endrede `.mjs`-filer med `node --check <fil>`.
4. Kjør hele testen lokalt i en sjekket ut kopi av prosjektet:

   ```bash
   npm ci --no-audit --no-fund
   npm run check
   ```

5. Rett feil lokalt, og send helst én samlet commit før PR opprettes eller oppdateres.
6. Kontroller **GitHub Actions** og **Netlify Deploy Preview** før sammenslåing.
7. Ved CI-feil: les feilen, rett den og send én ny samlet oppdatering fremfor mange prøvecommits.

Når lokal kjøring ikke er mulig (for eksempel ved bruk av GitHub-verktøy uten en checkout), skal dette opplyses. Klargjør da alle endringene før én samlet GitHub-commit og kontroller PR-testene før sammenslåing. **Ikke påstå at lokale tester er kjørt når de ikke er det.**

## GitHub Actions

- `pull_request`: Kjør tester ved åpning/oppdatering av PR; ingen parallell branch-push-test.
- `push` til `main`: Test kode etter sammenslåing eller direkte endring på hovedgrenen.
- `workflow_dispatch`: Manuell testkjøring ved behov.
- `concurrency`: Eldre pågående jobber for samme PR avbrytes når nyere endringer kommer.

Ferdige feilede kjøringer kan fremdeles ha sendt varsler. Netlify sine bygg og varsler styres separat; behold Netlify Deploy Preview som sluttkontroll.
 
## Regresjonstester

- Representative PDF-utdrag er låst som syntetiske, persondatafrie fixtures i `tests/fixtures/`.
- De første scenarioene sikrer riktig lekse-/pakkekategorisering, dagtabeller, kildebelagte engelskgloser og riktig ukevalg.
- Tester må fortsatt sjekkes mot originale skole-PDF-er ved funksjonelle endringer; disse baselinene alene er ikke en nettleser-/E2E-test.
- `package-lock.json` er generert med npm 10 / Node 22 og skal oppdateres ved bevisste avhengighetsendringer.
