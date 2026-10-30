# Kildekontroll for «Praktisk å huske»

Oppdatert 30. oktober 2026. Denne kontrollen gjelder **kun allerede publiserte, offentlige ukeplaner** fra MinSkole. Ingen familieprofiler, barnenavn eller brukerspesifikke avkrysninger inngår i kilderevisjonen.

## Verifisering mot original-PDF

`node scripts/verify-practical-original-pdfs.mjs` henter de faktiske PDF-bytefilene fra skolens offisielle server, kontrollerer PDF-signaturen, ekstraherer PDF.js-tekst og krever dokumenterte nøkkelord i originale dokumenter. Testen gir særskilt **UNVERIFIED ORIGINAL PDF** dersom en fil ikke er tilgjengelig eller mangler lesbart tekstlag. CI kjører kontrollen som separat best-effort steg med synlig resultat, mens vanlige tester må være grønne.

| Skole og trinn | Kilde og kontroll | Må ikke konkluderes uten kilde |
| --- | --- | --- |
| [Sjøstrand 2. trinn, uke 44/2026](https://www.minskole.no/DynamicContent//Documents/866-Sjostrand-Ukebrev-uke-44-ca300aa3-539e.pdf) | Vaksine onsdag og eksplisitt «ta med gymsko» | Ikke oppgi klokkeslett eller utstyr som ikke står i PDF |
| [Voiebyen 5. trinn, uke 44 (eldre)](https://www.minskole.no/DynamicContent//Documents/864-voiebyen-Ukeplan-uke-44-dd1c256c-7eb1.pdf) | Planlagt tur, men dagen er ikke bestemt | Ingen oppfunnet ukedag, frist eller refleks-/turutstyr |
| [Fagerholt 4. trinn, uke 44/2026](https://www.minskole.no/DynamicContent//Documents/854-fagerholt-Ukeplan-uke-44-93c849fa-ad01.pdf) | Korrekt uke, original-PDF lesbar | Ingen antatte deadlines fra dagsprogrammet |
| [Tordenskjolds gate 6. trinn, uke 44/2026](https://www.minskole.no/DynamicContent//Documents/863-todda-Uke-44-.-c350c815-359d.pdf) | Norsk, naturfag og matematikk i original PDF | Vanlige lekser skal ikke overta praktisk huskeliste |

**Resultater dokumenteres i GitHub Actions-loggen**, ikke bare som grønne mocktester. Kontroll av lesbart tekstlag er ikke en fullstendig visuell gjennomgang av alle PDF-tabeller og illustrasjoner. Kilder uten brukbart tekstlag rapporteres som uverifiserte, ikke godkjent.

## To nivåer av kvalitetssjekk

1. **Kontroll ved hver ny PDF-tolkning**: `auditPracticalSource` sammenligner kritiske uttrykk i originalens PDF.js-tekstlag med resultatet som faktisk vises til foreldrene. Manglende eller ikke-støttede beskjeder registreres med antall i serverloggen (`ukeplan.critical_pdf_audit`). Funksjonen **tilføyer aldri** beskjeder, datoer eller instruksjoner på egen hånd.
2. **Regresjonstester før hver merge**: `tests/source-audited-practical.test.mjs` tester også negativtilfeller: «ikke planleggingsdag», «SFO er ikke stengt», skoleoppgave *om* en ferie, uavklart turdag og modeller som forsøker å legge til fridag eller vaksinetid.

En oppsummering i familiekortet er **ekstraktiv**: AI kan velge et sammenhengende, ordrett utdrag fra allerede kildekontrollert tekst. Utdraget avvises hvis det endrer betydning eller fjerner selve skolefri-/vaksineinformasjonen. Ved avvisning brukes en enkel tekstforkortelse, og full beskrivelse er alltid tilgjengelig.

## Foreldrenes visning

- Høyest prioritet: forhold som påvirker voksnes jobbdag, levering, henting eller barnepass.
- Deretter vaksiner og andre konkrete helsebeskjeder, frister og særskilte aktiviteter.
- Dato vises bare når dag er dokumentert og stemmer med aktuell ISO-uke. Ved uklar dag vises ingen oppdiktet dato.
- «Les hele beskjeden» viser full tekst. Dersom et entydig kildeutdrag kan kobles til en bestemt PDF-side, vises det også. «Se original PDF» åpner den offisielle filen; sidetall inkluderes bare ved sikker kobling.
- Fullstendig PDF er fortsatt fasit ved tvil.

## Kjente begrensninger

Automatisk ekstraksjon kan overse informasjon som kun finnes som bilde eller i et komplekst tabelloppsett. Det er et åpent forbedringspunkt for visuell kilderevisjon og bredere skolemønstre. En automatisert ord-/tekstlagskontroll er **ikke bevis for at alle beskjeder er korrekt fanget opp**. Vi må fortsette å sammenligne mot visuelt originale PDF-sider i stikkprøver, særlig når kilderevisjonen indikerer mulige avvik.
