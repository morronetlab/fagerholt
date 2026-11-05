/** Human-reviewed, source-fingerprinted ORIGINAL public school PDFs.
 * Each source's original A4 page(s) was rendered and visually inspected on
 * 2026-11-05; the binary is NOT committed to this repository.
 * Golden facts are read from the original visual source, not parser outputs.
 * Contact details and personal identifiers are intentionally excluded.
 */
export const ORIGINAL_PDF_GOLDEN_VERSION = 1;
export const ORIGINAL_PDF_GOLDENS = [
  {
    "id": "sjostrand-2-w44-2026",
    "school": "sjostrand",
    "grade": "2",
    "year": 2026,
    "week": 44,
    "url": "https://www.minskole.no/DynamicContent//Documents/866-Sjostrand-Ukebrev-uke-44-ca300aa3-539e.pdf",
    "sha256": "945c339a8cab3c8a954ceb6d9cb6e007b4825355ffb524e5528829e90f19c771",
    "pageCount": 1,
    "review": {
      "date": "2026-11-05",
      "method": "Original PDF downloaded through official host, SHA-256 verified and rendered page 1 visually inspected",
      "pages": [
        1
      ],
      "scope": "Homework table, important vaccine notice and exercise words; contact details deliberately excluded"
    },
    "sourceAnchors": [
      {
        "page": 1,
        "contains": "Lekser til tirsdag"
      },
      {
        "page": 1,
        "contains": "Vaksine onsdag morgen"
      },
      {
        "page": 1,
        "contains": "Ta med gymsko"
      },
      {
        "page": 1,
        "contains": "skjorte"
      }
    ],
    "expectations": [
      {
        "kind": "homework",
        "contains": "Fabel lesebok",
        "dueDay": "Tirsdag"
      },
      {
        "kind": "homework",
        "contains": "leksemappa"
      },
      {
        "kind": "exclude_homework",
        "contains": "Vaksine onsdag"
      },
      {
        "kind": "exclude_homework",
        "contains": "Ta med gymsko"
      },
      {
        "kind": "day_note",
        "day": "Onsdag",
        "contains": "Vaksine"
      },
      {
        "kind": "packing",
        "day": "Fredag",
        "contains": "Gymsko"
      }
    ]
  },
  {
    "id": "fagerholt-4-w44-2026",
    "school": "fagerholt",
    "grade": "4",
    "year": 2026,
    "week": 44,
    "url": "https://www.minskole.no/DynamicContent//Documents/854-fagerholt-Ukeplan-uke-44-93c849fa-ad01.pdf",
    "sha256": "3886c3cd628cd4c3ed5c0ef859eaa4939b9057eda5d13b55660390149c7a6067",
    "pageCount": 2,
    "review": {
      "date": "2026-11-05",
      "method": "Original PDF downloaded through official host, SHA-256 verified and rendered pages 1–2 visually inspected",
      "pages": [
        1,
        2
      ],
      "scope": "Merged homework column: only English has explicit Til torsdag; page-2 instructions say all homework is due Thursday. Closure dates Nov 5–6 are following week 45, not week 44."
    },
    "sourceAnchors": [
      {
        "page": 1,
        "contains": "Detektivene LeMik"
      },
      {
        "page": 1,
        "contains": "Til torsdag"
      },
      {
        "page": 2,
        "contains": "lekser skal leveres torsdag"
      },
      {
        "page": 2,
        "contains": "vedkubbe"
      },
      {
        "page": 2,
        "contains": "SFO"
      }
    ],
    "expectations": [
      {
        "kind": "homework",
        "contains": "Detektivene"
      },
      {
        "kind": "homework",
        "contains": "mattearket"
      },
      {
        "kind": "homework",
        "contains": "Workbook s. 31",
        "dueDay": "Torsdag"
      },
      {
        "kind": "exclude_homework",
        "contains": "Planleggingsdag"
      },
      {
        "kind": "exclude_homework",
        "contains": "Halloween-kostyme"
      },
      {
        "kind": "packing",
        "day": "Mandag",
        "contains": "vedkubbe"
      }
    ]
  },
  {
    "id": "lovisenlund-4-w45-2026",
    "school": "lovisenlund",
    "grade": "4",
    "year": 2026,
    "week": 45,
    "url": "https://www.minskole.no/DynamicContent//Documents/858-lovisenlund-Uke-45-1f1acf35-2da8.pdf",
    "sha256": "b7480b4ae5f9ff6206434d9c792554a2c7f70a536c9e01568973dbd983cdd597",
    "pageCount": 2,
    "review": {
      "date": "2026-11-05",
      "method": "Original PDF downloaded through official host, SHA-256 verified and rendered pages 1–2 visually inspected",
      "pages": [
        1,
        2
      ],
      "scope": "Short school week Nov 2–4, school planning days Thu/Fri; all homework due latest Wednesday. Contact/person names/emails are not included."
    },
    "sourceAnchors": [
      {
        "page": 1,
        "contains": "planleggingsdager torsdag og fredag"
      },
      {
        "page": 1,
        "contains": "Husk gymtøy og gymsko"
      },
      {
        "page": 2,
        "contains": "leveres senest onsdag"
      },
      {
        "page": 2,
        "contains": "Matteark med divisjon"
      },
      {
        "page": 2,
        "contains": "Hibernation"
      }
    ],
    "expectations": [
      {
        "kind": "homework",
        "contains": "side 135",
        "dueDay": "Onsdag"
      },
      {
        "kind": "homework",
        "contains": "Matteark med divisjon",
        "dueDay": "Onsdag"
      },
      {
        "kind": "homework",
        "contains": "gloser"
      },
      {
        "kind": "exclude_homework",
        "contains": "Planleggingsdag"
      },
      {
        "kind": "packing",
        "day": "Mandag",
        "contains": "gymtøy"
      },
      {
        "kind": "notice",
        "contains": "planleggingsdager"
      }
    ]
  },
  {
    "id": "nygaard-4-w45-2026",
    "school": "nygaard",
    "grade": "4",
    "year": 2026,
    "week": 45,
    "url": "https://www.minskole.no/DynamicContent//Documents/882-nygaard-Uke-45-17132a07-a986.pdf",
    "sha256": "f55de892837f698ad5a2c5be2c5bf49c7aeccfd155454b97bb46e413eb5e8456",
    "pageCount": 2,
    "review": {
      "date": "2026-11-05",
      "method": "Original PDF downloaded through official host, SHA-256 verified and rendered pages 1–2 visually inspected",
      "pages": [
        1,
        2
      ],
      "scope": "Page 1 shows routine Thursday gym; page 2 explicitly overrides it with school closed Thu Nov 5 and Fri Nov 6. Homework has explicit Monday/Tuesday reading and Wednesday/Thursday homework-free notices."
    },
    "sourceAnchors": [
      {
        "page": 1,
        "contains": "KUNNSKAPSHJØRNET"
      },
      {
        "page": 1,
        "contains": "Ingen norske øveord"
      },
      {
        "page": 2,
        "contains": "skolen stengt torsdag"
      },
      {
        "page": 2,
        "contains": "Onsdag: LEKSEFRI"
      },
      {
        "page": 2,
        "contains": "Til tirsdag"
      }
    ],
    "expectations": [
      {
        "kind": "homework",
        "contains": "Les side 53"
      },
      {
        "kind": "homework",
        "contains": "Les side 54"
      },
      {
        "kind": "homework",
        "contains": "Quest textbook"
      },
      {
        "kind": "homework",
        "contains": "Velg ti oppgaver"
      },
      {
        "kind": "exclude_homework",
        "contains": "LEKSEFRI"
      },
      {
        "kind": "exclude_homework",
        "contains": "skolen stengt"
      },
      {
        "kind": "notice",
        "contains": "skolen stengt"
      },
      {
        "kind": "exclude_packing",
        "day": "Torsdag",
        "contains": "gymtøy"
      }
    ]
  }
];
