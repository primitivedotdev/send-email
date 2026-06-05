# Send Email

GitHub Action that sends an email from CI via [primitive.dev](https://primitive.dev)'s `/v1/send-mail` API. Useful for pipeline notifications, release announcements, and alerts. The step **fails** if the recipient is rejected, so a red run means the mail didn't go out.

## Quick start

```yaml
- uses: primitivedotdev/send-email@v0
  with:
    api-key: ${{ secrets.PRIMITIVE_API_KEY }}
    from: ci@yourdomain.com
    to: you@example.com
    subject: "Deploy ${{ github.ref_name }} succeeded"
    body-text: ${{ github.event.head_commit.message }}
```

`from` must be on a verified sending domain owned by the API key's org.

## Inputs

| Input | Required | Default | Description |
|---|---|---|---|
| `api-key` | yes | — | Org-scoped Primitive API key. Pass via `${{ secrets.* }}` — masked in logs. |
| `api-base-url` | no | `https://api.primitive.dev/v1` | API base URL. Override only for a non-production environment. |
| `from` | yes | — | Sender address on a verified sending domain owned by the key's org. |
| `to` | yes | — | Recipient address. |
| `subject` | yes | — | Email subject. |
| `body-text` | one of | — | Plain-text body. At least one of `body-text` / `body-html` is required. |
| `body-html` | one of | — | HTML body. At least one of `body-text` / `body-html` is required. |
| `wait` | no | `false` | Block until the platform reports a delivery outcome (up to `wait-timeout-ms`) instead of returning when the send is accepted. |
| `wait-timeout-ms` | no | `10000` | Max ms to wait for delivery when `wait` is true (platform caps at 30000). |
| `expected-org-id` | no | — | Safety guard: calls `/whoami` and aborts if the API key's org differs from this UUID. Recommended in production workflows. |

At least one of `body-text` and `body-html` must be set.

## Outputs

| Output | Description |
|---|---|
| `email-id` | UUID of the accepted send. |
| `status` | Platform-reported status (e.g. `submitted_to_agent`, `delivered`). |
| `accepted` | Comma-separated accepted recipients. |
| `rejected` | Comma-separated rejected recipients (empty on success — a non-empty value fails the step). |

## Examples

### Notify on failure

```yaml
- name: Tests
  run: pnpm test
- if: failure()
  uses: primitivedotdev/send-email@v0
  with:
    api-key: ${{ secrets.PRIMITIVE_API_KEY }}
    from: ci@yourdomain.com
    to: oncall@yourdomain.com
    subject: "❌ ${{ github.workflow }} failed on ${{ github.ref_name }}"
    body-text: "${{ github.server_url }}/${{ github.repository }}/actions/runs/${{ github.run_id }}"
```

### HTML body + wait for delivery + org guard

```yaml
- uses: primitivedotdev/send-email@v0
  with:
    api-key: ${{ secrets.PRIMITIVE_API_KEY }}
    expected-org-id: ${{ vars.PRIMITIVE_ORG_ID }}
    from: releases@yourdomain.com
    to: team@yourdomain.com
    subject: "Release ${{ github.ref_name }}"
    body-html: "<h1>Shipped ${{ github.ref_name }}</h1><p>See the changelog.</p>"
    wait: true
    wait-timeout-ms: 20000
```

### Using outputs

```yaml
- id: mail
  uses: primitivedotdev/send-email@v0
  with:
    api-key: ${{ secrets.PRIMITIVE_API_KEY }}
    from: ci@yourdomain.com
    to: you@example.com
    subject: hi
    body-text: hi
- run: echo "sent email-id=${{ steps.mail.outputs.email-id }} status=${{ steps.mail.outputs.status }}"
```

## Security

- The `api-key` input is automatically masked. Pass it as a GitHub secret (`${{ secrets.* }}`) — never hard-code.
- Use `expected-org-id` in production workflows. It calls `GET /v1/whoami` before sending and aborts if the API key's org doesn't match, so a leaked key can't be used to send from an unexpected org.

## Versioning

- Floating major tag `v0` always tracks the latest 0.x.
- Pin a specific minor/patch (`v0.1.0`) for reproducible runs.
- Breaking changes bump the major; the old major stays alive for a deprecation window.

## Source

This action is authored in [primitivedotdev/primitive-mono-repo](https://github.com/primitivedotdev/primitive-mono-repo) under `tools/actions/send-email/` and mirrored here on release tags. See [RELEASING.md](./RELEASING.md) for the release process.

## License

MIT — see [LICENSE](./LICENSE).
