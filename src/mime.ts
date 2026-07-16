import type { SendEmailInput } from "./schemas.js";

const RECOMMENDED_HEADER_LINE_LENGTH = 78;
const MAX_HEADER_LINE_LENGTH = 998;
const ENCODED_WORD_MAX_BYTES = 42;

function foldAddressHeader(name: "To" | "Cc" | "Bcc", addresses: readonly string[]): string {
  let line = `${name}:`;
  const lines: string[] = [];

  for (const [index, address] of addresses.entries()) {
    const segment = `${index === 0 ? " " : ", "}${address}`;
    if (line.length + segment.length <= RECOMMENDED_HEADER_LINE_LENGTH) {
      line += segment;
      continue;
    }

    if (index > 0) {
      line += ",";
    }
    lines.push(line);
    line = ` ${address}`;
  }

  lines.push(line);
  return lines.join("\r\n");
}

function splitUtf8(value: string, maximumBytes: number): string[] {
  const chunks: string[] = [];
  let chunk = "";

  for (const codePoint of value) {
    if (chunk.length > 0 && Buffer.byteLength(chunk + codePoint, "utf8") > maximumBytes) {
      chunks.push(chunk);
      chunk = codePoint;
    } else {
      chunk += codePoint;
    }
  }

  if (chunk.length > 0) {
    chunks.push(chunk);
  }
  return chunks;
}

function encodeSubjectHeader(subject: string): string {
  if (subject.length === 0) {
    return "Subject:";
  }

  const words = splitUtf8(subject, ENCODED_WORD_MAX_BYTES).map(
    (chunk) => `=?UTF-8?B?${Buffer.from(chunk, "utf8").toString("base64")}?=`,
  );

  return `Subject: ${words[0]}${words
    .slice(1)
    .map((word) => `\r\n ${word}`)
    .join("")}`;
}

export function formatRfcDate(date: Date): string {
  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
  const monthNames = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ] as const;
  const pad = (value: number): string => value.toString().padStart(2, "0");

  return `${dayNames[date.getUTCDay()]}, ${pad(date.getUTCDate())} ${monthNames[date.getUTCMonth()]} ${date.getUTCFullYear()} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())} +0000`;
}

function encodeBody(body: string): string {
  const encoded = Buffer.from(body, "utf8").toString("base64");
  return encoded.match(/.{1,76}/g)?.join("\r\n") ?? "";
}

function assertHeaderLengths(headers: readonly string[]): void {
  for (const line of headers.flatMap((header) => header.split("\r\n"))) {
    if (line.length > MAX_HEADER_LINE_LENGTH) {
      throw new Error("generated MIME header exceeds RFC line limit");
    }
  }
}

export function buildMimeMessage(input: SendEmailInput, date: Date): string {
  const headers = [
    `Date: ${formatRfcDate(date)}`,
    foldAddressHeader("To", input.to),
    ...(input.cc.length === 0 ? [] : [foldAddressHeader("Cc", input.cc)]),
    ...(input.bcc.length === 0 ? [] : [foldAddressHeader("Bcc", input.bcc)]),
    encodeSubjectHeader(input.subject),
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
  ];
  assertHeaderLengths(headers);

  return `${headers.join("\r\n")}\r\n\r\n${encodeBody(input.body)}`;
}

export function encodeMimeForGmail(mimeMessage: string): string {
  return Buffer.from(mimeMessage, "utf8").toString("base64url");
}

export function decodeGmailRaw(raw: string): string {
  return Buffer.from(raw, "base64url").toString("utf8");
}
