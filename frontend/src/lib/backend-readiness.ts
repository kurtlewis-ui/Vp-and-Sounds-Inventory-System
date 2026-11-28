import { waitForRetry } from './request-policy';

export const BACKEND_WAIT_LIMIT_MS = 120_000;
export const BACKEND_PROBE_TIMEOUT_MS = 30_000;
export const BACKEND_SLOW_NOTICE_MS = 3_000;
const RETRY_DELAYS_MS = [2_000, 4_000, 8_000, 12_000, 20_000, 30_000, 30_000];

export class BackendConnectionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BackendConnectionError';
  }
}

/** Only safe health reads are retried. Credentials are never sent here. */
export async function waitForBackend(
  apiBase: string,
  signal: AbortSignal,
  onSlow: () => void,
): Promise<void> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    throw new BackendConnectionError('You are offline. Check your internet connection and try again.');
  }
  const origin = apiBase.replace(/\/api\/v\d+\/?$/, '').replace(/\/$/, '');
  const deadline = Date.now() + BACKEND_WAIT_LIMIT_MS;
  const slowNotice = setTimeout(onSlow, BACKEND_SLOW_NOTICE_MS);
  try {
    for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length && Date.now() < deadline; attempt++) {
      if (signal.aborted) throw new DOMException('Connection canceled', 'AbortError');
      const probe = new AbortController();
      const cancel = () => probe.abort();
      signal.addEventListener('abort', cancel, { once: true });
      const timeout = setTimeout(cancel, Math.min(BACKEND_PROBE_TIMEOUT_MS, deadline - Date.now()));
      try {
        const response = await fetch(`${origin}/health`, {
          mode: 'cors', cache: 'no-store', signal: probe.signal,
        });
        if (response.ok) return;
        if (![502, 503, 504].includes(response.status)) {
          throw new BackendConnectionError('The server is temporarily unavailable. Please try again later or contact an administrator.');
        }
      } catch (error) {
        if (signal.aborted) throw new DOMException('Connection canceled', 'AbortError');
        if (error instanceof BackendConnectionError) throw error;
        // A timeout/network error can be a sleeping host, but is not proof of one.
      } finally {
        clearTimeout(timeout);
        signal.removeEventListener('abort', cancel);
      }
      if (attempt < RETRY_DELAYS_MS.length && Date.now() < deadline) {
        await waitForRetry(Math.min(RETRY_DELAYS_MS[attempt], deadline - Date.now()), signal);
      }
    }
    throw new BackendConnectionError('The server is still not responding. Please check your connection and try again shortly.');
  } finally {
    clearTimeout(slowNotice);
  }
}

/** Replace transport jargon without hiding credential/validation errors. */
export function loginConnectionMessage(error: unknown): string | undefined {
  if (error instanceof BackendConnectionError) return error.message;
  const failure = error as { code?: string; response?: { status?: number } };
  if ((failure?.response?.status ?? 0) >= 500) {
    return 'The server is temporarily unavailable. Please try again shortly.';
  }
  if (!failure?.response && ['ECONNABORTED', 'ETIMEDOUT', 'ERR_NETWORK'].includes(failure?.code ?? '')) {
    return typeof navigator !== 'undefined' && navigator.onLine === false
      ? 'You are offline. Check your internet connection and try again.'
      : 'Unable to connect to the server. It may still be starting. Please try again shortly.';
  }
  return undefined;
}
