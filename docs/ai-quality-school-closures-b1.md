# AI Quality 2.0 – PR B1: Source-backed school closures

This change affects only the **rules/fallback parser** and the presentation of its closed-school days. It does not rewrite the AI prompt, existing cached AI results, Supabase, homework completion, or family records.

## Verified original-school evidence (November 2026)

| Source (SHA-256 locked) | Active school week | Explicit closure evidence | Correct behavior |
| --- | --- | --- | --- |
| Lovisenlund grade 4, week 45 | Nov 2–6 | School planning days Thursday and Friday | Record planning-day notice; mark Thursday Nov 5 and Friday Nov 6 closed |
| Nygård grade 4, week 45 | Nov 2–6 | School closed Thursday Nov 5 and Friday Nov 6 | Record school-closed notice; remove routine Thursday gym events/equipment |
| Fagerholt grade 4, week 44 | Oct 26–30 | Planning-day dates are **Nov 5–6**, i.e. week 45 | Keep future notice, but do **not** mark October 29–30 closed |
| Sjøstrand grade 2, week 44 | Oct 26–30 | No reviewed closure | Never mark a day closed |

The original official PDFs are downloaded in CI and compared against the manually reviewed SHA-256 manifest. No PDF binaries are committed.

## Technical behavior

- [school-closure-source.mjs](../lib/school-closure-source.mjs) checks original PDF.js text for explicit planning-day or closed-school language and day names. When exact dates are printed, they must equal the requested ISO week and year. Negated/historical and next-week-only mentions never shut down a current-week day.
- [plan-core.mjs](../lib/plan-core.mjs) adds the supported notice to the fallback plan even if the PDF's generic section detector misses it; for confirmed **current-week** closures it sets `days[day].closed=true`, clears routine `events` and `bring`, and adds a `dayNotes` notice. Homework and other daily notes remain intact; no due dates are guessed.
- [family-core.mjs](../public/shared/family-core.mjs) and [app.js](../public/app.js) exclude `everyday` equipment from the day-specific bag when the actual school day is marked closed. Other school days retain their normal supplies and checkboxes.

All matches are source-derived and kept in the plan response. Missing or ambiguous source proof does not create a closed day. The marker is backward-compatible; plans without `closed` behave as before.

## Tests and immutable acceptance checks

- Pure/synthetic regression tests include in-week Lovisenlund and Nygård closures, timetable/packing suppression, future Fagerholt dates, invalid calendar dates, cancelled/negated notices, and no routine/everyday equipment on a closed day.
- The original-PDF evaluator publishes each document's closed weekdays and **booleans only** for source-backed closure notices, never original excerpt or contact information.
- The [original-school closure gate](../scripts/check-original-school-closures.mjs) requires exactly the approved days and notice types across **all four** SHA-verified originals. Fagerholt week 44 is explicitly required to have zero closed days.
- Existing [original-PDF ratchet](../scripts/check-approved-original-pdf-baseline.mjs) still protects the 13 formerly passing expectations and 18 source anchors. The PR A triage tracks three resolved gaps.

**Observed expected score after B1:** 16/26 golden assertions (was 13/26). The two P0 missing-closure notices and the Nygård P1 closed-day packing discrepancy are resolved. Seven homework and three day-packing gaps remain for B2/B3.

## Limitations

- A verified original statement may be printed in a complex table. A parser cannot infer closure from an isolated label without a reliable date or weekday; conservative uncertainty is preferable to fabricated time off.
- This does **not** retroactively repair previously cached AI-generated plans. Those are evaluated and guarded separately before any cache migration or production cache rewrite.
- The small, intentionally difficult corpus is a regression baseline, not an estimate of global school-plan or AI accuracy.

To reproduce: `npm run check`, `npm run test:browser`, then the CI job **AI quality real original PDFs**, which downloads the SHA-verified public originals and runs the closure gate.
