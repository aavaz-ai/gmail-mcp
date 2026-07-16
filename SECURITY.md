# Security

Do not open a public issue containing credentials, access tokens, mailbox data, email content, or recipient information.

Report security vulnerabilities privately through the repository's GitHub Security Advisory interface. Include only the minimum sanitized reproduction needed to evaluate the issue.

The package accepts a short-lived Gmail access token only through `GMAIL_OAUTH_BEARER`. It must never receive refresh tokens or persist credentials.
