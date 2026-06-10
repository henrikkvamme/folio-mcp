import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js"
import { readFile, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { basename, extname, join } from "node:path"
import { z } from "zod"
import { FolioApiError, type FolioClient } from "./folio.js"

const VERSION = "0.1.0"

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Must be an ISO date (YYYY-MM-DD)")

const uuid = z.string().uuid()

const decimalAmount = z
  .string()
  .regex(/^\d+\.\d{1,2}$/, 'Decimal string like "1000.00"')
  .describe('Amount as a decimal string, e.g. "1000.00"')

/** Wraps a tool handler: Folio/network errors become isError results the model can act on. */
function safe<A>(
  fn: (args: A) => Promise<CallToolResult>,
): (args: A) => Promise<CallToolResult> {
  return async (args) => {
    try {
      return await fn(args)
    } catch (error) {
      const message =
        error instanceof FolioApiError
          ? error.status === 401
            ? "Folio API rejected the API key (401). Check FOLIO_API_KEY."
            : error.message
          : error instanceof Error
            ? error.message
            : String(error)
      return { content: [{ type: "text", text: message }], isError: true }
    }
  }
}

function jsonResult(data: unknown): CallToolResult {
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] }
}

const UPLOAD_MIME_BY_EXT: Record<string, string> = {
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
}

const EXT_BY_MIME: Record<string, string> = {
  "application/pdf": ".pdf",
  "image/png": ".png",
  "image/jpeg": ".jpg",
}

