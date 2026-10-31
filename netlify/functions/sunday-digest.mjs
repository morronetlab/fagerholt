/** Sundays 17:00–20:45 UTC; local delivery window is still 18–21 CET/CEST.
 * Automatic scheduled execution only after production deploy.
 * Live email requires WEEKLY_DIGEST_SEND_ENABLED=true and sender/service secrets.
 */
import {runWeeklyDigestDispatch} from '../../lib/weekly-digest-dispatch.mjs';
export const config={schedule:'*/15 17-20 * * 0'};
export default async function handler(){
 const result=await runWeeklyDigestDispatch();
 return new Response(JSON.stringify({status:result.status,sent:result.sent}),{
  headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}
 });
}
