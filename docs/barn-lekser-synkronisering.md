# Skoleuka – felles lekseprogresjon mellom barn og foresatte

## Implementert
- Barnets `/barn/` leser og oppdaterer `public.homework_progress` via
  `/api/child-access?action=progress` og `POST action=set-progress`.
- QR-paret enhet får **aldri** Supabase Auth-token eller `service_role`-nøkkel.
  Ved hver lesing og skriving hash-verifiseres barne-enhetens bearer, den må være
  aktiv, ikke utløpt eller tilbakekalt, og serveren verifiserer barnet i rett familie.
- Innkomne POST-felter er kun `year`, `week`, `taskKey` (eksakt 16 tegn
  heksadesimalt) og `completed` (boolsk). Klienten bestemmer ikke `child_id`,
  `family_id`, `updated_by` eller `updated_by_device`.
- Endringer gjelder nærliggende skoleuker, med maks 100 ulike lekseoppgaver per barn/uke.
- Leksenøklene er identiske med foresattes eksisterende `taskFingerprint`, inkludert
  fag, gruppe, frist og gjentakelsesdag.
- Foreldre fortsetter å bruke de eksisterende fire RLS-policyene.
- QR-skriving attribueres til `updated_by_device`; foreldres skriving attribueres
  til `updated_by`. Triggeren verifiserer at enheten fortsatt er aktiv,
  ikke tilbakekalt, og tilhører nøyaktig samme barn/familie som progresjonsraden.
- Familien henter nye avkrysninger når fanen får fokus og omtrent hvert minutt
  mens familieoversikten er synlig. Barneappen oppdaterer ved åpning, retur til fanen
  og via Oppdater-knappen.
- Slettede/tilbakekalte QR-sesjoner kan verken lese eller endre delt progresjon.

## Overføring av tidligere lokal status
De lokale avkrysningene fra barneappens første versjon ligger fortsatt under
`skoleuka.child.checked.v1.<barn>.<år>.<uke>.homework.all`.
Når skyen har status for en oppgave, **vinner skyens status**, også om den er
`false`. Hvis barnet tidligere hadde krysset av en lekse lokalt og **ingen
skyverdi** finnes, får barnet en knapp til å overføre bare disse manglende
avkrysningene. Overføring skjer ikke automatisk, slik at en foreldres
tidligere valg aldri stilltiende overstyres.

Pakkeliste og quizfremdrift fortsetter lokalt på enheten. En endring som feiler
i Supabase rulles tilbake visuelt, og barnet får en tydelig feilbeskjed.
Det finnes foreløpig ingen offline-kø som lover synkronisering senere.

## Produksjonsmigrasjon
Supabase-prosjekt: `qxejliyfgfeigvxsqupg`.

Migration `20261031180805_child_homework_progress_sync.sql` ble kjørt
31. oktober 2026 og verifisert:
- `public.homework_progress.updated_by` er nå nullable.
- Kolonnen `updated_by_device` har fremmednøkkel til aktive barneenheter.
- `private.stamp_homework()` beholder foreldres attribusjon og krever at
  barneenhet er gyldig og tilhører samme barn/familie for child-writes.
- `service_role` kan SELECT, INSERT, UPDATE på fremdrift; ingen nye grants
  til `anon` eller `authenticated`.
- Fire eksisterende RLS-policyer for foresatte er uendret, og RLS er fortsatt
  aktivert. Det var 0 lagrede progresjonsrader ved verifisering.
- Netlify serverfunksjonen må være publisert før barnet kan bruke ny skriving.

## Manuell end-to-end etter Netlify-publisering
1. Logg inn som foresatt, åpne familieoversikten og en ukeplan for barn A.
2. Bruk barn A sin allerede parede enhet (ingen ny QR trengs). Kryss av én lekse.
3. Gå tilbake til foresattes familieoversikt eller oppdater den. Statusen skal
   nå være krysset av for barn A, ikke barn B.
4. Fjern samme avkrysning fra foresattes ukeplan, og oppdater barnets app.
   Den skal være fjernet også der.
5. Test samme barn på en annen paret enhet.
6. Fjern enhetstilgangen fra foresattkontoen; kontroller at videre
   synkronisering fra denne enheten avvises. Ikke bruk service-nøkler i klient.

## Testdekning
`npm run check`: nøkkelkompatibilitet, RLS/grants-migrasjonskontrakt,
sikker server-avgrensning, revokering, ugyldige nøkler/uke og lokal import.

`npm run test:browser`: deling på to barneenheter, serverbekreftet
avkrysning, motstridende foreldresvar, rollback ved serverfeil, offline
og import uten å overstyre foreldres eksplisitte avmerking.

Fysisk iOS/Android- og reell foresatt-til-barn-test er ikke erstattet
av CI-testene; gjennomfør punktene over etter produksjonsutrulling.

## Avgrensning / sikkerhetsoppfølging før bred utrulling
En 16-tegns `taskKey` er et deterministisk fingeravtrykk, ikke et autentisert
bevis på at oppgaven finnes i den publiserte PDF-en. Den nåværende
`set-progress`-ruten begrenser skriving til en gyldig, ikke-tilbakekalt
enhet for **eget barn**, nærliggende skoleuker og maks ca. 100 ulike nøkler
per uke, men en modifisert klient kan likevel sende oppdiktede leksenøkler
for dette barnet. Antallsgrensen kontrolleres ikke atomisk ved parallell
skriving. Dette gir ingen direkte tilgang til søsken eller andre familier,
men er en integritetsbegrensning. Ikke beskriv rutens formatkontroll som
serververifisering mot faktiske skolelekser.

Før løsningen tilbys mange familier: innfør serververifiserte oppgavebevis
bundet til skole, trinn, uke, gruppe og oppgave, eller en autoritativ
server-side allowlist fra validert ukeplan. Test også parallell skriving
og ratebegrensning, uten å overføre ekstra rettigheter til barneenheter.
