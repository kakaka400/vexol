import { HttpError } from '../shared/lib';

// Overridable so a local run can point the calls at a fake.
const zernioApiUrl = () => process.env.ZERNIO_API_URL || 'https://zernio.com/api/v1';

export async function getZernio(apiKey: string, path: string, query: Record<string, string>) {
  return zernioRequest(apiKey, 'GET', path, { query });
}

// One call to Zernio. A refusal (4xx) carries Zernio's own reason, because it
// names what to fix (an aspect ratio, a disconnected account); anything else
// is reported as the provider being unavailable.
export async function zernioRequest(
  apiKey: string,
  method: 'GET' | 'POST',
  path: string,
  options: { query?: Record<string, string>; body?: unknown; idempotencyKey?: string } = {},
): Promise<unknown> {
  const url = new URL(`${zernioApiUrl()}${path}`);
  for (const [key, value] of Object.entries(options.query ?? {})) url.searchParams.set(key, value);

  const headers: Record<string, string> = { Authorization: `Bearer ${apiKey}` };
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  if (options.idempotencyKey) headers['Idempotency-Key'] = options.idempotencyKey;

  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: AbortSignal.timeout(method === 'GET' ? 10_000 : 30_000),
    });
  } catch {
    throw new HttpError(503, 'Social data is temporarily unavailable');
  }

  if (!response.ok) {
    if (response.status >= 400 && response.status < 500 && response.status !== 401) {
      const reason = await zernioError(response);
      throw new HttpError(502, reason ? `Zernio refused: ${reason}` : 'Zernio refused the request');
    }
    if (response.status === 401) throw new HttpError(502, 'Zernio rejected the API key');
    throw new HttpError(502, 'Social data provider returned an error');
  }

  try {
    return await response.json();
  } catch {
    throw new HttpError(502, 'Social data provider returned an invalid response');
  }
}

async function zernioError(response: Response): Promise<string | null> {
  try {
    const body = (await response.json()) as { error?: unknown; message?: unknown };
    const reason = typeof body.error === 'string' ? body.error : body.message;
    return typeof reason === 'string' ? reason.slice(0, 300) : null;
  } catch {
    return null;
  }
}
