# Feide PR 3 – Feide-innlogging i barneappen (pilot)

Denne PR-en bygger videre på den godkjente Feide-identitetskoblingen i PR #170 og den serverstyrte inn-/utloggingen i PR #169.

## Sikkerhetsinvarianter
- **Ingen QR-bearer blir opprettet eller delt gjennom Feide.** Dagens QR-innlogging forblir uendret.
- Feide-økten lagres kun i kortlivet, kryptert HttpOnly-cookie og er låst til eksakt Netlify Deploy Preview for denne PR-en.
- Tilgang til barnedata krever en **aktiv `feide_child_links`-kobling på hver eneste API-forespørsel**. Ingen e-post/navn-matching, klientstyrt child/family-id eller ubetinget service-role-tilgang.
- Kun read-only child-data samt eksisterende validerte `set-progress` / `set-packing` API-operasjoner er tillatt. Ingen foresattfunksjoner eller device-administrasjon.
- RP-Initiated Logout avslutter lokal Feide-cookie før redirect til Feide, med `id_token_hint` og `state`.
- Revokert kobling må avvise neste request umiddelbart, selv om gammel ID-token-cookie eksisterer.
- Ikke endre produktions-`main` eller kjøre database-DDL før gjennomgang.

## Manuelle akseptansekriterier
- Barn med aktiv Feide-kobling kan logge inn i egen ukeplan og bare se sin skole, klasse, gruppe, aktiviteter og framdrift.
- Lekser og pakkeliste kan krysses av og synkroniseres med foresattsiden.
- Barn uten godkjent kobling får ikke adgang.
- Foresatt fjerner kobling -> videre child API kall avslås, og private data fjernes ved oppdatering.
- Feide-utlogging avslutter både lokal barnesesjon og Feide-økt. Ny login krever Feide-autentisering som forventet.
- QR-innlogging, QR-lagring og installert iOS/Android PWA fungerer uendret.
- Enhetstester, nettlesertester og Netlify Deploy Preview grønt. **Ingen merge uten manuell pilot.**
