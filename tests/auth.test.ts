import { describe, expect, it } from "vitest";

import { readBearer, validateBearer } from "../src/auth.js";
import { GmailMcpError } from "../src/errors.js";
import { GmailClient } from "../src/gmail-client.js";

describe("bearer contract", () => {
  it.each([undefined, "", " ", "\t\r\n"])("fails closed for %j", (value) => {
    expect(() => readBearer({ GMAIL_OAUTH_BEARER: value })).toThrowError(GmailMcpError);
    expect(() => readBearer({ GMAIL_OAUTH_BEARER: value })).toThrowError(
      expect.objectContaining({ code: "authentication_failed" }),
    );
  });

  it("trims process-boundary whitespace without exposing the bearer", () => {
    expect(validateBearer("  TEST_BEARER_MARKER  ")).toBe("TEST_BEARER_MARKER");
  });

  it.each([
    "Bearer TEST_BEARER_MARKER",
    "TEST_BEARER_MARKER\nUnrelated clipboard text",
    "TEST_BEARER_MARKER\r\nInjected: value",
    "TEST BEARER MARKER",
  ])("rejects malformed bearer material before HTTP construction", (value) => {
    expect(() => validateBearer(value)).toThrowError(
      expect.objectContaining({ code: "authentication_failed" }),
    );
  });

  it("also fails closed at the provider-client boundary", () => {
    expect(() => new GmailClient("   ")).toThrowError(
      expect.objectContaining({ code: "authentication_failed" }),
    );
  });
});
