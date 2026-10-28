/** A repeated homework item has one checkbox per documented weekday. */
import {DAYS} from './calendar.mjs';
export function expandHomework(items){
 const list=[];
 for(const item of (Array.isArray(items)?items:[])){
  const days=Array.isArray(item?.repeatDays)?DAYS.filter(d=>item.repeatDays.includes(d)):[];
  if(days.length){for(const day of days)list.push({...item,repeatDay:day,repeatDays:days});}
  else list.push(item);
 }
 return list;
}
export function repeatDayLabel(item){
 return DAYS.includes(item?.repeatDay)?'📖 '+item.repeatDay+' – daglig oppgave':null;
}
