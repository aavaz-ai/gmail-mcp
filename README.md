# Gmail no-CASA MCP

First-party, minimal Gmail MCP for explicitly approved plain-text sending and Gmail user-label object management over stdio, using only Gmail's send and labels OAuth scopes.

Maintained by Enterpret as the Gmail integration for the Enterpret Agent. Its standards-based MCP interface can also be used by compatible hosts that meet the approval and replay-safety requirements documented below.

This repository contains the `@enterpret/gmail-mcp@0.1.0` MIT-licensed release candidate. It is prepared for local packing and installed-artifact validation, but it has not been published or enabled in production.

## V1 surface

The MCP registers exactly four tools:

- `send_email`
- `create_label`
- `update_label`
- `delete_label`

The integration requests exactly two scopes:

- `https://www.googleapis.com/auth/gmail.send`
- `https://www.googleapis.com/auth/gmail.labels`

No message, thread, inbox, or search reads are exposed. V1 also excludes drafts, replies, forwarding, attachments, HTML, raw MIME, sender aliases, message labeling, archive/trash/star/read mutations, synchronization, triggers, HTTP MCP transport, and unrelated Workspace services.

As of July 2026, Google classifies `gmail.labels` as non-sensitive and `gmail.send` as sensitive; neither scope is restricted. The sensitive send scope still requires the applicable OAuth app verification for broad external production, but this exact scope set does not invoke the restricted-scope security assessment/CASA path. Do not broaden the scopes without a new product and security review.

## Tool contract

### `send_email`

Input:

```json
{
  "to": ["alice@example.com"],
  "cc": [],
  "bcc": [],
  "subject": "Exact subject",
  "body": "Complete plain-text body"
}
```

All five fields are required so the approval surface has an explicit value for every recipient group, subject, and body. Recipient arrays accept bare ASCII mailbox addresses only; display names and surrounding whitespace are rejected. There must be at least one `to` recipient, no exact duplicate across recipient fields, and at most 100 total recipients. Subjects are limited to 200 characters and reject CR, LF, and NUL. Bodies are limited to 100,000 characters and reject NUL.

The parser preserves the approved values exactly. The transport independently builds RFC-compatible plain-text MIME with deterministic address and encoded-subject folding, an internally generated UTC `Date` header, UTF-8/base64 body encoding, and Gmail base64url encoding. It never adds `From`, `Reply-To`, or `Message-Id`. Gmail binds the OAuth-authenticated account's configured default sender; this is not necessarily the primary login address.

Success is deliberately minimal:

```json
{ "status": "sent" }
```

The package performs one provider dispatch attempt. A connection failure, lost response, or HTTP 5xx after dispatch begins returns `send_unknown_outcome`, `outcome: "unknown"`, and `retryable: false`. The package never treats that as permission to resend and never exposes Gmail response bodies or provider message IDs.

### Label tools

Labels use exact, case-sensitive user-label names as public identity. Nested names such as `Projects/Launch` are accepted. Names are limited to 200 characters and reject control characters and leading or trailing whitespace. Provider IDs are internal and never appear in schemas or results.

- `create_label` takes `name`, optional `label_list_visibility` (`labelShow`, `labelShowIfUnread`, or `labelHide`), and optional `message_list_visibility` (`show` or `hide`). Defaults are `labelShow` and `show`.
- `update_label` takes the exact current `name` plus at least one of `new_name`, `label_list_visibility`, or `message_list_visibility`.
- `delete_label` takes the exact `name`.

Internal label resolution calls Gmail's labels list endpoint, compares exact names, and accepts only the provider's lowercase `type: "user"`. Lowercase `type: "system"` is rejected, including rename targets; uppercase variants are treated as invalid provider responses. Duplicate exact names are an error rather than an arbitrary choice. Result objects return only status, name, and relevant visibility—not provider IDs, counts, or mailbox metadata.

Tool annotations are fixed as follows:

| Tool | `readOnlyHint` | `destructiveHint` | `idempotentHint` | `openWorldHint` |
| --- | --- | --- | --- | --- |
| `send_email` | `false` | `false` | `false` | `true` |
| `create_label` | `false` | `false` | `false` | `true` |
| `update_label` | `false` | `true` | `false` | `true` |
| `delete_label` | `false` | `true` | `false` | `true` |

