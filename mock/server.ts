/**
 * Local mock of the Folio API for testing folio-mcp without a Folio account.
 *
 *   bun run mock                      # serves http://localhost:8787
 *
 * Then point the MCP server at it:
 *   FOLIO_API_KEY=test-key FOLIO_API_URL=http://localhost:8787 bun run src/stdio.ts
 *
 * Any non-empty bearer token is accepted. Data is in-memory and resets on restart.
 */
import { Hono } from "hono"

const T1 = "457f0b7c-e3d6-44bf-9364-638b3d39dc7a"
const T2 = "8f1fc8d3-7900-4c05-8d67-f513ef760111"
const E1 = "0a4b21de-9c1f-4f6a-8a4e-1f2e3d4c5b6a"
const E2 = "1b5c32ef-0d2a-4a7b-9b5f-2a3b4c5d6e7f"
const E3 = "2c6d43f0-1e3b-4b8c-8c6a-3b4c5d6e7f8a"
const P1 = "3d7e54a1-2f4c-4c9d-9d7b-4c5d6e7f8a9b"
const P2 = "4e8f65b2-3a5d-4d0e-ae8c-5d6e7f8a9b0c"
const ATT1 = "5f9a76c3-4b6e-4e1f-bf9d-6e7f8a9b0c1d"
const AGENT1 = "6a0b87d4-5c7f-4f2a-8a0e-7f8a9b0c2e1d"

// 1x1 red PNG
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
)

const accounts = [
  {
    accountNumber: "36060000001",
    balance: "184302.50",
    balanceUpdatedAt: "2026-06-09T14:12:00Z",
    matchingTransactionsAt: "2026-06-09T14:12:00Z",
    completeTransactionsAt: "2026-06-01T00:00:00Z",
    name: "Driftskonto",
    type: "Operational",
  },
  {
    accountNumber: "36060000002",
    balance: "52000.00",
    balanceUpdatedAt: "2026-06-09T14:12:00Z",
    matchingTransactionsAt: "2026-06-09T14:12:00Z",
    completeTransactionsAt: "2026-06-09T14:12:00Z",
    name: "Skattekonto",
    type: "Tax",
  },
]

const ledgerCategories: Record<string, object> = {
  Ue2QvIr9cu0xUyiKrO5Hhv: {
    accountName: "Reklamekostnad",
    accountNumber: 7320,
    isIncoming: false,
    requiresAttachment: true,
    requiresParticipants: false,
    requiresPurpose: true,
    requiresReview: false,
    title: "Annonsering (Markedsføring)",
    version: 3,
    vatCode: 1,
    vatRate: 25,
    vatTitle: "Inngående mva, høy sats",
  },
  Xk9PqLm2vR8sT4wYbN3eZa: {
    accountName: "Servering, representasjon",
    accountNumber: 7350,
    isIncoming: false,
    requiresAttachment: true,
    requiresParticipants: true,
    requiresPurpose: true,
    requiresReview: true,
    title: "Kundemøte / representasjon",
    version: 1,
    vatCode: 0,
    vatRate: 0,
    vatTitle: "Ingen mva-behandling",
  },
}

const attachment = {
  id: ATT1,
  filename: "kvittering-kaffebrenneriet.png",
  mimeType: "image/png",
  orgNum: "918711309",
  fileSize: PNG.byteLength,
  uploadedByAgentId: AGENT1,
  averageColor: "#fe4d4d",
  extractedText: "KAFFEBRENNERIET AS\nLatte x2  124.00\nTotal 124.00 NOK",
}

