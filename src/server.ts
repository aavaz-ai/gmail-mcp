import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { validateBearer } from "./auth.js";
import {
  GMAIL_MCP_PACKAGE_NAME,
  GMAIL_MCP_VERSION,
  GMAIL_V1_TOOL_ANNOTATIONS,
  GMAIL_V1_TOOL_DESCRIPTIONS,
} from "./contract.js";
import { toToolError } from "./errors.js";
import { type FetchLike, GmailClient } from "./gmail-client.js";
import {
  createLabelResultSchema,
  createLabelSchema,
  deleteLabelResultSchema,
  deleteLabelSchema,
  sendEmailResultSchema,
  sendEmailSchema,
  updateLabelResultSchema,
  updateLabelSchema,
} from "./schemas.js";

export type GmailServerOptions = {
  bearer: string;
  fetch?: FetchLike;
  now?: () => Date;
};

function successResult(structuredContent: Record<string, unknown>) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(structuredContent) }],
    structuredContent,
  };
}

export function createGmailMcpServer(options: GmailServerOptions): McpServer {
  const client = new GmailClient(validateBearer(options.bearer), options.fetch);
  const now = options.now ?? (() => new Date());
  const server = new McpServer({
    name: GMAIL_MCP_PACKAGE_NAME,
    version: GMAIL_MCP_VERSION,
  });

  server.registerTool(
    "send_email",
    {
      description: GMAIL_V1_TOOL_DESCRIPTIONS.send_email,
      inputSchema: sendEmailSchema,
      outputSchema: sendEmailResultSchema,
      annotations: GMAIL_V1_TOOL_ANNOTATIONS.send_email,
    },
    async (input) => {
      try {
        return successResult(await client.sendEmail(input, now()));
      } catch (error) {
        return toToolError(error);
      }
    },
  );

  server.registerTool(
    "create_label",
    {
      description: GMAIL_V1_TOOL_DESCRIPTIONS.create_label,
      inputSchema: createLabelSchema,
      outputSchema: createLabelResultSchema,
      annotations: GMAIL_V1_TOOL_ANNOTATIONS.create_label,
    },
    async (input) => {
      try {
        return successResult(await client.createLabel(input));
      } catch (error) {
        return toToolError(error);
      }
    },
  );

  server.registerTool(
    "update_label",
    {
      description: GMAIL_V1_TOOL_DESCRIPTIONS.update_label,
      inputSchema: updateLabelSchema,
      outputSchema: updateLabelResultSchema,
      annotations: GMAIL_V1_TOOL_ANNOTATIONS.update_label,
    },
    async (input) => {
      try {
        return successResult(await client.updateLabel(input));
      } catch (error) {
        return toToolError(error);
      }
    },
  );

  server.registerTool(
    "delete_label",
    {
      description: GMAIL_V1_TOOL_DESCRIPTIONS.delete_label,
      inputSchema: deleteLabelSchema,
      outputSchema: deleteLabelResultSchema,
      annotations: GMAIL_V1_TOOL_ANNOTATIONS.delete_label,
    },
    async (input) => {
      try {
        return successResult(await client.deleteLabel(input));
      } catch (error) {
        return toToolError(error);
      }
    },
  );

  return server;
}
