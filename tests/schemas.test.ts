import { describe, expect, it } from "vitest";

import {
  MAX_BODY_LENGTH,
  MAX_RECIPIENTS,
  createLabelSchema,
  deleteLabelSchema,
  sendEmailSchema,
  updateLabelSchema,
} from "../src/schemas.js";

const validSend = {
  to: ["Alice@example.com"],
  cc: [],
  bcc: [],
  subject: "Exact subject",
  body: "Exact body\nwith Unicode: नमस्ते 👋",
};

describe("send_email schema", () => {
  it("preserves the exact approval-visible payload", () => {
    expect(sendEmailSchema.parse(validSend)).toEqual(validSend);
  });

  it.each([
    "Display Name <alice@example.com>",
    "alice@example.com\r\nBcc: attacker@example.com",
    " alice@example.com",
    "alice@example.com ",
    "alice@localhost",
    "álîçé@example.com",
    "alice..dots@example.com",
  ])("rejects malformed or non-bare recipient %j", (address) => {
    expect(sendEmailSchema.safeParse({ ...validSend, to: [address] }).success).toBe(false);
  });

  it.each(["subject\rBcc: attacker@example.com", "subject\nInjected: yes", "bad\0value"])(
    "rejects subject header injection %j",
    (subject) => {
      expect(sendEmailSchema.safeParse({ ...validSend, subject }).success).toBe(false);
    },
  );

  it("rejects NUL in the body", () => {
    expect(sendEmailSchema.safeParse({ ...validSend, body: "before\0after" }).success).toBe(false);
  });

  it("requires explicit cc and bcc arrays and rejects excluded send features", () => {
    const { cc: _cc, ...withoutCc } = validSend;
    expect(sendEmailSchema.safeParse(withoutCc).success).toBe(false);
    expect(sendEmailSchema.safeParse({ ...validSend, html: "<b>no</b>" }).success).toBe(false);
    expect(sendEmailSchema.safeParse({ ...validSend, from: "sender@example.com" }).success).toBe(
      false,
    );
    expect(sendEmailSchema.safeParse({ ...validSend, reply_to: "reply@example.com" }).success).toBe(
      false,
    );
    expect(sendEmailSchema.safeParse({ ...validSend, raw: "mime" }).success).toBe(false);
  });

  it("rejects duplicate recipients and more than the total recipient limit", () => {
    expect(
      sendEmailSchema.safeParse({ ...validSend, cc: [validSend.to[0]] }).success,
    ).toBe(false);
    const recipients = Array.from(
      { length: MAX_RECIPIENTS },
      (_, index) => `person${index}@example.com`,
    );
    expect(
      sendEmailSchema.safeParse({
        ...validSend,
        to: recipients,
        cc: ["overflow@example.com"],
      }).success,
    ).toBe(false);
  });

  it("enforces the body size limit", () => {
    expect(sendEmailSchema.safeParse({ ...validSend, body: "a".repeat(MAX_BODY_LENGTH) }).success).toBe(
      true,
    );
    expect(
      sendEmailSchema.safeParse({ ...validSend, body: "a".repeat(MAX_BODY_LENGTH + 1) }).success,
    ).toBe(false);
  });
});

describe("label schemas", () => {
  it("applies explicit create defaults and preserves nested exact names", () => {
    expect(createLabelSchema.parse({ name: "Projects/Launch" })).toEqual({
      name: "Projects/Launch",
      label_list_visibility: "labelShow",
      message_list_visibility: "show",
    });
  });

  it.each(["", " leading", "trailing ", "line\nbreak", "null\0byte"])(
    "rejects unsafe label name %j",
    (name) => {
      expect(createLabelSchema.safeParse({ name }).success).toBe(false);
      expect(deleteLabelSchema.safeParse({ name }).success).toBe(false);
    },
  );

  it("requires a real update and rejects excluded provider IDs", () => {
    expect(updateLabelSchema.safeParse({ name: "Old" }).success).toBe(false);
    expect(updateLabelSchema.safeParse({ name: "Old", new_name: "Old" }).success).toBe(false);
    expect(
      updateLabelSchema.safeParse({
        name: "Old",
        new_name: "Old",
        message_list_visibility: "hide",
      }).success,
    ).toBe(true);
    expect(deleteLabelSchema.safeParse({ name: "Old", id: "provider-id" }).success).toBe(false);
  });
});
