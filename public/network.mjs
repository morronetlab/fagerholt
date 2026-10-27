/** Fetch JSON without leaving the UI stuck in a loading state forever. */
export class DataLoadError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'DataLoadError';
    this.code = code;
  }
}

export async function fetchJsonWithTimeout(url, {timeoutMs = 12000, cache = 'default', fetchImpl = globalThis.fetch} = {}) {
  const controller = new AbortController();
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new DataLoadError('timeout', 'Tidsavbrudd ved henting'));
    }, timeoutMs);
  });
  const request = (async () => {
    let response;
    try {
      response = await fetchImpl(url, {cache, signal: controller.signal});
    } catch (err) {
      if (controller.signal.aborted) throw new DataLoadError('timeout', 'Tidsavbrudd ved henting');
      throw new DataLoadError('offline', 'Ingen kontakt med Netlify');
    }
    if (response.status === 404 || response.status === 405) {
      throw new DataLoadError('missing_api', 'Netlify-funksjonen ble ikke funnet');
    }
    const type = response.headers?.get?.('content-type') || '';
    if (type && !type.includes('application/json')) {
      throw new DataLoadError('missing_api', 'Netlify returnerte en nettside i stedet for JSON');
    }
    let body;
    try { body = await response.json(); }
    catch { throw new DataLoadError('invalid_api', 'API-et sendte ikke gyldig JSON'); }
    if (!response.ok) {
      throw new DataLoadError('server', body?.warning || `API-et svarte HTTP ${response.status}`);
    }
    return body;
  })();
  // Retire an abandoned request even when a mock/proxy ignores AbortSignal.
  // Promise.race prevents a permanently pending response.json() from freezing the UI.
  try { return await Promise.race([request, timeout]); }
  finally { clearTimeout(timer); }
}
