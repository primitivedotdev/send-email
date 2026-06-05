/**
 * Send orchestration: the platform-shape-independent algorithm the Action runs
 * once inputs are parsed. Split out from `index.ts` so it's testable without an
 * `@actions/core` runtime — unit tests inject a fake api + capture output
 * through a Logger seam.
 */

import { api, ApiError, type SendMailResult } from './api.js';
import type { Inputs } from './inputs.js';

export { ApiError };

export interface Logger {
  info(msg: string): void;
  warn(msg: string): void;
}

export interface OrchestratorDeps {
  apiKey: string;
  apiBaseUrl: string;
  log: Logger;
  /** Test seam — overrides the api wrapper. */
  api?: typeof api;
}

export interface OrchestratorResult {
  emailId: string;
  status: string;
  accepted: string[];
  rejected: string[];
}

export async function sendEmail(inputs: Inputs, deps: OrchestratorDeps): Promise<OrchestratorResult> {
  const a = deps.api ?? api;
  const apiDeps = { apiKey: deps.apiKey, apiBaseUrl: deps.apiBaseUrl };

  // Optional cross-org safety guard: refuse to send if the key's org differs
  // from the caller's expectation (prevents a leaked-key cross-org send).
  if (inputs.expectedOrgId) {
    const who = await a.whoami(apiDeps);
    if (who.org_id !== inputs.expectedOrgId) {
      throw new Error(
        `org guard failed: api-key belongs to org ${who.org_id}, expected ${inputs.expectedOrgId}`,
      );
    }
    deps.log.info(`org guard ok: ${who.org_id}`);
  }

  const result: SendMailResult = await a.sendMail(apiDeps, {
    from: inputs.from,
    to: inputs.to,
    subject: inputs.subject,
    ...(inputs.bodyText ? { body_text: inputs.bodyText } : {}),
    ...(inputs.bodyHtml ? { body_html: inputs.bodyHtml } : {}),
    wait: inputs.wait,
    ...(inputs.wait ? { wait_timeout_ms: inputs.waitTimeoutMs } : {}),
  });

  const accepted = result.accepted ?? [];
  const rejected = result.rejected ?? [];

  // A rejected recipient should fail the step, but we DON'T throw here: the
  // caller (index.ts) sets all four outputs first, then calls setFailed — so a
  // `continue-on-error` workflow can still read `outputs.rejected` to see which
  // address bounced. Throwing would skip the outputs entirely.
  if (rejected.length > 0) {
    deps.log.warn(`send rejected recipient(s): ${rejected.join(', ')} (id=${result.id})`);
  } else {
    deps.log.info(`send ok: id=${result.id} status=${result.status} accepted=${accepted.join(', ')}`);
  }
  return { emailId: result.id, status: result.status, accepted, rejected };
}
