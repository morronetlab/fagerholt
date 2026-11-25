# Skoleuka 2.3 – Fase D: godkjenningsprotokoll

## Automatisk (CI – PR #185)
- [ ] Node unit / syntaks
- [ ] Chromium browser suite (inkl. mobilkontroller ved 320, 390 og 700 px)
- [ ] Firefox WebKit-sammenlignbar barneapp + familiekontroller
- [ ] WebKit barneapp + familiekontroller
- [ ] Netlify Deploy Preview = ready
- [ ] Ingen 5xx / uventede JS-feil i testene
- [ ] Original skole-PDF kildeverifisert eller eksplisitt registrert som utilgjengelig (Actions kjører noen kildejobber med continue-on-error)

## Manuell fysisk testing – krever faktisk utstyr
**Ikke kryss av uten gjennomføring.** Bruk syntetisk testfamilie eller anonymisert testscenario; unngå å publisere private barneopplysninger i screenshots/logg.

| Enhet | Scenario | Resultat | Observasjon |
| --- | --- | --- | --- |
| iPhone Safari, kompakt skjerm | Min familie: oversikt, aktiviteter, legg til barn, 44px-tapper, modaler, skjermtastatur | Ikke utført | |
| iPhone PWA | Oppstart, tilbake til app, refresh etter låst skjerm | Ikke utført | |
| Android Chrome/PWA | Min familie: navbar, aktiviteter, tastatur og avkrysning | Ikke utført | |
| iPad Safari portrett/landskap | Familieoversikt og kalender uten horisontal overflow | Ikke utført | |
| iPad installert barne-PWA | QR-paring, cookie-basert session transfer, oppstart etter installering | Ikke utført | |
| Desktop Chrome/Firefox/Safari/Edge | Modal, tastaturnavigasjon, 200% zoom, ingen regresjoner | Ikke utført | |

## Flerbruker-regresjon (isolert Supabase nødvendig)
- [ ] Foresatt legger til to syntetiske barn, inviterer annen foresatt.
- [ ] Barn A sjekker av lekse på enhet 1. Foresatt ser status på enhet 2.
- [ ] Foresatt fjerner avkrysning. Barneappen ser oppdatert status etter refresh.
- [ ] Barn A får ikke se Barn B eller foresattdata.
- [ ] Utgått/tilbakekalt QR-økt avvises både ved oppdatering og ny lesing.
- [ ] Frakoblet / 503 viser feil og lagrer ikke falsk fullføring.

## Akseptanseregler
- P0: tilgangs-/personvernsbrudd, alvorlig tap av data, total produksjonsstans – stopper release.
- P1: sentral flyt brutt eller iOS PWA ikke brukbar – stopper release.
- P2: kontrast/trykkflate/overflow/visuell inkonsistens – egen issue og plan.
- Kode/CI alene er **ikke** godkjenning av fysisk installert iOS PWA.
- Ikke merge PR #185 som «fullt plattformgodkjent» før den manuelle matrisen er dokumentert.

## Release
- GitHub PR: https://github.com/morronetlab/fagerholt/pull/185
- Testverktøy: GitHub Actions og Netlify Deploy Preview
- Produksjon skal ikke endres av denne verifikasjonsprotokollen alene.
