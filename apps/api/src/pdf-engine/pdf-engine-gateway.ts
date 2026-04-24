import { readFile } from "node:fs/promises"

import type {
  MergePdfPageNumberingMode,
  PdfEngineActionKind
} from "../documents/document.js"

export type SubmitPdfActionInput =
  | {
      actionKind: Exclude<PdfEngineActionKind, "merge-pdf">
      documentId: string
      documentName: string
      pageRanges?: string
      sourceFileName: string
      sourceFilePath: string
    }
  | {
      actionKind: "merge-pdf"
      documentId: string
      documentName: string
      sourceDocumentIds: string[]
      excludePageRanges?: string
      pageNumberingMode: MergePdfPageNumberingMode
      sourceDocuments: Array<{
        documentId: string
        documentName: string
        sourceFileName: string
        sourceFilePath: string
      }>
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
      code: string
      details?: string
      kind: "error"
      message: string
      statusCode: 400 | 500 | 502 | 503
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

type PdfEngineRequestStep =
  | "document-create"
  | "source-upload"
  | "job-create"
  | "execute"
  | "result-download"

const PDF_ENGINE_PRODUCT_BASE_PATH = "/api/v1"
const REQUEST_TIMEOUT_MS = 30_000
const PDF_MEDIA_TYPE = "application/pdf"
const ZIP_MEDIA_TYPE = "application/zip"
const OCTET_STREAM_MEDIA_TYPE = "application/octet-stream"
const PDF_FILE_SIGNATURE = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d])
const ZIP_FILE_SIGNATURE = new Uint8Array([0x50, 0x4b, 0x03, 0x04])

const DEFAULT_RESULT_FILE_NAME_BY_ACTION: Record<PdfEngineActionKind, string> = {
  "compress-pdf": "compressed.pdf",
  "split-pdf": "split.zip",
  "merge-pdf": "merged.pdf"
}

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

const resolveRequestUrl = (baseUrl: string, pathName: string): string => {
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
  code: string,
  message: string,
  details?: string
): PdfEngineActionSubmissionResult => {
  return {
    kind: "error",
    code,
    details,
    message,
    statusCode: 500
  }
}

const createGatewayError = (
  code: string,
  message: string,
  statusCode: 400 | 500 | 502 | 503 = 502,
  details?: string
): PdfEngineGatewayErrorResult => {
  return {
    kind: "error",
    code,
    details,
    message,
    statusCode
  }
}

const isGatewayErrorResult = (
  value: PdfEngineDocumentSummary | PdfEngineOperationJob | PdfEngineGatewayErrorResult
): value is PdfEngineGatewayErrorResult => {
  return isRecord(value) && "kind" in value && value.kind === "error"
}

const getDefaultResultFileName = (
  actionKind: PdfEngineActionKind,
  mediaType: string
): string => {
  if (actionKind === "split-pdf" && mediaType === PDF_MEDIA_TYPE) {
    return "split.pdf"
  }

  return DEFAULT_RESULT_FILE_NAME_BY_ACTION[actionKind]
}

const decodeFileNameValue = (value: string): string => {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

const parseFileNameFromContentDisposition = (
  actionKind: PdfEngineActionKind,
  mediaType: string,
  contentDisposition: string | null
): string => {
  if (contentDisposition === null) {
    return getDefaultResultFileName(actionKind, mediaType)
  }

  const encodedMatch = /filename\*\s*=\s*UTF-8''([^;]+)/i.exec(contentDisposition)

  if (encodedMatch !== null) {
    const encodedFileName = decodeFileNameValue(encodedMatch[1]).trim()

    if (encodedFileName.length > 0) {
      return encodedFileName
    }
  }

  const plainMatch = /filename="?([^";]+)"?/i.exec(contentDisposition)

  if (plainMatch === null) {
    return getDefaultResultFileName(actionKind, mediaType)
  }

  const fileName = decodeFileNameValue(plainMatch[1]).trim()

  return fileName.length > 0
    ? fileName
    : getDefaultResultFileName(actionKind, mediaType)
}

const createAuthorizedHeaders = (authToken: string): Headers => {
  const headers = new Headers()

  headers.set("Authorization", `Bearer ${authToken}`)

  return headers
}

