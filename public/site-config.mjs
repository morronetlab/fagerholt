/**
 * Public white-label site configuration.
 * Change this file when deploying for another school.
 * Only public information belongs here: never API keys or credentials.
 */
export const SITE = Object.freeze({
  id: 'fagerholt',
  schoolName: 'Fagerholt skole',
  appName: 'Ukeplanen',
  tagline: 'En enklere start på skoledagen.',
  locationName: 'Kristiansand',
  logo: '✳',
  colors: {primary:'#315f54', accent:'#faac72'},
  weather: {lat:58.14671, lon:7.9956, label:'Fagerholt', externalUrl:'https://pent.no/58.14671,7.9956'},
  pdfHosts:['minskole.no','www.minskole.no'],
  grades: {
    '1':'https://www.minskole.no/fagerholt/seksjon/22634',
    '2':'https://www.minskole.no/fagerholt/seksjon/22635',
    '3':'https://www.minskole.no/fagerholt/seksjon/22636',
    '4':'https://www.minskole.no/fagerholt/seksjon/22637',
    '5':'https://www.minskole.no/fagerholt/seksjon/22638',
    '6':'https://www.minskole.no/fagerholt/seksjon/22639',
    '7':'https://www.minskole.no/fagerholt/seksjon/22640'
  },
  // Optional bespoke extensions. Disabled for the shared, white-label version.
  features:{redGroupGrade3:false,afterSchool:false}
});

export const GRADES = Object.freeze(Object.keys(SITE.grades));
export const choiceStorageKey = () => `ukeplan.${SITE.id}.selected-grade.v1`;
