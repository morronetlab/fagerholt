/** Sundays 17:00–18:45 UTC (18–20:45 CET; 19–20:45 CEST).
 * Automatic scheduled execution only after production deploy.
 * Live email requires WEEKLY_DIGEST_SEND_ENABLED=true and sender/service secrets.
 */
import {runWeeklyDigestDispatch} from '../../lib/weekly-digest-dispatch.mjs';
export const config={schedule:'*/15 17-18 * * 0'};
export default async function handler(){
 const result=await runWeeklyDigestDispatch();
 return new Response(JSON.stringify({status:result.status,sent:result.sent}),{
  headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}
 });
}
