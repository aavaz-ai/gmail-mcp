import { GMAIL_OAUTH_BEARER_ENV } from "./contract.js";
import { GmailMcpError } from "./errors.js";

export function validateBearer(value: string | undefined): string {
  if (value === undefined || value.trim().length === 0) {
    throw new GmailMcpError("authentication_failed");
  }

  const bearer = value.trim();
  // RFC 6750 b64token. Reject clipboard/request blobs and header injection at
  // the process boundary before any provider request can be constructed.
  if (!/^[A-Za-z0-9\-._~+/]+=*$/.test(bearer)) {
    throw new GmailMcpError("authentication_failed");
  }

  return bearer;
}

export function readBearer(env: NodeJS.ProcessEnv = process.env): string {
  return validateBearer(env[GMAIL_OAUTH_BEARER_ENV]);
}