const transactions = [
  {
    id: T1,
    eventId: E1,
    description: "KAFFEBRENNERIET OSLO",
    bookingDate: "2026-06-05",
    transactionAmount: { amount: "124.00", currency: "NOK" },
    currencyAmount: { amount: "124.00", currency: "NOK" },
    cardAuthorization: {
      cardId: T2,
      merchantId: "285f4fe1-00aa-40cf-8d22-d7b024473bbb",
      merchantName: "KAFFEBRENNERIET",
      mcc: 5812,
      terminalId: "14655964",
      physicalTerminal: true,
      currencyAmount: { amount: "124.00", currency: "NOK" },
    },
    creditor: { name: "Kaffebrenneriet AS" },
    debtor: { name: "Eksempel AS", accountNumber: "36060000001" },
    attachments: [attachment],
    purpose: "Kundemøte med Acme AS",
    participants: "Ola Nordmann, Kari Acme",
    complete: true,
    ledgerCategory: { id: "Xk9PqLm2vR8sT4wYbN3eZa", eTag: "abc123" },
  },
  {
    id: T2,
    eventId: E2,
    description: "GOOGLE ADS",
    bookingDate: "2026-06-02",
    transactionAmount: { amount: "2500.00", currency: "NOK" },
    currencyAmount: { amount: "212.50", currency: "EUR" },
    creditor: { name: "Google Ireland Ltd" },
    debtor: { name: "Eksempel AS", accountNumber: "36060000001" },
    attachments: [],
    complete: false,
    ledgerCategory: { id: "Ue2QvIr9cu0xUyiKrO5Hhv", eTag: "def456" },
  },
]

const events: Record<string, Record<string, unknown>> = {
  [E1]: {
    id: E1,
    time: "2026-06-05T11:42:00Z",
    amount: { amount: "124.00", currency: "NOK" },
    transactions: [transactions[0]],
    attachments: [attachment],
    purpose: "Kundemøte med Acme AS",
    participants: "Ola Nordmann, Kari Acme",
    complete: true,
    ledgerCategory: { id: "Xk9PqLm2vR8sT4wYbN3eZa", eTag: "abc123" },
  },
  [E2]: {
    id: E2,
    time: "2026-06-02T08:00:00Z",
    amount: { amount: "2500.00", currency: "NOK" },
    transactions: [transactions[1]],
    attachments: [],
    complete: false,
    ledgerCategory: { id: "Ue2QvIr9cu0xUyiKrO5Hhv", eTag: "def456" },
  },
  [E3]: {
    id: E3,
    time: "2026-06-08T15:30:00Z",
    amount: { amount: "899.00", currency: "NOK" },
    transactions: [],
    cardAuthorization: {
      cardId: T2,
      merchantId: "385f4fe1-11bb-40cf-8d22-d7b024473ccc",
      merchantName: "CLAS OHLSON",
      mcc: 5200,
      terminalId: "99887766",
      physicalTerminal: true,
      currencyAmount: { amount: "899.00", currency: "NOK" },
    },
    attachments: [],
    complete: false,
  },
}

const payments: Record<string, Record<string, unknown>> = {
  [P1]: {
    id: P1,
    eventId: E2,
    createdAt: "2026-06-01T09:00:00Z",
    createdByAgentId: AGENT1,
    state: "Completed",
    creditor: { name: "Huseier AS", accountNumber: "98360612770" },
    debtorAccountNumber: "36060000001",
    currencyAmount: { amount: "12000.00", currency: "NOK" },
    executionDate: "2026-06-01",
    message: "Husleie juni",
  },
  [P2]: {
    id: P2,
    eventId: E3,
    createdAt: "2026-06-09T10:00:00Z",
    createdByAgentId: AGENT1,
    state: "Draft",
    creditor: { name: "Regnskapsfører AS", accountNumber: "98360612771" },
    debtorAccountNumber: "36060000001",
    currencyAmount: { amount: "4500.00", currency: "NOK" },
    executionDate: "2026-06-15",
    kid: "1248103",
  },
}

const app = new Hono()

app.use("*", async (c, next) => {
  const auth = c.req.header("authorization") ?? ""
  if (!/^Bearer .+/.test(auth)) return c.text("Unauthorized", 401)
  await next()
})

