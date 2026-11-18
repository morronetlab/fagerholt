/** Preview-only Feide OIDC code flow + logout test endpoints. */
import {createFeideOidcHandler} from '../../lib/feide-oidc.mjs';
export default createFeideOidcHandler();
export const config = {
  path: [
    '/api/feide-oidc/start',
    '/api/feide-oidc/callback',
    '/api/feide-oidc/status',
    '/api/feide-oidc/logout',
    '/api/feide-oidc/complete'
  ]
};
