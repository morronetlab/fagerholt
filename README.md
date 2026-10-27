# Ukeplanen — konfigurerbar skoleuke (v1.0 forhåndsversjon)

Et nytt, **selvstendig** prosjekt for [morronetlab/fagerholt](https://github.com/morronetlab/fagerholt). Basert på Skolesekken 3.0.7, men bygget om for ett valgt klassetrinn av gangen og for gjenbruk hos andre skoler.

## Status

Dette er en ferdig testbar prosjektpakke for GitHub/Netlify, **ikke publisert** og **ikke pushet** til det nye repoet. Et Netlify-prosjekt er ikke opprettet. Den selvstendige `docs/forhandsvisning.html` har merkede **eksempeldata**, mens `public/` bruker ekte Netlify-funksjoner og skolens offisielle PDF-er.

## Brukerflyt

1. Ved første besøk vises valg av **1.–7. klasse**. Ingen ukeplanforespørsel skjer før et valg er gjort.
2. Valgt klassetrinn lagres lokalt i nettleseren med nøkkel `ukeplan.<school-id>.selected-grade.v1`.
3. Kun skolens trinnside for den valgte klassen blir forespurt (`/api/plan?grade=<1–7>`). Værforespørselen starter også først etter valg.
4. Ukeplan, pakkeliste, lekser, uketema/oppdrag, beskjeder og læringsmål vises når data faktisk finnes i PDF-en.
5. Knappen **«Bytt klassetrinn»** sletter bare klassetilhørigheten og viser valgskjermen på nytt. Avkrysningene for lekser og pakkeliste er atskilt per skole, klasse, uke og dag.
6. Ved neste besøk gjenopprettes klassevalget automatisk. Henting har timeout og viser en forklaring dersom PDF-en mangler eller ikke kan leses.

## Hvitmerking / konfigurasjon

Endre **`public/site-config.mjs`** for en ny skole. Her finnes skolens navn, appnavn, logo, farger, værposisjon, kilde-vertsnavn og URL-er til trinn 1–7. Ingen programmeringsendring skal være nødvendig for å oppdatere disse verdiene **dersom skolen også benytter MinSkole med tilsvarende PDF-struktur**. En annen skoleplattform eller vesentlig annerledes PDF-oppsett krever en ny adapter/parser.

Første implementasjon er knyttet til Fagerholt skole, med disse offisielle sidene:

| Trinn | Offisiell trinnside |
|---|---|
| 1 | https://www.minskole.no/fagerholt/seksjon/22634 |
| 2 | https://www.minskole.no/fagerholt/seksjon/22635 |
| 3 | https://www.minskole.no/fagerholt/seksjon/22636 |
| 4 | https://www.minskole.no/fagerholt/seksjon/22637 |
| 5 | https://www.minskole.no/fagerholt/seksjon/22638 |
| 6 | https://www.minskole.no/fagerholt/seksjon/22639 |
| 7 | https://www.minskole.no/fagerholt/seksjon/22640 |

**Merk:** Enkelte trinnsider har ikke en publisert ukeplan-PDF til enhver tid. Da viser appen tydelig «Ukeplan ikke publisert» og lenke til skolens side — aldri en annen klasses plan eller en foreldet uke.

## Teknisk løsning

- Vanlig HTML/CSS/ES Modules i `public/`, uten frontend build-avhengigheter.
- `netlify/functions/plan.mjs`: validerer valgt trinn, finner uke-PDF, parser teksten med `pdfjs-dist`.
- `netlify/functions/weather.mjs`: henter prognose fra Meteorologisk institutt for konfigurert sted.
- `lib/plan-core.mjs`: generalisert PDF-uttrekk for alle 1–7. Tidligere rød gruppe-tilpasning er nå **valgfri og skrudd av**, slik at 3. trinn ikke behandles som en bestemt elevgruppe.
- Tidligere privat kjøreordning/dans/tennis følger **ikke** med i standard-appen.
- `tests/`: parser, API, lagringsnøkler, uke/dato, vær, kildevalidering og klasseflyt.

## Test lokalt

```bash
npm install
npm test
npx netlify dev
```

Åpne Netlify sin lokale adresse. `python -m http.server` serverer kun frontend og kan **ikke** svare på `/api/plan` og `/api/weather`.

Du kan åpne `docs/forhandsvisning.html` uten server for å teste flyten med eksempeldata. Den filen ligger **utenfor** `public/` og skal ikke publiseres som del av appen.

## Når du er klar for GitHub

Repoet `morronetlab/fagerholt` er tomt på tidspunktet for opprettelsen av denne pakken. Pakk ut ZIP-filen, gå inn i mappen og kjør:

```bash
git init
git branch -M main
git remote add origin https://github.com/morronetlab/fagerholt.git
git add .
git commit -m "Initial white-label school week planner"
git push -u origin main
```

## Netlify — senere

Når dere har godkjent forhåndsvisningen, opprett nytt Netlify-prosjekt fra `morronetlab/fagerholt`, production branch `main`. Bygget er definert i `netlify.toml`: kommando `npm test`, publish `public`, functions `netlify/functions`, Node >=20. Den eksisterende `fagerholt.netlify.app` er **ikke** endret.

## Viktige begrensninger

- PDF-filer kan ha ulik struktur og kan mangle tekstlag. Automatiske tolkninger kan være ufullstendige og må verifiseres mot originalen.
- Testforhåndsvisningen er *simulert*. Live PDF-henting er ikke sluttverifisert for hvert av de syv trinnene.
- Lokale avkrysninger følger nettleseren, ikke en brukerkonto eller andre enheter.
- Ingenting fra privat Flyt Foresatt/Spond hentes.
