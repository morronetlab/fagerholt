/** Public-only configuration: publishable key is intended for browsers.
 * Never return a service_role / secret API key.
 */
export default async function handler(){
 const url=process.env.SUPABASE_URL||'';
 const key=process.env.SUPABASE_PUBLISHABLE_KEY||'';
 let enabled=false;
 try{
  const u=new URL(url);
  let publicKey=key.startsWith('sb_publishable_')&&key.length>20;
  if(!publicKey&&key.startsWith('eyJ')){
   try{
    const payload=JSON.parse(Buffer.from(key.split('.')[1],'base64url').toString('utf8'));
    publicKey=payload?.role==='anon';
   }catch{}
  }
  enabled=u.protocol==='https:'&&/^[a-z0-9-]+\.supabase\.co$/.test(u.hostname)&&u.pathname==='/'&&publicKey;
 }catch{}
 return new Response(JSON.stringify(enabled?{enabled:true,url,publishableKey:key}:{enabled:false}),{
  status:200,headers:{'Content-Type':'application/json; charset=utf-8',
   'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}
 });
}
