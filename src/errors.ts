import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

export type GmailErrorCode =
  | "invalid_input"
  | "authentication_failed"
  | "permission_denied"
  | "not_found"
  | "conflict"
  | "rate_limited"
  | "provider_rejected"
  | "provider_unavailable"
  | "provider_invalid_response"
  | "send_unknown_outcome"
  | "internal_error";

export type ErrorOutcome = "not_completed" | "not_sent" | "unknown";

export class GmailMcpError extends Error {
  readonly code: GmailErrorCode;
  readonly outcome: ErrorOutcome;
  readonly providerStatus?: number;

  constructor(code: GmailErrorCode, options?: { outcome?: ErrorOutcome; providerStatus?: number }) {
    super(code);
    this.name = "GmailMcpError";
    this.code = code;
    this.outcome = options?.outcome ?? "not_completed";
    this.providerStatus = options?.providerStatus;
  }
}

const SAFE_MESSAGES: Record<GmailErrorCode, string> = {
  invalid_input: "The request is invalid for this Gmail tool.",
  authentication_failed: "The Gmail connection could not be authenticated.",
  permission_denied: "The Gmail connection is not permitted to perform this operation.",
  not_found: "The requested Gmail user label was not found.",
  conflict: "The requested Gmail label operation conflicts with existing provider state.",
  rate_limited: "Gmail rate-limited the operation.",
  provider_rejected: "Gmail rejected the operation.",
  provider_unavailable: "Gmail did not complete the operation.",
  provider_invalid_response: "Gmail returned an invalid response.",
  send_unknown_outcome: "The email dispatch outcome is unknown. Do not retry automatically.",
  internal_error: "The Gmail tool failed safely before a result could be returned.",
};

export function toToolError(error: unknown): CallToolResult {
  const safeError =
    error instanceof GmailMcpError
      ? error
      : new GmailMcpError("internal_error", { outcome: "not_completed" });

  const errorResult: Record<string, unknown> = {
    status: "error",
    error: {
      code: safeError.code,
      message: SAFE_MESSAGES[safeError.code],
      outcome: safeError.outcome,
      retryable: false,
      ...(safeError.providerStatus === undefined
        ? {}
        : { provider_status: safeError.providerStatus }),
    },
  };

  return {
    content: [{ type: "text", text: JSON.stringify(errorResult) }],
    isError: true,
  };
}
