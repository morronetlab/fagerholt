/** Public boolean: never exposes email service credentials or recipients. */
import {mailConfigured} from '../../lib/mail-core.mjs';
import {serviceConfigured} from '../../lib/weekly-digest-dispatch.mjs';
export function digestAvailable(env=process.env){
 return env.WEEKLY_DIGEST_SEND_ENABLED==='true'&&mailConfigured(env)&&serviceConfigured(env);
}
export default async function handler(){
 return new Response(JSON.stringify({available:digestAvailable()}),{headers:{
  'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',
  'X-Content-Type-Options':'nosniff'}});
}
