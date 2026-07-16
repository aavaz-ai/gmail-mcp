#!/usr/bin/env node

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { realpathSync } from "node:fs";
import { pathToFileURL } from "node:url";

import { readBearer } from "./auth.js";
import { GMAIL_MCP_VERSION } from "./contract.js";
import { createGmailMcpServer } from "./server.js";

function detectEntrypoint(): boolean {
  if (process.argv[1] === undefined) return false;
  try {
    return import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href;
  } catch {
    return false;
  }
}

const isEntrypoint = detectEntrypoint();

export async function runStdioServer(env: NodeJS.ProcessEnv = process.env): Promise<void> {
  const bearer = readBearer(env);
  const server = createGmailMcpServer({ bearer });
  server.server.onerror = () => {
    console.error("@enterpret/gmail-mcp: sanitized MCP protocol error");
  };
  await server.connect(new StdioServerTransport());
}

if (isEntrypoint && process.argv.includes("--version")) {
  process.stdout.write(`${GMAIL_MCP_VERSION}\n`);
} else if (isEntrypoint) {
  runStdioServer().catch(() => {
    console.error("@enterpret/gmail-mcp: startup or stdio runtime failed safely");
    process.exitCode = 1;
  });
}
