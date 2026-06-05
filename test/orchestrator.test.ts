/**
 * Orchestrator unit tests. Injects a fake `api` so every branch (plain send,
 * rejected recipient, org-guard pass/fail, body modes, wait) is exercised
 * without a real fetch.
 */

import { describe, expect, it, vi } from 'vitest';
import { api, type SendMailBody, type SendMailResult, type WhoamiResult } from '../src/api.js';
import { InputsSchema, type Inputs } from '../src/inputs.js';
import { sendEmail, type Logger } from '../src/orchestrator.js';

const ORG_ID = '5ed84344-6a3a-498d-9656-075401c9634d';

function makeInputs(overrides: Partial<Inputs> = {}): Inputs {
  return InputsSchema.parse({
    apiKey: 'prim_test',
    apiBaseUrl: 'https://api.example.com/v1',
    from: 'ci@example.com',
    to: 'dev@example.com',
    subject: 'build done',
    bodyText: 'green',
    wait: false,
    waitTimeoutMs: 10_000,
    ...overrides,
  });
}

function makeLogger(): Logger & { lines: string[] } {
  const lines: string[] = [];
  return { info: (m) => lines.push(`info: ${m}`), warn: (m) => lines.push(`warn: ${m}`), lines };
}

// Fake api mirrors the real signatures (deps first); overrides expose only the
// per-call behaviour the test needs.
function fakeApi(over: {
  send?: (body: SendMailBody) => SendMailResult;
  who?: () => WhoamiResult;
}): typeof api {
  return {
    whoami: vi.fn(async () => (over.who ?? (() => ({ org_id: ORG_ID })))()),
    sendMail: vi.fn(async (_deps, body: SendMailBody) =>
      (over.send ?? (() => ({ id: 'em_1', status: 'submitted_to_agent', accepted: [body.to], rejected: [] })))(body),
    ),
  } as unknown as typeof api;
}

describe('sendEmail', () => {
  it('sends and returns id/status/accepted on success', async () => {
    const a = fakeApi({});
    const log = makeLogger();
    const res = await sendEmail(makeInputs(), { apiKey: 'k', apiBaseUrl: 'u', log, api: a });
    expect(res).toEqual({ emailId: 'em_1', status: 'submitted_to_agent', accepted: ['dev@example.com'], rejected: [] });
    expect(a.whoami).not.toHaveBeenCalled(); // no org guard set
  });

  it('forwards body_text/body_html + wait fields into the request', async () => {
    const seen: SendMailBody[] = [];
    const a = fakeApi({ send: (b) => { seen.push(b); return { id: 'em_2', status: 'delivered', accepted: [b.to], rejected: [] }; } });
    await sendEmail(makeInputs({ bodyText: undefined, bodyHtml: '<p>hi</p>', wait: true, waitTimeoutMs: 5000 }), {
      apiKey: 'k', apiBaseUrl: 'u', log: makeLogger(), api: a,
    });
    expect(seen[0]!).toMatchObject({ body_html: '<p>hi</p>', wait: true, wait_timeout_ms: 5000 });
    expect(seen[0]!.body_text).toBeUndefined();
  });

  it('omits wait_timeout_ms when wait is false', async () => {
    const seen: SendMailBody[] = [];
    const a = fakeApi({ send: (b) => { seen.push(b); return { id: 'e', status: 's', accepted: [b.to], rejected: [] }; } });
    await sendEmail(makeInputs({ wait: false }), { apiKey: 'k', apiBaseUrl: 'u', log: makeLogger(), api: a });
    expect(seen[0]!.wait).toBe(false);
    expect(seen[0]!.wait_timeout_ms).toBeUndefined();
  });

  it('returns rejected recipients (without throwing) so index.ts can set outputs then fail', async () => {
    const a = fakeApi({ send: (b) => ({ id: 'em_x', status: 'rejected', accepted: [], rejected: [b.to] }) });
    const res = await sendEmail(makeInputs(), { apiKey: 'k', apiBaseUrl: 'u', log: makeLogger(), api: a });
    expect(res).toEqual({ emailId: 'em_x', status: 'rejected', accepted: [], rejected: ['dev@example.com'] });
  });

  it('passes the org guard when whoami matches', async () => {
    const a = fakeApi({ who: () => ({ org_id: ORG_ID }) });
    await expect(
      sendEmail(makeInputs({ expectedOrgId: ORG_ID }), { apiKey: 'k', apiBaseUrl: 'u', log: makeLogger(), api: a }),
    ).resolves.toMatchObject({ status: 'submitted_to_agent' });
    expect(a.whoami).toHaveBeenCalledOnce();
  });

  it('aborts (without sending) when the org guard fails', async () => {
    const a = fakeApi({ who: () => ({ org_id: 'other-org' }) });
    await expect(
      sendEmail(makeInputs({ expectedOrgId: ORG_ID }), { apiKey: 'k', apiBaseUrl: 'u', log: makeLogger(), api: a }),
    ).rejects.toThrow(/org guard failed/);
    expect(a.sendMail).not.toHaveBeenCalled();
  });
});
