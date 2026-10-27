// The only factual theme title comes from the school's PDF (weekTheme).
// A minioppdrag is an optional family activity suggested by Skolesekken.
const PRESETS = [
 {rx:/alle har en stemme|bli h[oø]rt|medbestemmelse|demokrati/i,emoji:'🗣️',tone:'violet',quest:'Spør noen hva de mener om noe dere skal gjøre sammen, og lytt uten å avbryte.'},
 {rx:/solidaritet|bryr meg|omtanke|hjelp|inkluder/i,emoji:'💛',tone:'gold',quest:'Gjør én liten god gjerning for noen i dag – uten å bli bedt om det.'},
 {rx:/vennskap|venn|samarbeid|fellesskap/i,emoji:'🤝',tone:'rose',quest:'Gi en venn et oppriktig kompliment, eller inviter noen med i en lek.'},
 {rx:/respekt|toleranse|mangfold|likeverd/i,emoji:'🌈',tone:'violet',quest:'Øv på å si én hyggelig ting til noen som tenker annerledes enn deg.'},
 {rx:/natur|milj[oø]|b[æe]rekraft|gjenbruk|klima/i,emoji:'🌿',tone:'green',quest:'Finn én liten ting du kan gjøre for naturen denne uka.'},
 {rx:/lesing|b[oø]ker|litteratur|fortelling/i,emoji:'📚',tone:'violet',quest:'Del favorittordet eller en morsom setning fra noe du leser.'},
 {rx:/nettvet|digital|internett|kildekritikk/i,emoji:'💻',tone:'blue',quest:'Snakk med en voksen om ett smart valg du kan ta på nettet.'},
 {rx:/f[oø]lelser|mestring|mot|selvf[oø]lelse/i,emoji:'🚀',tone:'rose',quest:'Tenk på én ting du har blitt litt modigere til i år. Fortell om det!'},
 {rx:/trafikk|refleks|sikkerhet/i,emoji:'🚦',tone:'blue',quest:'Finn tre ting som gjør skoleveien tryggere.'},
 {rx:/kropp|helse|aktivitet|bevegelse/i,emoji:'🏃',tone:'green',quest:'Ta en liten bevegelsespause sammen med noen hjemme.'},
];
export function themePresentation(raw){
 const theme=String(raw||'').replace(/\s+/g,' ').trim();
 if(!theme)return null;
 // Some PDFs pair a main theme with a social goal, separated by a middle dot.
 // The first part is the actual theme heading; the rest is contextual text from school.
 const [title, ...extra] = theme.split(/\s+[·•]\s+/).map(s => s.trim()).filter(Boolean);
 const subtitle = extra.join(' · ');
 const found=PRESETS.find(p=>p.rx.test(theme));
 return {theme,title,subtitle,emoji:found?.emoji||'🌟',tone:found?.tone||'blue',
   quest:found?.quest||`Snakk sammen: Hva betyr «${title}» for deg, og hvordan kan du vise det denne uka?`};
}
export function themeProgressKey(year,week,grade,theme){
 return `skolesekken.tema.v1.${year}.${week}.${grade}.${encodeURIComponent(String(theme).toLowerCase())}`;
}