const createTimeoutSignal = (): AbortSignal => {
  return AbortSignal.timeout(REQUEST_TIMEOUT_MS)
}

const startsWithSignature = (
  value: Uint8Array,
  signature: Uint8Array
): boolean => {
  if (value.byteLength < signature.byteLength) {
    return false
  }

  for (let index = 0; index < signature.byteLength; index += 1) {
    if (value[index] !== signature[index]) {
      return false
    }
  }

  return true
}

const isValidPdfResult = (resultFileContents: Uint8Array): boolean => {
  return startsWithSignature(resultFileContents, PDF_FILE_SIGNATURE)
}

const isValidSplitResult = (
  mediaType: string,
  resultFileContents: Uint8Array
): boolean => {
  if (mediaType === PDF_MEDIA_TYPE) {
    return startsWithSignature(resultFileContents, PDF_FILE_SIGNATURE)
  }

  if (mediaType === ZIP_MEDIA_TYPE) {
    return startsWithSignature(resultFileContents, ZIP_FILE_SIGNATURE)
  }

  if (mediaType === OCTET_STREAM_MEDIA_TYPE) {
    return (
      startsWithSignature(resultFileContents, PDF_FILE_SIGNATURE) ||
      startsWithSignature(resultFileContents, ZIP_FILE_SIGNATURE)
    )
  }

  return false
}

const buildPdfEngineResponseError = async (
  actionKind: PdfEngineActionKind,
  step: PdfEngineRequestStep,
  response: Response
): Promise<PdfEngineGatewayErrorResult> => {
  const details = await resolveErrorMessageFromResponse(response)

  if (response.status === 401 || response.status === 403) {
    return createGatewayError(
      "PDF_ENGINE_AUTH_INVALID",
      "PDF engine rejected the configured bearer token.",
      502,
      details
    )
  }

  if (actionKind === "split-pdf") {
    return createGatewayError(
      "PDF_ENGINE_SPLIT_FAILED",
      "PDF engine split execution failed.",
      502,
      `HTTP ${response.status}. ${details}`
    )
  }

  if (actionKind === "merge-pdf") {
    return createGatewayError(
      "PDF_ENGINE_MERGE_FAILED",
      "PDF engine merge execution failed.",
      502,
      `HTTP ${response.status}. ${details}`
    )
  }

  const stepLabelByCode: Record<PdfEngineRequestStep, string> = {
    "document-create": "document creation",
    "source-upload": "source file upload",
    "job-create": "job creation",
    execute: "job execution",
    "result-download": "result download"
  }
  const stepCodeByName: Record<PdfEngineRequestStep, string> = {
    "document-create": "PDF_ENGINE_DOCUMENT_CREATE_FAILED",
    "source-upload": "PDF_ENGINE_SOURCE_UPLOAD_FAILED",
    "job-create": "PDF_ENGINE_JOB_CREATE_FAILED",
    execute: "PDF_ENGINE_EXECUTION_FAILED",
    "result-download": "PDF_ENGINE_RESULT_DOWNLOAD_FAILED"
  }

  return createGatewayError(
    stepCodeByName[step],
    `PDF engine ${stepLabelByCode[step]} failed.`,
    502,
    `HTTP ${response.status}. ${details}`
  )
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
    return buildPdfEngineResponseError("compress-pdf", "document-create", response)
  }

  const payload: unknown = await response.json().catch(() => null)

  if (!isPdfEngineDocumentSummary(payload)) {
    return createGatewayError(
      "PDF_ENGINE_DOCUMENT_CREATE_INVALID_RESPONSE",
      "PDF engine document creation returned an unexpected response shape."
    )
  }

  return payload
}

const uploadSourceFileToPdfEngine = async ({
  authToken,
  baseUrl,
  engineDocumentId,
  sourceFileName,
  sourceFilePath,
  actionKind
}: {
  authToken: string
  baseUrl: string
  engineDocumentId: string
  sourceFileName: string
  sourceFilePath: string
  actionKind: PdfEngineActionKind
}): Promise<true | PdfEngineGatewayErrorResult> => {
  const sourceFileContents = await readFile(sourceFilePath)
  const formData = new FormData()

  formData.append(
    "file",
    new Blob([sourceFileContents], { type: PDF_MEDIA_TYPE }),
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
    return buildPdfEngineResponseError(actionKind, "source-upload", response)
  }

  return true
}

