import { readFile } from "node:fs/promises"

import type { PdfEngineActionKind } from "../documents/document.js"

export type SubmitPdfActionInput = {
  actionKind: PdfEngineActionKind
  documentId: string
  documentName: string
  sourceFileName: string
  sourceFilePath: string
}

export type PdfEngineGatewayConfig = {
  authToken?: string
  baseUrl?: string
}

export type PdfEngineActionSubmissionResult =
  | {
      kind: "completed"
      engineDocumentId: string
      engineRequestId: string
      mediaType: string
      resultFileName: string
      resultFileContents: Uint8Array
    }
  | {
      kind: "error"
      message: string
      statusCode: 400 | 500 | 502
    }

type PdfEngineGatewayErrorResult = Extract<
  PdfEngineActionSubmissionResult,
  { kind: "error" }
>

export type PdfEngineGateway = {
  submitPdfAction: (
    input: SubmitPdfActionInput
  ) => Promise<PdfEngineActionSubmissionResult>
}

type PdfEngineApiError = {
  code: string
  message: string
}

type PdfEngineDocumentSummary = {
  id: string
}

type PdfEngineOperationJob = {
  id: string
  message?: string
  status: string
}

const PDF_ENGINE_PRODUCT_BASE_PATH = "/api/v1"
const REQUEST_TIMEOUT_MS = 30_000
const DEFAULT_RESULT_FILE_NAME = "compressed.pdf"

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === "object" && value !== null
}

const isPdfEngineApiError = (value: unknown): value is PdfEngineApiError => {
  return (
    isRecord(value) &&
    typeof value.code === "string" &&
    typeof value.message === "string"
  )
}

const isPdfEngineDocumentSummary = (
  value: unknown
): value is PdfEngineDocumentSummary => {
  return isRecord(value) && typeof value.id === "string"
}

const isPdfEngineOperationJob = (
  value: unknown
): value is PdfEngineOperationJob => {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.status === "string" &&
    (typeof value.message === "string" || value.message === undefined)
  )
}

const resolveRequestUrl = (
  baseUrl: string,
  pathName: string
): string => {
  return `${baseUrl}${PDF_ENGINE_PRODUCT_BASE_PATH}${pathName}`
}

const resolveErrorMessageFromResponse = async (
  response: Response
): Promise<string> => {
  const payload: unknown = await response.json().catch(() => null)

  if (isPdfEngineApiError(payload)) {
    if (response.status === 401 || response.status === 403) {
      return `${payload.message} Check PDF_ENGINE_AUTH_TOKEN.`
    }

    return payload.message
  }

  if (response.status === 401 || response.status === 403) {
    return `PDF engine rejected the bearer token with HTTP ${response.status}. Check PDF_ENGINE_AUTH_TOKEN.`
  }

  return `PDF engine request failed with HTTP ${response.status}.`
}

const createConfigurationError = (
  message: string
): PdfEngineActionSubmissionResult => {
  return {
    kind: "error",
    message,
    statusCode: 500
  }
}

const createGatewayError = (
  message: string
): PdfEngineGatewayErrorResult => {
  return {
    kind: "error",
    message,
    statusCode: 502
  }
}

const isGatewayErrorResult = (
  value: PdfEngineDocumentSummary | PdfEngineOperationJob | PdfEngineGatewayErrorResult
): value is PdfEngineGatewayErrorResult => {
  return isRecord(value) && "kind" in value && value.kind === "error"
}

const parseFileNameFromContentDisposition = (
  contentDisposition: string | null
): string => {
  if (contentDisposition === null) {
    return DEFAULT_RESULT_FILE_NAME
  }

  const match = /filename="?([^";]+)"?/i.exec(contentDisposition)

  if (match === null) {
    return DEFAULT_RESULT_FILE_NAME
  }

  const fileName = match[1].trim()

  return fileName.length > 0 ? fileName : DEFAULT_RESULT_FILE_NAME
}

const createAuthorizedHeaders = (authToken: string): Headers => {
  const headers = new Headers()

  headers.set("Authorization", `Bearer ${authToken}`)

  return headers
}

const createTimeoutSignal = (): AbortSignal => {
  return AbortSignal.timeout(REQUEST_TIMEOUT_MS)
}

const createPdfEngineDocument = async (
  authToken: string,
  baseUrl: string,
  documentName: string
): Promise<PdfEngineDocumentSummary | PdfEngineGatewayErrorResult> => {
  const response = await fetch(resolveRequestUrl(baseUrl, "/documents"), {
    method: "POST",
    headers: {
      ...Object.fromEntries(createAuthorizedHeaders(authToken).entries()),
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      name: documentName,
      source: "manual-upload"
    }),
    signal: createTimeoutSignal()
  })

  if (!response.ok) {
    return createGatewayError(
      `PDF engine document creation failed: ${await resolveErrorMessageFromResponse(response)}`
    )
  }

  const payload: unknown = await response.json().catch(() => null)

  if (!isPdfEngineDocumentSummary(payload)) {
    return createGatewayError(
      "PDF engine document creation returned an unexpected response shape."
    )
  }

  return payload
}

const uploadSourceFileToPdfEngine = async (
  authToken: string,
  baseUrl: string,
  engineDocumentId: string,
  sourceFileName: string,
  sourceFilePath: string
): Promise<true | PdfEngineGatewayErrorResult> => {
  const sourceFileContents = await readFile(sourceFilePath)
  const formData = new FormData()

  formData.append(
    "file",
    new Blob([sourceFileContents], { type: "application/pdf" }),
    sourceFileName
  )

  const response = await fetch(
    resolveRequestUrl(
      baseUrl,
      `/documents/${encodeURIComponent(engineDocumentId)}/upload-input-file`
    ),
    {
      method: "POST",
      headers: createAuthorizedHeaders(authToken),
      body: formData,
      signal: createTimeoutSignal()
    }
  )

  if (!response.ok) {
    return createGatewayError(
      `PDF engine input upload failed: ${await resolveErrorMessageFromResponse(response)}`
    )
  }

  return true
}

