export const DAYS = ['Mandag','Tirsdag','Onsdag','Torsdag','Fredag'];
export function schoolCalendar(date = new Date(), zone = 'Europe/Oslo') {
  const pieces = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
    timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'
  }).formatToParts(date).filter(x=>x.type!=='literal').map(x=>[x.type,Number(x.value)]));
  const local = new Date(Date.UTC(pieces.year,pieces.month-1,pieces.day));
  const weekday = (local.getUTCDay()+6)%7;
  const thursday = new Date(local); thursday.setUTCDate(local.getUTCDate()-weekday+3);
  const year = thursday.getUTCFullYear();
  const jan4 = new Date(Date.UTC(year,0,4));
  const monday1 = new Date(jan4); monday1.setUTCDate(jan4.getUTCDate()-(jan4.getUTCDay()+6)%7);
  const monday = new Date(local); monday.setUTCDate(local.getUTCDate()-weekday);
  return {year, week: Math.round((monday-monday1)/604800000)+1, weekday: Math.min(weekday,4), today:local.toISOString().slice(0,10)};
}
export function dayDate(year, week, index) {
  const jan4 = new Date(Date.UTC(year,0,4));
  const date = new Date(jan4);
  date.setUTCDate(jan4.getUTCDate()-(jan4.getUTCDay()+6)%7+(week-1)*7+index);
  return date.toISOString().slice(0,10);
}