const createPdfEngineOperation = async (
  authToken: string,
  baseUrl: string,
  input: SubmitPdfActionInput,
  engineDocumentId: string
): Promise<PdfEngineOperationJob | PdfEngineGatewayErrorResult> => {
  const requestBody =
    input.actionKind === "split-pdf"
      ? {
          operationType: "split",
          pageRanges: input.pageRanges
        }
      : input.actionKind === "merge-pdf"
        ? {
            operationType: "merge",
            sourceDocumentIds: input.sourceDocumentIds,
            excludePageRanges: input.excludePageRanges,
            pageNumberingMode: input.pageNumberingMode
          }
        : {
            operationType: "compress"
          }

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
      body: JSON.stringify(requestBody),
      signal: createTimeoutSignal()
    }
  )

  if (!response.ok) {
    return buildPdfEngineResponseError(input.actionKind, "job-create", response)
  }

  const payload: unknown = await response.json().catch(() => null)

  if (!isPdfEngineOperationJob(payload)) {
    return createGatewayError(
      input.actionKind === "split-pdf"
        ? "PDF_ENGINE_SPLIT_FAILED"
        : input.actionKind === "merge-pdf"
          ? "PDF_ENGINE_MERGE_FAILED"
          : "PDF_ENGINE_JOB_CREATE_INVALID_RESPONSE",
      input.actionKind === "split-pdf"
        ? "PDF engine split job creation returned an unexpected response shape."
        : input.actionKind === "merge-pdf"
          ? "PDF engine merge job creation returned an unexpected response shape."
          : "PDF engine job creation returned an unexpected response shape."
    )
  }

  return payload
}

const executePdfEngineOperation = async (
  authToken: string,
  baseUrl: string,
  actionKind: PdfEngineActionKind,
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
    return buildPdfEngineResponseError(actionKind, "execute", response)
  }

  const payload: unknown = await response.json().catch(() => null)

  if (!isPdfEngineOperationJob(payload)) {
    return createGatewayError(
      actionKind === "split-pdf"
        ? "PDF_ENGINE_SPLIT_FAILED"
        : actionKind === "merge-pdf"
          ? "PDF_ENGINE_MERGE_FAILED"
          : "PDF_ENGINE_EXECUTION_INVALID_RESPONSE",
      actionKind === "split-pdf"
        ? "PDF engine split execution returned an unexpected response shape."
        : actionKind === "merge-pdf"
          ? "PDF engine merge execution returned an unexpected response shape."
          : "PDF engine execution returned an unexpected response shape."
    )
  }

  if (payload.status !== "completed") {
    return createGatewayError(
      actionKind === "split-pdf"
        ? "PDF_ENGINE_SPLIT_FAILED"
        : actionKind === "merge-pdf"
          ? "PDF_ENGINE_MERGE_FAILED"
          : "PDF_ENGINE_EXECUTION_UNEXPECTED_STATUS",
      actionKind === "split-pdf"
        ? "PDF engine split execution did not complete successfully."
        : actionKind === "merge-pdf"
          ? "PDF engine merge execution did not complete successfully."
          : "PDF engine execution did not complete successfully.",
      502,
      payload.message ?? `Unexpected engine job status: ${payload.status}.`
    )
  }

  return payload
}

