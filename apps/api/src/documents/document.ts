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

export type CreateDocumentInput = {
  name: string
  kind: DocumentKind
}

export const isDocumentKind = (value: unknown): value is DocumentKind => {
  return value === "pdf" || value === "docx"
}

export const isPlatformDocumentActionKind = (
  value: unknown
): value is PlatformDocumentActionKind => {
  return value === "extract-metadata" || value === "generate-derived-document"
}

export const isPdfEngineActionKind = (
  value: unknown
): value is PdfEngineActionKind => {
  return value === "compress-pdf" || value === "split-pdf"
}

export const isDocumentActionKind = (
  value: unknown
): value is DocumentActionKind => {
  return isPlatformDocumentActionKind(value) || isPdfEngineActionKind(value)
}

export const isPdfEngineActionSupportedForDocument = (
  documentKind: DocumentKind,
  actionKind: PdfEngineActionKind
): boolean => {
  switch (actionKind) {
    case "compress-pdf":
    case "split-pdf":
      return documentKind === "pdf"
  }
}

export const buildPlannedOperations = (
  documentId: string,
  documentKind: DocumentKind
): DocumentOperation[] => {
  const baseOperations: DocumentOperationKind[] = [
    "extract-metadata",
    "generate-derived-document"
  ]

  if (documentKind === "docx") {
    baseOperations.unshift("convert-to-pdf")
  }

  return baseOperations.map((kind, index) => ({
    id: `${documentId}-operation-${index + 1}`,
    documentId,
    kind,
    status: "planned"
  }))
}

const DOCUMENT_EXTENSIONS: Record<DocumentKind, string> = {
  pdf: "pdf",
  docx: "docx"
}

const DOCUMENT_MIME_TYPES: Record<DocumentKind, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
}

const normalizeFileNameStem = (value: string): string => {
  const normalizedValue = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")

  return normalizedValue.length > 0 ? normalizedValue : "document"
}

export const buildDocumentMetadata = (
  documentName: string,
  documentKind: DocumentKind
): DocumentMetadata => {
  const trimmedDocumentName = documentName.trim()
  const extension = DOCUMENT_EXTENSIONS[documentKind]
  const sourceFileName = `${normalizeFileNameStem(trimmedDocumentName)}.${extension}`
  const sizeBytes =
    (documentKind === "pdf" ? 256_000 : 192_000) +
    trimmedDocumentName.length * 512

  return {
    sourceFileName,
    mimeType: DOCUMENT_MIME_TYPES[documentKind],
    sizeBytes,
    pageCount:
      documentKind === "pdf"
        ? Math.max(1, Math.ceil(trimmedDocumentName.length / 6))
        : null,
    wordCount:
      documentKind === "docx"
        ? Math.max(120, trimmedDocumentName.length * 48)
        : null
  }
}

export const buildSourceArtifact = (
  documentId: string,
  documentName: string,
  documentKind: DocumentKind,
  createdAt: string
): SourceArtifact => {
  const trimmedDocumentName = documentName.trim()
  const extension = DOCUMENT_EXTENSIONS[documentKind]

  return {
    id: `${documentId}-source-artifact-1`,
    documentId,
    fileName: `${normalizeFileNameStem(trimmedDocumentName)}.${extension}`,
    kind: documentKind,
    storageKind: "local-placeholder",
    status: "registered",
    createdAt
  }
}

export const resolveDocumentKindForDerivation = (
  derivationKind: DocumentDerivationKind
): DocumentKind => {
  switch (derivationKind) {
    case "converted-pdf":
    case "compressed-pdf":
    case "split-pdf-set":
      return "pdf"
    case "document-summary":
      return "docx"
  }
}
