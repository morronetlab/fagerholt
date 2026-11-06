# AI Quality 2.0 — PR A: verified fallback-parser gap triage

**Evidence:** [AI quality real original PDFs run 42021927248](https://github.com/morronetlab/fagerholt/actions/runs/42021927248), with visually reviewed PDF originals and immutable SHA-256 fingerprints.

**Engine and scope:** This measures the **rules/fallback parser**, NOT live AI-model accuracy or overall app quality. Read-only analysis only: no family data, user accounts, Supabase, production parser, or source PDF bytes changed.

## Confirmed baseline

Four official original PDFs were verified. The rules fallback passed 13 of 26 reviewed expectations and missed 13. The independent PDF.js source-text check matched 18 of 19 text anchors. The missing text anchor is NOT a 14th parser error.

| Priority | Count | Actual observed gap | User impact |
| --- | ---: | --- | --- |
| **P0 – Critical** | **2** | School planning days / closed-school notices are missing | Parents may miss an important change in school attendance |
| **P1 – High** | **8** | Seven missing or unmatched homework tasks/deadlines; one routine Thursday packing suggestion despite school closure | Wrong homework plan or required items on a day off |
| **P2 – Medium** | **3** | Explicit day-specific packing reminders missing | Parents may forget needed equipment |

### Source-level breakdown

| Reviewed original | Passed | Failed | Failure severity |
| --- | ---: | ---: | --- |
| Sjøstrand grade 2, week 44 | 5 | 1 | P2: 1 |
| Fagerholt grade 4, week 44 | 5 | 1 | P2: 1 |
| Lovisenlund grade 4, week 45 | 1 | 5 | P0: 1; P1: 3; P2: 1 |
| Nygård grade 4, week 45 | 2 | 6 | P0: 1; P1: 5 |

The Nygård PDF.js extractor could not find the rendered heading **KUNNSKAPSHJØRNET** verbatim. This is a separate *text-layer* finding and might involve glyph spacing or encoding, not a proven missing school instruction.

All **7 of 7 tests that reject non-homework information in homework** passed. Preserve these.

## Concrete scope for PR B

**B1 – P0: School closures / planning days and explicit precedence.** Inspect source page 2 and date context; extract source-backed notices for Lovisenlund and Nygård. A source-confirmed closure must override recurring timetable equipment for that date. A week-44 PDF mentioning a closure in week 45 must NOT close days in week 44. Acceptance: both notice assertions and the Nygård Thursday non-packing check pass, without new false closures.

**B2 – P1: Homework extraction / day attribution.** Trace Lovisenlund's page-2 reading, math division worksheet, and vocabulary homework; trace Nygård's reading pages 53 and 54 and English/mathematics tasks. Preserve original task text and source-proven deadline/weekday. Acceptance: all seven homework checks pass, all previously passing homework checks continue passing, and the seven negative contamination checks remain green. Investigate homework grid, day-section and source-truth modules.

**B3 – P2: Day-specific equipment.** Investigate the exact explicit bring/husk text in each original and how it enters the weekday packing checklist. Acceptance: Sjøstrand Friday gym shoes, Fagerholt Monday wood log and Lovisenlund Monday gymwear appear on the right days, without guessed requirements inferred from the regular timetable.

For every PR B slice: rerun all original PDFs, keep the 13 previously correct assertions and 18 source anchors green, rerun reconstructed/synthetic fixtures, and independently review any change to golden data.

### Source of truth and automated report

- Full, manually classified 13-finding ledger: [parser-gap-triage-v1.json](../tests/quality/parser-gap-triage-v1.json).
- Read-only report generator: [report-parser-gaps.mjs](../scripts/report-parser-gaps.mjs).
- CI job: [AI quality real original PDFs](../.github/workflows/ai-quality-real-pdfs.yml). Produces parser-gap-triage.json and parser-gap-triage.md together with the existing original-PDF report and adds the summary to the GitHub run.

Reproduce with Node.js 22+:

    npm ci
    node --test tests/parser-gap-triage.test.mjs
    node scripts/evaluate-original-pdf-quality.mjs quality-real-results
    node scripts/check-approved-original-pdf-baseline.mjs quality-real-results/original-pdf-quality.json
    node scripts/report-parser-gaps.mjs quality-real-results/original-pdf-quality.json quality-real-results

CI ensures every original-PDF expectation is *exactly one* of previously approved-passing or an explicitly classified issue, with source SHA and exact expected fact unchanged. It also protects the 18 approved text anchors; an unexpected new failure, source drift or an unavailable approved original is a blocker. A fixed known gap is reported as **resolved** without deleting its history.

The causes listed in the ledger are **hypotheses to investigate**, not confirmed root causes. A failed assertion may represent missing content, a mismatched due date or a text representation mismatch. This selected, difficult fixture set is not a representative error rate for all school plans. No production code, caches or family data are modified in PR A.
