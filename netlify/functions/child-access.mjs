/** Child data API: existing QR bearer or active linked Feide browser session. */
import {createChildAccessHandler} from '../../lib/child-access.mjs';
import {resolveFeideChildContext} from '../../lib/feide-child-session.mjs';
import {feideRuntimeEnv} from '../../lib/feide-runtime-env.mjs';
export default (request,context)=>
  createChildAccessHandler({
    env:feideRuntimeEnv(context),
    feideContextResolver:resolveFeideChildContext
  })(request);
