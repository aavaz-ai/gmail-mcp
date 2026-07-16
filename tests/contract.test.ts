import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  GMAIL_MCP_PACKAGE_NAME,
  GMAIL_MCP_VERSION,
  GMAIL_OAUTH_BEARER_ENV,
  GMAIL_V1_SCOPES,
  GMAIL_V1_TOOL_ANNOTATIONS,
  GMAIL_V1_TOOL_DESCRIPTIONS,
  GMAIL_V1_TOOL_NAMES,
} from "../src/contract.js";

describe("Gmail V1 contract", () => {
  it("allows exactly the four approved public tools", () => {
    expect(GMAIL_V1_TOOL_NAMES).toEqual([
      "send_email",
      "create_label",
      "update_label",
      "delete_label",
    ]);
  });

  it("allows exactly the two no-CASA scopes", () => {
    expect(GMAIL_V1_SCOPES).toEqual([
      "https://www.googleapis.com/auth/gmail.send",
      "https://www.googleapis.com/auth/gmail.labels",
    ]);
  });

  it("reserves one bearer environment variable", () => {
    expect(GMAIL_OAUTH_BEARER_ENV).toBe("GMAIL_OAUTH_BEARER");
  });

  it("keeps the approved public release identity", () => {
    expect(GMAIL_MCP_PACKAGE_NAME).toBe("@enterpret/gmail-mcp");
    expect(GMAIL_MCP_VERSION).toBe("0.1.0");
    const packageJson = JSON.parse(
      readFileSync(new URL("../package.json", import.meta.url), "utf8"),
    ) as Record<string, unknown>;
    expect(packageJson).toMatchObject({
      name: GMAIL_MCP_PACKAGE_NAME,
      version: GMAIL_MCP_VERSION,
      license: "MIT",
      publishConfig: { access: "public" },
    });
    expect(packageJson).not.toHaveProperty("private");
  });

  it("uses the approved MCP annotations", () => {
    expect(GMAIL_V1_TOOL_ANNOTATIONS).toEqual({
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
    });
  });

  it("documents the approval and destructive-delete consequences", () => {
    expect(GMAIL_V1_TOOL_DESCRIPTIONS.send_email).toContain("fresh explicit approval");
    expect(GMAIL_V1_TOOL_DESCRIPTIONS.send_email).toContain("complete body");
    expect(GMAIL_V1_TOOL_DESCRIPTIONS.delete_label).toContain(
      "removes it from every affected message and thread",
    );
  });
});
