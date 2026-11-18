/** Feide OIDC endpoints: resolve trusted Netlify deploy context at request time. */
import {createFeideOidcHandler} from '../../lib/feide-oidc.mjs';
import {feideRuntimeEnv} from '../../lib/feide-runtime-env.mjs';
export default (request,context)=>
  createFeideOidcHandler({env:feideRuntimeEnv(context)})(request);
export const config = {
  path: [
    '/api/feide-oidc/start',
    '/api/feide-oidc/callback',
    '/api/feide-oidc/status',
    '/api/feide-oidc/logout',
    '/api/feide-oidc/complete'
  ]
};
