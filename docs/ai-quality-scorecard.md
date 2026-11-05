# AI Quality 2.0 – baseline scorecard

Run locally from the repository root:

```bash
npm ci
node --test tests/quality-corpus-contract.test.mjs tests/ai-quality-evaluator.test.mjs
node scripts/evaluate-plan-quality.mjs --out-dir quality-results
```

The CLI executes the **existing rules/fallback parser** against the source-labelled de-identified cases in `tests/quality/corpus-v1.mjs`. It writes `quality-report.json` and `quality-report.md` and prints the Markdown summary.

GitHub Actions workflow `AI quality baseline` publishes the same outputs in its Summary and as a downloadable `ai-quality-baseline` artifact. The workflow runs on relevant PR changes, corresponding main pushes and manual dispatch.

## Read metrics correctly

- `summary.passRatePercent` = passed fixture assertions / all fixture assertions. **Not** full PDF accuracy, school coverage or live AI model quality.
- `byKind` = homework due dates, repeating days, false homework, packing, day notes etc. Each assertion checks specific content and may be more/less difficult than another.
- `byEvidenceTier` separates reconstructed PDF layouts, indexed text and synthetic negatives. **No full PDF binary was independently reverified during phase 1.**
- The evaluator does **not** call the OpenAI API or reparse a live school PDF, so there is no inference cost and no production cache mutation.
- A parser exception becomes failed assertions and is visible in the report.
- Baseline mismatches are **reported, not gated**. Once the corpus has real, independently reviewed PDF/golden annotations and a known-good baseline, add a threshold/ratchet in a separate PR. Contract or syntax/test failures remain CI failures.

## Scope and safety

Read-only; no Supabase tables, invitation records, progress, user accounts or family data. No source PDF bytes are checked into the repo. Case metadata stores only public source pointers and deliberately de-identified snippets. Avoid republishing public PDF contact details or children's names in artifacts.

## Next phase

1. Obtain 20–30 appropriately licensed/public source PDFs and complete independent visual page inspection (and privacy screening).
2. Add immutable PDF hash, reviewed page/region, expected facts and missing-fact annotations for each source. Distinguish source verification from inference.
3. Freeze an approved quality baseline and enforce no regressions per category/evidence tier.
4. Add a separate **AI model track** (fixed, consented, privacy-reviewed PDF corpus; model output snapshots; cache/version/cost telemetry). Never confuse the deterministic rules baseline with measured live AI performance.
