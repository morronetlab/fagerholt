// Calendar dates are ALWAYS calculated for the school's timezone, even when a device is elsewhere.
const DAY_MS = 86400000;
export const REFRESH_INTERVAL_MS = 60 * 60 * 1000;

export function norwayCalendar(referenceDate = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Oslo', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(referenceDate).filter(p => p.type !== 'literal').map(p => [p.type, Number(p.value)]));
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
  const dow = (date.getUTCDay() + 6) % 7; // Monday 0 … Sunday 6
  const thursday = new Date(date);
  thursday.setUTCDate(date.getUTCDate() - dow + 3);
  const year = thursday.getUTCFullYear(); // ISO week year, not necessarily calendar year
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const weekOneMonday = new Date(jan4);
  weekOneMonday.setUTCDate(jan4.getUTCDate() - (jan4.getUTCDay() + 6) % 7);
  const week = Math.round((date.getTime() - dow * DAY_MS - weekOneMonday.getTime()) / (7 * DAY_MS)) + 1;
  return {date, dateKey: date.toISOString().slice(0, 10), day: Math.min(dow, 4), dow, year, week};
}

export function isExpiredSchoolDay(dayIndex, todayDow) {
  return Number.isInteger(dayIndex) && dayIndex >= 0 && dayIndex <= 4 &&
    Number.isInteger(todayDow) && todayDow >= 0 && todayDow <= 6 && dayIndex < todayDow;
}

export function hasCalendarDateChanged(previous, current) {
  return previous.dateKey !== current.dateKey || previous.year !== current.year || previous.week !== current.week;
}

export function hourlyRefreshDue(openedAtMs, currentMs, intervalMs = REFRESH_INTERVAL_MS) {
  return currentMs - openedAtMs >= intervalMs;
}
