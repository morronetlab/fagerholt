# Skoleuka 2.2 – Forenklet familieoversikt

## Mål og informasjonsrekkefølge
1. **Barna mine** ligger rett under ukeoverskriften. Navn, skole, klasse, lekseprogresjon og lenke til barnets ukeplan er alltid synlige; detaljer om konkrete lekser, pakkeliste og ordøving utvides per barn.
2. **Viktig denne uka** viser opptil tre prioriterte kildebaserte beskjeder om skolefri, endret skoledag og helserelaterte klassebeskjeder. De med ukjent dato er like viktige som andre. Samme beskjed for flere barn på samme skole dedupliseres, uten å skjule hvilke barn den gjelder. Dersom flere finnes, er antallet tydelig i lenken til komplett huskeliste.
3. **Hele familiens uke** beholdes som autoritativ syvdagersvisning med lekser, skolehendelser, kommunal skolerute, familiens aktiviteter, kildehenvisninger og filtrering per barn.
4. **Uten bestemt dag** er en kompakt utvidbar seksjon. Antall oppgaver og antall viktige beskjeder vises i sammendraget. Viktige datoløse meldinger er i tillegg synlige øverst.
5. **Familiens aktiviteter** beholdes for administrasjon, men aktivitetslisten er lukket som standard. «Ny aktivitet» er fortsatt synlig. «Endre aktivitet» i kalenderen åpner skjemaet og lukker den doble aktivitetslisten.

## Bevaring av funksjoner og sikkerhet
- Ingen endringer i Supabase, RLS, innlogging, familie- eller barns eierskap.
- Ingen endringer i API-er, PDF-parser, kalendergrunnlag eller e-postutsending.
- Skolens beskjeder og kommunens datoer kommer fra eksisterende ukeplan-/skolerutemodeller, og originalkildene vises fortsatt.
- Varsler uten bestemt dato gis aldri en oppdiktet dag. De utelates ikke fra prioriterte varsler bare fordi dato mangler.
- «Praktisk å huske» har uendret filtrering (i dag / neste skoledag / hele uka) og kan utvides til full liste, inkludert alle kildeutdrag, rapportering av feil og utstyr.
- Native `details` og `summary` gjør skjulte deler tastaturtilgjengelige. Barnekortene beholder lekseavkrysning og fremdrift.
- Samlet uke kan fortsatt filtreres på ett barn; «Viktig denne uka» dekker alltid hele familien.

## Akseptansetest
- Mobil 390 px: «Barna mine» før varsler før kalender; ingen unødvendige dobbeltlister.
- Kritisk beskjed med ukjent dag synlig i toppvarselet og under det utvidbare sammendraget for datoløse beskjeder.
- Kildelenker forblir klikkbare; ingen kildetekst blir fjernet.
- Sekundære lekser/pakkelister kan utvides, og lekseavkrysning fungerer.
- Åpning av komplett praktisk liste viser alle varsler via eksisterende «Vis alle»-knapp.
- Aktivitetsadministrasjon er lukket ved første visning, men oppretting, redigering, sletting, lokal lagring og familiedeling fungerer fortsatt.
- CI: `npm run check`, `npm run test:browser`, Netlify Deploy Preview.
