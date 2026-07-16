import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, describe, expect, it } from "vitest";

import { GMAIL_V1_TOOL_ANNOTATIONS, GMAIL_V1_TOOL_NAMES } from "../src/contract.js";
import type { FetchLike } from "../src/gmail-client.js";
import { decodeGmailRaw } from "../src/mime.js";
import { createGmailMcpServer } from "../src/server.js";

const BEARER_MARKER = "TEST_BEARER_MARKER";
const closeCallbacks: Array<() => Promise<void>> = [];

afterEach(async () => {
  await Promise.all(closeCallbacks.splice(0).map((close) => close()));
});

async function connectedClient(fetcher: FetchLike): Promise<Client> {
  const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
  const server = createGmailMcpServer({
    bearer: BEARER_MARKER,
    fetch: fetcher,
    now: () => new Date("2026-07-15T12:34:56.000Z"),
  });
  const client = new Client({ name: "gmail-mcp-tests", version: "1.0.0" });
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  closeCallbacks.push(async () => {
    await client.close();
    await server.close();
  });
  return client;
}

describe("MCP surface", () => {
  it("discovers exactly four tools with exact annotations and no read surface", async () => {
    const client = await connectedClient(async () => {
      throw new Error("discovery must not call Gmail");
    });
    const { tools } = await client.listTools();

    expect(tools.map((tool) => tool.name)).toEqual(GMAIL_V1_TOOL_NAMES);
    for (const tool of tools) {
      expect(tool.annotations).toEqual(
        GMAIL_V1_TOOL_ANNOTATIONS[tool.name as keyof typeof GMAIL_V1_TOOL_ANNOTATIONS],
      );
      expect(tool.inputSchema.additionalProperties).toBe(false);
      expect(tool.outputSchema?.additionalProperties).toBe(false);
    }
    expect(tools.find((tool) => tool.name === "send_email")?.inputSchema.required).toEqual(
      expect.arrayContaining(["to", "cc", "bcc", "subject", "body"]),
    );
    expect(
      tools.find((tool) => tool.name === "create_label")?.outputSchema?.properties?.status,
    ).toMatchObject({ const: "created" });
    expect(
      tools.find((tool) => tool.name === "update_label")?.outputSchema?.properties?.status,
    ).toMatchObject({ const: "updated" });
    expect(tools.find((tool) => tool.name === "delete_label")?.description).toContain(
      "removes it from every affected message and thread",
    );
    expect(tools.map((tool) => tool.name)).not.toEqual(
      expect.arrayContaining([
        "list_messages",
        "search",
        "create_draft",
        "send_attachment",
        "reply",
        "forward",
        "archive",
        "trash",
        "watch",
        "generic_rest",
      ]),
    );
  });

  it("dispatches the exact approved send arguments once and returns a minimal result", async () => {
    const calls: Array<{ input: string | URL; init?: RequestInit }> = [];
    const client = await connectedClient(async (input, init) => {
      calls.push({ input, init });
      return new Response(JSON.stringify({ id: "provider-id-must-not-escape" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });
    const args = {
      to: ["Alice@example.com"],
      cc: [],
      bcc: ["blind@example.com"],
      subject: "Exact ✓ subject",
      body: "Complete body\nwithout truncation 👋",
    };

    const result = await client.callTool({ name: "send_email", arguments: args });

    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toEqual({ status: "sent" });
    expect(JSON.stringify(result)).not.toContain("provider-id-must-not-escape");
    expect(calls).toHaveLength(1);
    const request = JSON.parse(calls[0].init?.body as string) as { raw: string };
    const mime = decodeGmailRaw(request.raw);
    expect(mime).toContain("To: Alice@example.com\r\n");
    expect(mime).not.toContain("\r\nCc:");
    expect(mime).toContain("Bcc: blind@example.com\r\n");
    const encodedBody = mime.split("\r\n\r\n")[1].replaceAll("\r\n", "");
    expect(Buffer.from(encodedBody, "base64").toString("utf8")).toBe(args.body);
  });

  it("redacts provider bodies, authorization, recipients, subject, and body from errors", async () => {
    let attempts = 0;
    const client = await connectedClient(async () => {
      attempts += 1;
      return new Response(
        JSON.stringify({
          authorization: `Bearer ${BEARER_MARKER}`,
          recipient: "recipient-marker@example.com",
          subject: "SUBJECT_MARKER",
          body: "BODY_MARKER",
          provider: "PROVIDER_SECRET_MARKER",
        }),
        { status: 503, headers: { "Content-Type": "application/json" } },
      );
    });

    const result = await client.callTool({
      name: "send_email",
      arguments: {
        to: ["recipient-marker@example.com"],
        cc: [],
        bcc: [],
        subject: "SUBJECT_MARKER",
        body: "BODY_MARKER",
      },
    });
    const content = result.content as Array<{ type: string; text?: string }>;
    expect(content[0]?.type).toBe("text");
    const serialized = content[0]?.type === "text" ? (content[0].text ?? "") : "";
    const payload = JSON.parse(serialized) as { error: Record<string, unknown> };

    expect(result.isError).toBe(true);
    expect(attempts).toBe(1);
    expect(payload.error).toMatchObject({
      code: "send_unknown_outcome",
      outcome: "unknown",
      retryable: false,
      provider_status: 503,
    });
    expect(serialized).not.toContain(BEARER_MARKER);
    expect(serialized).not.toContain("recipient-marker@example.com");
    expect(serialized).not.toContain("SUBJECT_MARKER");
    expect(serialized).not.toContain("BODY_MARKER");
    expect(serialized).not.toContain("PROVIDER_SECRET_MARKER");
  });

  it("rejects malformed send arguments before provider dispatch without echoing values", async () => {
    let attempts = 0;
    const client = await connectedClient(async () => {
      attempts += 1;
      throw new Error("must not dispatch");
    });
    const result = await client.callTool({
      name: "send_email",
      arguments: {
        to: ["recipient-marker@example.com\r\nBcc: attacker@example.com"],
        cc: [],
        bcc: [],
        subject: "SUBJECT_MARKER",
        body: "BODY_MARKER",
      },
    });
    const serialized = JSON.stringify(result);

    expect(result.isError).toBe(true);
    expect(attempts).toBe(0);
    expect(serialized).not.toContain("recipient-marker@example.com");
    expect(serialized).not.toContain("attacker@example.com");
    expect(serialized).not.toContain("SUBJECT_MARKER");
    expect(serialized).not.toContain("BODY_MARKER");
  });
});
