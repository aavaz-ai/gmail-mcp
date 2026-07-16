# Gmail MCP Agent Guidelines

Read this file and `README.md` before planning or changing the repository.

## Workflow

- Default to discovery before implementation: inspect the current repository state, product contract, host approval/retry behavior, and relevant upstream specifications before proposing a code change.
- Preserve existing work. Do not commit, push, create a remote, publish a package, or update external systems without explicit authorization.
- Keep the package small and auditable. Avoid generic Gmail clients, arbitrary REST tools, bundled OAuth frameworks, HTTP transports, token stores, and unrelated Workspace services.
- Update tests and docs with behavior changes. Run the complete credential-free validation before handoff.

## Fixed V1 Boundary

The public MCP surface is exactly:

- `send_email`
- `create_label`
- `update_label`
- `delete_label`

The only OAuth scopes are:

- `https://www.googleapis.com/auth/gmail.send`
- `https://www.googleapis.com/auth/gmail.labels`

Do not add inbox/thread reads, search, drafts, reply/forward, attachments, message labeling or other message mutation, synchronization, triggers, or broader Gmail scopes without a new product and security decision.

Internal provider calls required to resolve label identifiers may not become public read tools or return mailbox/message metadata.

## Authentication And Runtime

- The runtime is stdio only and must remain compatible with ephemeral MCP host subprocesses. Deployments should use an exact immutable package version through `npx` or a preinstalled reviewed binary. Prefer preinstalled direct execution when bearer material must remain outside package-install processes.
- Read one fresh host-supplied bearer from `GMAIL_OAUTH_BEARER` at process startup. A missing, blank, or whitespace-only value must fail closed before tools become usable.
- Never accept, refresh, or persist refresh tokens. Never write access tokens to disk, caches, snapshots, test fixtures, errors, telemetry, or logs.
- Keep provider error bodies and authorization headers out of user-visible errors. Preserve only safe status/category information needed for diagnosis.
- Reserve stdout for MCP JSON-RPC. Send sanitized diagnostics to stderr.

## Approval, Retry, And Tool Annotations

`send_email` is an irreversible external side effect:

- Every invocation requires fresh explicit user approval, including when a user previously chose an "always allow" option or a session uses high autonomy.
- Approval must show the exact `to`, `cc`, and `bcc` recipients, subject, and complete body without truncation. If the approval surface cannot do that, do not dispatch.
- Reject header injection and malformed addresses before approval. The approved payload and dispatched payload must be identical.
- Build plain-text MIME without `From`; Gmail supplies the connected account's configured default sender. Do not add sender metadata environment variables, public sender/alias inputs, or identity scopes.
- Register it as not read-only, additive (`destructiveHint: false`), non-idempotent, and open-world. Sending remains irreversible and externally consequential; forced approval must come from trusted host policy, not an inflated destructive annotation.
- Never automatically retry after the request may have reached Gmail. A timeout, connection close, or lost response after dispatch is an unknown outcome, not permission to resend.

All label tools are writes and must never be marked read-only. `delete_label` is destructive, must require explicit approval, and must explain that deleting a user label removes that label from affected messages and threads. `create_label` and `update_label` follow the platform's normal write-approval policy unless a stricter product policy is adopted.

The public label identity is the exact user-label name. Compare the provider's exact lowercase types `"user"` and `"system"`; reject system labels and invalid type values. All three label tools use `idempotentHint: false`. Repeated execution after an ambiguous provider response must never create an unreviewed additional effect.

## Testing Expectations

Credential-free tests are the default and must cover:

- Exact four-tool discovery and exact two-scope configuration.
- Missing/blank bearer failure before provider calls.
- MIME formatting, Unicode subjects/bodies, base64url encoding, recipient normalization, and CRLF/header-injection rejection.
- Mocked Gmail endpoints for send and label create/update/delete, including system-label rejection and safe label resolution.
- Token, authorization-header, recipient, body, and provider-error redaction in logs and thrown errors.
- Approval payload fidelity and the no-retry/unknown-outcome path for email sends.
- Accurate `readOnlyHint`, `destructiveHint`, `idempotentHint`, and `openWorldHint` values for every registered tool.
- Negative-surface checks proving excluded tools and scopes are absent.

Run typecheck, unit tests, build, executable smoke, package dry-run, production dependency audit, and a secret/scope scan before release work. Live provider tests need separate authorization. Never send a real email without exact-payload approval and a controlled recipient/cleanup plan.

## License And Provenance

- Release metadata is `@enterpret/gmail-mcp@0.1.0` under MIT. Do not publish, tag, or change npm/GitHub state without explicit authorization.
- Upstream repositories are references, not permission to copy wholesale. Before reusing code, pin the exact commit, verify the license at that commit, record source files and modifications in `THIRD_PARTY_NOTICES.md`, preserve required headers, and include the applicable license and NOTICE material.
- Prefer a small, reviewed adaptation over vendoring a Gmail/Workspace server. Do not mix code from incompatible or unclear licenses.