app.get("/accounts", (c) => c.json({ accounts }))

app.get("/accounts/:acct/balance/:date", (c) =>
  c.json({ incomingBalance: "180000.00", outgoingBalance: "184302.50" }),
)

app.get("/accounts/:acct/transactions", (c) => {
  const acct = c.req.param("acct")
  const booked = transactions.filter((t) => t.debtor.accountNumber === acct)
  return c.json({ transactions: { booked } })
})

app.get("/transactions", (c) => {
  const body: Record<string, unknown> = { transactions: { booked: transactions } }
  if (c.req.query("includeMerchants") === "true") {
    body.includes = {
      merchants: [
        {
          id: "285f4fe1-00aa-40cf-8d22-d7b024473bbb",
          name: "Kaffebrenneriet Storgata",
          postalAddress: "Storgata 32",
          postalCode: "0184",
          city: "Oslo",
          countryCode: "NOR",
          orgNum: "918711309",
        },
      ],
    }
  }
  return c.json(body)
})

app.get("/transactions/:id", (c) => {
  const tx = transactions.find((t) => t.id === c.req.param("id"))
  return tx ? c.json(tx) : c.text("Not found", 404)
})

app.get("/events", (c) => c.json({ events: Object.values(events) }))

app.patch("/events/:id", async (c) => {
  const event = events[c.req.param("id")]
  if (!event) return c.text("Forbidden", 403)
  const patch = await c.req.json<Record<string, string>>()
  for (const key of ["purpose", "note", "participants"]) {
    if (key in patch) {
      if (patch[key] === "") delete event[key]
      else event[key] = patch[key]
    }
  }
  if (patch.ledgerCategoryId) {
    if (!(patch.ledgerCategoryId in ledgerCategories)) return c.text("Bad request", 400)
    event.ledgerCategory = { id: patch.ledgerCategoryId, eTag: "mock" }
  }
  return c.body(null, 202)
})

app.post("/events/:id/complete", (c) => {
  const event = events[c.req.param("id")]
  if (!event) return c.text("Forbidden", 403)
  event.complete = true
  return c.body(null, 202)
})

app.delete("/events/:id/complete", (c) => {
  const event = events[c.req.param("id")]
  if (!event) return c.text("Forbidden", 403)
  event.complete = false
  return c.body(null, 202)
})

app.post("/events/:id/attachments", (c) =>
  c.json({ id: crypto.randomUUID() }),
)

app.get("/attachments/:id/:type", (c) =>
  c.body(PNG as unknown as ArrayBuffer, 200, {
    "Content-Type": "image/png",
    "Content-Disposition": 'attachment; filename="kvittering.png"',
  }),
)

app.get("/categories/:id", (c) => {
  const category = ledgerCategories[c.req.param("id")]
  return category
    ? c.json(category, 200, { ETag: "mock-etag" })
    : c.text("Not found", 404)
})

app.get("/payments", (c) => c.json({ payments: Object.values(payments) }))

app.get("/payments/:id", (c) => {
  const payment = payments[c.req.param("id")]
  return payment ? c.json(payment) : c.text("Not found", 404)
})

app.post("/payments", async (c) => {
  const body = await c.req.json()
  const id = crypto.randomUUID()
  const eventId = crypto.randomUUID()
  payments[id] = {
    id,
    eventId,
    createdAt: new Date().toISOString(),
    createdByAgentId: AGENT1,
    state: "Draft",
    ...body,
  }
  return c.json({ id, eventId })
})

app.delete("/payments/:id", (c) => {
  const payment = payments[c.req.param("id")]
  if (!payment) return c.text("Not found", 404)
  payment.state = "Cancelled"
  return c.body(null, 202)
})

const port = Number(process.env.PORT ?? 8787)
console.error(`Mock Folio API on http://localhost:${port} (any bearer token accepted)`)

export default { port, fetch: app.fetch }