export function createServer(folio: FolioClient): McpServer {
  const server = new McpServer({ name: "folio-mcp", version: VERSION })

  // ---- Accounts -------------------------------------------------------------

  server.registerTool(
    "list_accounts",
    {
      title: "List accounts",
      description:
        "List all Folio bank accounts with current balance, type (Card, Earmarks, Operational, Tax, Savings) and data-freshness timestamps.",
      inputSchema: {},
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    safe(async () => jsonResult(await folio.json("/accounts"))),
  )

  server.registerTool(
    "get_account_balance",
    {
      title: "Get historical account balance",
      description:
        "Get the incoming (start of day) and outgoing (end of day) balance for an account on a given date.",
      inputSchema: {
        accountNumber: z
          .string()
          .describe("Account number (BBAN), e.g. 36060000000"),
        date: isoDate.describe("Date to get the balance for (YYYY-MM-DD)"),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    safe(async ({ accountNumber, date }) =>
      jsonResult(
        await folio.json(
          `/accounts/${encodeURIComponent(accountNumber)}/balance/${date}`,
        ),
      ),
    ),
  )

  // ---- Transactions ---------------------------------------------------------

  server.registerTool(
    "list_transactions",
    {
      title: "List transactions",
      description:
        "List booked transactions in a date range, optionally scoped to one account. Amounts are decimal strings. Set includeMerchants to resolve merchant details (only supported when not scoped to an account).",
      inputSchema: {
        startDate: isoDate.describe("Earliest date, inclusive (YYYY-MM-DD)"),
        endDate: isoDate
          .optional()
          .describe("Last date, inclusive. Defaults to today."),
        accountNumber: z
          .string()
          .optional()
          .describe(
            "Limit to one account (BBAN). If set, includeMerchants is ignored.",
          ),
        includeMerchants: z
          .boolean()
          .optional()
          .describe(
            "Include merchant info (name, address, org number) in the result",
          ),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    safe(async ({ startDate, endDate, accountNumber, includeMerchants }) => {
      const path = accountNumber
        ? `/accounts/${encodeURIComponent(accountNumber)}/transactions`
        : "/transactions"
      return jsonResult(
        await folio.json(path, {
          query: {
            startDate,
            endDate,
            includeMerchants: accountNumber ? undefined : includeMerchants,
          },
        }),
      )
    }),
  )

  server.registerTool(
    "get_transaction",
    {
      title: "Get transaction",
      description:
        "Get a single transaction by its id, including attachments and ledger category.",
      inputSchema: { id: uuid.describe("Transaction id") },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    safe(async ({ id }) => jsonResult(await folio.json(`/transactions/${id}`))),
  )

  // ---- Events ---------------------------------------------------------------

  server.registerTool(
    "list_events",
    {
      title: "List events",
      description:
        "List events — anything that is or will become a transaction (card authorizations, payments in flight, booked transactions). Use this to find items missing receipts, purpose or other documentation (complete=false).",
      inputSchema: {
        startDate: isoDate.describe("Earliest date, inclusive (YYYY-MM-DD)"),
        endDate: isoDate
          .optional()
          .describe("Last date, inclusive. Defaults to today."),
        includeMerchants: z
          .boolean()
          .optional()
          .describe("Include merchant info"),
        includeAgents: z
          .boolean()
          .optional()
          .describe("Include agent (user/integration) info"),
        includeCards: z.boolean().optional().describe("Include card info"),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    safe(async (query) => jsonResult(await folio.json("/events", { query }))),
  )

  server.registerTool(
    "update_event",
    {
      title: "Update event documentation",
      description:
        "Update purpose, note, participants and/or ledger category on an event. Omitted fields are unchanged; an empty string removes the value (ledger category cannot be removed, only overwritten). The event's 'complete' flag is re-evaluated against the ledger category's requirements.",
      inputSchema: {
        id: uuid.describe("Event id"),
        purpose: z
          .string()
          .optional()
          .describe(
            'Purpose of the transaction, e.g. "Team lunch". Empty string removes.',
          ),
        note: z
          .string()
          .optional()
          .describe("Free-form note. Empty string removes."),
        participants: z
          .string()
          .optional()
          .describe(
            'Who participated, e.g. "Ola Nordmann, Kari Nordmann". Empty string removes.',
          ),
        ledgerCategoryId: z
          .string()
          .optional()
          .describe("Ledger category id (see get_ledger_category)"),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    safe(async ({ id, ...patch }) => {
      await folio.json(`/events/${id}`, { method: "PATCH", body: patch })
      return { content: [{ type: "text", text: `Event ${id} updated.` }] }
    }),
  )

  server.registerTool(
    "set_event_completion",
    {
      title: "Mark event complete / incomplete",
      description:
        "Mark an event as complete (all documentation present) or remove a previously set completion. Note: another system may independently consider it complete.",
      inputSchema: {
        id: uuid.describe("Event id"),
        complete: z
          .boolean()
          .describe(
            "true to mark complete, false to remove the completion mark",
          ),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    safe(async ({ id, complete }) => {
      await folio.json(`/events/${id}/complete`, {
        method: complete ? "POST" : "DELETE",
      })
      return {
        content: [
          {
            type: "text",
            text: `Event ${id} marked ${
              complete ? "complete" : "not complete"
            }.`,
          },
        ],
      }
    }),
  )

  // ---- Attachments ----------------------------------------------------------

  server.registerTool(
    "upload_attachment",
    {
      title: "Upload attachment to event",
      description:
        "Upload a receipt/invoice (PDF, PNG or JPEG file from the local filesystem) as an attachment on an event.",
      inputSchema: {
        eventId: uuid.describe("Event id to attach the file to"),
        filePath: z
          .string()
          .describe("Absolute path to a .pdf, .png or .jpg/.jpeg file"),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        openWorldHint: false,
      },
    },
    safe(async ({ eventId, filePath }) => {
      const mime = UPLOAD_MIME_BY_EXT[extname(filePath).toLowerCase()]
      if (!mime) {
        return {
          content: [
            {
              type: "text",
              text: `Unsupported file type "${extname(filePath)}". Use .pdf, .png, .jpg or .jpeg.`,
            },
          ],
          isError: true,
        }
      }
      const data = await readFile(filePath)
      const result = await folio.upload(
        `/events/${eventId}/attachments`,
        data,
        mime,
        basename(filePath),
      )
      return jsonResult(result)
    }),
  )

  server.registerTool(
    "download_attachment",
    {
      title: "Download attachment",
      description:
        "Download an attachment (receipt/invoice) to a local file. Type 'original' is the uploaded file, 'cropped' is auto-cropped, and 128x128/256x256/512x512 are square image thumbnails. Small images are also returned inline.",
      inputSchema: {
        id: uuid.describe("Attachment id"),
        type: z
          .enum(["original", "cropped", "128x128", "256x256", "512x512"])
          .describe("Which rendition to download"),
        savePath: z
          .string()
          .optional()
          .describe(
            "Where to save the file. Defaults to the system temp directory.",
          ),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    safe(async ({ id, type, savePath }) => {
      const { data, contentType, filename } = await folio.binary(
        `/attachments/${id}/${type}`,
      )
      const ext = EXT_BY_MIME[contentType] ?? ""
      const target =
        savePath ??
        join(tmpdir(), filename ?? `folio-attachment-${id}-${type}${ext}`)
      const bytes = new Uint8Array(data)
      await writeFile(target, bytes)
      const result: CallToolResult = {
        content: [
          {
            type: "text",
            text: `Saved ${contentType} (${bytes.byteLength} bytes) to ${target}`,
          },
        ],
      }
      if (contentType.startsWith("image/") && bytes.byteLength <= 1_500_000) {
        result.content.push({
          type: "image",
          data: Buffer.from(bytes).toString("base64"),
          mimeType: contentType,
        })
      }
      return result
    }),
  )

  // ---- Ledger categories ----------------------------------------------------

  server.registerTool(
    "get_ledger_category",
    {
      title: "Get ledger category",
      description:
        "Get a ledger category by id: account number/name (Norsk Standardkontoplan NS4102), VAT code/rate, and which documentation (attachment, purpose, participants) is required for an event to be complete.",
      inputSchema: {
        id: z
          .string()
          .describe(
            "Ledger category id, e.g. from an event's ledgerCategory.id",
          ),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    safe(async ({ id }) =>
      jsonResult(await folio.json(`/categories/${encodeURIComponent(id)}`)),
    ),
  )

  // ---- Payments -------------------------------------------------------------

  server.registerTool(
    "list_payments",
    {
      title: "List payments",
      description:
        "List payments in a date range with state (Draft, InProcess, Completed, Cancelled, Rejected, RetryingInsufficientFunds).",
      inputSchema: {
        startDate: isoDate.describe("Earliest date, inclusive (YYYY-MM-DD)"),
        endDate: isoDate
          .optional()
          .describe("Last date, inclusive. Defaults to today."),
        includeAgents: z
          .boolean()
          .optional()
          .describe("Include agent (creator/signer) info"),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    safe(async (query) => jsonResult(await folio.json("/payments", { query }))),
  )

  server.registerTool(
    "get_payment",
    {
      title: "Get payment",
      description: "Get a single payment by id, including its current state.",
      inputSchema: { id: uuid.describe("Payment id") },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    safe(async ({ id }) => jsonResult(await folio.json(`/payments/${id}`))),
  )

  server.registerTool(
    "create_payment",
    {
      title: "Create payment (draft)",
      description:
        "Create a new payment. The payment is created as a Draft and must be approved/signed by the user in the Folio app before any money moves. Either kid or message may be set, not both. Foreign (non-NOK) payments require foreignPaymentInfo.",
      inputSchema: {
        creditorName: z.string().describe("Name of the recipient"),
        creditorAccountNumber: z
          .string()
          .describe("Recipient account number (BBAN or IBAN)"),
        debtorAccountNumber: z
          .string()
          .describe("Your Folio account number to pay from (BBAN)"),
        amount: decimalAmount,
        currency: z
          .string()
          .default("NOK")
          .describe('ISO currency code, e.g. "NOK" or "EUR"'),
        executionDate: isoDate.describe(
          "Date the payment should be executed (YYYY-MM-DD)",
        ),
        kid: z
          .string()
          .regex(/^\d+-?$/)
          .optional()
          .describe("KID number. Mutually exclusive with message."),
        message: z
          .string()
          .optional()
          .describe("Message to recipient. Mutually exclusive with kid."),
        foreignPaymentInfo: z
          .object({
            reportingInfo: z
              .string()
              .max(35)
              .describe("Information about the payment, max 35 characters"),
            paymentType: z.enum([
              "DirectCapitalInvestment",
              "DirectShareInvestment",
              "Dividend",
              "InheritanceGiftEtc",
              "Interest",
              "LifeInsuranceOrPension",
              "OtherCapitalDividend",
              "OtherFinanceInvestments",
              "OtherPurchaseOrSaleOfServices",
              "PortfolioBondsAndCertificates",
              "PortfolioDerivates",
              "PortfolioShares",
              "PurchaseOfSaleOfProperty",
              "PurchaseOrSaleOfGoods",
              "Rent",
              "Salary",
            ]),
            creditorAddress: z.object({
              streetName: z.string(),
              postCode: z.string(),
              townName: z.string(),
              country: z.string(),
            }),
          })
          .optional()
          .describe("Required for payments in a currency other than NOK"),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    safe(async (args) => {
      if (args.kid && args.message) {
        return {
          content: [
            {
              type: "text",
              text: "kid and message are mutually exclusive — set only one.",
            },
          ],
          isError: true,
        }
      }
      const result = await folio.json("/payments", {
        method: "POST",
        body: {
          creditor: {
            name: args.creditorName,
            accountNumber: args.creditorAccountNumber,
          },
          debtorAccountNumber: args.debtorAccountNumber,
          currencyAmount: { amount: args.amount, currency: args.currency },
          executionDate: args.executionDate,
          kid: args.kid,
          message: args.message,
          foreignPaymentInfo: args.foreignPaymentInfo,
        },
      })
      return {
        content: [
          {
            type: "text",
            text:
              `Payment draft created — it must be approved in the Folio app before execution.\n` +
              JSON.stringify(result, null, 2),
          },
        ],
      }
    }),
  )

  server.registerTool(
    "cancel_payment",
    {
      title: "Cancel payment",
      description:
        "Cancel (soft-delete) a payment. It remains visible with status Cancelled and cannot be re-approved by the user.",
      inputSchema: { id: uuid.describe("Payment id") },
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    safe(async ({ id }) => {
      await folio.json(`/payments/${id}`, { method: "DELETE" })
      return { content: [{ type: "text", text: `Payment ${id} cancelled.` }] }
    }),
  )

  return server
}
