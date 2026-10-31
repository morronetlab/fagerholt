/** Published deploys only: daily source integrity and optional ops email. */
import {runCalendarMonitor} from '../../lib/calendar-monitor.mjs';
export const config={schedule:'15 6 * * *'};
export default async function handler(){
 await runCalendarMonitor();
 return new Response(null,{status:204});
}
