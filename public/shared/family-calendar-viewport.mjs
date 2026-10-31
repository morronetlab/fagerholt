/** A presentation-only viewport of the complete 7-day event model.
 * The calendar shows schooldays first; any meaningful weekend entries are
 * available explicitly. There is no data loss or family access change.
 */
export function focusedFamilyCalendar(model,{showWeekend=false}={}){
 const days=Array.isArray(model?.days)?model.days:[];
 const weekday=days.slice(0,5);
 const weekend=days.slice(5);
 const weekendCount=weekend.reduce((n,d)=>n+(d.items?.length||0),0);
 const weekendVisible=Boolean(showWeekend&&weekendCount);
 const visibleDays=weekendVisible?[...weekday,...weekend]:weekday;
 const undated=Array.isArray(model?.undated)?model.undated:[];
 return {...model,days:visibleDays,undated,
  count:visibleDays.reduce((n,d)=>n+(d.items?.length||0),undated.length),
  weekdayCount:weekday.reduce((n,d)=>n+(d.items?.length||0),0),
  weekendCount,weekendVisible};
}
