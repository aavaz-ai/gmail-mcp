# Changelog

All notable changes to this package will be documented here.

## 0.1.0

- Add the minimal four-tool Gmail MCP surface for approved plain-text sending and user-label management.
- Accept one host-supplied bearer through `GMAIL_OAUTH_BEARER` over stdio only.
- Limit OAuth access to `gmail.send` and `gmail.labels`.
- Add strict input validation, safe provider-error redaction, and ambiguous-send no-retry semantics.
- Add deterministic mocked tests and packed-artifact `npx` validation.
