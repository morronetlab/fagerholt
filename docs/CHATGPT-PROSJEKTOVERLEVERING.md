# Prosjektkontekst til ny ChatGPT-chat — Ukeplanen (morronetlab/fagerholt)

**Kopier denne teksten som første melding i en ny ChatGPT-chat inne i et eget prosjekt.**

Prosjekt: **Ukeplanen**, en white-label utgave av Skolesekken.
Nytt repo (separat fra originalen): https://github.com/morronetlab/fagerholt.git
Tidligere løsning (referanse, skal stå urørt): https://github.com/morronetlab/skolesekken.git

## Hva som er besluttet
- Besøkende må velge 1.–7. klasse **før** API-kall og visning av ukeplan.
- Valget lagres i localStorage per skole. «Bytt klassetrinn» nullstiller valget.
- Kun valgt klassetrinns offisielle PDF skal hentes. Feil/uoppgitt plan viser ærlig tom-/feiltilstand.
- Ukeplanfunksjonene: dagsprogram, sekk/pakkeliste med avkrysning, lekser med avkrysning, ukas tema og frivillig oppdrag (kompakt etter utført), beskjeder, læringsmål under beskjeder, valgt-dag-vær og regntøyvarsel.
- Tema, læringsmål og fag kan være forskjellige for ulike klassetrinn. Ingen falske eller hardkodede live-data.
- Fjern personlige tilpasninger fra standardproduktet: rød gruppe og hip-hop/tennis/kjørerotasjon. Eventuelle skoletilpasninger legges bak konfigurasjon.
- Først testbar prototype og ZIP; **ingen Netlify-opprettelse og ingen push til nytt repo uten neste beslutning fra brukeren**.

## Hvordan prosjektet er organisert
- `public/site-config.mjs`: all offentlig branding, trinnmapping, værkoordinater, tillatte kildeverter og valgfrie funksjoner.
- `public/app.js`: klassevalg og klientapplikasjon.
- `lib/plan-core.mjs`: analyse av MinSkole PDF.
- `netlify/functions/plan.mjs`: API for kun valgt trinn.
- `netlify/functions/weather.mjs`: vær-API fra MET.
- `tests/`: Node-tester.
- `docs/forhandsvisning.html`: selvstendig testfil med merkede eksempeldata (ikke produksjon).

## Før produksjonssetting
1. Test trinnvelger, husking/reset, alle 1–7 API-responsene, avkrysning og mobil.
2. Test de faktiske publiserte PDF-ene for alle trinn med ulike formater.
3. Kontroller at Netlify bygger og funksjonene er tilgjengelige.
4. Kontroller responsive visninger og at ingen personlige data eller eksempellister ligger i produksjonen.

**Viktig:** Dette dokumentet oppretter ikke automatisk et ChatGPT-prosjekt eller en chat. Brukeren må gjøre dette i ChatGPT-grensesnittet.
