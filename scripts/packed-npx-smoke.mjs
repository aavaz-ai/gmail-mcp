#!/usr/bin/env node

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { resolve } from "node:path";

const tarball = process.argv[2];
if (!tarball) {
  throw new Error("usage: node scripts/packed-npx-smoke.mjs <package.tgz>");
}

const expectedTools = ["send_email", "create_label", "update_label", "delete_label"];
const transport = new StdioClientTransport({
  command: "npx",
  args: ["--yes", "--package", resolve(tarball), "gmail-mcp"],
  env: {
    ...process.env,
    GMAIL_OAUTH_BEARER: "PACKED_ARTIFACT_DISCOVERY_ONLY",
  },
  stderr: "pipe",
});
const client = new Client({ name: "gmail-packed-npx-smoke", version: "1.0.0" });

try {
  await client.connect(transport);
  const { tools } = await client.listTools();
  const actualTools = tools.map((tool) => tool.name);
  if (JSON.stringify(actualTools) !== JSON.stringify(expectedTools)) {
    throw new Error(`unexpected tool surface: ${JSON.stringify(actualTools)}`);
  }
  process.stdout.write(`packed npx smoke passed: ${actualTools.join(", ")}\n`);
} finally {
  await client.close();
}
