/** Keep PDF wording, but present due dates, packing and end times legibly. */
const DAYS=['Mandag','Tirsdag','Onsdag','Torsdag','Fredag'];
const tidy=s=>String(s||'').replace(/\s+/g,' ').trim();
export function dueDayLabel(item,{allowTextFallback=true}={}){
 if(!item||typeof item==='string')return null;
 const value=tidy(item.dueDay);
 const day=DAYS.find(d=>d.toLocaleLowerCase('nb-NO')===value.toLocaleLowerCase('nb-NO'));
 if(day)return 'Til '+day.toLocaleLowerCase('nb-NO');
 if(!allowTextFallback)return null;
 const fromText=(item.subject||'')+' '+(item.text||'');
 const m=fromText.match(/\btil\s+(mandag|tirsdag|onsdag|torsdag|fredag)\b/i);
 return m?'Til '+m[1].toLocaleLowerCase('nb-NO'):null;
}
export function packingText(value){
 return tidy(value)
  .replace(/([a-zæøå])(?=Til(?:inne|ute|gym|svøm|kropp))/g,'$1 · ')
  .replace(/\bTil(?=(?:inne|ute|gym|svøm|kropp))/g,'Til ')
  .replace(/([a-zæøå])(?=[A-ZÆØÅ][a-zæøå])/g,'$1 · ');
}
export function displayEvent(event){
 const title=tidy(event?.title),time=tidy(event?.time);
 const rx=/\b(?:skolen\s+)?(?:slutt|slutter|ferdig|avsluttes)\s*(?:kl\.?\s*)?(\d{1,2}[.:]\d{2})\b/i;
 const t=time.match(rx),u=title.match(rx),finish=t||u;
 const endTime=finish?'Slutt kl. '+finish[1].replace('.',':'):null;
 const startTime=t?null:time;
 const cleanTitle=u?tidy(title.replace(u[0],''))||title:title;
 return {title:cleanTitle,time:startTime,endTime};
}
