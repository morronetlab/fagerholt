/** Public boolean: never exposes email service credentials or recipients. */
import {mailConfigured} from '../../lib/mail-core.mjs';
export function digestAvailable(env=process.env){
 try{const url=new URL(env.SUPABASE_URL||'');
 return env.WEEKLY_DIGEST_SEND_ENABLED==='true'&&mailConfigured(env)&&
  url.protocol==='https:'&&/^[a-z0-9-]+\.supabase\.co$/.test(url.hostname)&&
  typeof env.SUPABASE_SERVICE_ROLE_KEY==='string'&&env.SUPABASE_SERVICE_ROLE_KEY.length>=32;
 }catch{return false;}
}
export default async function handler(){
 return new Response(JSON.stringify({available:digestAvailable()}),{headers:{
  'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',
  'X-Content-Type-Options':'nosniff'}});
}
