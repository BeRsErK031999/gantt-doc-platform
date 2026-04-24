import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

import {
  buildDocumentMetadata,
  buildSourceArtifact,
  isDocumentKind,
  isPdfEngineActionKind,
  resolveDocumentKindForDerivation
} from "./document.js"
import type { Document } from "./document.js"
import type {
  DocumentDerivationKind,
  DerivedDocument,
  DocumentMetadata,
  DocumentOrigin,
  DocumentOperation,
  DocumentOperationStatus,
  SourceArtifact
} from "./document.js"

export type DocumentsStore = {
  listDocuments: () => Document[]
  getDocumentById: (documentId: string) => Document | null
  createDocument: (document: Document) => Document
  updateDocument: (document: Document) => Document
}

type DocumentsStoragePayload = {
  documents: Document[]
}

type LegacyDerivedDocument = {
  id: string
  sourceDocumentId: string
  name: string
  kind: StoredDocumentDerivationKind
  status: "planned"
}

type StoredDocumentDerivationKind = DocumentDerivationKind | "split-pdf-set"

type LegacyDocument = Omit<Document, "origin" | "sourceArtifact" | "derivedDocuments"> & {
  derivedDocuments: LegacyDerivedDocument[]
}

type LegacyDocumentOperation = {
  id: string
  documentId: string
  kind: string
  status: string
}

type BackwardCompatibleDocument = Omit<Document, "operations"> & {
  operations?: unknown
}

const DOCUMENTS_STORAGE_FILE_PATH = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../../data/documents.json"
)

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

const isDocumentOperationStatus = (
  value: unknown
): value is DocumentOperationStatus => {
  return value === "completed" || value === "failed"
}

const isDocumentOperationInput = (
  value: unknown
): value is DocumentOperation["input"] => {
  if (value === undefined) {
    return true
  }

  if (!isRecord(value) || !isPdfEngineActionKind(value.kind)) {
    return false
  }

  if (value.kind === "compress-pdf") {
    return true
  }

  if (value.kind === "split-pdf") {
    return typeof value.pageRanges === "string"
  }

  return (
    Array.isArray(value.sourceDocumentIds) &&
    value.sourceDocumentIds.every((sourceDocumentId) => {
      return typeof sourceDocumentId === "string"
    }) &&
    (typeof value.excludePageRanges === "string" ||
      value.excludePageRanges === undefined) &&
    (value.pageNumberingMode === "none" ||
      value.pageNumberingMode === "append" ||
      value.pageNumberingMode === undefined)
  )
}

const isDocumentOperation = (value: unknown): value is DocumentOperation => {
  if (!isRecord(value)) {
    return false
  }

  return (
    typeof value.id === "string" &&
    isPdfEngineActionKind(value.kind) &&
    isDocumentOperationInput(value.input) &&
    (value.input === undefined || value.input.kind === value.kind) &&
    isDocumentOperationStatus(value.status) &&
    typeof value.createdAt === "string" &&
    (typeof value.finishedAt === "string" || value.finishedAt === null) &&
    (typeof value.errorCode === "string" || value.errorCode === undefined) &&
    (typeof value.errorMessage === "string" || value.errorMessage === undefined)
  )
}

const isLegacyDocumentOperation = (
  value: unknown
): value is LegacyDocumentOperation => {
  if (!isRecord(value)) {
    return false
  }

  return (
    typeof value.id === "string" &&
    typeof value.documentId === "string" &&
    typeof value.kind === "string" &&
    typeof value.status === "string"
  )
}

const isDocumentMetadata = (value: unknown): value is DocumentMetadata => {
  if (!isRecord(value)) {
    return false
  }

  return (
    typeof value.sourceFileName === "string" &&
    typeof value.mimeType === "string" &&
    typeof value.sizeBytes === "number" &&
    (typeof value.pageCount === "number" || value.pageCount === null) &&
    (typeof value.wordCount === "number" || value.wordCount === null)
  )
}

