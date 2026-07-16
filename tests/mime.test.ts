import { describe, expect, it } from "vitest";

import { buildMimeMessage, decodeGmailRaw, encodeMimeForGmail } from "../src/mime.js";

const date = new Date("2026-07-15T12:34:56.000Z");

describe("Gmail MIME construction", () => {
  it("builds deterministic plain-text MIME without sender-controlled headers", () => {
    const mime = buildMimeMessage(
      {
        to: ["alice@example.com", "second-recipient@example.com"],
        cc: [],
        bcc: ["audit@example.com"],
        subject: "Status ✓",
        body: "Line one\nLine two 👋",
      },
      date,
    );

    expect(mime).toContain("Date: Wed, 15 Jul 2026 12:34:56 +0000\r\n");
    expect(mime).toContain("To: alice@example.com, second-recipient@example.com\r\n");
    expect(mime).not.toContain("\r\nCc:");
    expect(mime).toContain("\r\nBcc: audit@example.com\r\n");
    expect(mime).toContain("\r\nMIME-Version: 1.0\r\n");
    expect(mime).toContain('Content-Type: text/plain; charset="UTF-8"');
    expect(mime).toContain("Content-Transfer-Encoding: base64");
    expect(mime).not.toMatch(/(^|\r\n)From:/u);
    expect(mime).not.toMatch(/(^|\r\n)(Reply-To|Message-Id):/iu);

    const [headers, encodedBody] = mime.split("\r\n\r\n");
    expect(headers).toContain("Subject: =?UTF-8?B?");
    expect(Buffer.from(encodedBody.replaceAll("\r\n", ""), "base64").toString("utf8")).toBe(
      "Line one\nLine two 👋",
    );
  });

  it("folds long Unicode subjects and recipient headers deterministically", () => {
    const mime = buildMimeMessage(
      {
        to: Array.from({ length: 6 }, (_, index) => `recipient-${index}@example.com`),
        cc: [],
        bcc: [],
        subject: "नमस्ते 👋 ".repeat(20),
        body: "body",
      },
      date,
    );
    const headers = mime.split("\r\n\r\n")[0].split("\r\n");

    expect(headers.some((line) => line.startsWith(" "))).toBe(true);
    expect(headers.every((line) => line.length <= 78)).toBe(true);
    expect(buildMimeMessage(
      {
        to: Array.from({ length: 6 }, (_, index) => `recipient-${index}@example.com`),
        cc: [],
        bcc: [],
        subject: "नमस्ते 👋 ".repeat(20),
        body: "body",
      },
      date,
    )).toBe(mime);
  });

  it("uses unpadded Gmail base64url over the complete Unicode MIME", () => {
    const mime = buildMimeMessage(
      { to: ["alice@example.com"], cc: [], bcc: [], subject: "é", body: "雪" },
      date,
    );
    const raw = encodeMimeForGmail(mime);

    expect(raw).toMatch(/^[A-Za-z0-9_-]+$/u);
    expect(raw).not.toContain("=");
    expect(decodeGmailRaw(raw)).toBe(mime);
  });
});
