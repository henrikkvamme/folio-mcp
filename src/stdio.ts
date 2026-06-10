#!/usr/bin/env node
/**
 * stdio entry point — for local use from Claude Code / Claude Desktop:
 *   claude mcp add folio --env FOLIO_API_KEY=... -- bun run /path/to/folio-mcp/src/stdio.ts
 *
 * stdout is reserved for the MCP protocol; log only to stderr.
 */
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { folioClientFromEnv } from "./folio.js"
import { createServer } from "./server.js"

try {
  const server = createServer(folioClientFromEnv())
  await server.connect(new StdioServerTransport())
  console.error("folio-mcp running on stdio")
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
}
