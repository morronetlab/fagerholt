/** Minimal Supabase Auth/PostgREST client for a static Netlify frontend.
 * Only the publishable/anon key is ever exposed. All access relies on RLS.
 */
export const SESSION_KEY='ukeplanen.cloud.session.v1';
export function validSupabaseConfig(config){
 try {
  const u=new URL(config?.url);
  const key=config?.publishableKey;
  if(u.protocol!=='https:'||! /^[a-z0-9-]+\.supabase\.co$/.test(u.hostname)||
     u.pathname!=='/'||typeof key!=='string'||key.length<20)return false;
  if(key.startsWith('sb_publishable_'))return true;
  if(!key.startsWith('eyJ'))return false;
  try{
   const payload=JSON.parse(atob(key.split('.')[1].replace(/-/g,'+').replace(/_/g,'/')));
   return payload?.role==='anon';
  }catch{return false;}
 }catch{return false;}
}
export function taskFingerprint({school,grade,year,week,task,day}){
 const norm=s=>String(s??'').normalize('NFKC').toLocaleLowerCase('nb-NO')
  .replace(/\s+/g,' ').trim();
 const value=[school,grade,year,week,norm(task?.subject),norm(task?.text),
  norm(task?.dueDay),norm(task?.repeatDay||day),norm(task?.group)].join('\x1f');
 let a=2166136261,b=2166136261^0x9e3779b9;
 for(let i=0;i<value.length;i++){
  const c=value.charCodeAt(i);
  a=Math.imul(a^c,16777619)>>>0;b=Math.imul(b^c,2246822519)>>>0;
 }
 return a.toString(16).padStart(8,'0')+b.toString(16).padStart(8,'0');
}
export class CloudAccount {
 constructor(config,{fetcher=fetch,storage=localStorage}={}){
  if(!validSupabaseConfig(config))throw Error('Supabase-konfigurasjon mangler eller er ugyldig.');
  this.base=config.url.replace(/\/$/,'');this.key=config.publishableKey;
  this.fetcher=fetcher;this.storage=storage;
  this.session=null;this.refreshing=null;
  try{
   const raw=JSON.parse(storage.getItem(SESSION_KEY)||'null');
   if(raw&&typeof raw.access_token==='string'&&typeof raw.refresh_token==='string'&&Number.isFinite(raw.expires_at))
    this.session=raw;
  }catch{/* unavailable storage means session only */}
 }
 isSignedIn(){return Boolean(this.session?.access_token);}
 persist(data){
  if(!data?.access_token||!data?.refresh_token)throw Error('Mangler gyldig innloggingssesjon.');
  this.session={access_token:data.access_token,refresh_token:data.refresh_token,
   expires_at:Math.floor(Date.now()/1000)+Number(data.expires_in||3600)-30,
   user:data.user||this.session?.user||null};
  try{this.storage.setItem(SESSION_KEY,JSON.stringify(this.session));}catch{}
  return this.session;
 }
 signOutLocal(){this.session=null;try{this.storage.removeItem(SESSION_KEY);}catch{}}
 async request(path,{method='GET',body,auth=false,headers={},retry=true}={}){
  if(auth)await this.ensureSession();
  const h={'apikey':this.key,'Accept':'application/json',...headers};
  if(auth)h.Authorization='Bearer '+this.session.access_token;
  if(body!==undefined)h['Content-Type']='application/json';
  let res;
  try{res=await this.fetcher(this.base+path,{method,headers:h,body:body===undefined?undefined:JSON.stringify(body),cache:'no-store'});}
  catch{throw Error('Fikk ikke kontakt med konto-tjenesten. Kontroller nettverket.');}
  if(res.status===401&&auth&&retry){
   await this.refreshSession(true);
   return this.request(path,{method,body,auth,headers,retry:false});
  }
  let data;
  try{data=await res.json();}catch{data=null;}
  if(!res.ok)throw Error(String(data?.msg||data?.error_description||data?.message||data?.error||'Forespørselen mislyktes.').slice(0,220));
  return data;
 }
 async ensureSession(){
  if(!this.session?.refresh_token)throw Error('Du må logge inn først.');
  if(this.session.expires_at<=Date.now()/1000+45)await this.refreshSession();
 }
 async refreshSession(force=false){
  if(this.refreshing)return this.refreshing;
  if(!this.session?.refresh_token)throw Error('Du må logge inn på nytt.');
  if(!force&&this.session.expires_at>Date.now()/1000+45)return this.session;
  this.refreshing=(async()=>{
   try{
    const data=await this.request('/auth/v1/token?grant_type=refresh_token',{
     method:'POST',body:{refresh_token:this.session.refresh_token}});
    return this.persist(data);
   }catch(error){this.signOutLocal();throw Error('Økten har utløpt. Logg inn på nytt.');}
   finally{this.refreshing=null;}
  })();
  return this.refreshing;
 }
 async sendCode(email){
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>254)throw Error('Skriv en gyldig e-postadresse.');
  return this.request('/auth/v1/otp',{method:'POST',body:{email:email.toLowerCase().trim(),create_user:true}});
 }
 async verifyCode(email,token){
  if(!/^\d{6,8}$/.test(token.trim()))throw Error('Skriv inn engangskoden fra e-posten.');
  const data=await this.request('/auth/v1/verify',{method:'POST',body:{email:email.toLowerCase().trim(),token:token.trim(),type:'email'}});
  return this.persist(data);
 }
 async restore(){
  if(!this.isSignedIn())return null;
  try{
   await this.ensureSession();
   const user=await this.request('/auth/v1/user',{auth:true});
   if(!user?.id)throw Error('Manglende bruker');
   this.session.user=user;return user;
  }catch{this.signOutLocal();return null;}
 }
 async signOut(){
  try{if(this.isSignedIn())await this.request('/auth/v1/logout',{method:'POST',auth:true});}
  finally{this.signOutLocal();}
 }
 async rows(table,params=''){
  return this.request('/rest/v1/'+table+'?'+params,{auth:true});
 }
 async insert(table,body,{ignoreDuplicates=false}={}){
  return this.request('/rest/v1/'+table+(ignoreDuplicates?'?on_conflict=child_id,school_year,school_week,task_key':''),{
   method:'POST',auth:true,body,
   headers:{Prefer:(ignoreDuplicates?'resolution=ignore-duplicates,':'')+'return=representation'}});
 }
 async patch(table,where,body){
  return this.request('/rest/v1/'+table+'?'+where,{method:'PATCH',auth:true,body,headers:{Prefer:'return=representation'}});
 }
 async remove(table,where){
  return this.request('/rest/v1/'+table+'?'+where,{method:'DELETE',auth:true,headers:{Prefer:'return=representation'}});
 }
 async rpc(name,body){return this.request('/rest/v1/rpc/'+name,{method:'POST',auth:true,body});}
 families(){return this.rows('families','select=id,name,created_by,created_at&order=created_at.asc');}
 createFamily(name){return this.rpc('create_family',{p_name:name});}
 children(familyId){return this.rows('children','select=id,family_id,nickname,school_id,grade,group_name&family_id=eq.'+encodeURIComponent(familyId)+'&order=created_at.asc');}
 createChild(data){return this.insert('children',data);}
 updateChild(id,familyId,changes){return this.patch('children','id=eq.'+encodeURIComponent(id)+'&family_id=eq.'+encodeURIComponent(familyId),changes);}
 removeChild(id,familyId){return this.remove('children','id=eq.'+encodeURIComponent(id)+'&family_id=eq.'+encodeURIComponent(familyId));}
 progress(familyId,year,week){return this.rows('homework_progress','select=child_id,task_key,completed&family_id=eq.'+
  encodeURIComponent(familyId)+'&school_year=eq.'+year+'&school_week=eq.'+week);}
 setTask({familyId,childId,year,week,key,completed,ignoreDuplicates=false}){
  const values={family_id:familyId,child_id:childId,school_year:year,school_week:week,
   task_key:key,completed:!!completed};
  return this.request('/rest/v1/homework_progress?on_conflict=child_id,school_year,school_week,task_key',{
   method:'POST',body:values,auth:true,headers:{Prefer:'resolution='+(ignoreDuplicates?'ignore':'merge')+'-duplicates,return=representation'}});
 }
 inviteParent(familyId,email){return this.rpc('invite_guardian',{p_family:familyId,p_email:email});}
 acceptInvite(code){return this.rpc('accept_guardian_invite',{p_token:code});}
 deleteFamily(id){return this.rpc('delete_family',{p_family:id});}
 leaveFamily(id){return this.rpc('leave_family',{p_family:id});}
}
