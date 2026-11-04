/** AI Quality Phase 1: read-only, de-identified, source-labelled reference cases.
 * Inputs reconstruct representative PDF.js layout tokens, NOT PDF binaries.
 * No child/family/user data. Do not claim binary/visual verification for these cases.
 * Add cases only with an independently inspectable source and human-reviewed facts.
 */
export const QUALITY_CORPUS_VERSION = 1;
export const QUALITY_REFERENCE_CASES = [
  {
    "id": "wildsminne-2-w45-homework-grid",
    "title": "Homework rows on the same baseline",
    "evidenceTier": "reconstructed-layout",
    "source": {
      "school": "wildsminne",
      "grade": "2",
      "week": 45,
      "year": 2026,
      "sectionUrl": "https://www.minskole.no/wildsminne",
      "pdfUrl": null,
      "reference": "tests/wilds-minne-actual-pdf-table.test.mjs",
      "scope": "De-identified PDF.js-like reconstruction from an inspected official week-45 layout; original PDF binary NOT bundled or reverified."
    },
    "input": {
      "pages": [
        {
          "width": 600,
          "height": 850,
          "items": [
            {
              "text": "LEKSEPLAN 2. TRINN, UKE 45",
              "x": 180,
              "y": 76,
              "width": 130
            },
            {
              "text": "LÆRINGSMÅL:",
              "x": 200,
              "y": 125,
              "width": 55
            },
            {
              "text": "Jeg kan telle til hundre.",
              "x": 150,
              "y": 157,
              "width": 125
            },
            {
              "text": "Lekser",
              "x": 272,
              "y": 290,
              "width": 30
            },
            {
              "text": "Mandag",
              "x": 72,
              "y": 330,
              "width": 30
            },
            {
              "text": "Norsk: Les i bok i sekken 10-15.min.",
              "x": 155,
              "y": 330,
              "width": 180
            },
            {
              "text": "Tur UTEN",
              "x": 72,
              "y": 353,
              "width": 40
            },
            {
              "text": "bål.",
              "x": 72,
              "y": 369,
              "width": 20
            },
            {
              "text": "Matte: Tell til hundre – hva skjer med tallet når det består av to siffer?",
              "x": 155,
              "y": 352,
              "width": 370
            },
            {
              "text": "(Det består av en mengde tiere og en mengde enere).",
              "x": 155,
              "y": 370,
              "width": 255
            },
            {
              "text": "Bruk gjerne penger eller andre konkreter hjemme – fyrstikker, legobrikker,",
              "x": 155,
              "y": 390,
              "width": 370
            },
            {
              "text": "duplobrikker, steiner, kongler, pinner etc.",
              "x": 155,
              "y": 409,
              "width": 215
            },
            {
              "text": "Tirsdag",
              "x": 72,
              "y": 464,
              "width": 35
            },
            {
              "text": "Norsk: Les i bok i sekken 10-15.min.",
              "x": 155,
              "y": 464,
              "width": 180
            },
            {
              "text": "Onsdag",
              "x": 72,
              "y": 519,
              "width": 30
            },
            {
              "text": "Norsk: Les i bok i sekken 10-15.min.",
              "x": 155,
              "y": 519,
              "width": 180
            },
            {
              "text": "Torsdag",
              "x": 72,
              "y": 575,
              "width": 35
            },
            {
              "text": "Bibliotek",
              "x": 72,
              "y": 597,
              "width": 45
            },
            {
              "text": "Norsk: Les i bok i sekken 10-15.min.",
              "x": 155,
              "y": 575,
              "width": 180
            },
            {
              "text": "Fredag",
              "x": 72,
              "y": 629,
              "width": 30
            },
            {
              "text": "Info:",
              "x": 72,
              "y": 700,
              "width": 25
            },
            {
              "text": "Planleggingsdag fredag 6. november.",
              "x": 72,
              "y": 723,
              "width": 175
            },
            {
              "text": "LESELEKSE:",
              "x": 72,
              "y": 751,
              "width": 50
            },
            {
              "text": "Les gjerne hver side 3 ganger, så blir det god flyt.",
              "x": 72,
              "y": 773,
              "width": 260
            }
          ]
        }
      ]
    },
    "expectations": [
      {
        "kind": "homework",
        "subject": "Norsk",
        "contains": "Les i bok i sekken",
        "dueDay": null,
        "repeatDays": [
          "Mandag",
          "Tirsdag",
          "Onsdag",
          "Torsdag"
        ]
      },
      {
        "kind": "homework",
        "subject": "Matte",
        "contains": "Tell til hundre",
        "dueDay": "Mandag"
      },
      {
        "kind": "exclude_homework",
        "contains": "Planleggingsdag"
      },
      {
        "kind": "exclude_homework",
        "contains": "Tur UTEN"
      },
      {
        "kind": "exclude_homework",
        "contains": "Bibliotek"
      }
    ]
  },
  {
    "id": "todda-6-w44-four-homework-columns",
    "title": "Four distinct homework deadline columns",
    "evidenceTier": "reconstructed-layout",
    "source": {
      "school": "todda",
      "grade": "6",
      "week": 44,
      "year": 2026,
      "sectionUrl": "https://www.minskole.no/todda/seksjon/22410",
      "pdfUrl": "https://www.minskole.no/DynamicContent//Documents/863-todda-Uke-44-.-c350c815-359d.pdf",
      "reference": "tests/todda-homework-deadlines.test.mjs",
      "scope": "De-identified geometry/quotes reconstructed from existing regression test. PDF binary not available for new independent inspection."
    },
    "input": {
      "pages": [
        {
          "width": 1000,
          "height": 1450,
          "items": [
            {
              "text": "LEKSER UKE 44",
              "x": 110,
              "y": 780,
              "width": 65
            },
            {
              "text": "Til tirsdag",
              "x": 115,
              "y": 810,
              "width": 55
            },
            {
              "text": "Til onsdag",
              "x": 315,
              "y": 810,
              "width": 50
            },
            {
              "text": "Til torsdag",
              "x": 515,
              "y": 810,
              "width": 55
            },
            {
              "text": "Til fredag",
              "x": 715,
              "y": 810,
              "width": 50
            },
            {
              "text": "Naturfag",
              "x": 120,
              "y": 850,
              "width": 40
            },
            {
              "text": "Les teksten du har fått",
              "x": 120,
              "y": 885,
              "width": 115
            },
            {
              "text": "utdelt og svar på",
              "x": 120,
              "y": 905,
              "width": 85
            },
            {
              "text": "spørsmålene.",
              "x": 120,
              "y": 925,
              "width": 60
            },
            {
              "text": "Skriv svarene i lekseboka.",
              "x": 120,
              "y": 960,
              "width": 130
            },
            {
              "text": "Engelsk:",
              "x": 120,
              "y": 1010,
              "width": 40
            },
            {
              "text": "Les arket du har fått utdelt.",
              "x": 120,
              "y": 1040,
              "width": 145
            },
            {
              "text": "Skriv svaret på spørsmålene i lekseboka.",
              "x": 120,
              "y": 1062,
              "width": 200
            },
            {
              "text": "Leksefri pga. halloween-arrangementet på Tangen vgs.",
              "x": 320,
              "y": 850,
              "width": 260
            },
            {
              "text": "Matte",
              "x": 520,
              "y": 850,
              "width": 25
            },
            {
              "text": "Jobb med arket du har fått utdelt.",
              "x": 520,
              "y": 880,
              "width": 170
            },
            {
              "text": "Skriv svarene i innføringsboka.",
              "x": 520,
              "y": 907,
              "width": 155
            },
            {
              "text": "Norsk: Les minimum 20",
              "x": 720,
              "y": 850,
              "width": 105
            },
            {
              "text": "minutter i selvvalgt bok.",
              "x": 720,
              "y": 877,
              "width": 125
            },
            {
              "text": "Skriv et kort sammendrag av",
              "x": 720,
              "y": 910,
              "width": 135
            },
            {
              "text": "det du har lest (i lekseboka).",
              "x": 720,
              "y": 935,
              "width": 150
            },
            {
              "text": "Ukelekse",
              "x": 115,
              "y": 1113,
              "width": 40
            },
            {
              "text": "Sosialt: Vi øver på å lytte til hverandre og ikke avbryte når andre snakker.",
              "x": 120,
              "y": 1150,
              "width": 380
            }
          ]
        }
      ]
    },
    "expectations": [
      {
        "kind": "homework",
        "subject": "Naturfag",
        "contains": "Les teksten",
        "dueDay": "Tirsdag"
      },
      {
        "kind": "homework",
        "subject": "Engelsk",
        "contains": "Les arket",
        "dueDay": "Tirsdag"
      },
      {
        "kind": "homework",
        "subject": "Matte",
        "contains": "Jobb med arket",
        "dueDay": "Torsdag"
      },
      {
        "kind": "homework",
        "subject": "Norsk",
        "contains": "Les minimum 20",
        "dueDay": "Fredag"
      },
      {
        "kind": "homework",
        "subject": "Sosialt",
        "contains": "Vi øver",
        "dueDay": null
      },
      {
        "kind": "exclude_homework",
        "contains": "Leksefri"
      }
    ]
  },
  {
    "id": "sjostrand-2-w44-classification",
    "title": "Vaccine and gym shoes under a homework heading",
    "evidenceTier": "reconstructed-layout",
    "source": {
      "school": "sjostrand",
      "grade": "2",
      "week": 44,
      "year": 2026,
      "sectionUrl": "https://www.minskole.no/sjostrand/seksjon/22169",
      "pdfUrl": "https://www.minskole.no/DynamicContent//Documents/866-Sjostrand-Ukebrev-uke-44-ca300aa3-539e.pdf",
      "reference": "tests/sjostrand2-homework-routing.test.mjs",
      "scope": "Short reconstructed PDF text blocks from the existing verified-content test; not a complete or binary PDF."
    },
    "input": {
      "pages": [
        {
          "width": 900,
          "height": 700,
          "items": [
            {
              "text": "Lekser",
              "x": 26,
              "y": 165,
              "width": 30
            },
            {
              "text": "Til tirsdag: Norsk: Les s. 58-59 i Fabel lesebok. Teksten leses 3 ganger.",
              "x": 26,
              "y": 196,
              "width": 365
            },
            {
              "text": "Til tirsdag: Ukelekse: Gjør eget ark i leksemappa.",
              "x": 26,
              "y": 223,
              "width": 250
            },
            {
              "text": "Til onsdag: Vaksine onsdag morgen.",
              "x": 26,
              "y": 256,
              "width": 170
            },
            {
              "text": "Til fredag: Ta med gymsko.",
              "x": 26,
              "y": 284,
              "width": 130
            }
          ]
        }
      ]
    },
    "expectations": [
      {
        "kind": "homework",
        "contains": "Fabel lesebok"
      },
      {
        "kind": "homework",
        "contains": "eget ark"
      },
      {
        "kind": "exclude_homework",
        "contains": "Vaksine"
      },
      {
        "kind": "exclude_homework",
        "contains": "gymsko"
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
    "id": "voiebyen-5-w44-indexed-excerpt",
    "title": "Subject-oriented homework, no invented daily deadlines",
    "evidenceTier": "indexed-text-only",
    "source": {
      "school": "voiebyen",
      "grade": "5",
      "week": 44,
      "year": null,
      "sectionUrl": "https://www.minskole.no/voiebyen",
      "pdfUrl": "https://www.minskole.no/DynamicContent//Documents/864-voiebyen-Ukeplan-uke-44-dd1c256c-7eb1.pdf",
      "reference": "Public PDF text index checked 2026-11-04 (web; year not verified). PDF screenshot could not be retrieved.",
      "scope": "Short de-identified excerpt of indexed text; rows and coordinates are illustrative, not verified PDF geometry."
    },
    "input": {
      "pages": [
        {
          "width": 900,
          "height": 1100,
          "items": [
            {
              "text": "Ukeplan uke 44 for 5.trinn",
              "x": 50,
              "y": 80,
              "width": 130
            },
            {
              "text": "Lekser",
              "x": 50,
              "y": 250,
              "width": 30
            },
            {
              "text": "NORSK: Ark i lekseperm. Bøying av verb.",
              "x": 70,
              "y": 285,
              "width": 195
            },
            {
              "text": "MATTE: Jobb med mattearket du får i den grønne permen på mandag. Leveres på skolen innen fredag.",
              "x": 70,
              "y": 320,
              "width": 460
            },
            {
              "text": "ENGELSK: Read the text My Pet. Read one time for yourself and one time loud.",
              "x": 70,
              "y": 355,
              "width": 380
            },
            {
              "text": "Write: Do the worksheet with the words of the week. Hand in by Friday.",
              "x": 70,
              "y": 395,
              "width": 350
            },
            {
              "text": "Info til hjemmet",
              "x": 50,
              "y": 480,
              "width": 80
            },
            {
              "text": "Vi planlegger en tur i løpet av uka. Vi ser været an, nærmere beskjed kommer når dag er bestemt.",
              "x": 65,
              "y": 510,
              "width": 460
            }
          ]
        }
      ]
    },
    "expectations": [
      {
        "kind": "homework",
        "contains": "Bøying av verb"
      },
      {
        "kind": "homework",
        "contains": "mattearket"
      },
      {
        "kind": "exclude_homework",
        "contains": "Vi planlegger en tur"
      },
      {
        "kind": "exclude_homework",
        "contains": "Info til hjemmet"
      }
    ]
  },
  {
    "id": "synthetic-timetable-not-homework",
    "title": "Weekdays in a timetable cannot imply homework",
    "evidenceTier": "synthetic-negative",
    "source": {
      "school": "fagerholt",
      "grade": "3",
      "week": 44,
      "year": 2026,
      "sectionUrl": "https://www.minskole.no/fagerholt",
      "pdfUrl": null,
      "reference": "tests/wilds-minne-actual-pdf-table.test.mjs",
      "scope": "Explicit negative test, not an official PDF."
    },
    "input": {
      "pages": [
        {
          "width": 600,
          "height": 800,
          "items": [
            {
              "text": "Mandag",
              "x": 80,
              "y": 300,
              "width": 30
            },
            {
              "text": "Tirsdag",
              "x": 160,
              "y": 300,
              "width": 35
            },
            {
              "text": "Onsdag",
              "x": 240,
              "y": 300,
              "width": 30
            },
            {
              "text": "Torsdag",
              "x": 320,
              "y": 300,
              "width": 35
            },
            {
              "text": "Fredag",
              "x": 400,
              "y": 300,
              "width": 30
            },
            {
              "text": "Norsk",
              "x": 80,
              "y": 340,
              "width": 25
            },
            {
              "text": "Matte",
              "x": 160,
              "y": 340,
              "width": 25
            }
          ]
        }
      ]
    },
    "expectations": [
      {
        "kind": "homework_empty"
      }
    ]
  }
];
