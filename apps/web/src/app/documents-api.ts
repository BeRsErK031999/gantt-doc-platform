export type DocumentKind = "pdf" | "docx"

export type DocumentStatus = "draft" | "ready"

export type SourceArtifactStorageKind = "local-placeholder"

export type SourceArtifactStatus = "registered"

export type SourceArtifact = {
  id: string
  documentId: string
  fileName: string
  kind: DocumentKind
  storageKind: SourceArtifactStorageKind
  status: SourceArtifactStatus
  createdAt: string
}

export type PlatformDocumentActionKind =
  | "extract-metadata"
  | "generate-derived-document"

export type PdfEngineActionKind = "compress-pdf" | "split-pdf"

export type DocumentActionKind = PlatformDocumentActionKind | PdfEngineActionKind

export type DocumentOperationKind = "convert-to-pdf" | DocumentActionKind

export type DocumentOperationStatus = "planned" | "completed"

export type DocumentOperation = {
  id: string
  documentId: string
  kind: DocumentOperationKind
  status: DocumentOperationStatus
}

export type DocumentMetadata = {
  sourceFileName: string
  mimeType: string
  sizeBytes: number
  pageCount: number | null
  wordCount: number | null
}

export type DocumentRelationshipKind = "derived-from"

export type DocumentDerivationKind =
  | "converted-pdf"
  | "document-summary"
  | "compressed-pdf"
  | "split-pdf-set"

export type DocumentOrigin = {
  documentId: string
  relationshipKind: DocumentRelationshipKind
  derivationKind: DocumentDerivationKind
}

export type DerivedDocument = {
  id: string
  originDocumentId: string
  relationshipKind: DocumentRelationshipKind
  name: string
  kind: DocumentKind
  status: DocumentStatus
  createdAt: string
  derivationKind: DocumentDerivationKind
}

export type Document = {
  id: string
  name: string
  kind: DocumentKind
  status: DocumentStatus
  createdAt: string
  origin: DocumentOrigin | null
  sourceArtifact: SourceArtifact
  operations: DocumentOperation[]
  metadata: DocumentMetadata
  derivedDocuments: DerivedDocument[]
}

export type DocumentSummary = Pick<
  Document,
  "id" | "name" | "kind" | "status" | "createdAt"
>

export type DocumentDetails = Document

export type CreateDocumentRequest = {
  name: string
  kind: DocumentKind
}

export type RunDocumentActionRequest = {
  kind: DocumentActionKind
}

type ErrorResponse = {
  message: string
}

export class ApiError extends Error {
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = "ApiError"
    this.status = status
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === "object" && value !== null
}

const isDocumentKind = (value: unknown): value is DocumentKind => {
  return value === "pdf" || value === "docx"
}

const isDocumentStatus = (value: unknown): value is DocumentStatus => {
  return value === "draft" || value === "ready"
}

const isSourceArtifactStorageKind = (
  value: unknown
): value is SourceArtifactStorageKind => {
  return value === "local-placeholder"
}

const isSourceArtifactStatus = (
  value: unknown
): value is SourceArtifactStatus => {
  return value === "registered"
}

const isDocumentOperationKind = (
  value: unknown
): value is DocumentOperationKind => {
  return (
    value === "convert-to-pdf" ||
    value === "extract-metadata" ||
    value === "generate-derived-document" ||
    value === "compress-pdf" ||
    value === "split-pdf"
  )
}

const isDocumentOperationStatus = (
  value: unknown
): value is DocumentOperationStatus => {
  return value === "planned" || value === "completed"
}

const isDocumentDerivationKind = (
  value: unknown
): value is DocumentDerivationKind => {
  return (
    value === "converted-pdf" ||
    value === "document-summary" ||
    value === "compressed-pdf" ||
    value === "split-pdf-set"
  )
}

const isDocumentOperation = (value: unknown): value is DocumentOperation => {
  if (!isRecord(value)) {
    return false
  }

  return (
    typeof value.id === "string" &&
    typeof value.documentId === "string" &&
    isDocumentOperationKind(value.kind) &&
    isDocumentOperationStatus(value.status)
  )
}

const isDocumentMetadata = (value: unknown): value is DocumentMetadata => {
  if (!isRecord(value)) {
    return false
  }

  const { mimeType, pageCount, sizeBytes, sourceFileName, wordCount } = value

  return (
    typeof sourceFileName === "string" &&
    typeof mimeType === "string" &&
    typeof sizeBytes === "number" &&
    Number.isFinite(sizeBytes) &&
    (typeof pageCount === "number" || pageCount === null) &&
    (typeof wordCount === "number" || wordCount === null)
  )
}

