# Skoleuka 2.1 – samlet familieuke

## Funksjon
Øverst på familieoversikten vises **mandag–søndag** i én tidslinje. Den kombinerer:
- Lekser og kjente frister per barn fra allerede innlastet skole-PDF. Oppgaver uten dokumentert dato ligger under «Hele uka» og får **ikke** en konstruert frist.
- De samme «Praktisk å huske»-beskjedene som tidligere, med dato bare når `schoolNoticeDate` kan fastslå én entydig ukedag.
- Kommunens registrerte skolefridager/planleggingsdager med synlig merking av reserveversjon og lenke til offisiell skolerute.
- Familiens egne aktiviteter, inkludert ukentlig gjentakelse og lørdag/søndag.

Velg «Alle i familien» eller ett barn. Barnespesifikke aktiviteter og lekser filtreres; aktiviteter som gjelder hele familien følger alle barn, og relevante kommunale skoledatoer beholdes for valgt barns skole. Det eksisterende detaljkortet for «Praktisk å huske», aktivitetsskjemaet og barnekortene beholdes under tidslinjen.

Alt innhold HTML-escapes. Kildelenker er HTTPS og skole-PDF-lenker kontrolleres av `sourcePdfLink`; familiens egne registreringer merkes separat og har ikke falsk «offisiell kilde». Manglende eller uferdig PDF vises som en eksplisitt advarsel.

## Supabase RLS-verifikasjon utført 31.10.2026

Utført på prosjektet `ukeplanen` i **transaksjoner som ble rullet tilbake**. Det eksisterte to Supabase Auth-brukere, men bare én reell familietilknytning. Den andre brukeren ble derfor midlertidig gitt foreldremedlemskap kun inne i transaksjonen for RLS-simulering. Uvedkommende ble simulert med annen JWT-`sub` uten medlemskap.

| Test | Resultat |
| --- | --- |
| Eksisterende foresatt oppretter og leser aktivitet | Bestått |
| Midlertidig foresatt i samme familie leser | Bestått |
| Midlertidig foresatt i samme familie oppdaterer og sletter | Bestått |
| Uvedkommende leser, oppretter, oppdaterer eller sletter | Avvist |
| Forelder knytter aktiviteten til barn i en **annen** testfamilie | Avvist av sammensatt FK |
| Eksisterende data etter rollback | Uendret |

Verifikasjonen bruker den faktiske RLS-policyen `private.parent_family_ids()`, PostgreSQL-rollen `authenticated` og kontekstspesifikke JWT-`sub`-verdier. Ingen bruker eller testaktivitet ble lagret. Denne testen er sterkere enn statisk analyse av policyene, men er **ikke** en full end-to-end-invitasjons- og innloggingstest med to separate nettlesere. Det anbefales som siste akseptansetest før større utrulling.

## Tester og utrulling

- `npm run check`: kildekonsistent 7-dagers datamodell, barn/gruppefiltrering, helgeaktiviteter, ukjent leksefrist, kommune-snapshot, HTML-escaping og lenkesikkerhet.
- `npm run test:browser`: mobilvisning, barns filter, korrekt kildehenvisning, revisjon av familieaktivitet direkte fra tidslinjen og varig lagring.
- Ingen ny databasemigrasjon eller nye API-nøkler kreves; Skoleuka 2.1 gjenbruker den allerede eksisterende RLS-beskyttede `public.family_activities`-tabellen.
- PR-en må bestå Github Actions og Netlify-forhåndsvisning før merge.
- Den offisielle PDF-en og skoleruta har forrang ved avvik, og ukjente tidspunkt blir aldri gjettet.
