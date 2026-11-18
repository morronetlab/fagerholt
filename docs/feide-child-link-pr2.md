# Feide PR 2 – sikker kobling til eksisterende barneprofiler

**Status:** Utvikling pågår. Stablet oppå [PR #169](https://github.com/morronetlab/fagerholt/pull/169). Ikke produksjonsklar.

## Sikkerhetsmodell
1. Foresatt må være logget inn i Supabase og ha tilgang til barnet via **eksisterende children-RLS**, verifisert på server ved hver handling.
2. Foresatt starter en engangsinvitasjon (tilfeldig 256-bit token, 10 minutter, SHA-256 hash lagres).
3. Barnet bruker Feide Authorization Code + PKCE på serveren (fra PR #169); verifisert `iss + sub` tilknyttes kun forespørselen, ikke barnet.
4. Barnet får en tilfeldig 6-sifret bekreftelseskode på egen enhet. Foresatt må taste denne og uttrykkelig godkjenne i sin innloggede familiekonto.
5. Først da registreres Feide-koblingen. Ingen automatisk matching på navn, e-post, skole eller klassetrinn.
6. Unike aktive koblinger på både `child_id` og pseudonymisert Feide-subjekt. Alle nye tabeller er server-only og har RLS uten grant til klientroller.
7. Slett/trekk tilbake kobling må kreve samme verifiserte foresatt-RLS.
8. **Ingen Feide-autentisert tilgang til ukeplan/lekser før separat tilgangsmodell og logout-integrasjon er ferdig kontrollert.** QR-pålogging forblir uendret.

## Status før implementasjon
- Supabase prosjekt `ukeplanen` er i bruk i produksjon – **ikke kjør ny migrasjon på prod** før isolert verifikasjon og godkjenning.
- Feide RP-Initiated Logout er testet i PR #169 med testbruker, men det er fortsatt en isolert test.
- PR 2 bruker eget Netlify Deploy Preview og må registrere egne eksakte Feide callback/logout URI-er; aldri åpne nye familiedata uten server-side autorisering.

## Akseptansekriterier
- [ ] To ulike familier kan ikke lese, koble eller godkjenne hverandres barn.
- [ ] Uautorisert forespørsel, utløpt token, gjenbruk, feil kode, feil Feide-sub eller feil CSRF-origin avvises.
- [ ] Brukeren må fysisk hente bekreftelseskoden fra elevens enhet og selv godkjenne koblingen.
- [ ] Feide-kobling gis ingen direkte Supabase- eller QR-tokens.
- [ ] Foresatt kan trekke tilbake koblingen.
- [ ] Tester og CI er grønne. Ingen merge til produksjon.
