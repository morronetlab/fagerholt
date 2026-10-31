/** Server-only transactional email via a verified Resend sender.
 * No credentials, personal data or source excerpts are logged.
 */
export function mailConfigured(env=process.env){
 return typeof env.RESEND_API_KEY==='string'&&/^re_[A-Za-z0-9_]{12,}$/u.test(env.RESEND_API_KEY)&&
  typeof env.EMAIL_FROM==='string'&&env.EMAIL_FROM.length>=6&&
  /<[^<>\s@]+@[^<>\s@]+\.[^<>\s@]+>|^[^<>\s@]+@[^<>\s@]+\.[^<>\s@]+$/u.test(env.EMAIL_FROM);
}
export async function sendPlainEmail({to,subject,text,idempotencyKey},
 {fetchImpl=fetch,env=process.env}={}){
 if(!mailConfigured(env))throw Error('Email provider is not configured');
 if(typeof to!=='string'||to.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(to)||
  typeof subject!=='string'||subject.length>160||!subject.trim()||
  typeof text!=='string'||!text.trim()||text.length>20000||
  !/^[A-Za-z0-9_:.-]{8,200}$/u.test(idempotencyKey||''))
  throw Error('Invalid email envelope');
 const response=await fetchImpl('https://api.resend.com/emails',{
  method:'POST',headers:{Authorization:'Bearer '+env.RESEND_API_KEY,
   'Content-Type':'application/json','Idempotency-Key':idempotencyKey},
  body:JSON.stringify({from:env.EMAIL_FROM,to:[to],subject,text}),
  signal:AbortSignal.timeout(12000)
 });
 if(!response.ok)throw Error('Email delivery failed with HTTP '+response.status);
 const result=await response.json().catch(()=>null);
 if(typeof result?.id!=='string'||!result.id)throw Error('Provider did not confirm message');
 return result.id;
}
