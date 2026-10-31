# Skoleuka 2.3 – En kalender for hendelser, ikke lekser

## Revidert kalender
- Viser **mandag–fredag** som standard. Dette følger skoleuka og sparer plass på mobil og PC.
- **Lørdag og søndag** kan åpnes via `Vis helg (N hendelser)`, men knappen vises bare dersom den valgte familien/det valgte barnet faktisk har hendelser i helgen. Helgeaktiviteter forsvinner aldri fra Supabase, lokale aktiviteter eller eksisterende aktivitetsadministrasjon.
- Hendelser i kalenderen: spesielle skolehendelser og beskjeder, kommunal skolerute, og familiens egne aktiviteter. Hver kilde oppgis som før.
- **Lekser og pakkelister fjernes fra kalenderens datagrunnlag**. De er allerede tilgjengelige under «Barna mine» og barnets fulle ukeplan. Pakkeliste beholdes i den utvidbare komplette praktiske huskelisten.
- Skolebeskjeder uten dato forblir i den utvidbare seksjonen «Beskjeder uten bestemt dag». Kritiske beskjeder (for eksempel vaksine/planleggingsdag) er fortsatt prioritert under «Viktig denne uka» selv om dato mangler.
- Barnefilter påvirker helgeknappens synlighet, og valg av nytt barn lukker helgen igjen. Den komplette datamodellen og familiedeling/RLS endres ikke.

## Ikke endret
Ingen endring i Supabase/RLS, datamodell for aktiviteter, innlogging, familie- eller skoleinformasjon, PDF-parser eller e-post. Alle eksisterende kildehenvisninger, feilmelding, familiedeling og redigeringsknapper er bevart.

## Testplan
- Enhetstest: fem dager som standard, seks/sju ved utvidelse, helg bare når det finnes hendelser, og ingen lekse-/utstyrsduplikater i verken kalenderen eller «uten dato».
- Nettlesertest mobil: kalenderen viser fem kort; helgeaktiviteter avsløres via knappen; når man velger et annet barn uten helgeaktiviteter forsvinner knappen; originalkilder og redigeringsflyt fungerer.
- Hele `npm run check`, `npm run test:browser` og Netlify deploy-preview må bestås før merge.
