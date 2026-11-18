/** Feide guardian linking: trusted deployment scope, server-only access. */
import {createFeideLinkHandler} from '../../lib/feide-child-link.mjs';
import {feideRuntimeEnv} from '../../lib/feide-runtime-env.mjs';
export default (request,context)=>
  createFeideLinkHandler({env:feideRuntimeEnv(context)})(request);
export const config={path:'/api/feide-child-link'};
