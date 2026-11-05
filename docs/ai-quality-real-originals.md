# AI Quality: visually reviewed original PDFs (2026-11-05)

Four official MinSkole PDFs were downloaded byte-for-byte through the GitHub Actions official-source collector and rendered at page level for independent manual review.

| School | Grade/week | Original pages inspected | SHA-256 (prefix) | Reviewed focus |
| --- | --- | ---: | --- | --- |
| Sjøstrand | 2 / 44 (2026) | 1 of 1 | `945c339a8cab` | Tuesday homework; Wednesday vaccination and Friday shoes are **not homework** |
| Fagerholt | 4 / 44 (2026) | 2 of 2 | `3886c3cd628c` | Homework layout spanning day rows; due Thursday; *next week's* school/SFO closures |
| Lovisenlund | 4 / 45 (2026) | 2 of 2 | `b7480b4ae5` | Monday gymwear; Tuesday/Wednesday school hours; all homework due Wednesday; closures Thu/Fri |
| Nygård | 4 / 45 (2026) | 2 of 2 | `f55de892837f` | Routine Thursday timetable conflicts with explicit Thu/Fri school closure; day-specific reading |

Original URLs, full immutable hashes, reviewed page numbers, and curated expectations are in `tests/quality/original-pdf-goldens.mjs`. No PDF binary, contact details, child names, user accounts or homework checkmarks are committed.

The original Tordenskjolds gate PDF returned **HTTP 404** from GitHub Actions and is not included in the verified set. The indexed Krossen PDF was downloaded but remains out of this v1 set because its source year has not been established. A previously indexed Voiebyen excerpt is not treated as a verified original PDF.

## Read-only original-PDF scorecard

```sh
npm ci
node --test tests/ai-quality-original-pdfs.test.mjs tests/quality-original-source-collection.test.mjs
node scripts/evaluate-original-pdf-quality.mjs quality-real-results
```

The evaluator independently downloads each *exact source URL*, verifies `%PDF`, current SHA-256 and page count, then parses the **actual downloaded PDF bytes** with the existing `pdfPages`/PDF.js logic and runs the existing rules parser against goldens independently noted from the visual pages.

It produces:
- `quality-real-results/original-pdf-quality.json`
- `quality-real-results/original-pdf-quality.md`

The GitHub Actions workflow `AI quality real original PDFs` publishes a readable summary and uploads **only** those two reports. The temporary PDFs are deleted at the end of evaluation. Production/Netlify/Supabase are never mutated; this is not an AI model evaluation.

### Interpreting results

- **Source verified**: fresh bytes match the frozen original SHA-256. A changed PDF is **source drift**, not a parser regression, and requires human review.
- **PDF.js anchor passed**: an original, human-reviewed phrase was found on the expected page in extracted PDF text. This is a separate metric from parser output.
- **Parser expectation passed**: the existing rule-based parser produced a human-reviewed expected fact (or did not invent prohibited content). This baseline may have failures; failures are documented without altering their expected facts.
- **Unavailable**: school server did not supply a verifiable PDF. The report excludes this document from the denominator and never counts it as correct.
- **AI model quality**: **not measured**. No private API keys or model requests are involved.

The baseline is initially informational, so a low rules-parser score does not fail CI. A run with zero verified PDFs or source-hash mismatch fails the source-integrity step. After enough reviewed sources exist, introduce a per-category non-regression threshold and a separately consented live-AI snapshot track.

## Future reference expansion

Expand from 4 to 20–30 original PDFs with varied layout and year. Visually review all pages, privacy-screen each document, and add goldens derived from the **source**, never parser output. Track each PDF's SHA-256; do not silently refresh expectations if a PDF changes.

## Non-regression ratchet (follow-up CI PR)

The approved historical baseline is in `tests/quality/approved-original-pdf-baseline-v1.json`, frozen from GitHub Actions run [41989590228](https://github.com/morronetlab/fagerholt/actions/runs/41989590228).

- **13 parser assertions** previously passed and must continue passing.
- **18 PDF.js source text anchors** previously matched and must remain extractable.
- **13 existing parser failures and one non-extracted source heading remain failures** in the full report. They are **not** approved as correct and are not rewritten to make CI green.
- Any formerly passing assertion becoming incorrect is a CI regression.
- A changed reviewed expected value, SHA-256 or unavailable approved source prevents a green gate until independently reviewed. Such conditions are reported as source/review blockers, not mislabeled parser defects.
- Newly fixed assertions are allowed. A future independently reviewed PR can refresh the approved passing baseline after verifying the improvement.
- The baseline is not generated from parser outputs during CI; it must be changed explicitly in a reviewed PR.

Run this non-regression check against a produced report:

```bash
node scripts/check-approved-original-pdf-baseline.mjs quality-real-results/original-pdf-quality.json
```

This gate remains **strictly limited to the four visually inspected official originals**. It does not imply any measured live OpenAI model performance. No production parser or family data changes are part of it.
