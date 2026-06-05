/**
 * Thin wrapper over the public Primitive API surface this action consumes
 * (`POST /send-mail`, plus `GET /whoami` for the optional org guard). All
 * requests carry the Bearer API key; the success envelope (`{success, data}`)
 * is unwrapped here so the orchestrator only sees domain data.
 *
 * Retry policy: GET retries once on 5xx (idempotent). POST does NOT retry — a
 * duplicate send is worse than a transient failure; the workflow can re-run.
 *
 * Mirrors tools/actions/deploy-function/src/api.ts intentionally — published
 * Actions keep a lean, hand-rolled client (deps: @actions/core + zod only)
 * rather than bundling the SDK into the redistributed dist.
 */

const FETCH_TIMEOUT_MS = 35_000;

export interface ApiDeps {
  apiKey: string;
  apiBaseUrl: string;
  fetch?: typeof fetch;
}

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export interface WhoamiResult {
  org_id: string;
}

export interface SendMailBody {
  from: string;
  to: string;
  subject: string;
  body_text?: string;
  body_html?: string;
  wait?: boolean;
  wait_timeout_ms?: number;
}

export interface SendMailResult {
  id: string;
  status: string;
  accepted?: string[];
  rejected?: string[];
  queue_id?: string | null;
}

interface RequestOpts {
  method: 'GET' | 'POST';
  path: string;
  body?: unknown;
  /** Internal: GET retries once on 5xx. POST does not. */
  retryOn5xx?: boolean;
}

async function call<T>(deps: ApiDeps, opts: RequestOpts): Promise<T> {
  const url = `${deps.apiBaseUrl}${opts.path}`;
  const fetchImpl = deps.fetch ?? globalThis.fetch;
  const headers: Record<string, string> = { Authorization: `Bearer ${deps.apiKey}` };
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';

  const init: RequestInit = {
    method: opts.method,
    headers,
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  };

  let res: Response;
  try {
    res = await fetchImpl(url, init);
  } catch (err) {
    throw new ApiError(`network error: ${(err as Error).message}`, 0, undefined);
  }

  if (res.status >= 500 && opts.retryOn5xx) {
    // Single retry with a fresh timeout budget (re-using init.signal would hand
    // the retry whatever the first attempt didn't burn). Network failure on the
    // retry funnels through the same ApiError(status=0) shape.
    await new Promise((r) => setTimeout(r, 1_000));
    const retryInit: RequestInit = { ...init, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) };
    try {
      res = await fetchImpl(url, retryInit);
    } catch (err) {
      throw new ApiError(`network error (retry): ${(err as Error).message}`, 0, undefined);
    }
  }

  const text = await res.text();
  let parsed: unknown;
  try {
    parsed = text === '' ? undefined : JSON.parse(text);
  } catch {
    parsed = text;
  }

  if (!res.ok) {
    const envelope = parsed as { error?: { code?: string; message?: string } } | undefined;
    const detail = envelope?.error?.message ?? (typeof parsed === 'string' ? parsed : 'unknown');
    throw new ApiError(`${res.status} ${detail}`, res.status, parsed);
  }

  const envelope = parsed as { success?: boolean; data?: T } | undefined;
  if (envelope && 'data' in envelope) return envelope.data as T;
  return parsed as T;
}

export const api = {
  whoami(deps: ApiDeps): Promise<WhoamiResult> {
    return call<WhoamiResult>(deps, { method: 'GET', path: '/whoami', retryOn5xx: true });
  },

  sendMail(deps: ApiDeps, body: SendMailBody): Promise<SendMailResult> {
    return call<SendMailResult>(deps, { method: 'POST', path: '/send-mail', body });
  },
};
