/**
 * Invitation links are bearer credentials: keep the token out of browser
 * history once captured, retain it only in THIS TAB through OTP/login reloads,
 * and clear it immediately after a successful acceptance.
 */
export const GUARDIAN_INVITE_SESSION_KEY='skoleuka.guardian-invite.v1';
export const GUARDIAN_INVITE_MAX_AGE_MS=48*60*60*1000;
const valid=token=>typeof token==='string'&&/^[a-f0-9]{64}$/.test(token);
const storageRead=storage=>{try{return storage?.getItem(GUARDIAN_INVITE_SESSION_KEY)||null;}catch{return null;}};
export function clearGuardianInvite(storage){
 try{storage?.removeItem(GUARDIAN_INVITE_SESSION_KEY);}catch{}
}
export function captureGuardianInvite(hash,storage,now=Date.now()){
 const params=new URLSearchParams(String(hash||'').replace(/^#/,''));
 if(params.has('invite')){
  const token=params.get('invite');
  if(!valid(token)){clearGuardianInvite(storage);return null;}
  try{storage?.setItem(GUARDIAN_INVITE_SESSION_KEY,JSON.stringify({token,savedAt:now}));}catch{}
  return token;
 }
 const raw=storageRead(storage);
 if(!raw)return null;
 try{
  const data=JSON.parse(raw);
  if(valid(data?.token)&&Number.isFinite(data.savedAt)&&data.savedAt<=now&&
     now-data.savedAt<GUARDIAN_INVITE_MAX_AGE_MS)return data.token;
 }catch{}
 clearGuardianInvite(storage);
 return null;
}
