/** Source-shaped, de-identified token data verified against published
 * Sjøstrand week 44 2026 PDF pages. These are NOT complete PDF binaries.
 * Original sources:
 * - Sjøstrand 5A: 866-Sjostrand-Ukebrev-uke-44-(3)-1082166a-078b.pdf
 * - Sjøstrand 2. trinn: 866-Sjostrand-Ukebrev-uke-44-ca300aa3-539e.pdf
 */
export const sjoestrand5AGlossaryText=[
 'subject - fag','lesson - time',
 'boarding school - kostskole /',
 'internatskole','study hall - lesesal','dining hall - spisesal'
].join('\n');
export const sjoestrand5AGlossaryExpected=[
 ['subject','fag'],
 ['lesson','time'],
 ['boarding school','kostskole / internatskole'],
 ['study hall','lesesal'],
 ['dining hall','spisesal']
];
export const sjoestrand5AGlossarySource=[
 'ENGELSKE GLOSER: ENGLISH NORWEGIAN',
 'subject fag lesson time boarding school kostskole / internatskole',
 'study hall lesesal dining hall spisesal',
 'Lekser til tirsdag English: Practice your glossary.'
].join(' ');
export const sjoestrand2Homework=[
 'Norsk: Les s. 58-59 i Fabel lesebok.',
 'Teksten leses 3 ganger. Dette gjøres 3 dager i løpet av uka, velg dag selv.',
 'Ukelekse: Gjør eget ark i leksemappa.',
 'Vaksine onsdag morgen.',
 'Ta med gymsko.'
];
export const sjoestrand2NorwegianWords=['skjorte','skjegg','skjell','skjære'];