const createCompressOperation = async (
  authToken: string,
  baseUrl: string,
  engineDocumentId: string
): Promise<PdfEngineOperationJob | PdfEngineGatewayErrorResult> => {
  const response = await fetch(
    resolveRequestUrl(
      baseUrl,
      `/documents/${encodeURIComponent(engineDocumentId)}/operations`
    ),
    {
      method: "POST",
      headers: {
        ...Object.fromEntries(createAuthorizedHeaders(authToken).entries()),
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        operationType: "compress"
      }),
      signal: createTimeoutSignal()
    }
  )

  if (!response.ok) {
    return createGatewayError(
      `PDF engine job creation failed: ${await resolveErrorMessageFromResponse(response)}`
    )
  }

  const payload: unknown = await response.json().catch(() => null)

  if (!isPdfEngineOperationJob(payload)) {
    return createGatewayError(
      "PDF engine job creation returned an unexpected response shape."
    )
  }

  return payload
}

const executeCompressOperation = async (
  authToken: string,
  baseUrl: string,
  engineDocumentId: string,
  engineRequestId: string
): Promise<PdfEngineOperationJob | PdfEngineGatewayErrorResult> => {
  const response = await fetch(
    resolveRequestUrl(
      baseUrl,
      `/documents/${encodeURIComponent(engineDocumentId)}/operations/${encodeURIComponent(engineRequestId)}/execute`
    ),
    {
      method: "POST",
      headers: createAuthorizedHeaders(authToken),
      signal: createTimeoutSignal()
    }
  )

  if (!response.ok) {
    return createGatewayError(
      `PDF engine execution failed: ${await resolveErrorMessageFromResponse(response)}`
    )
  }

  const payload: unknown = await response.json().catch(() => null)

  if (!isPdfEngineOperationJob(payload)) {
    return createGatewayError(
      "PDF engine execution returned an unexpected response shape."
    )
  }

  if (payload.status !== "completed") {
    return createGatewayError(
      payload.message ??
        `PDF engine execution finished with unexpected status "${payload.status}".`
    )
  }

  return payload
}

const downloadCompressResult = async (
  authToken: string,
  baseUrl: string,
  engineDocumentId: string,
  engineRequestId: string
): Promise<PdfEngineActionSubmissionResult> => {
  const response = await fetch(
    resolveRequestUrl(
      baseUrl,
      `/documents/${encodeURIComponent(engineDocumentId)}/operations/${encodeURIComponent(engineRequestId)}/result`
    ),
    {
      method: "GET",
      headers: createAuthorizedHeaders(authToken),
      signal: createTimeoutSignal()
    }
  )

  if (!response.ok) {
    return createGatewayError(
      `PDF engine result download failed: ${await resolveErrorMessageFromResponse(response)}`
    )
  }

  const resultFileContents = new Uint8Array(await response.arrayBuffer())

  if (resultFileContents.byteLength === 0) {
    return createGatewayError("PDF engine returned an empty result artifact.")
  }

  return {
    kind: "completed",
    engineDocumentId,
    engineRequestId,
    mediaType: response.headers.get("content-type") ?? "application/pdf",
    resultFileName: parseFileNameFromContentDisposition(
      response.headers.get("content-disposition")
    ),
    resultFileContents
  }
}

const submitCompressPdfAction = async (
  config: PdfEngineGatewayConfig,
  input: SubmitPdfActionInput
): Promise<PdfEngineActionSubmissionResult> => {
  if (config.baseUrl === undefined) {
    return createConfigurationError(
      "PDF_ENGINE_BASE_URL is not configured for gantt-doc-platform."
    )
  }

  if (config.authToken === undefined) {
    return createConfigurationError(
      "PDF_ENGINE_AUTH_TOKEN is not configured for gantt-doc-platform."
    )
  }

  try {
    const engineDocument = await createPdfEngineDocument(
      config.authToken,
      config.baseUrl,
      input.documentName
    )

    if (isGatewayErrorResult(engineDocument)) {
      return engineDocument
    }

    const uploadResult = await uploadSourceFileToPdfEngine(
      config.authToken,
      config.baseUrl,
      engineDocument.id,
      input.sourceFileName,
      input.sourceFilePath
    )

    if (uploadResult !== true) {
      return uploadResult
    }

    const operationJob = await createCompressOperation(
      config.authToken,
      config.baseUrl,
      engineDocument.id
    )

    if (isGatewayErrorResult(operationJob)) {
      return operationJob
    }

    const executionResult = await executeCompressOperation(
      config.authToken,
      config.baseUrl,
      engineDocument.id,
      operationJob.id
    )

    if (isGatewayErrorResult(executionResult)) {
      return executionResult
    }

    return downloadCompressResult(
      config.authToken,
      config.baseUrl,
      engineDocument.id,
      operationJob.id
    )
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown PDF engine error."

    return createGatewayError(
      `PDF engine is unavailable or unreachable: ${message}`
    )
  }
}

export const createHttpPdfEngineGateway = (
  config: PdfEngineGatewayConfig
): PdfEngineGateway => {
  return {
    submitPdfAction: async (input) => submitCompressPdfAction(config, input)
  }
}
