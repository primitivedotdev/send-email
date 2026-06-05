/**
 * Input parsing for the Send Email GitHub Action.
 *
 * `@actions/core.getInput` always returns a string; this module is the single
 * place we convert action-runtime strings into a validated, typed config (zod).
 * Conversion failures throw with a readable message so the action fails fast at
 * top-of-run rather than mid-send.
 */

import { z } from 'zod';

// Permissive address check — the platform does authoritative validation
// server-side (and owns the verified-domain rules for `from`). We only catch
// obvious typos so a malformed workflow fails before the API round-trip.
const looksLikeEmail = (s: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s);

export const InputsSchema = z
  .object({
    apiKey: z.string().min(1, 'api-key is required'),
    apiBaseUrl: z
      .string()
      .url()
      .transform((s) => s.replace(/\/+$/, '')),
    from: z.string().refine(looksLikeEmail, 'from must be an email address'),
    to: z.string().refine(looksLikeEmail, 'to must be an email address'),
    subject: z.string().min(1, 'subject is required'),
    bodyText: z.string().optional(),
    bodyHtml: z.string().optional(),
    wait: z.boolean().default(false),
    waitTimeoutMs: z.number().int().positive().max(30_000, 'wait-timeout-ms caps at 30000'),
    expectedOrgId: z.string().uuid().optional(),
  })
  .strict()
  .refine(
    (v) => (v.bodyText != null && v.bodyText !== '') || (v.bodyHtml != null && v.bodyHtml !== ''),
    'at least one of body-text or body-html is required',
  );

export type Inputs = z.infer<typeof InputsSchema>;

/**
 * Parse a boolean from an action input string. action.yml booleans arrive as
 * raw strings; we accept the standard `true`/`false` spellings plus `1`/`0`.
 * Anything else throws so a typo in a workflow doesn't silently flip a flag.
 */
export function parseBool(raw: string, fieldName: string): boolean {
  const norm = raw.trim().toLowerCase();
  if (norm === '' || norm === 'false' || norm === '0') return false;
  if (norm === 'true' || norm === '1') return true;
  throw new Error(`${fieldName} must be 'true' or 'false' (got: ${raw})`);
}

/**
 * Parse a positive-integer action input (milliseconds). Empty falls back to the
 * provided default; non-numeric throws rather than silently coercing to NaN.
 */
export function parseIntInput(raw: string, fieldName: string, dflt: number): number {
  const trimmed = raw.trim();
  if (trimmed === '') return dflt;
  const n = Number(trimmed);
  if (!Number.isInteger(n)) throw new Error(`${fieldName} must be an integer (got: ${raw})`);
  return n;
}
