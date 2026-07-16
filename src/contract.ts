import type { ToolAnnotations } from "@modelcontextprotocol/sdk/types.js";

export const GMAIL_OAUTH_BEARER_ENV = "GMAIL_OAUTH_BEARER" as const;

export const GMAIL_MCP_PACKAGE_NAME = "@enterpret/gmail-mcp" as const;
export const GMAIL_MCP_VERSION = "0.1.0" as const;

export const GMAIL_V1_SCOPES = [
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/gmail.labels",
] as const;

export const GMAIL_V1_TOOL_NAMES = [
  "send_email",
  "create_label",
  "update_label",
  "delete_label",
] as const;

export type GmailV1ToolName = (typeof GMAIL_V1_TOOL_NAMES)[number];

export const GMAIL_V1_TOOL_ANNOTATIONS = {
  send_email: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: true,
  },
  create_label: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: true,
  },
  update_label: {
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: false,
    openWorldHint: true,
  },
  delete_label: {
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: false,
    openWorldHint: true,
  },
} as const satisfies Record<GmailV1ToolName, ToolAnnotations>;

export const GMAIL_V1_TOOL_DESCRIPTIONS = {
  send_email:
    "Send one plain-text email from the connected Gmail account. The host must obtain fresh explicit approval for every call and show the exact to, cc, bcc, subject, and complete body. A response lost after dispatch has an unknown outcome and must never be retried automatically.",
  create_label:
    "Create one Gmail user label by exact name. This is an external write; it does not apply the label to messages or threads.",
  update_label:
    "Update one Gmail user label resolved by its exact current name. This can rename the label or change its Gmail visibility settings; it does not modify message membership.",
  delete_label:
    "Permanently delete one Gmail user label resolved by exact name. Deleting the label removes it from every affected message and thread, so the host must obtain explicit consequence-aware approval.",
} as const satisfies Record<GmailV1ToolName, string>;
