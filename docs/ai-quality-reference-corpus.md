# AI Quality 2.0 – reference corpus v1

This folder is the **first read-only quality benchmark**, not a new parser implementation.

## Evidence classification

| Tier | Meaning | Full source PDF independently verified? |
| --- | --- | --- |
| `reconstructed-layout` | De-identified PDF.js-like geometry reproduced from existing regression tests for a specific official week plan. | **No**: original binaries were unavailable for reinspection. |
| `indexed-text-only` | A publicly indexed PDF text excerpt was independently retrieved. Coordinates are synthetic and do not prove visual cell placement. | **No**: PDF screenshot/retrieval failed. |
| `synthetic-negative` | A deliberate counterexample (e.g. timetable weekdays must not become homework). | Not an official source. |

Every case records the school, grade, week, source reference, evidence tier, and exact reviewed expected facts. These facts are the *golden expectations for the fixture*, **not** a statement that the whole official PDF has been verified.

## Case inventory

| Case | Origin | Focus |
| --- | --- | --- |
| Wilds Minne 2, week 45 | `tests/wilds-minne-actual-pdf-table.test.mjs` | Row-aligned homework, Monday maths, recurring reading |
| Tordenskjolds gate 6, week 44 | `tests/todda-homework-deadlines.test.mjs` | Four deadline columns, homework-free Wednesday, undated weekly task |
| Sjøstrand 2, week 44 | `tests/sjostrand2-homework-routing.test.mjs` | Vaccine notice / gym shoes must not become homework |
| Voiebyen 5, week 44 | Public PDF text index: `https://www.minskole.no/DynamicContent//Documents/864-voiebyen-Ukeplan-uke-44-dd1c256c-7eb1.pdf` | Subject-organized homework with unknown publication year |
| Negative timetable | Existing Wilds Minne regression | Weekday headers without a homework section |

The Voiebyen PDF index contains Norwegian, maths and English assignments, an undated trip notice, and timetable text. **Its year is not verified**, so `source.year` remains `null`; any evaluation year is merely a required, artificial parser parameter.

## How to strengthen the reference corpus

1. Secure permission to download public weekly PDF binaries for representative schools and check which documents may contain personal information before retaining them.
2. Render each PDF page and manually verify actual table geometry and expected facts against the original. Do not mark `reconstructed-layout` as verified solely because a unit test passes.
3. Store only redacted/minimal PDF fixtures when appropriate; prefer source URL + SHA-256 + reviewed facts. Avoid pupil names, family accounts, homework progress or unreviewed personal data in repository files.
4. Expand the corpus to 20–30 documents spanning 8–12 schools and scanned, image-rich, vertical-row, multiple-column, subject-oriented and group-specific formats.
5. Review any new or changed golden expectations independently of the parser output. Never derive a “correct answer” from the implementation under test.

No code in this PR downloads PDFs, calls an AI model, writes to production cache or changes any family data. A follow-up PR adds the executable scorecard and CI artifact.