const downloadPdfEngineResult = async (
  authToken: string,
  baseUrl: string,
  actionKind: PdfEngineActionKind,
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
    return buildPdfEngineResponseError(actionKind, "result-download", response)
  }

  const resultFileContents = new Uint8Array(await response.arrayBuffer())
  const mediaType =
    response.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() ??
    (actionKind === "split-pdf" ? ZIP_MEDIA_TYPE : PDF_MEDIA_TYPE)

  if (resultFileContents.byteLength === 0) {
    return createGatewayError(
      actionKind === "split-pdf"
        ? "PDF_ENGINE_SPLIT_RESULT_INVALID"
        : actionKind === "merge-pdf"
          ? "PDF_ENGINE_MERGE_RESULT_INVALID"
          : "PDF_ENGINE_RESULT_EMPTY",
      actionKind === "split-pdf"
        ? "PDF engine returned an empty split result artifact."
        : actionKind === "merge-pdf"
          ? "PDF engine returned an empty merged PDF artifact."
          : "PDF engine returned an empty compressed PDF artifact."
    )
  }

  if (actionKind === "split-pdf" && !isValidSplitResult(mediaType, resultFileContents)) {
    return createGatewayError(
      "PDF_ENGINE_SPLIT_RESULT_INVALID",
      "PDF engine returned an unsupported split result artifact.",
      502,
      `Unexpected split result media type: ${mediaType}.`
    )
  }

  if (
    actionKind === "merge-pdf" &&
    (mediaType !== PDF_MEDIA_TYPE || !isValidPdfResult(resultFileContents))
  ) {
    return createGatewayError(
      "PDF_ENGINE_MERGE_RESULT_INVALID",
      "PDF engine returned an invalid merge result artifact.",
      502,
      `Unexpected merge result media type: ${mediaType}.`
    )
  }

  return {
    kind: "completed",
    engineDocumentId,
    engineRequestId,
    mediaType,
    resultFileName: parseFileNameFromContentDisposition(
      actionKind,
      mediaType,
      response.headers.get("content-disposition")
    ),
    resultFileContents
  }
}

const submitSingleSourcePdfAction = async (
  config: PdfEngineGatewayConfig,
  input: Extract<SubmitPdfActionInput, { actionKind: "compress-pdf" | "split-pdf" }>
): Promise<PdfEngineActionSubmissionResult> => {
  const engineDocument = await createPdfEngineDocument(
    config.authToken!,
    config.baseUrl!,
    input.documentName
  )

  if (isGatewayErrorResult(engineDocument)) {
    if (input.actionKind === "split-pdf" && engineDocument.code !== "PDF_ENGINE_AUTH_INVALID") {
      return createGatewayError(
        "PDF_ENGINE_SPLIT_FAILED",
        "PDF engine split setup failed.",
        engineDocument.statusCode,
        engineDocument.details
      )
    }

    return engineDocument
  }

  const uploadResult = await uploadSourceFileToPdfEngine({
    authToken: config.authToken!,
    baseUrl: config.baseUrl!,
    engineDocumentId: engineDocument.id,
    sourceFileName: input.sourceFileName,
    sourceFilePath: input.sourceFilePath,
    actionKind: input.actionKind
  })

  if (uploadResult !== true) {
    if (input.actionKind === "split-pdf" && uploadResult.code !== "PDF_ENGINE_AUTH_INVALID") {
      return createGatewayError(
        "PDF_ENGINE_SPLIT_FAILED",
        "PDF engine split setup failed.",
        uploadResult.statusCode,
        uploadResult.details
      )
    }

    return uploadResult
  }

  const operationJob = await createPdfEngineOperation(
    config.authToken!,
    config.baseUrl!,
    input,
    engineDocument.id
  )

  if (isGatewayErrorResult(operationJob)) {
    return operationJob
  }

  const executionResult = await executePdfEngineOperation(
    config.authToken!,
    config.baseUrl!,
    input.actionKind,
    engineDocument.id,
    operationJob.id
  )

  if (isGatewayErrorResult(executionResult)) {
    return executionResult
  }

  return downloadPdfEngineResult(
    config.authToken!,
    config.baseUrl!,
    input.actionKind,
    engineDocument.id,
    operationJob.id
  )
}