const isSourceArtifact = (value: unknown): value is SourceArtifact => {
  if (!isRecord(value)) {
    return false
  }

  const hasValidStorageState =
    (value.storageKind === "local-placeholder" &&
      value.status === "registered" &&
      value.path === undefined) ||
    (value.storageKind === "local-file" &&
      value.status === "uploaded" &&
      typeof value.path === "string")

  return (
    typeof value.id === "string" &&
    typeof value.documentId === "string" &&
    typeof value.fileName === "string" &&
    isDocumentKind(value.kind) &&
    hasValidStorageState &&
    typeof value.createdAt === "string"
  )
}

const isDocumentDerivationKind = (
  value: unknown
): value is StoredDocumentDerivationKind => {
  return (
    value === "converted-pdf" ||
    value === "document-summary" ||
    value === "compressed-pdf" ||
    value === "split-pdf" ||
    value === "merge-pdf" ||
    value === "split-pdf-set"
  )
}

const normalizeDocumentDerivationKind = (
  value: StoredDocumentDerivationKind
): DocumentDerivationKind => {
  return value === "split-pdf-set" ? "split-pdf" : value
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
    (value.status === "draft" || value.status === "ready") &&
    typeof value.createdAt === "string" &&
    isDocumentDerivationKind(value.derivationKind)
  )
}

