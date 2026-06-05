/**
 * Send Email — GitHub Action entrypoint.
 *
 * Thin caller over `orchestrator.sendEmail`:
 *   - parses + validates @actions/core inputs (via `inputs.ts`)
 *   - masks the API key before any work so an early throw can't leak it
 *   - wires `@actions/core` logger seams into the orchestrator
 *   - emits action outputs on success, maps failures to `core.setFailed`
 *
 * Kept deliberately small so unit tests exercise `orchestrator.sendEmail`
 * against a fake api/logger and never need the real `@actions/core` runtime.
 */

import * as core from '@actions/core';

import { InputsSchema, parseBool, parseIntInput } from './inputs.js';
import { ApiError, sendEmail } from './orchestrator.js';

async function main(): Promise<void> {
  const apiKey = core.getInput('api-key', { required: true });
  // Mask first so an early throw can't leak it via a stack trace.
  core.setSecret(apiKey);

  const inputs = InputsSchema.parse({
    apiKey,
    apiBaseUrl: core.getInput('api-base-url') || 'https://api.primitive.dev/v1',
    from: core.getInput('from', { required: true }),
    to: core.getInput('to', { required: true }),
    subject: core.getInput('subject', { required: true }),
    bodyText: core.getInput('body-text') || undefined,
    bodyHtml: core.getInput('body-html') || undefined,
    wait: parseBool(core.getInput('wait') || 'false', 'wait'),
    waitTimeoutMs: parseIntInput(core.getInput('wait-timeout-ms') || '', 'wait-timeout-ms', 10_000),
    expectedOrgId: core.getInput('expected-org-id') || undefined,
  });

  const result = await sendEmail(inputs, {
    apiKey,
    apiBaseUrl: inputs.apiBaseUrl,
    log: {
      info: (msg) => core.info(msg),
      warn: (msg) => core.warning(msg),
    },
  });

  // Write outputs BEFORE deciding pass/fail so a `continue-on-error` consumer can
  // read `rejected` even when the step fails.
  core.setOutput('email-id', result.emailId);
  core.setOutput('status', result.status);
  core.setOutput('accepted', result.accepted.join(','));
  core.setOutput('rejected', result.rejected.join(','));

  if (result.rejected.length > 0) {
    core.setFailed(`send rejected recipient(s): ${result.rejected.join(', ')} (id=${result.emailId})`);
    return;
  }
  core.info(`sent: id=${result.emailId} status=${result.status}`);
}

main().catch((err: unknown) => {
  if (err instanceof ApiError) {
    core.setFailed(`API error (${err.status}): ${err.message}`);
    return;
  }
  if (err instanceof Error) {
    core.setFailed(err.message);
    return;
  }
  core.setFailed(String(err));
});