const isSourceArtifact = (value: unknown): value is SourceArtifact => {
  if (!isRecord(value)) {
    return false
  }

  return (
    typeof value.id === "string" &&
    typeof value.documentId === "string" &&
    typeof value.fileName === "string" &&
    isDocumentKind(value.kind) &&
    isSourceArtifactStorageKind(value.storageKind) &&
    isSourceArtifactStatus(value.status) &&
    typeof value.createdAt === "string"
  )
}

const isDocumentOrigin = (value: unknown): value is DocumentOrigin | null => {
  if (value === null) {
    return true
  }

  if (!isRecord(value)) {
    return false
  }

  return (
    typeof value.documentId === "string" &&
    value.relationshipKind === "derived-from" &&
    isDocumentDerivationKind(value.derivationKind)
  )
}

const isDerivedDocument = (value: unknown): value is DerivedDocument => {
  if (!isRecord(value)) {
    return false
  }

  return (
    typeof value.id === "string" &&
    typeof value.originDocumentId === "string" &&
    value.relationshipKind === "derived-from" &&
    typeof value.name === "string" &&
    isDocumentKind(value.kind) &&
    isDocumentStatus(value.status) &&
    typeof value.createdAt === "string" &&
    isDocumentDerivationKind(value.derivationKind)
  )
}

const isDocument = (value: unknown): value is Document => {
  if (!isRecord(value)) {
    return false
  }

  const { sourceArtifact } = value

  return (
    typeof value.id === "string" &&
    typeof value.name === "string" &&
    isDocumentKind(value.kind) &&
    isDocumentStatus(value.status) &&
    typeof value.createdAt === "string" &&
    isDocumentOrigin(value.origin) &&
    isSourceArtifact(sourceArtifact) &&
    sourceArtifact.documentId === value.id &&
    sourceArtifact.kind === value.kind &&
    Array.isArray(value.operations) &&
    value.operations.every((operation) => isDocumentOperation(operation)) &&
    isDocumentMetadata(value.metadata) &&
    Array.isArray(value.derivedDocuments) &&
    value.derivedDocuments.every((document) => isDerivedDocument(document))
  )
}

const isDocumentSummary = (value: unknown): value is DocumentSummary => {
  if (!isRecord(value)) {
    return false
  }

  return (
    typeof value.id === "string" &&
    typeof value.name === "string" &&
    isDocumentKind(value.kind) &&
    isDocumentStatus(value.status) &&
    typeof value.createdAt === "string"
  )
}

const isDocumentsResponse = (value: unknown): value is DocumentSummary[] => {
  return (
    Array.isArray(value) &&
    value.every((document) => isDocumentSummary(document))
  )
}

const isErrorResponse = (value: unknown): value is ErrorResponse => {
  if (!isRecord(value)) {
    return false
  }

  return typeof value.message === "string"
}

const getResponseMessage = async (response: Response): Promise<string> => {
  const payload: unknown = await response.json().catch(() => null)

  if (isErrorResponse(payload)) {
    return payload.message
  }

  return `Request failed with status ${response.status}`
}

const ensureSuccessfulResponse = async (response: Response): Promise<void> => {
  if (response.ok) {
    return
  }

  throw new ApiError(await getResponseMessage(response), response.status)
}

export const loadDocuments = async (
  signal?: AbortSignal
): Promise<DocumentSummary[]> => {
  const response = await fetch("/api/documents", {
    signal
  })

  await ensureSuccessfulResponse(response)

  const payload: unknown = await response.json()

  if (!isDocumentsResponse(payload)) {
    throw new Error("Documents response has an unexpected shape")
  }

  return payload
}

export const loadDocument = async (
  documentId: string,
  signal?: AbortSignal
): Promise<DocumentDetails> => {
  const response = await fetch(`/api/documents/${encodeURIComponent(documentId)}`, {
    signal
  })

  await ensureSuccessfulResponse(response)

  const payload: unknown = await response.json()

  if (!isDocument(payload)) {
    throw new Error("Document details response has an unexpected shape")
  }

  return payload
}

export const createDocument = async (
  input: CreateDocumentRequest
): Promise<DocumentDetails> => {
  const response = await fetch("/api/documents", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(input)
  })

  await ensureSuccessfulResponse(response)

  const payload: unknown = await response.json()

  if (!isDocument(payload)) {
    throw new Error("Created document response has an unexpected shape")
  }

  return payload
}

export const runDocumentAction = async (
  documentId: string,
  input: RunDocumentActionRequest
): Promise<DocumentDetails> => {
  const response = await fetch(
    `/api/documents/${encodeURIComponent(documentId)}/actions`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(input)
    }
  )

  await ensureSuccessfulResponse(response)

  const payload: unknown = await response.json()

  if (!isDocument(payload)) {
    throw new Error("Document action response has an unexpected shape")
  }

  return payload
}