const isLegacyDerivedDocument = (
  value: unknown
): value is LegacyDerivedDocument => {
  if (!isRecord(value)) {
    return false
  }

  return (
    typeof value.id === "string" &&
    typeof value.sourceDocumentId === "string" &&
    typeof value.name === "string" &&
    isDocumentDerivationKind(value.kind) &&
    value.status === "planned"
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
    (value.status === "draft" ||
      value.status === "uploaded" ||
      value.status === "ready") &&
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

const isBackwardCompatibleDocument = (
  value: unknown
): value is BackwardCompatibleDocument => {
  if (!isRecord(value)) {
    return false
  }

  const { sourceArtifact } = value

  const hasCompatibleOperations =
    value.operations === undefined ||
    (Array.isArray(value.operations) &&
      value.operations.every((operation) => {
        return (
          isDocumentOperation(operation) || isLegacyDocumentOperation(operation)
        )
      }))

  return (
    typeof value.id === "string" &&
    typeof value.name === "string" &&
    isDocumentKind(value.kind) &&
    (value.status === "draft" ||
      value.status === "uploaded" ||
      value.status === "ready") &&
    typeof value.createdAt === "string" &&
    isDocumentOrigin(value.origin) &&
    isSourceArtifact(sourceArtifact) &&
    sourceArtifact.documentId === value.id &&
    sourceArtifact.kind === value.kind &&
    hasCompatibleOperations &&
    isDocumentMetadata(value.metadata) &&
    Array.isArray(value.derivedDocuments) &&
    value.derivedDocuments.every((document) => isDerivedDocument(document))
  )
}

const isLegacyDocument = (value: unknown): value is LegacyDocument => {
  if (!isRecord(value)) {
    return false
  }

  return (
    typeof value.id === "string" &&
    typeof value.name === "string" &&
    isDocumentKind(value.kind) &&
    (value.status === "draft" ||
      value.status === "uploaded" ||
      value.status === "ready") &&
    typeof value.createdAt === "string" &&
    Array.isArray(value.operations) &&
    value.operations.every((operation) => isLegacyDocumentOperation(operation)) &&
    isDocumentMetadata(value.metadata) &&
    Array.isArray(value.derivedDocuments) &&
    value.derivedDocuments.every((document) => isLegacyDerivedDocument(document))
  )
}

const buildDocumentFromLegacyPayload = (
  document: LegacyDocument
): Document => {
  return {
    ...document,
    origin: null,
    sourceArtifact: buildSourceArtifact(
      document.id,
      document.name,
      document.kind,
      document.createdAt
    ),
    derivedDocuments: []
  }
}

const buildDocumentFromLegacyDerivedPayload = (
  parentDocument: LegacyDocument,
  derivedDocument: LegacyDerivedDocument
): Document => {
  const derivationKind = normalizeDocumentDerivationKind(derivedDocument.kind)
  const documentKind = resolveDocumentKindForDerivation(derivationKind)

  return {
    id: derivedDocument.id,
    name: derivedDocument.name,
    kind: documentKind,
    status: "draft",
    createdAt: parentDocument.createdAt,
    origin: {
      documentId: parentDocument.id,
      relationshipKind: "derived-from",
      derivationKind
    },
    sourceArtifact: buildSourceArtifact(
      derivedDocument.id,
      derivedDocument.name,
      documentKind,
      parentDocument.createdAt
    ),
    operations: [],
    metadata: buildDocumentMetadata(derivedDocument.name, documentKind),
    derivedDocuments: []
  }
}

const isDocumentsStoragePayload = (value: unknown): value is DocumentsStoragePayload => {
  return (
    isRecord(value) &&
    Array.isArray(value.documents) &&
    value.documents.every((document) => isDocument(document))
  )
}

const parseDocumentsStoragePayload = (value: unknown): Document[] | null => {
  if (isDocumentsStoragePayload(value)) {
    return value.documents
  }

  if (!isRecord(value) || !Array.isArray(value.documents)) {
    return null
  }

  const documents: Document[] = []

  for (const document of value.documents) {
    if (isDocument(document)) {
      documents.push({
        ...document,
        origin:
          document.origin === null
            ? null
            : {
                ...document.origin,
                derivationKind: normalizeDocumentDerivationKind(
                  document.origin.derivationKind
                )
              },
        derivedDocuments: []
      })
      continue
    }

    if (isBackwardCompatibleDocument(document)) {
      const normalizedOperations: DocumentOperation[] =
        document.operations !== undefined && Array.isArray(document.operations)
          ? document.operations.flatMap<DocumentOperation>((operation) => {
              if (isDocumentOperation(operation)) {
                return [operation]
              }

              if (!isLegacyDocumentOperation(operation)) {
                return []
              }

              if (!isPdfEngineActionKind(operation.kind)) {
                return []
              }

              return [
                {
                  id: operation.id,
                  kind: operation.kind,
                  status:
                    operation.status === "failed" ? "failed" : "completed",
                  createdAt: document.createdAt,
                  finishedAt: null
                }
              ]
            })
          : []

      documents.push({
        ...document,
        origin:
          document.origin === null
            ? null
            : {
                ...document.origin,
                derivationKind: normalizeDocumentDerivationKind(
                  document.origin.derivationKind
                )
              },
        operations: normalizedOperations,
        derivedDocuments: []
      })
      continue
    }

    if (isLegacyDocument(document)) {
      documents.push(buildDocumentFromLegacyPayload(document))
      documents.push(
        ...document.derivedDocuments.map((derivedDocument) =>
          buildDocumentFromLegacyDerivedPayload(document, derivedDocument)
        )
      )
      continue
    }

    return null
  }

  return documents
}

const readStoredDocuments = (): Document[] => {
  if (!existsSync(DOCUMENTS_STORAGE_FILE_PATH)) {
    return []
  }

  const fileContents = readFileSync(DOCUMENTS_STORAGE_FILE_PATH, "utf8")
  const payload: unknown = JSON.parse(fileContents)
  const documents = parseDocumentsStoragePayload(payload)

  if (documents === null) {
    throw new Error("Documents storage file has an unexpected shape")
  }

  return documents
}

const writeStoredDocuments = (documents: Document[]): void => {
  mkdirSync(dirname(DOCUMENTS_STORAGE_FILE_PATH), { recursive: true })
  writeFileSync(
    DOCUMENTS_STORAGE_FILE_PATH,
    `${JSON.stringify({ documents }, null, 2)}\n`,
    "utf8"
  )
}

export const createFileBackedDocumentsStore = (): DocumentsStore => {
  const documents: Document[] = readStoredDocuments()

  return {
    listDocuments: () => documents.slice(),
    getDocumentById: (documentId) =>
      documents.find((document) => document.id === documentId) ?? null,
    createDocument: (document) => {
      documents.unshift(document)
      writeStoredDocuments(documents)

      return document
    },
    updateDocument: (document) => {
      const documentIndex = documents.findIndex(
        (currentDocument) => currentDocument.id === document.id
      )

      if (documentIndex === -1) {
        return document
      }

      documents[documentIndex] = document
      writeStoredDocuments(documents)

      return document
    }
  }
}
