/** Choose the next useful school day, respecting the school's timezone. */
export function smartDayChoice(now=new Date(),zone='Europe/Oslo',schoolEndsAt=15){
 const parts=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:zone,weekday:'short',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(now).filter(x=>x.type!=='literal').map(x=>[x.type,x.value]));
 const weekday={Mon:0,Tue:1,Wed:2,Thu:3,Fri:4,Sat:5,Sun:6}[parts.weekday];
 const hour=Number(parts.hour)+Number(parts.minute)/60;
 if(weekday>=5)return {day:0,tryNextWeek:true};
 if(weekday===4&&hour>=schoolEndsAt)return {day:0,tryNextWeek:true};
 return {day:hour>=schoolEndsAt?weekday+1:weekday,tryNextWeek:false};
}
