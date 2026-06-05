#!/usr/bin/env node
/**
 * Local end-to-end driver for the bundled action.
 *
 * GitHub Actions feeds the action runtime via `INPUT_<NAME>` env vars (see
 * @actions/core); this script sets them in-process then imports the bundled
 * dist/index.js so the action runs exactly as it would on a runner — but
 * against real credentials from your shell.
 *
 * Usage:
 *   PRIMITIVE_API_KEY=... node scripts/run-local.mjs \
 *     --from ci@yourdomain.com \
 *     --to you@example.com \
 *     --subject "hello from CI" \
 *     --body-text "it works" \
 *     [--body-html "<p>it works</p>"] \
 *     [--wait true --wait-timeout-ms 20000] \
 *     [--expected-org-id <uuid>] \
 *     [--api-base-url https://api.primitive.dev/v1]
 *
 * Inputs not supplied via flags fall through to action.yml defaults (api-base-url
 * defaults to prod). The api-key MUST be in env — never on the command line where
 * it could leak via `ps`/history.
 */

import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = resolve(HERE, '..');

const apiKey = process.env.PRIMITIVE_API_KEY;
if (!apiKey) {
  console.error('PRIMITIVE_API_KEY env var is required');
  process.exit(1);
}

// Parse `--key value` pairs from argv into an object.
const args = {};
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (!a.startsWith('--')) {
    console.error(`unexpected positional arg: ${a}`);
    process.exit(1);
  }
  const key = a.slice(2);
  const next = argv[i + 1];
  if (next == null || next.startsWith('--')) {
    console.error(`flag --${key} requires a value`);
    process.exit(1);
  }
  args[key] = next;
  i++;
}

// @actions/core.getInput reads `INPUT_${name.toUpperCase().replace(/ /g,'_')}`.
// Dashes in names are preserved as-is in the env var name (yes, really).
function setInput(name, value) {
  if (value === undefined) return;
  process.env[`INPUT_${name.toUpperCase().replace(/ /g, '_')}`] = String(value);
}

setInput('api-key', apiKey);
for (const k of ['from', 'to', 'subject', 'body-text', 'body-html', 'wait', 'wait-timeout-ms', 'api-base-url', 'expected-org-id']) {
  if (args[k] !== undefined) setInput(k, args[k]);
}

console.error('[run-local] inputs configured; invoking dist/index.js');
await import(resolve(PKG_ROOT, 'dist', 'index.js'));
