import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {CloudAccount,SESSION_KEY,validSupabaseConfig,taskFingerprint} from '../public/shared/cloud-account.mjs';
import {importCurrentLocalFamily,IMPORT_MAP_PREFIX} from '../public/shared/family-import.mjs';
import {FAMILY_STORAGE_KEY,familyDocument,childProgressKey} from '../public/shared/family-core.mjs';
import {siteConfig} from '../public/site-config.mjs';
import {expandHomework} from '../public/shared/homework-view.mjs';

const config={url:'https://testprojectabc.supabase.co/',publishableKey:'sb_publishable_test_not_a_real_key'};
function storage(seed={}){
 const db=new Map(Object.entries(seed));
 return {getItem:k=>db.get(k)||null,setItem:(k,v)=>db.set(k,v),
  removeItem:k=>db.delete(k),entries:()=>[...db]};
}
const result=(value,status=200)=>new Response(JSON.stringify(value),{status,
 headers:{'Content-Type':'application/json'}});
test('Public configuration strictly accepts HTTPS Supabase publishable endpoint',()=>{
 assert.equal(validSupabaseConfig(config),true);
 assert.equal(validSupabaseConfig({...config,url:'http://testprojectabc.supabase.co/'}),false);
 assert.equal(validSupabaseConfig({...config,url:'https://evil.com/'}),false);
 assert.equal(validSupabaseConfig({...config,publishableKey:'service_role_secret_test'}),false);
});
test('Email sign-in uses OTP without passwords, session is restored locally',async()=>{
 const calls=[],st=storage();
 const fetcher=async(url,init)=>{
  calls.push({url,init});
  if(url.includes('/auth/v1/otp'))return result({});
  if(url.includes('/auth/v1/verify'))return result({access_token:'access-one',
   refresh_token:'refresh-one',expires_in:3600,user:{id:'parent-1',email:'a@example.no'}});
  if(url.includes('/rest/v1/families'))return result([{id:'family-one',name:'Vår familie'}]);
  if(url.includes('/auth/v1/user'))return result({id:'parent-1',email:'a@example.no'});
  throw Error('Unexpected fetch '+url);
 };
 const c=new CloudAccount(config,{fetcher,storage:st});
 await c.sendCode('a@example.no');await c.verifyCode('a@example.no','123456');
 assert.equal(c.isSignedIn(),true);
 assert.equal(JSON.parse(st.getItem(SESSION_KEY)).refresh_token,'refresh-one');
 assert.equal(calls[0].init.body.includes('"create_user":true'),true);
 assert.equal(calls[1].init.body.includes('"type":"email"'),true);
 assert.equal((await c.families())[0].id,'family-one');
 assert.equal(calls[2].init.headers.Authorization,'Bearer access-one');
 const again=new CloudAccount(config,{fetcher,storage:st});
 assert.equal((await again.restore()).id,'parent-1');
 again.signOutLocal();assert.equal(st.getItem(SESSION_KEY),null);
});
test('Cannot send malformed email or code to Supabase',async()=>{
 const c=new CloudAccount(config,{fetcher:()=>{throw Error('Should not fetch');},storage:storage()});
 await assert.rejects(c.sendCode('not-an-email'),/e-postadresse/i);
 await assert.rejects(c.verifyCode('a@example.no','123'),/engangskoden/i);
 await assert.rejects(c.families(),/logge inn/i);
});
test('Stable task fingerprints ignore list indexes and vary by week and wording',()=>{
 const task={subject:'Norsk',text:'Les kapittel 7',dueDay:'Fredag'};
 const base={school:'fagerholt',grade:'3',year:2026,week:44,task};
 const a=taskFingerprint(base);
 assert.match(a,/^[a-f0-9]{16}$/);
 assert.equal(a,taskFingerprint({...base,task:{...task}}));
 assert.notEqual(a,taskFingerprint({...base,week:45}));
 assert.notEqual(a,taskFingerprint({...base,task:{...task,text:'Les kapittel 8'}}));
});
test('Explicit import uploads only current-week checked items and leaves local archive intact',async()=>{
 const child={id:'child-abcd-1111',name:'Barn 1',school:'fagerholt',grade:'3',group:''};
 const cal={year:2026,week:44};
 const plan={year:2026,week:44,homework:[
  {subject:'Norsk',text:'Les 15 minutter',dueDay:'Torsdag'},
  {subject:'Matte',text:'Gjør oppgaver',dueDay:'Fredag'}]};
 const checks=childProgressKey(child,2026,44,'homework'),old=childProgressKey(child,2026,43,'homework');
 const st=storage({[FAMILY_STORAGE_KEY]:familyDocument([child]),
   [checks]:JSON.stringify({0:true,1:false}),[old]:JSON.stringify({0:true})});
 const calls=[],client={
  async children(){return []},
  async createChild(fields){calls.push(['child',fields]);return [{id:'remote-child-id',...fields}]},
  async setTask(fields){calls.push(['task',fields]);return []}
 };
 const output=await importCurrentLocalFamily({client,familyId:'family-uuid',
  schools:siteConfig.schools,calendar:cal,storage:st,fetchPlan:async()=>plan});
 assert.deepEqual([output.profiles,output.marked],[1,1]);
 assert.equal(calls.length,2);
 assert.equal(calls[1][1].childId,'remote-child-id');
 assert.equal(calls[1][1].ignoreDuplicates,true);
 assert.ok(st.getItem(old),'Past progress remains unchanged');
 assert.ok(st.getItem(FAMILY_STORAGE_KEY),'Local child list remains unchanged');
 assert.equal(JSON.parse(st.getItem(IMPORT_MAP_PREFIX+'family-uuid'))[child.id],'remote-child-id');
});
test('Migration does not fabricate source assignments when the current PDF is missing',async()=>{
 const child={id:'child-abcd-1111',name:'Barn 1',school:'fagerholt',grade:'3',group:''};
 const st=storage({[FAMILY_STORAGE_KEY]:familyDocument([child])}),calls=[];
 const client={children:async()=>[],createChild:async fields=>{calls.push(fields);return [{id:'remote-1',...fields}]},
 setTask:async()=>{throw Error('Should never post task')}};
 const summary=await importCurrentLocalFamily({client,familyId:'fam-1',
  schools:siteConfig.schools,calendar:{year:2026,week:44},storage:st,
  fetchPlan:async()=>({year:2026,week:43,homework:[]})});
 assert.equal(summary.profiles,1);assert.equal(summary.marked,0);
 assert.equal(summary.notes.length,1);
});
test('SQL migration gates every family table behind RLS and scopes children and progress',()=>{
 const sql=readFileSync(new URL('../supabase/migrations/20261029_family_accounts.sql',import.meta.url),'utf8');
 for(const table of ['families','family_members','children','homework_progress','family_invitations'])
  assert.ok(sql.includes('alter table public.'+table+' enable row level security;'));
 assert.match(sql,/foreign key\(child_id,family_id\) references public\.children\(id,family_id\)/);
 assert.match(sql,/family_id in \(select private\.parent_family_ids\(\)\)/);
 assert.match(sql,/revoke all on public\.families/);
 assert.match(sql,/security definer set search_path=''/);
 assert.match(sql,/invitee_email=email and used_at is null and expires_at>now\(\)/);
 assert.doesNotMatch(sql,/grant (select|insert|update).*family_invitations.*to authenticated/i);
});

test('A service_role JWT is never accepted as a browser publishable key',()=>{
 const token=role=>'eyJhbGciOiJub25lIn0.'+Buffer.from(JSON.stringify({role})).toString('base64url')+'.signature';
 assert.equal(validSupabaseConfig({...config,publishableKey:token('service_role')}),false);
 assert.equal(validSupabaseConfig({...config,publishableKey:token('anon')}),true);
 assert.equal(validSupabaseConfig({...config,publishableKey:'sb_secret_do_not_publish'}),false);
});
