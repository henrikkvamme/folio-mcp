# folio-mcp

**Talk to your [Folio](https://folio.no) business bank account from Claude.**

An MCP server for the official [Folio API](https://api.folio.no/v2/api) — accounts, transactions, receipts, bookkeeping and payments as tools for Claude and any other MCP client.

> *"Which card purchases from May are still missing receipts?"* · *"Upload this receipt to the Clas Ohlson purchase"* · *"What did we spend on advertising this quarter?"* · *"Draft the June rent payment"*

Unofficial community project — not affiliated with Folio. Payments created through the API are always **drafts** that must be approved in the Folio app before any money moves.

## Install

You need a Folio API key — create one at [app.folio.no/til/api-tilgang](https://app.folio.no/til/api-tilgang).

**Claude Desktop** — download the latest `folio-mcp.mcpb` from [Releases](https://github.com/henrikkvamme/folio-mcp/releases), double-click it, paste your API key. The key is stored in your OS keychain; nothing is sent anywhere except directly to Folio.

**Claude Code**

```bash
claude mcp add folio --env FOLIO_API_KEY=your-key -- npx -y @henrikkvamme/folio-mcp
```

**Any MCP client** — stdio command `npx -y @henrikkvamme/folio-mcp` (or `bunx`) with `FOLIO_API_KEY` in the environment.

## Tools

| | |
|---|---|
| **Read** | `list_accounts` · `get_account_balance` · `list_transactions` · `get_transaction` · `list_events` · `list_payments` · `get_payment` · `get_ledger_category` · `download_attachment` |
| **Write** | `update_event` (purpose/note/participants/category) · `set_event_completion` · `upload_attachment` (receipts: PDF/PNG/JPEG) |
| **Payments** | `create_payment` (draft — approved in the Folio app) · `cancel_payment` |

Receipts download as inline images. Ledger categories map to Norsk Standardkontoplan (NS4102) with VAT codes.

## Try it without a Folio account

No public sandbox exists, so the repo ships a stateful mock of the API with realistic data:

```bash
bun install && bun run mock                # mock API on :8787
FOLIO_API_KEY=test FOLIO_API_URL=http://localhost:8787 bun run inspect
```

## Remote server (optional)

A Streamable HTTP entry point (Hono, stateless, bearer-auth) for VPS deployment:

```bash
MCP_AUTH_TOKEN=$(openssl rand -hex 32) FOLIO_API_KEY=your-key bun run src/http.ts
claude mcp add --transport http folio https://your-host/mcp --header "Authorization: Bearer $MCP_AUTH_TOKEN"
```

⚠️ The API key reads your full account history and can create payment drafts. Prefer local stdio; never expose the HTTP entry without auth.

## Development

Bun + TypeScript, [`@modelcontextprotocol/sdk`](https://github.com/modelcontextprotocol/typescript-sdk), zod v4, oxlint/oxfmt, tsdown.

```bash
bun install
bun run typecheck && bun run lint   # checks
bun run inspect                     # MCP Inspector
bun run build                       # npm dist (Node ≥ 18)
bun run mcpb                        # Claude Desktop bundle
```

`src/server.ts` holds all tool definitions in a `createServer()` factory shared by both transports (`src/stdio.ts`, `src/http.ts`).

## License

[MIT](LICENSE)
