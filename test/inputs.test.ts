import { describe, expect, it } from 'vitest';
import { InputsSchema, parseBool, parseIntInput } from '../src/inputs.js';

const base = {
  apiKey: 'prim_test',
  apiBaseUrl: 'https://api.example.com/v1',
  from: 'ci@example.com',
  to: 'dev@example.com',
  subject: 'hi',
  bodyText: 'hello',
  wait: false,
  waitTimeoutMs: 10_000,
};

describe('InputsSchema', () => {
  it('accepts a minimal valid input and strips trailing slashes on base url', () => {
    const out = InputsSchema.parse({ ...base, apiBaseUrl: 'https://api.example.com/v1//' });
    expect(out.apiBaseUrl).toBe('https://api.example.com/v1');
    expect(out.from).toBe('ci@example.com');
  });

  it('requires at least one of body-text / body-html', () => {
    expect(() => InputsSchema.parse({ ...base, bodyText: undefined, bodyHtml: undefined })).toThrow(
      /at least one of body-text or body-html/,
    );
    expect(() => InputsSchema.parse({ ...base, bodyText: undefined, bodyHtml: '<p>hi</p>' })).not.toThrow();
  });

  it('rejects malformed from / to addresses', () => {
    expect(() => InputsSchema.parse({ ...base, from: 'not-an-email' })).toThrow(/from must be an email/);
    expect(() => InputsSchema.parse({ ...base, to: 'nope' })).toThrow(/to must be an email/);
  });

  it('rejects a wait-timeout over the 30s cap and a non-uuid org id', () => {
    expect(() => InputsSchema.parse({ ...base, waitTimeoutMs: 60_000 })).toThrow(/caps at 30000/);
    expect(() => InputsSchema.parse({ ...base, expectedOrgId: 'not-a-uuid' })).toThrow();
  });
});

describe('parseBool', () => {
  it('maps the accepted spellings and defaults empty to false', () => {
    expect(parseBool('true', 'wait')).toBe(true);
    expect(parseBool('1', 'wait')).toBe(true);
    expect(parseBool('false', 'wait')).toBe(false);
    expect(parseBool('0', 'wait')).toBe(false);
    expect(parseBool('', 'wait')).toBe(false);
  });
  it('throws on garbage', () => {
    expect(() => parseBool('yes', 'wait')).toThrow(/must be 'true' or 'false'/);
  });
});

describe('parseIntInput', () => {
  it('parses integers and falls back to the default on empty', () => {
    expect(parseIntInput('5000', 'wait-timeout-ms', 10_000)).toBe(5000);
    expect(parseIntInput('', 'wait-timeout-ms', 10_000)).toBe(10_000);
  });
  it('throws on non-integers', () => {
    expect(() => parseIntInput('1.5', 'wait-timeout-ms', 10_000)).toThrow(/must be an integer/);
    expect(() => parseIntInput('abc', 'wait-timeout-ms', 10_000)).toThrow(/must be an integer/);
  });
});
