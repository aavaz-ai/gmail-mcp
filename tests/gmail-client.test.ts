import { describe, expect, it } from "vitest";

import { GmailMcpError, toToolError } from "../src/errors.js";
import { GmailClient, type FetchLike } from "../src/gmail-client.js";
import { decodeGmailRaw } from "../src/mime.js";

const BEARER_MARKER = "TEST_BEARER_MARKER";
const fixedDate = new Date("2026-07-15T12:34:56.000Z");

type RecordedCall = { url: string; init?: RequestInit };

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function queuedFetch(
  ...results: Array<Response | Error>
): { calls: RecordedCall[]; fetcher: FetchLike } {
  const calls: RecordedCall[] = [];
  const fetcher: FetchLike = async (input, init) => {
    calls.push({ url: input.toString(), init });
    const result = results.shift();
    if (result === undefined) throw new Error("unexpected fetch call");
    if (result instanceof Error) throw result;
    return result;
  };
  return { calls, fetcher };
}

function requestJson(call: RecordedCall): Record<string, unknown> {
  expect(typeof call.init?.body).toBe("string");
  return JSON.parse(call.init?.body as string) as Record<string, unknown>;
}

describe("Gmail send transport", () => {
  it("makes one send attempt with the exact validated payload encoded as MIME", async () => {
    const transport = queuedFetch(
      jsonResponse({ id: "provider-id-must-not-escape", threadId: "provider-thread" }),
    );
    const client = new GmailClient(BEARER_MARKER, transport.fetcher);
    const input = {
      to: ["Alice@example.com"],
      cc: ["copy@example.com"],
      bcc: ["blind@example.com"],
      subject: "Exact ✓ subject",
      body: "Complete body\nwith Unicode: नमस्ते 👋",
    };

    await expect(client.sendEmail(input, fixedDate)).resolves.toEqual({ status: "sent" });
    expect(transport.calls).toHaveLength(1);
    const [call] = transport.calls;
    expect(call.url).toBe("https://gmail.googleapis.com/gmail/v1/users/me/messages/send");
    expect(call.init?.method).toBe("POST");
    expect(call.init?.redirect).toBe("error");
    expect(new Headers(call.init?.headers).get("Authorization")).toBe(`Bearer ${BEARER_MARKER}`);

    const request = requestJson(call);
    expect(Object.keys(request)).toEqual(["raw"]);
    const mime = decodeGmailRaw(request.raw as string);
    expect(mime).toContain("To: Alice@example.com\r\n");
    expect(mime).toContain("Cc: copy@example.com\r\n");
    expect(mime).toContain("Bcc: blind@example.com\r\n");
    expect(mime).not.toMatch(/(^|\r\n)From:/u);
    const encodedBody = mime.split("\r\n\r\n")[1].replaceAll("\r\n", "");
    expect(Buffer.from(encodedBody, "base64").toString("utf8")).toBe(input.body);
  });

  it.each([
    { response: new Error("connection closed with PROVIDER_SECRET_MARKER"), status: undefined },
    {
      response: jsonResponse({ error: "PROVIDER_SECRET_MARKER", raw: "RECIPIENT_MARKER" }, 503),
      status: 503,
    },
  ])("classifies an ambiguous send as unknown and never retries", async ({ response, status }) => {
    const transport = queuedFetch(response);
    const client = new GmailClient(BEARER_MARKER, transport.fetcher);

    const promise = client.sendEmail(
      {
        to: ["recipient-marker@example.com"],
        cc: [],
        bcc: [],
        subject: "SUBJECT_MARKER",
        body: "BODY_MARKER",
      },
      fixedDate,
    );

    await expect(promise).rejects.toEqual(
      expect.objectContaining({
        code: "send_unknown_outcome",
        outcome: "unknown",
        ...(status === undefined ? {} : { providerStatus: status }),
      }),
    );
    expect(transport.calls).toHaveLength(1);
  });

  it("classifies a definitive provider rejection as not sent", async () => {
    const transport = queuedFetch(jsonResponse({ error: "PROVIDER_SECRET_MARKER" }, 400));
    const client = new GmailClient(BEARER_MARKER, transport.fetcher);
    const promise = client.sendEmail(
      {
        to: ["recipient-marker@example.com"],
        cc: [],
        bcc: [],
        subject: "SUBJECT_MARKER",
        body: "BODY_MARKER",
      },
      fixedDate,
    );

    await expect(promise).rejects.toEqual(
      expect.objectContaining({ code: "provider_rejected", outcome: "not_sent", providerStatus: 400 }),
    );
    expect(transport.calls).toHaveLength(1);
  });
});

