# Third-party provenance

The Gmail MCP implementation is independently authored against public MCP, MIME, and Gmail API contracts. No source code was copied, translated, or adapted from either upstream Gmail/Workspace MCP reference:

- `https://github.com/aaronsb/google-workspace-mcp`
- `https://github.com/taylorwilsdon/google_workspace_mcp`

Those repositories informed discovery topics only, such as behavior to verify against authoritative API documentation. They are not source dependencies, forks, or implementation ancestors. No files, copyright headers, license text, or NOTICE material from either repository are incorporated into this package.

Runtime npm dependencies and their exact versions are declared in `package.json` and locked in `package-lock.json`. They are consumed as normal package dependencies rather than vendored source.

The independently authored package is licensed under MIT. Before publication, release review must:

1. Confirm the final diff still contains no copied or adapted upstream source.
2. Confirm `LICENSE`, `package.json`, this notice, and the README remain consistent.
3. Re-run dependency license and packed-artifact review.

If source is ever copied or adapted later, do not rely on this notice. First pin the exact upstream commit, verify the license and NOTICE obligations at that commit, record each source and destination path plus modifications, preserve required copyright headers, include all required license/NOTICE material, and obtain provenance review before merge or publication.
