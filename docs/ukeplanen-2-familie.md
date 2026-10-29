# Ukeplanen 2.0 – Familieoversikt

## Målet
Gi familier med flere barn en samlet, kildebasert oversikt uten å miste den eksisterende ukeplanen for én klasse.

## Brukerflyt
1. Trykk «Familien» i toppen. Første gangs bruk viser tom tilstand og «Legg til barn».
2. Legg til et **kallenavn**, velg skole og en klasse/et trinn som er oppdaget fra skolens offentlige API. Gruppe er valgfritt.
3. Se ett kort per barn med lekseprogresjon, oppgaver for dagen og neste skoledag, og ordøvingsprogresjon.
4. «Husk til neste skoledag» samler udaterte? Nei: **kun** oppgaver med dokumentert frist for neste skoledag, kildebasert utstyr og beskjeder.
5. «Åpne ukeplan» tar deg til den eksisterende visningen og bruker barneprofilens egne lagringsnøkler.
6. Rediger/fjern profiler fra familieoversikten. Når profilen fjernes, beholdes tidligere lagret fremdrift lokalt (ingen stille sletting av data).

## Kildetro og personvern
- Profilnavn, skole-/trinnvalg og avkrysning ligger **kun i nettleserens localStorage**, ikke på Netlify/server eller i GitHub. Bruk gjerne kallenavn.
- Ingen påloggingskonto, pushvarsler, server-side lagring eller synkronisering mellom enheter.
- Familieoversikten henter samme offentlige ukeplan-API som vanlig klassevisning. Like skole-/trinnkombinasjoner dedupliseres, og maksimalt to slike kall kjøres samtidig.
- Ingen demo-oppgaver eller oppdiktede frister brukes i faktisk app. Et ikke publisert eller usikkert tolket dokument gir en ærlig status.
- For familien som helhet vises kun den **aktuelle uken**, ikke en utgått ukeplan. Når dagen er fredag/helg, vises ikke kommende mandags oppgaver fra den gamle PDF-en.
- Frister fra API har prioritet; gjentatte leseoppgaver får dag via kildebasert repeatDays. Oppgavetekst som bare inneholder et ukedagsnavn gir ikke frist.
- Gruppefeltet brukes til å avgrense gruppe-spesifikt innhold i oversikten. Hvis ingen gruppe er valgt, beholdes alle kildebaserte grupper med sine eksisterende merkelapper.
- Avkrysninger og øvestatus er avgrenset per **profil-ID, skole, trinn, uke og år**. Gamle én-klasse-data er urørt og leses ikke som en annen profil.

## I første 2.0-versjon
- Profilhåndtering, samlet oversikt, lekseprogresjon, huskeliste og navigasjon til full klassevisning.
- Mobilresponsivt design og visning av status ved manglende/AI-behandlet ukeplan.
- Ingen varsler eller kalendersynkronisering; dette vurderes etter validering av kildetro og brukerbehov.

## Testløp
- Node-enhetstester: validering, personvernmodell, isolerte lagringsnøkler, samme klasse for to barn, kilde-/gruppefilter, kommende uke og manglende PDF.
- Chromium: mobil, opprettelse av to barn, fremdrift i én profil og uendret fremdrift i søskenprofil, reload, redigering og vanlig klassevisning.
- Ingen produksjonsmerge uten grønn GitHub Actions og Netlify Deploy Preview.
