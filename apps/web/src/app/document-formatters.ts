import type {
  DocumentDerivationKind,
  DocumentKind,
  DocumentStatus,
  DocumentOperation,
  DocumentOperationInput,
  SourceArtifact
} from "./documents-api"

const formatCount = (value: number, unitLabel: string): string => {
  return `${value.toLocaleString("en-US")} ${unitLabel}`
}

export const formatCreatedAt = (value: string): string => {
  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return value
  }

  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(date)
}

export const formatDocumentKind = (value: DocumentKind): string => {
  if (value === "docx") {
    return "DOCX"
  }

  return value.toUpperCase()
}

export const formatDocumentStatus = (value: DocumentStatus): string => {
  switch (value) {
    case "draft":
      return "Draft"
    case "uploaded":
      return "Uploaded"
    case "ready":
      return "Ready"
  }
}

export const formatSourceArtifactStorageKind = (
  value: SourceArtifact["storageKind"]
): string => {
  switch (value) {
    case "local-placeholder":
      return "Local placeholder"
    case "local-file":
      return "Local file"
  }
}

export const formatSourceArtifactStatus = (
  value: SourceArtifact["status"]
): string => {
  switch (value) {
    case "registered":
      return "Registered"
    case "uploaded":
      return "Uploaded"
  }
}

export const formatOperationKind = (value: DocumentOperation["kind"]): string => {
  switch (value) {
    case "compress-pdf":
      return "Compress PDF"
    case "split-pdf":
      return "Split PDF"
    case "merge-pdf":
      return "Merge PDF"
  }
}

export const formatOperationBoundary = (
  value: DocumentOperation["kind"]
): string => {
  switch (value) {
    case "compress-pdf":
    case "split-pdf":
    case "merge-pdf":
      return "PDF engine"
  }
}

export const formatOperationStatus = (
  value: DocumentOperation["status"]
): string => {
  switch (value) {
    case "completed":
      return "Completed"
    case "failed":
      return "Failed"
  }
}

export const formatFinishedAt = (value: string | null): string => {
  if (value === null) {
    return "Not finished"
  }

  return formatCreatedAt(value)
}

export const formatDerivationKind = (value: DocumentDerivationKind): string => {
  switch (value) {
    case "converted-pdf":
      return "Converted PDF"
    case "document-summary":
      return "Document summary"
    case "compressed-pdf":
      return "Compressed PDF"
    case "split-pdf":
      return "Split PDF"
    case "merge-pdf":
      return "Merged PDF"
  }
}

export const formatSizeBytes = (value: number): string => {
  if (value < 1024) {
    return formatCount(value, "bytes")
  }

  if (value < 1024 * 1024) {
    return `${(value / 1024).toFixed(1)} KB`
  }

  return `${(value / (1024 * 1024)).toFixed(1)} MB`
}

export const formatPageCount = (value: number | null): string => {
  if (value === null) {
    return "Not available"
  }

  return formatCount(value, value === 1 ? "page" : "pages")
}

export const formatWordCount = (value: number | null): string => {
  if (value === null) {
    return "Not available"
  }

  return formatCount(value, value === 1 ? "word" : "words")
}

export const formatOperationRetrySummary = (
  input: DocumentOperationInput | undefined
): string => {
  if (input === undefined) {
    return "Retry unavailable for legacy history entries without saved input."
  }

  if (input.kind === "split-pdf") {
    return `Retry with page ranges ${input.pageRanges}`
  }

  if (input.kind === "merge-pdf") {
    return `Retry merge with ${input.sourceDocumentIds.length + 1} PDFs`
  }

  return "Retry compression"
}

export const formatOperationErrorMessage = ({
  code,
  fallbackMessage
}: {
  code?: string
  fallbackMessage: string
}): string => {
  switch (code) {
    case "PDF_ENGINE_AUTH_INVALID":
      return "The PDF engine token was rejected. Check local API token configuration and try again."
    case "PDF_ENGINE_UNAVAILABLE":
      return "The PDF engine is unavailable right now. Make sure the local engine is running and reachable."
    case "PDF_ENGINE_MERGE_FAILED":
      return "The merge request reached the PDF engine, but the engine could not complete it."
    case "PDF_ENGINE_SPLIT_FAILED":
      return "The split request reached the PDF engine, but the engine could not complete it."
    case "PDF_ENGINE_EXECUTION_FAILED":
      return "The PDF engine could not execute the requested action."
    case "PDF_ENGINE_RESULT_DOWNLOAD_FAILED":
      return "The processed file was created, but the platform could not download it from the engine."
    case "SOURCE_FILE_NOT_UPLOADED":
      return "Upload the source PDF before running this action."
    case "SOURCE_FILE_MISSING":
      return "The uploaded source PDF is missing from local storage."
    case "MERGE_SOURCE_DOCUMENTS_REQUIRED":
      return "Merge needs at least two uploaded PDFs in the current order."
    case "MERGE_SOURCE_DOCUMENT_NOT_FOUND":
      return "One of the merge source documents no longer exists in local history."
    case "MERGE_SOURCE_DOCUMENT_UNSUPPORTED_KIND":
      return "Merge can only use PDF source documents."
    case "MERGE_SOURCE_FILE_NOT_UPLOADED":
      return "Every merge source needs an uploaded PDF before merge can start."
    case "MERGE_SOURCE_FILE_MISSING":
      return "One of the uploaded merge source PDFs is missing from local storage."
    case "LOCAL_DERIVED_FILE_SAVE_FAILED":
      return "The file was processed, but the platform could not save the result locally."
    default:
      return fallbackMessage
  }
}
