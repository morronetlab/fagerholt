/** Public deployment configuration. This file contains no secrets or personal preferences. */
export const siteConfig = Object.freeze({
  school: {
    id: 'fagerholt',
    name: 'Fagerholt skole',
    homepage: 'https://www.minskole.no/fagerholt',
    timezone: 'Europe/Oslo',
    grades: {
      '1': 'https://www.minskole.no/fagerholt/seksjon/22634',
      '2': 'https://www.minskole.no/fagerholt/seksjon/22635',
      '3': 'https://www.minskole.no/fagerholt/seksjon/22636',
      '4': 'https://www.minskole.no/fagerholt/seksjon/22637',
      '5': 'https://www.minskole.no/fagerholt/seksjon/22638',
      '6': 'https://www.minskole.no/fagerholt/seksjon/22639',
      '7': 'https://www.minskole.no/fagerholt/seksjon/22640'
    }
  },
  brand: { title: 'Ukeplanen', subtitle: 'En enklere skoleuke', color: '#215d59', accent: '#f6b64b' },
  weather: { lat: 58.14671, lon: 7.9956, label: 'Ved skolen', attribution: 'Meteorologisk institutt / Yr' },
  allowedSourceHosts: ['www.minskole.no', 'minskole.no'],
  features: {weather: true, rainReminder: true, learningGoals: true, optionalMission: true, theme: true}
});
