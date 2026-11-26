/** Read-only deployment guard. No authentication or private data is requested. */
export async function checkProductionGuard(origin,{fetchImpl=fetch,timeout=15000}={}){
 const base=new URL(origin);
 if(base.protocol!=='https:'||base.username||base.password||base.pathname!=='/'||base.search||base.hash)
  throw Error('Expected a clean HTTPS production origin');
 const get=path=>fetchImpl(new URL(path,base),{method:'GET',redirect:'manual',cache:'no-store',
  signal:AbortSignal.timeout(timeout)});
 const [page,api]=await Promise.all([get('/drift/'),get('/api/operations-health')]);
 const html=page.status===200?await page.text():'';
 const dashboardReady=page.status===200&&html.includes('<title>Driftsstatus')&&html.includes('/drift/drift.mjs');
 const privateApiDenied=api.status===401;
 const privateApiNoStore=/(?:^|,)\s*no-store\s*(?:,|$)/i.test(api.headers.get('cache-control')||'');
 const errors=[];
 if(!dashboardReady)errors.push('Drift dashboard unavailable or missing assets');
 if(!privateApiDenied)errors.push('Operations API did not deny anonymous access (HTTP '+api.status+')');
 if(!privateApiNoStore)errors.push('Operations API missing no-store');
 // Never read or log the private endpoint response body.
 return {dashboardReady,privateApiDenied,privateApiNoStore,errors};
}
