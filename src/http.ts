/**
 * Streamable HTTP entry point (Hono, stateless) for remote use, e.g. on a VPS:
 *   MCP_AUTH_TOKEN=... FOLIO_API_KEY=... bun run src/http.ts
 *
 * Connect with:
 *   claude mcp add --transport http folio https://host/mcp --header "Authorization: Bearer $MCP_AUTH_TOKEN"
 *
 * Stateless mode: a fresh McpServer + transport per request (recommended for
 * simple request/response tool servers: no session bookkeeping, restart-safe).
 */
import { StreamableHTTPTransport } from "@hono/mcp"
import { Hono } from "hono"
import { bearerAuth } from "hono/bearer-auth"
import { folioClientFromEnv } from "./folio.js"
import { createServer } from "./server.js"

const token = process.env.MCP_AUTH_TOKEN
if (!token) {
  console.error(
    "MCP_AUTH_TOKEN is not set. Refusing to serve a banking API without auth.",
  )
  process.exit(1)
}

const folio = folioClientFromEnv()
const app = new Hono()

app.get("/healthz", (c) => c.text("ok"))
app.use("/mcp", bearerAuth({ token }))
app.all("/mcp", async (c) => {
  const transport = new StreamableHTTPTransport() // no sessionIdGenerator → stateless
  await createServer(folio).connect(transport)
  return transport.handleRequest(c)
})

const port = Number(process.env.PORT ?? 3000)
console.error(`folio-mcp listening on :${port}/mcp`)

export default {
  port,
  fetch: app.fetch,
  // Bun kills quiet SSE streams after 10s by default; 0 disables the idle timeout.
  idleTimeout: 0,
}
