/**
 * Netlify functions receive authoritative deploy information as the second
 * handler argument. The build-only CONTEXT variable is not reliably exposed
 * to the serverless runtime.
 *
 * Never infer environment from a user-controlled Host/X-Forwarded-* header.
 * Preserve the existing process.env.CONTEXT fallback for local development
 * and test runners; the Netlify context overrides it when present.
 */
export function feideRuntimeEnv(context, base=process.env) {
  const deployContext=context?.deploy?.context;
  return {...base,CONTEXT:typeof deployContext==='string'?deployContext:base.CONTEXT};
}
