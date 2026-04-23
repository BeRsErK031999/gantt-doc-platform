import { buildDocumentMetadata } from "./document.js"
import type {
  Document,
  DocumentMetadata,
  DocumentOperation,
  DocumentOperationKind,
  PdfEngineActionKind,
  PlatformDocumentActionKind
} from "./document.js"

const buildCompletedOperations = (
  document: Document,
  actionKind: DocumentOperationKind
): DocumentOperation[] => {
  const matchingOperation = document.operations.find(
    (operation) => operation.kind === actionKind
  )

  if (matchingOperation !== undefined) {
    return document.operations.map((operation) =>
      operation.kind === actionKind
        ? {
            ...operation,
            status: "completed"
          }
        : operation
    )
  }

  return [
    ...document.operations,
    {
      id: `${document.id}-operation-${document.operations.length + 1}`,
      documentId: document.id,
      kind: actionKind,
      status: "completed"
    }
  ]
}

const buildExtractedMetadata = (document: Document): DocumentMetadata => {
  const baseMetadata = buildDocumentMetadata(document.name, document.kind)
  const trimmedNameLength = document.name.trim().length
  const currentPageCount =
    document.metadata.pageCount ?? Math.max(1, Math.ceil(trimmedNameLength / 8))
  const currentWordCount =
    document.metadata.wordCount ?? Math.max(120, trimmedNameLength * 36)

  return {
    sourceFileName: baseMetadata.sourceFileName,
    mimeType: baseMetadata.mimeType,
    sizeBytes: Math.max(baseMetadata.sizeBytes, document.metadata.sizeBytes) + 2_048,
    pageCount: currentPageCount + 1,
    wordCount: currentWordCount + 120
  }
}

export const applyDocumentAction = (
  document: Document,
  actionKind: PlatformDocumentActionKind
): Document => {
  const operations = buildCompletedOperations(document, actionKind)

  switch (actionKind) {
    case "extract-metadata":
      return {
        ...document,
        operations,
        metadata: buildExtractedMetadata(document)
      }
    case "generate-derived-document":
      return {
        ...document,
        operations
      }
  }
}

export const applyPdfEngineActionPlaceholder = (
  document: Document,
  actionKind: PdfEngineActionKind
): Document => {
  return {
    ...document,
    operations: buildCompletedOperations(document, actionKind)
  }
}
