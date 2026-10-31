# Skoleuka – Barnets egen ukeplan, QR og PWA (første versjon)

## Hva er bygget
1. Foresatt logger inn i familiekonto, åpner **Barna mine → Inviter barnet (QR)** under det aktuelle barnet.
2. Server verifiserer foresattes bekreftede Supabase Auth-session og tilgang til barnet via **eksisterende RLS**. Først deretter lages en **32-byte tilfeldig QR-token** med ti minutters gyldighet. Bare SHA-256-hash lagres i databasen. QR lages lokalt/server-side, aldri via en ekstern QR-bildetjeneste.
3. Barnet skanner koden med sin mobil/nettbrett. Åpner `/barn/?pair=...`, koden løses inn **én gang**, og den spesifikke enheten får en separat, tilbakekallbar lesesesjon som gjelder i maks 180 dager. QR-strengen fjernes umiddelbart fra nettleseradressen. Ingen e-post/passord eller foreldres Supabase-sesjon kopieres til barnets enhet.
4. `/barn/` er en egen, mobiltilpasset PWA-visning med **kun barnets profil**, skoleuke (mandag–fredag), gruppefiltrerte skolehendelser, lekser, pakkeliste og egne/felles familieaktiviteter.
5. Foresatt kan se aktive enheter og **Fjern tilgang** fra QR-vinduet. Neste serveroppslag fra den enheten avvises.
6. Barnet får veiledning om «Legg til på hjemskjermen» på iPhone/iPad og installasjonsvalg på Android. **Nettleseren, ikke webappen, styrer installasjonen.** QR-skanning kan ikke automatisk installere en PWA. På enkelte iOS-versjoner har Safari og en installert webapp forskjellige lagringskontekster; hvis barnet ikke ser sin profil etter installasjon, opprettes en **ny QR-kode** og skannes/åpnes i den installerte appen dersom mulig. Dette bør testes på faktisk iPad/iPhone før utrulling.
7. Den vanlige per-barn ukeplanen (åpnet fra foreldrenes barnekort) låser skole og klassetrinn, men lar gjestebrukere bytte som før. Dagsvisningen har eget kort for familiens egne/felles aktiviteter.
8. Forsiden viser nå tre enkle innganger: foresatte, barn og offentlig ukeplan, samt fire tydelige oppsettsteg.

## Datasikkerhet og barns personvern
- Server-endepunkt `/api/child-access` autoriserer `create`, `devices`, `revoke` på hver foresattforespørsel med Supabase JWT og barnets RLS-beskyttede rad. **Det er ikke tilstrekkelig å bare kjenne barnets ID.**
- Barnet får **ikke** Supabase Auth-JWT, API-secret/service-role-key, familie-ID, søskenprofiler, foresattes e-postadresser, andres aktiviteter, barneadministrasjon eller rett til å redigere familieaktiviteter.
- Barne-enhetens sesjon sendes kun som Authorization-header over HTTPS. Den ligger i `localStorage` på barnets enhet, og aldri i lenken. Ved oppsett brukes en kortvarig QR-token i URL, som straks strippes fra historikken; unngå logging av querystring for `/barn/`.
- Bare serveren kan lese `public.child_pairings` og `public.child_device_sessions`; begge tabellene har **RLS på og ingen grants for anon eller authenticated**. Service key er bare Netlify servermiljøet.
- Foresatt kan trekke tilbake aktive enheter; sesjonen utløper automatisk. En mistet enhet må sperres av foresatt.
- PWA service worker cacher utelukkende offentlige statiske filer. **Ingen API-svar, foresatt-/barnesesjoner, skoleplan-PDF, lekseprogresjon eller private aktivitetsdata cacheres.** Ved manglende nett kan den installerte appen starte men viser ikke tidligere private data.
- Av sikkerhetsgrunner er barnevisningen **lesemodus**: Barn kan se egne lekser/aktiviteter men kan foreløpig ikke endre foresattes avkrysninger.
- School/grade-data fra skolens PDF er offentlige; barnets kallenavn og familieaktiviteter kommer bare gjennom verifisert, én-barn-sesjon.

## Utrulling (ikke gjort i PR)
1. Sjekk kildekode, testresultater og produktets barnevern/personverkrisiko.
2. Opprett helst en **separat staging Supabase**. Kjør `supabase/migrations/20261031_child_pairing_v1.sql` i staging; to tabeller med RLS, ingen klientrettigheter.
3. Verifiser `get_advisors` for security og følgende scenarier med faktiske ulike brukere: foresatt kan pare eget barn; uvedkommende kan ikke pare annet barns profil; QR brukes én gang, utløper, er ugyldig etter 10 min; barne-API leser kun eget barn og egne/felles aktiviteter; aktiv enhet kan trekkes tilbake; tap av foreldretilgang bør testast; direkte REST mot nye tabeller med anon/authenticated gir ikke lesetilgang.
4. Test på faktiske **iPhone, iPad og Android**, inkludert hjemskjerm-installasjon og mulig lagringsisolasjon i iOS.
5. Bare deretter migrer produksjonstabellene, bygg/deploy frontend og aktiver funksjonen for foreldre.
6. Hvis migrasjonen ennå ikke er kjørt, gir QR-endepunktet trygg feil i stedet for å gi tilgang; ingen data eller foreldrefunksjoner skades.

## Kjent begrensning / senere versjon
- Ingen pushvarsler eller offline lagring av barnets private opplysninger.
- Barn kan ikke opprette/endre aktiviteter, invitere noen eller markere lekser i foreldre-synkronisert progresjon.
- QR-veiledningen kan ikke installere direkte uten OS-/nettleservalg; iOS kan kreve ny QR for lagring i installert PWA.
- Barnets enhetsnavn er kun nummerert (personvernvennlig), ikke automatisk kjent som en spesifikk fysisk enhet.
- Eksisterende konto- og QR-prosess kan videreutvikles med foresattes samtykke og strengere sesjonshåndtering.

## Verifikasjon
- `npm run check`: sikkerhetskontrakter, mock-verifisert parent Auth/RLS, bruk-av-QR én gang, tilbakekalling, ISO-uke-/aktivitetstilgang og genererte PWA-ikoner.
- `npm run test:browser`: egen barnevisning, gruppeisolering, aktivitetshendelser, installasjonsforklaring, én-gangs QR, lokale sesjoner, valg på eksisterende foreldreukeplan, og forside.
- Netlify-preview brukes til design og navigasjon. **En fungerende QR-/innloggingstest i preview krever at migrasjonen er utført i testmiljøet.**