describe("Gmail label transport", () => {
  it("creates a user label after exact-name preflight and returns no provider ID", async () => {
    const transport = queuedFetch(
      jsonResponse({ labels: [{ id: "INBOX", name: "INBOX", type: "system" }] }),
      jsonResponse({
        id: "Label_123",
        name: "Projects/Launch",
        labelListVisibility: "labelShowIfUnread",
        messageListVisibility: "hide",
        messagesTotal: 42,
      }),
    );
    const client = new GmailClient(BEARER_MARKER, transport.fetcher);

    await expect(
      client.createLabel({
        name: "Projects/Launch",
        label_list_visibility: "labelShowIfUnread",
        message_list_visibility: "hide",
      }),
    ).resolves.toEqual({
      status: "created",
      label: {
        name: "Projects/Launch",
        label_list_visibility: "labelShowIfUnread",
        message_list_visibility: "hide",
      },
    });

    expect(transport.calls.map((call) => [call.init?.method, call.url])).toEqual([
      ["GET", "https://gmail.googleapis.com/gmail/v1/users/me/labels"],
      ["POST", "https://gmail.googleapis.com/gmail/v1/users/me/labels"],
    ]);
    expect(transport.calls.every((call) => call.init?.redirect === "error")).toBe(true);
    expect(requestJson(transport.calls[1])).toEqual({
      name: "Projects/Launch",
      labelListVisibility: "labelShowIfUnread",
      messageListVisibility: "hide",
    });
  });

  it("rejects exact system-label creation before a write", async () => {
    const transport = queuedFetch(
      jsonResponse({ labels: [{ id: "INBOX", name: "INBOX", type: "system" }] }),
    );
    const client = new GmailClient(BEARER_MARKER, transport.fetcher);

    await expect(
      client.createLabel({
        name: "INBOX",
        label_list_visibility: "labelShow",
        message_list_visibility: "show",
      }),
    ).rejects.toEqual(expect.objectContaining({ code: "invalid_input" }));
    expect(transport.calls).toHaveLength(1);
  });

  it("updates a label resolved by exact name and safely strips provider metadata", async () => {
    const transport = queuedFetch(
      jsonResponse({
        labels: [
          {
            id: "Label_123/unsafe?",
            name: "Projects/Old",
            type: "user",
            labelListVisibility: "labelShow",
            messageListVisibility: "show",
          },
        ],
      }),
      jsonResponse({
        id: "Label_123/unsafe?",
        name: "Projects/New",
        type: "user",
        labelListVisibility: "labelHide",
        messageListVisibility: "show",
        threadsTotal: 9,
      }),
    );
    const client = new GmailClient(BEARER_MARKER, transport.fetcher);

    await expect(
      client.updateLabel({
        name: "Projects/Old",
        new_name: "Projects/New",
        label_list_visibility: "labelHide",
      }),
    ).resolves.toEqual({
      status: "updated",
      label: {
        name: "Projects/New",
        label_list_visibility: "labelHide",
        message_list_visibility: "show",
      },
    });
    expect(transport.calls[1].url).toBe(
      "https://gmail.googleapis.com/gmail/v1/users/me/labels/Label_123%2Funsafe%3F",
    );
    expect(transport.calls[1].init?.method).toBe("PATCH");
    expect(requestJson(transport.calls[1])).toEqual({
      name: "Projects/New",
      labelListVisibility: "labelHide",
    });
  });

  it.each([
    {
      target: { id: "INBOX", name: "INBOX", type: "system" },
      expectedCode: "invalid_input",
    },
    {
      target: { id: "Label_456", name: "Projects/New", type: "user" },
      expectedCode: "conflict",
    },
  ])("preflights rename collisions before a write", async ({ target, expectedCode }) => {
    const transport = queuedFetch(
      jsonResponse({
        labels: [
          { id: "Label_123", name: "Projects/Old", type: "user" },
          target,
        ],
      }),
    );
    const client = new GmailClient(BEARER_MARKER, transport.fetcher);

    await expect(
      client.updateLabel({ name: "Projects/Old", new_name: target.name }),
    ).rejects.toEqual(expect.objectContaining({ code: expectedCode }));
    expect(transport.calls).toHaveLength(1);
  });

  it("deletes only a resolved user label", async () => {
    const transport = queuedFetch(
      jsonResponse({ labels: [{ id: "Label_123", name: "Temporary", type: "user" }] }),
      new Response(null, { status: 204 }),
    );
    const client = new GmailClient(BEARER_MARKER, transport.fetcher);

    await expect(client.deleteLabel({ name: "Temporary" })).resolves.toEqual({
      status: "deleted",
      label: { name: "Temporary" },
    });
    expect(transport.calls[1].init?.method).toBe("DELETE");
    expect(transport.calls[1].url).toBe(
      "https://gmail.googleapis.com/gmail/v1/users/me/labels/Label_123",
    );
  });

  it("rejects absent, ambiguous, system, and uppercase provider label types", async () => {
    const cases = [
      { labels: [], code: "not_found" },
      {
        labels: [
          { id: "Label_1", name: "Duplicate", type: "user" },
          { id: "Label_2", name: "Duplicate", type: "user" },
        ],
        code: "conflict",
      },
      { labels: [{ id: "INBOX", name: "INBOX", type: "system" }], code: "invalid_input" },
      { labels: [{ id: "Label_1", name: "Upper", type: "USER" }], code: "provider_invalid_response" },
    ];

    for (const testCase of cases) {
      const transport = queuedFetch(jsonResponse({ labels: testCase.labels }));
      const client = new GmailClient(BEARER_MARKER, transport.fetcher);
      const name = testCase.labels[0]?.name ?? "Missing";
      await expect(client.deleteLabel({ name })).rejects.toEqual(
        expect.objectContaining({ code: testCase.code }),
      );
      expect(transport.calls).toHaveLength(1);
    }
  });

  it("does not retry ambiguous create, update, or delete writes", async () => {
    const cases: Array<{
      expectedMethod: string;
      invoke: (client: GmailClient) => Promise<unknown>;
      labels: Array<Record<string, unknown>>;
      response: Response | Error;
    }> = [
      {
        expectedMethod: "POST",
        labels: [],
        response: new Error("create connection closed"),
        invoke: (client) =>
          client.createLabel({
            name: "Create",
            label_list_visibility: "labelShow",
            message_list_visibility: "show",
          }),
      },
      {
        expectedMethod: "PATCH",
        labels: [{ id: "Label_1", name: "Update", type: "user" }],
        response: jsonResponse({ error: "unavailable" }, 503),
        invoke: (client) => client.updateLabel({ name: "Update", new_name: "Updated" }),
      },
      {
        expectedMethod: "DELETE",
        labels: [{ id: "Label_2", name: "Delete", type: "user" }],
        response: new Error("delete connection closed"),
        invoke: (client) => client.deleteLabel({ name: "Delete" }),
      },
    ];

    for (const testCase of cases) {
      const transport = queuedFetch(jsonResponse({ labels: testCase.labels }), testCase.response);
      const client = new GmailClient(BEARER_MARKER, transport.fetcher);
      await expect(testCase.invoke(client)).rejects.toEqual(
        expect.objectContaining({ code: "provider_unavailable", outcome: "unknown" }),
      );
      expect(transport.calls).toHaveLength(2);
      expect(transport.calls[1].init?.method).toBe(testCase.expectedMethod);
      expect(transport.calls[1].init?.redirect).toBe("error");
    }
  });

  it("rejects inconsistent provider label identities", async () => {
    const createTransport = queuedFetch(
      jsonResponse({ labels: [] }),
      jsonResponse({ id: "Label_1", name: "Different", type: "user" }),
    );
    await expect(
      new GmailClient(BEARER_MARKER, createTransport.fetcher).createLabel({
        name: "Expected",
        label_list_visibility: "labelShow",
        message_list_visibility: "show",
      }),
    ).rejects.toEqual(expect.objectContaining({ code: "provider_invalid_response" }));

    const updateTransport = queuedFetch(
      jsonResponse({ labels: [{ id: "Label_1", name: "Current", type: "user" }] }),
      jsonResponse({ id: "Label_2", name: "Renamed", type: "user" }),
    );
    await expect(
      new GmailClient(BEARER_MARKER, updateTransport.fetcher).updateLabel({
        name: "Current",
        new_name: "Renamed",
      }),
    ).rejects.toEqual(expect.objectContaining({ code: "provider_invalid_response" }));
  });
});

describe("safe errors", () => {
  it("redacts unknown exceptions and exposes only safe classified metadata", () => {
    const unknown = JSON.stringify(
      toToolError(
        new Error(
          `Authorization: Bearer ${BEARER_MARKER} recipient-marker@example.com BODY_MARKER PROVIDER_SECRET_MARKER`,
        ),
      ),
    );
    expect(unknown).not.toContain(BEARER_MARKER);
    expect(unknown).not.toContain("recipient-marker@example.com");
    expect(unknown).not.toContain("BODY_MARKER");
    expect(unknown).not.toContain("PROVIDER_SECRET_MARKER");
    expect(unknown).toContain("internal_error");
  });

  it("serializes unknown send outcomes as explicitly non-retryable", () => {
    const result = toToolError(
      new GmailMcpError("send_unknown_outcome", { outcome: "unknown", providerStatus: 503 }),
    );
    expect(result.content[0].type).toBe("text");
    const payload = JSON.parse(result.content[0].type === "text" ? result.content[0].text : "") as {
      error: Record<string, unknown>;
    };
    expect(payload.error).toMatchObject({
      outcome: "unknown",
      retryable: false,
      provider_status: 503,
    });
  });
});
