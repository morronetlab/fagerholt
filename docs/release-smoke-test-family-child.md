# Skoleuka – fysisk ende-til-ende-test før nye familier inviteres

Sist oppdatert: 1. november 2026. **Dette er en sjekkliste for ekte enheter, ikke en påstand om at fysisk test er utført.**

## Testmiljø og sikkerhet
- Bruk frivillige voksne, samtykke og testbarn. Ikke legg inn ekte helsedata eller hemmelig skoleinformasjon i skjermbilder.
- Kontroller at Netlify-deploy tilsvarer siste grønne SHA på `main`, at Supabase-migreringene er brukt og at e-postavsender er verifisert.
- Bruk to forskjellige foreldreenheter/nettleserprofiler (A/B) og minst én fysisk Android og én iPhone for barneappen. Åpne inkognito/ny profil for test av førstegangsregistrering, men **ikke** inkognito for å installere PWA.
- Ved feil: noter dato/klokkeslett, nettleser, OS, skjermbredde, aktiv skole/trinn, hvilken skjerm som feiler og GitHub SHA. Del aldri engangskoder, QR-token eller JWT i bug-rapporter.

## Scenario 1 – opprettelse og synk mellom foresatte
- [ ] Foresatt A starter fra forsiden, ber om e-postkode og registrerer seg uten veiledning.
- [ ] Foresatt A oppretter én familie med to barn, ulike klassetrinn, og fullfører.
- [ ] Begge barna vises etter omlasting og gjenåpning, uten en midlertidig tom familievisning.
- [ ] Foresatt A inviterer foresatt B med familieinvitasjon; B registrerer egen konto og aksepterer.
- [ ] B ser samme barn og familieaktiviteter, men ingen konto-/QR-hemmeligheter til A.
- [ ] Foresatt A markerer en lekse utført, B oppdaterer og ser samme status; B endrer den tilbake og A ser endringen.

## Scenario 2 – QR, installasjon og enhetstilgang
- [ ] I familieoversikten vises «Vis QR-kode» tydelig for hvert barn uten installert app.
- [ ] QR-skanning med barnets telefon gir kun barnets egen ukeplan, aldri søskens profil/lekser.
- [ ] Status etter skanning er «Åpnet på telefonen», **ikke** «Installert».
- [ ] På Android: Installer/Legg til på hjemskjermen og åpne Skoleuka fra appikonet; bekreft at status endres til «Barneappen er klar» hos foresatt.
- [ ] På iPhone: Del → Legg til på Hjem-skjerm → Åpne appikonet; bekreft tilsvarende.
- [ ] Den andre barneprofilen beholder QR-oppfordringen til akkurat den enheten er satt opp.
- [ ] Foresatt tilbakekaller barneenheten i QR-dialogen; på barnets enhet blir videre tilgang avvist, og QR-oppsettet dukker opp igjen.
- [ ] Utløpt eller brukt QR kan ikke brukes på nytt; en ny kode virker.

## Scenario 3 – familieaktivitet, lekser og pakkeliste
- [ ] Foresatt oppretter en aktivitet for ett barn og en felles aktivitet; begge foresatte ser dem etter oppdatering.
- [ ] Barnet ser egen og felles aktivitet, men ikke søskens private aktivitet.
- [ ] Barnet krysser av lekse og utstyr; foreldrene ser samme status etter oppdatering.
- [ ] Ved kortvarig nettverksbrudd gir appen en forståelig feilmelding og later **ikke** som at en avkrysning er synkronisert.
- [ ] Quiz og leksehjelp åpnes kun der kildeinnholdet faktisk støtter oppgaven.

## Scenario 4 – ukeplanens kildetilgjengelighet
Bruk kontrollerte teststubber eller en skole/trinn med kjent testkilde; ikke manipuler en faktisk skoles publisering.
- [ ] PDF-lenke mangler på trinnsiden: «Ikke funnet på trinnsiden», med lenke til skolen – uten påstand om at skolen ikke har publisert.
- [ ] Skolesiden svarer 5xx / timeout: hentefeil + «Prøv igjen». **Ikke** «Ukeplan ikke publisert».
- [ ] PDF-lenken finnes, men nedlasting feiler: egen hentefeil og lenke til original-PDF.
- [ ] PDF finnes, men kan ikke tolkes: egen tolkningsmelding; ikke en tilsynelatende komplett, tom ukeplan.
- [ ] AI-tolkning pågår, feiler eller er delvis: riktig status og originale kildehenvisninger, ingen oppfunne leksefrister/oppmøter.
- [ ] Når ukeplan for neste skoleuke publiseres på søndag/mandag, byttes den på riktig ISO-uke, og gamle avkrysninger flyttes **ikke** til en annen uke.

## Godkjenningskriterier
Alle scenarier må passere uten hjelp fra utvikler, og det må ikke være datalekkasjer mellom barn/familier. Registrer alle avvik som GitHub Issues med reproduksjon før å invitere flere eksterne familier.

### Automatisert dekning
`tests/browser/family-journey.test.mjs` dekker kryssende UI-/API-flyter i Chromium med isolert, delt test-backend. Ekte e-post, nettverksbrudd på fysiske telefoner, Android/iOS installasjonsintegrasjon og faktisk produksjons-RLS må testes separat.
