/**
 * Thin typed client for the Folio API (https://api.folio.no/v2/api).
 * Auth is a bearer API key created at https://app.folio.no/til/api-tilgang.
 */

const DEFAULT_BASE_URL = "https://api.folio.no/v2"

export class FolioApiError extends Error {
  constructor(
    readonly status: number,
    readonly body: string,
    readonly url: string,
  ) {
    super(
      `Folio API ${status} for ${url}${body ? `: ${body.slice(0, 500)}` : ""}`,
    )
    this.name = "FolioApiError"
  }
}

type Query = Record<string, string | boolean | undefined>

type FetchBody = NonNullable<Parameters<typeof fetch>[1]>["body"]

interface RequestInitLite {
  method?: string
  query?: Query
  headers?: Record<string, string>
  body?: FetchBody
}

interface JsonInit {
  method?: string
  query?: Query
  body?: unknown
}

export interface BinaryResult {
  data: ArrayBuffer
  contentType: string
  filename?: string
}

export class FolioClient {
  constructor(
    private readonly apiKey: string,
    private readonly baseUrl: string = DEFAULT_BASE_URL,
  ) {}

  private url(path: string, query?: Query): string {
    const url = new URL(this.baseUrl + path)
    for (const [key, value] of Object.entries(query ?? {})) {
      if (value !== undefined) url.searchParams.set(key, String(value))
    }
    return url.toString()
  }

  private async fetch(
    path: string,
    init: RequestInitLite = {},
  ): Promise<Response> {
    const url = this.url(path, init.query)
    const response = await fetch(url, {
      method: init.method ?? "GET",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        Accept: "application/json",
        ...init.headers,
      },
      body: init.body,
    })
    if (!response.ok) {
      throw new FolioApiError(
        response.status,
        await response.text().catch(() => ""),
        url,
      )
    }
    return response
  }

  /** JSON request. Returns undefined for empty (202/204) responses. */
  async json<T = unknown>(path: string, init: JsonInit = {}): Promise<T> {
    const response = await this.fetch(path, {
      method: init.method,
      query: init.query,
      headers:
        init.body !== undefined
          ? { "Content-Type": "application/json" }
          : undefined,
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    })
    const text = await response.text()
    return (text ? JSON.parse(text) : undefined) as T
  }

  /** Binary download (attachments). */
  async binary(path: string): Promise<BinaryResult> {
    const response = await this.fetch(path)
    const disposition = response.headers.get("content-disposition") ?? ""
    const filename = /filename="?([^";]+)"?/.exec(disposition)?.[1]
    return {
      data: await response.arrayBuffer(),
      contentType:
        response.headers.get("content-type") ?? "application/octet-stream",
      filename,
    }
  }

  /** Binary upload (event attachments). */
  async upload<T = unknown,>(
    path: string,
    data: Uint8Array,
    contentType: string,
    filename?: string,
  ): Promise<T> {
    const response = await this.fetch(path, {
      method: "POST",
      headers: {
        "Content-Type": contentType,
        ...(filename
          ? { "Content-Disposition": `attachment; filename="${filename}"` }
          : {}),
      },
      body: data as FetchBody,
    })
    const text = await response.text()
    return (text ? JSON.parse(text) : undefined) as T
  }
}

export function folioClientFromEnv(): FolioClient {
  const apiKey = process.env.FOLIO_API_KEY
  if (!apiKey) {
    throw new Error(
      "FOLIO_API_KEY is not set. Create an API key at https://app.folio.no/til/api-tilgang and export it as FOLIO_API_KEY.",
    )
  }
  return new FolioClient(apiKey, process.env.FOLIO_API_URL ?? DEFAULT_BASE_URL)
}
