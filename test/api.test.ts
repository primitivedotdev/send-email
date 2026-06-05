/**
 * api.ts wrapper tests. Stubs global fetch to verify request shape (method,
 * headers, body) and the envelope-unwrap + error behaviour.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api, ApiError } from '../src/api.js';

const DEPS = { apiBaseUrl: 'https://api.example.com/v1', apiKey: 'prim_test' };

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function ok(data: unknown): Response {
  return new Response(JSON.stringify({ success: true, data }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('api.sendMail', () => {
  it('POSTs /send-mail with bearer auth + json body and unwraps the envelope', async () => {
    fetchMock.mockResolvedValueOnce(
      ok({ id: 'em_1', status: 'submitted_to_agent', accepted: ['a@x.com'], rejected: [] }),
    );
    const res = await api.sendMail(DEPS, { from: 'c@x.com', to: 'a@x.com', subject: 's', body_text: 'b' });

    expect(res).toEqual({ id: 'em_1', status: 'submitted_to_agent', accepted: ['a@x.com'], rejected: [] });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://api.example.com/v1/send-mail');
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe('Bearer prim_test');
    expect(init.headers['Content-Type']).toBe('application/json');
    expect(JSON.parse(init.body)).toEqual({ from: 'c@x.com', to: 'a@x.com', subject: 's', body_text: 'b' });
  });

  it('throws ApiError with status + server message on a 4xx', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: { code: 'unverified_sender', message: 'from not verified' } }), {
        status: 422,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    await expect(api.sendMail(DEPS, { from: 'c@x.com', to: 'a@x.com', subject: 's', body_text: 'b' })).rejects.toMatchObject(
      { name: 'ApiError', status: 422, message: expect.stringContaining('from not verified') },
    );
  });

  it('does NOT retry POST on 5xx (single attempt)', async () => {
    fetchMock.mockResolvedValueOnce(new Response('boom', { status: 503 }));
    await expect(api.sendMail(DEPS, { from: 'c@x.com', to: 'a@x.com', subject: 's', body_text: 'b' })).rejects.toBeInstanceOf(
      ApiError,
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('whoami GET retries once on 5xx then succeeds', async () => {
    fetchMock
      .mockResolvedValueOnce(new Response('boom', { status: 502 }))
      .mockResolvedValueOnce(ok({ org_id: 'org-1' }));
    const res = await api.whoami(DEPS);
    expect(res).toEqual({ org_id: 'org-1' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('wraps a network failure as ApiError status=0', async () => {
    fetchMock.mockRejectedValueOnce(new Error('ECONNRESET'));
    await expect(api.sendMail(DEPS, { from: 'c@x.com', to: 'a@x.com', subject: 's', body_text: 'b' })).rejects.toMatchObject(
      { status: 0, message: expect.stringContaining('ECONNRESET') },
    );
  });
});
