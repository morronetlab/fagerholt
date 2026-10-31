# PR #68 – Offisiell skolerute i familieoversikten

## Kilde

Kilde: [Kristiansand kommunes skolerute](https://www.kristiansand.kommune.no/navigasjon/barnehage-og-skole/skole-og-sfo/skoleruta/), kontrollert 30. oktober 2026. På nettsiden står at enkelte skoler kan flytte planleggingsdager etter godkjenning, og at lokale endringer oppgis på skolens egen hjemmeside.

Skoleåret 2026–2027: skolestart 13. august 2026; høstferie 28. september–2. oktober; elevfri fredag **6. november (Sørlandsk lærerstevne)**; juleferie fra 21. desember frem til skolestart 5. januar 2027; vinterferie 22.–26. februar 2027; påskeferie 22.–30. mars; fri 6. og 7. mai samt 17. mai; siste skoledag 18. juni.

Kommunen oppgir særskilt at SFO er stengt 24. og 31. desember 2026 og i uke 27–30 sommeren 2027. **Dette er ikke det samme som at SFO er stengt på alle elevfrie dager.** For fredag 6. november vises derfor «SFO: åpning eller stenging er ikke oppgitt» med lenke til skolen.

## Teknisk gjennomføring

- `GET /api/school-calendar?school=fagerholt&year=2026&week=45` henter kun offentlig kommunal HTML fra én fast, forhåndsdefinert URL. En deterministisk HTML-tabellparser leser datointervall, måneder og merknader. Den gjetter ikke ukedag, klokkeslett eller SFO-status fra øvrig tekst.
- Ekstra kontroll: Det må være en lesbar tabell med minst åtte skoleårsrader, *høstferie* og *skolestart*. Hvis dette mangler, brukes ingen delvise/ukontrollerte resultater.
- Fallback for skoleåret 2026–2027: datert, manuelt kontrollert snapshot fra kommunens tabell (`SNAPSHOT_VERIFIED_AT=2026-10-30`) med tydelig «sist kontrollert». For senere år vises ingen fiktive datoer ved utilgjengelig kilde.
- API-et svarer med `sourceStatus:live|snapshot|unavailable`, `scope:municipal_default`, `localChangesPossible:true`, kildeadresse, og bare kalenderhendelser innenfor den etterspurte ISO-uka.
- Ingen AI-bruk, profil-ID-er, barnenavn, grupper eller lekseprogresjon sendes. Klienten etterspør bare skole-ID, ISO-år og uke. Familier med flere barn på samme skole får én kommunal hendelse per dag, og skoleruta kan vises selv om PDF-en ikke finnes.
- Offisielle kommunale beskjeder vises med egen kildemarkør. PDF-basert skoleinformasjon beholder sin separate kilde. De blandes aldri sammen som om kommunal skolerute var en bekreftet lokalbeskjed.

## Sjekk før merge

1. `npm run check` må passere alle enhetstestene, inkludert fredagen 6. november, SFO-julaften, påske- og mai-fridager, strenge kildeparsetester og ingen fiktive skolefridager.
2. `npm run test:browser` verifiserer at fredag etter kl. 14 viser neste uke, at 6. november er synlig også uten PDF, at SFO-status ikke antas, at viktig dato prioriteres foran ordinære skolebeskjeder, og at flere barn på samme skole ikke dobler kortene.
3. Test i Netlify preview med familien og sammenlign mot kommunens originale skolerute.
4. **Lokale avvik** må fortsatt dobbeltsjekkes med skolens egen hjemmeside. Det er ikke implementert automatisk lesing av lokale skolekalendere eller SFO-åpningstider per skole.

## Videre arbeid

- Kvalitetssikre parseren mot endringer i kommunens HTML-mal og legg til datert overvåking av kildestatus.
- Innfør per-skole overstyringer **kun** når avvik kan dokumenteres på skolens offisielle nettside, og gjør begge kilder synlige.
- Utvid arkitekturen til andre kommuner først etter verifiserte kilderegler per kommune. Ikke bruk Kristiansand-datoene for skoler utenfor kommunen.
