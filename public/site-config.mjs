/** Public multi-school registry grounded in Kristiansand municipality's MinSkole links.
 * Grade URLs are discovered from the selected school's official homepage at runtime;
 * the existing Fagerholt URLs remain pinned for backwards compatibility.
 * No secret keys, student names or private data belong here.
 */
const school=(id,name,slug,kind='primary',extra={})=>({
  id,name,homepage:`https://www.minskole.no/${slug}`,kind,timezone:'Europe/Oslo',...extra
});
const schools=[
  school('dvergsnes','Dvergsnes skoleenhet','dvergsnes'),
  school('fagerholt','Fagerholt skole','fagerholt','primary',{grades:{
    '1':'https://www.minskole.no/fagerholt/seksjon/22634',
    '2':'https://www.minskole.no/fagerholt/seksjon/22635',
    '3':'https://www.minskole.no/fagerholt/seksjon/22636',
    '4':'https://www.minskole.no/fagerholt/seksjon/22637',
    '5':'https://www.minskole.no/fagerholt/seksjon/22638',
    '6':'https://www.minskole.no/fagerholt/seksjon/22639',
    '7':'https://www.minskole.no/fagerholt/seksjon/22640'
  },weather:{lat:58.14671,lon:7.9956,label:'Ved Fagerholt skole'}}),
  school('flekkeroy','Flekkerøy skole','flekkeroy'),
  school('hellemyr','Hellemyr skole','hellemyr'),
  school('haanes','Hånes skoleenhet','haanes'),
  school('justvik','Justvik skole','justvik'),
  school('kjm','Karl Johans Minne skole','kjm'),
  school('kringsja','Kringsjå skole','kringsja'),
  school('krossen','Krossen skole','krossen'),
  school('langenes','Langenes skole','langenes'),
  school('lovisenlund','Lovisenlund skole','lovisenlund'),
  school('lundeskole','Lunde skole','lundeskole'),
  school('mosby','Mosby oppvekstsenter','mosby'),
  school('nygaard','Nygård skole','nygaard'),
  school('presteheia','Presteheia skole','presteheia'),
  school('ross','Rosseland skole','ross'),
  school('sjostrand','Sjøstrand skole','sjostrand'),
  school('slettheia','Slettheia skole','slettheia'),
  school('solholmen','Solholmen skole','solholmen'),
  school('stromme','Strømme skole','stromme'),
  school('todda','Tordenskjolds gate skole','todda'),
  school('tunballen','Tunballen skole','tunballen'),
  school('vardasen','Vardåsen skole','vardasen'),
  school('voiebyen','Voiebyen skole','voiebyen'),
  school('vagsbygd','Vågsbygd skole','vagsbygd'),
  school('wildsminne','Wilds Minne skole','wildsminne'),
  school('finsland','Finsland skole','finsland','combined'),
  school('karuss','Karuss skole','karuss','combined'),
  school('torridal','Torridal skole','torridal','combined'),
  school('ve','Ve skole','ve','combined')
];
const byId=Object.freeze(Object.fromEntries(schools.map(s=>[s.id,Object.freeze(s)])));
export const siteConfig = Object.freeze({
  schools:byId,
  // Compatibility for earlier versions and existing Fagerholt-only bookmarks.
  school:byId.fagerholt,
  municipalList:'https://www.kristiansand.kommune.no/navigasjon/barnehage-og-skole/skole-og-sfo/grunnskole/',
  brand:{title:'Ukeplanen',subtitle:'En enklere skoleuke',color:'#225e52',accent:'#ed9561'},
  // Regional default until a particular school's coordinates have been verified.
  weather:{lat:58.14671,lon:7.9956,label:'Kristiansand-området',attribution:'Meteorologisk institutt / Yr'},
  allowedSourceHosts:['www.minskole.no','minskole.no','www.minskule.no','minskule.no'],
  features:{weather:true,rainReminder:true,learningGoals:true,optionalMission:true,theme:true}
});