Sending is irreversible and non-idempotent, but additive rather than destructive under the MCP annotation definition. Safety must come from trusted host policy, not an inflated `destructiveHint`. All label idempotence hints remain false because exact-name resolution does not make ambiguous create, rename, update, or delete replay safe.

## Authentication and runtime

The server uses MCP over stdio only. It reads one fresh access token from `GMAIL_OAUTH_BEARER` at startup. Missing, blank, or whitespace-only values fail closed before the server becomes usable.

The package contains no OAuth UI, access-token refresh, refresh-token handling, token persistence, credential files, filesystem state, or HTTP transport. It reserves stdout for JSON-RPC and emits only fixed, sanitized diagnostics to stderr. Errors expose a stable category, outcome, non-retryable flag, and safe HTTP status when available; they omit authorization headers, tokens, recipients, subjects, bodies, raw MIME, and provider error bodies.

OAuth authorization, refresh-token custody, access-token refresh, and persistence belong to the integrating host or its token broker. The host injects only a fresh bearer into a fresh MCP child. Deployments should pin an exact immutable package version when invoking through `npx`; preinstalling and directly executing the reviewed package keeps bearer material out of package-install processes.

Build and inspect the local binary with Node 22 or later:

```bash
npm ci
npm run check
node dist/index.js --version
```

Running the server without `GMAIL_OAUTH_BEARER` must exit nonzero. Do not store a live bearer in this repository, an `.env` file, shell history, fixtures, or logs.

## Host safety limitations

The package cannot control host approval grants or workflow replay. Before enabling `send_email`, the integrating host must provide both guarantees:

1. Every `send_email` call receives fresh explicit user approval, even after an earlier “always allow” choice or in high-autonomy mode. Approval must display the exact `to`, `cc`, `bcc`, subject, and complete body without truncation.
2. Once a send may have reached Gmail, timeout, process failure, connection close, saved-grant reuse, and workflow replay cannot dispatch it again. The result remains unknown until the user independently verifies delivery.

`delete_label` must also receive consequence-aware approval explaining that deleting a Gmail user label removes that label from all affected messages and threads. Create and update use the host's normal write approval unless a stricter policy is adopted.

## Validation

Credential-free tests cover the exact MCP surface and annotations, bearer failure, schemas and negative features, approval-payload fidelity, MIME/base64url/Unicode behavior, mocked send and label endpoints, lowercase provider label types, system-label rejection, redaction, and ambiguous-send single-attempt behavior.

Before any release candidate:

```bash
npm ci
npm run check
npm pack --dry-run
npm audit --omit=dev
```

`npm run smoke:pack` builds a fresh tarball in a temporary directory and runs MCP initialization plus exact four-tool discovery through `npx -y` against that artifact. CI runs the same command on every push and pull request.

Also inspect the packed files, install the reviewed tarball into a fresh temporary consumer, smoke-test the installed CLI and stdio initialization/tool discovery, and scan the source and package for credentials and scopes. Live Gmail calls, real sends, OAuth-provider configuration, host-integration changes, commits, remotes, publication, and production enablement require separate authorization.

The packed-artifact discovery smoke accepts the tarball produced by `npm pack` and executes that exact artifact through `npx` without making a Gmail API call:

```bash
node scripts/packed-npx-smoke.mjs /path/to/enterpret-gmail-mcp-0.1.0.tgz
```

## Release gates

The intended release lineage is a reviewed source revision → `@enterpret/gmail-mcp@0.1.0` → an exact deployment pin. Repository readiness, npm publication, OAuth configuration, host safety policy, integration testing, and production enablement are independent gates. Google's sensitive-scope verification is required for broad external production use of `gmail.send`.

See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for provenance. No source from the upstream reference implementations was copied or adapted.

Repository and npm publication procedures are documented in [RELEASING.md](RELEASING.md). Publishing remains an explicit, separately authorized action.

## References

- [Gmail OAuth scopes](https://developers.google.com/workspace/gmail/api/auth/scopes)
- [Gmail users.messages.send](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages/send)
- [Gmail users.labels](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.labels)
