import type {
  DocumentDerivationKind,
  DocumentKind,
  DocumentStatus,
  DocumentOperation,
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
