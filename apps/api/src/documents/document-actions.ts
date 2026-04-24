import { buildDocumentMetadata } from "./document.js"
import type {
  Document,
  DocumentMetadata,
  PlatformDocumentActionKind
} from "./document.js"

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
  switch (actionKind) {
    case "extract-metadata":
      return {
        ...document,
        metadata: buildExtractedMetadata(document)
      }
    case "generate-derived-document":
      return {
        ...document
      }
  }
}
