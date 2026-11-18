/**
 * An isolated Feide OIDC login probe; never authorizes access to a family.
 * Provider OAuth flow and token verification happen at Supabase Auth.
 */
export const PROVIDER = 'custom:feide';
export const CALLBACK_PATH = '/barn/feide/callback';
export const PENDING_KEY = 'skoleuka.feide.poc.pending.v1';

export function isPreviewHost(hostname) {
  return /^deploy-preview-[1-9][0-9]*--ukeplanen\.netlify\.app$/u.test(String(hostname || ''));
}

export function previewCallback(origin) {
  const url = new URL(origin);
  if (url.protocol !== 'https:' || !isPreviewHost(url.hostname) ||
      url.pathname !== '/' || url.search || url.hash) {
    throw Error('Feide POC kan kun startes fra Skoleuka Deploy Preview.');
  }
  return new URL(CALLBACK_PATH, url).href;
}

export function feideAuthorizeURL(supabaseUrl, previewOrigin) {
  const base = new URL(supabaseUrl);
  if (base.protocol !== 'https:' || !/^[a-z0-9-]+\.supabase\.co$/u.test(base.hostname) ||
      base.pathname !== '/' || base.search || base.hash) {
    throw Error('Ugyldig Supabase-adresse.');
  }
  const url = new URL('/auth/v1/authorize', base);
  url.searchParams.set('provider', PROVIDER);
  url.searchParams.set('redirect_to', previewCallback(previewOrigin));
  return url.href;
}

export function parseOAuthCallback(hash, search) {
  // Parse only in memory. Caller must remove both hash and query from browser URL first.
  const p = new URLSearchParams(String(hash || '').replace(/^#/, ''));
  const q = new URLSearchParams(String(search || '').replace(/^\?/, ''));
  if (p.has('error') || q.has('error')) return {kind:'error'};
  if (q.has('code')) return {kind:'unsupported-code'};
  const token = p.get('access_token');
  if (!token || p.get('token_type')?.toLowerCase() !== 'bearer') return {kind:'missing'};
  // Never print, save in localStorage, or send the supplied refresh/provider token.
  return {kind:'access-token', accessToken:token,
    rawIdTokenReturned:p.has('id_token') || p.has('provider_id_token')};
}

export function identitySummary(user) {
  if (!user || typeof user !== 'object') return {feide:false, stableSubject:false, otherIdentities:false};
  const identities = Array.isArray(user.identities) ? user.identities : [];
  const feide = identities.find(i => i?.provider === PROVIDER);
  const linked = identities.some(i => i?.provider && i.provider !== PROVIDER);
  return {
    feide: Boolean(feide || user.app_metadata?.provider === PROVIDER),
    stableSubject: typeof feide?.identity_data?.sub === 'string' && feide.identity_data.sub.length > 0,
    otherIdentities: linked
  };
}