const submitMergePdfAction = async (
  config: PdfEngineGatewayConfig,
  input: Extract<SubmitPdfActionInput, { actionKind: "merge-pdf" }>
): Promise<PdfEngineActionSubmissionResult> => {
  if (input.sourceDocuments.length < 2) {
    return createGatewayError(
      "MERGE_SOURCE_DOCUMENTS_REQUIRED",
      "Merge PDF requires at least two uploaded PDF documents including the current document.",
      400
    )
  }

  const primarySource = input.sourceDocuments[0]

  if (primarySource === undefined) {
    return createGatewayError(
      "MERGE_SOURCE_DOCUMENTS_REQUIRED",
      "Merge PDF requires a primary source document.",
      400
    )
  }

  const primaryEngineDocument = await createPdfEngineDocument(
    config.authToken!,
    config.baseUrl!,
    primarySource.documentName
  )

  if (isGatewayErrorResult(primaryEngineDocument)) {
    return primaryEngineDocument
  }

  const primaryUploadResult = await uploadSourceFileToPdfEngine({
    authToken: config.authToken!,
    baseUrl: config.baseUrl!,
    engineDocumentId: primaryEngineDocument.id,
    sourceFileName: primarySource.sourceFileName,
    sourceFilePath: primarySource.sourceFilePath,
    actionKind: "merge-pdf"
  })

  if (primaryUploadResult !== true) {
    return primaryUploadResult
  }

  const additionalEngineDocumentIds: string[] = []

  for (const sourceDocument of input.sourceDocuments.slice(1)) {
    const engineDocument = await createPdfEngineDocument(
      config.authToken!,
      config.baseUrl!,
      sourceDocument.documentName
    )

    if (isGatewayErrorResult(engineDocument)) {
      return engineDocument
    }

    const uploadResult = await uploadSourceFileToPdfEngine({
      authToken: config.authToken!,
      baseUrl: config.baseUrl!,
      engineDocumentId: engineDocument.id,
      sourceFileName: sourceDocument.sourceFileName,
      sourceFilePath: sourceDocument.sourceFilePath,
      actionKind: "merge-pdf"
    })

    if (uploadResult !== true) {
      return uploadResult
    }

    additionalEngineDocumentIds.push(engineDocument.id)
  }

  const operationJob = await createPdfEngineOperation(
    config.authToken!,
    config.baseUrl!,
    {
      ...input,
      sourceDocumentIds: additionalEngineDocumentIds
    },
    primaryEngineDocument.id
  )

  if (isGatewayErrorResult(operationJob)) {
    return operationJob
  }

  const executionResult = await executePdfEngineOperation(
    config.authToken!,
    config.baseUrl!,
    "merge-pdf",
    primaryEngineDocument.id,
    operationJob.id
  )

  if (isGatewayErrorResult(executionResult)) {
    return executionResult
  }

  return downloadPdfEngineResult(
    config.authToken!,
    config.baseUrl!,
    "merge-pdf",
    primaryEngineDocument.id,
    operationJob.id
  )
}

const submitPdfActionToEngine = async (
  config: PdfEngineGatewayConfig,
  input: SubmitPdfActionInput
): Promise<PdfEngineActionSubmissionResult> => {
  if (config.baseUrl === undefined) {
    return createConfigurationError(
      "PDF_ENGINE_BASE_URL_MISSING",
      "PDF compression is not configured on the server.",
      "Missing environment variable: PDF_ENGINE_BASE_URL."
    )
  }

  if (config.authToken === undefined) {
    return createConfigurationError(
      "PDF_ENGINE_AUTH_TOKEN_MISSING",
      "PDF compression authentication is not configured on the server.",
      "Missing environment variable: PDF_ENGINE_AUTH_TOKEN."
    )
  }

  if (input.actionKind === "split-pdf" && input.pageRanges === undefined) {
    return createGatewayError(
      "PDF_ENGINE_SPLIT_FAILED",
      "Split PDF requires pageRanges before calling the PDF engine.",
      400
    )
  }

  if (input.actionKind === "merge-pdf" && input.sourceDocuments.length < 2) {
    return createGatewayError(
      "MERGE_SOURCE_DOCUMENTS_REQUIRED",
      "Merge PDF requires at least two uploaded PDF documents before calling the PDF engine.",
      400
    )
  }

  try {
    if (input.actionKind === "merge-pdf") {
      return await submitMergePdfAction(config, input)
    }

    return await submitSingleSourcePdfAction(
      config,
      input as Extract<SubmitPdfActionInput, { actionKind: "compress-pdf" | "split-pdf" }>
    )
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown PDF engine error."

    return createGatewayError(
      "PDF_ENGINE_UNAVAILABLE",
      "PDF engine is unavailable or unreachable.",
      503,
      message
    )
  }
}

export const createHttpPdfEngineGateway = (
  config: PdfEngineGatewayConfig
): PdfEngineGateway => {
  return {
    submitPdfAction: async (input) => submitPdfActionToEngine(config, input)
  }
}
