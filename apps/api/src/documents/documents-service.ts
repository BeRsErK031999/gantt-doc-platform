import { randomUUID } from "node:crypto"

import {
  applyDocumentAction,
  applyPdfEngineActionPlaceholder
} from "./document-actions.js"
import {
  attachUploadedDocumentSource,
  buildDocumentMetadata,
  buildPlannedOperations,
  buildSourceArtifact,
  isPdfEngineActionSupportedForDocument,
  isPlatformDocumentActionKind,
  resolveDocumentKindFromSourceFile,
  resolveDocumentKindForDerivation
} from "./document.js"
import type {
  CreateDocumentInput,
  DerivedDocument,
  Document,
  DocumentDerivationKind,
  DocumentDetails,
  DocumentKind,
  DocumentSummary
} from "./document.js"
import type { DocumentActionKind } from "./document.js"
import type { DocumentsStore } from "./documents-store.js"
import type { LocalDocumentFileStorage } from "./local-file-storage.js"
import type { PdfEngineGateway } from "../pdf-engine/pdf-engine-gateway.js"

export type RunDocumentActionResult =
  | { kind: "updated"; document: DocumentDetails }
  | { kind: "not-found" }
  | {
      code: string
      details?: string
      kind: "error"
      message: string
      statusCode: 400 | 500 | 502 | 503
    }

export type RunDocumentActionInput =
  | {
      kind: Exclude<DocumentActionKind, "split-pdf">
    }
  | {
      kind: "split-pdf"
      pageRanges: string
    }

export type UploadDocumentSourceFileInput = {
  contents: Uint8Array
  fileName: string
  mimeType: string
}

export type UploadDocumentSourceFileResult =
  | { kind: "updated"; document: DocumentDetails }
  | { kind: "not-found" }
  | { kind: "invalid-file"; message: string }

export type DocumentsService = {
  listDocuments: () => DocumentSummary[]
  getDocumentById: (documentId: string) => DocumentDetails | null
  createDocument: (input: CreateDocumentInput) => DocumentDetails
  getDerivedDocumentDownload: (
    documentId: string,
    derivedDocumentId: string
  ) => Promise<
    | {
        kind: "ready"
        contents: Uint8Array
        fileName: string
        mediaType: string
      }
    | { kind: "document-not-found" }
    | { kind: "derived-document-not-found" }
    | { kind: "file-not-found" }
    | { kind: "error"; message: string }
  >
  uploadDocumentSourceFile: (
    documentId: string,
    input: UploadDocumentSourceFileInput
  ) => Promise<UploadDocumentSourceFileResult>
  runDocumentAction: (
    documentId: string,
    input: RunDocumentActionInput
  ) => Promise<RunDocumentActionResult>
}

const createActionError = ({
  code,
  details,
  message,
  statusCode
}: {
  code: string
  details?: string
  message: string
  statusCode: 400 | 500 | 502 | 503
}): Extract<RunDocumentActionResult, { kind: "error" }> => {
  return {
    kind: "error",
    code,
    message,
    details,
    statusCode
  }
}

const toDocumentSummary = (document: Document): DocumentSummary => {
  return {
    id: document.id,
    name: document.name,
    kind: document.kind,
    status: document.status,
    createdAt: document.createdAt
  }
}

const toDerivedDocument = (document: Document): DerivedDocument | null => {
  if (document.origin === null) {
    return null
  }

  return {
    id: document.id,
    originDocumentId: document.origin.documentId,
    relationshipKind: document.origin.relationshipKind,
    name: document.name,
    kind: document.kind,
    status: document.status,
    createdAt: document.createdAt,
    derivationKind: document.origin.derivationKind
  }
}

const withDerivedDocuments = (
  document: Document,
  documents: Document[]
): Document => {
  const derivedDocuments = documents
    .map((candidateDocument) => toDerivedDocument(candidateDocument))
    .filter((candidateDocument): candidateDocument is DerivedDocument => {
      return (
        candidateDocument !== null &&
        candidateDocument.originDocumentId === document.id
      )
    })

  return {
    ...document,
    derivedDocuments
  }
}

const resolveGeneratedDerivationKind = (
  document: Document,
  nextIndex: number
): DocumentDerivationKind => {
  if (document.kind === "docx" && nextIndex % 2 === 1) {
    return "converted-pdf"
  }

  return "document-summary"
}

const buildDerivedDocumentName = (
  document: Document,
  derivationKind: DocumentDerivationKind,
  nextIndex: number,
  engineRequestId: string | null
): string => {
  const trimmedName = document.name.trim()

  switch (derivationKind) {
    case "converted-pdf":
      return `${trimmedName} derived PDF ${nextIndex}`
    case "document-summary":
      return `${trimmedName} summary ${nextIndex}`
    case "compressed-pdf":
      return `${trimmedName} compressed PDF placeholder (stub ${engineRequestId ?? "local"})`
    case "split-pdf":
      return `${trimmedName} split PDF placeholder (stub ${engineRequestId ?? "local"})`
  }
}

const buildDerivedDocument = ({
  document,
  derivationKind,
  engineRequestId,
  nextIndex
}: {
  document: Document
  derivationKind: DocumentDerivationKind
  engineRequestId: string | null
  nextIndex: number
}): Document => {
  const documentId = randomUUID()
  const documentName = buildDerivedDocumentName(
    document,
    derivationKind,
    nextIndex,
    engineRequestId
  )
  const documentKind = resolveDocumentKindForDerivation(derivationKind)
  const createdAt = new Date().toISOString()

  return {
    id: documentId,
    name: documentName,
    kind: documentKind,
    status: "draft",
    createdAt,
    origin: {
      documentId: document.id,
      relationshipKind: "derived-from",
      derivationKind
    },
    sourceArtifact: buildSourceArtifact(
      documentId,
      documentName,
      documentKind,
      createdAt
    ),
    operations: buildPlannedOperations(documentId, documentKind),
    metadata: buildDocumentMetadata(documentName, documentKind),
    derivedDocuments: []
  }
}

const getDocumentKindFromMediaType = (mediaType: string): DocumentKind => {
  if (mediaType === "application/zip") {
    return "zip"
  }

  return "pdf"
}

const buildPdfEngineDerivedDocument = ({
  derivationKind,
  document,
  derivedDocumentId,
  fileName,
  mediaType,
  savedFilePath,
  sizeBytes
}: {
  derivationKind: Extract<DocumentDerivationKind, "compressed-pdf" | "split-pdf">
  derivedDocumentId: string
  document: Document
  fileName: string
  mediaType: string
  savedFilePath: string
  sizeBytes: number
}): Document => {
  const createdAt = new Date().toISOString()
  const documentKind = getDocumentKindFromMediaType(mediaType)
  const documentName =
    derivationKind === "compressed-pdf"
      ? `${document.name.trim()} compressed PDF`
      : `${document.name.trim()} split PDF`

  return {
    id: derivedDocumentId,
    name: documentName,
    kind: documentKind,
    status: "ready",
    createdAt,
    origin: {
      documentId: document.id,
      relationshipKind: "derived-from",
      derivationKind
    },
    sourceArtifact: {
      id: `${derivedDocumentId}-source-artifact-1`,
      documentId: derivedDocumentId,
      fileName,
      kind: documentKind,
      storageKind: "local-file",
      status: "uploaded",
      createdAt,
      path: savedFilePath
    },
    operations: [],
    metadata: {
      sourceFileName: fileName,
      mimeType: mediaType,
      sizeBytes,
      pageCount: null,
      wordCount: null
    },
    derivedDocuments: []
  }
}

export const createDocumentsService = (
  store: DocumentsStore,
  pdfEngineGateway: PdfEngineGateway,
  localFileStorage: LocalDocumentFileStorage
): DocumentsService => {
  return {
    listDocuments: () => {
      return store.listDocuments().map((document) => toDocumentSummary(document))
    },
    getDocumentById: (documentId) => {
      const document = store.getDocumentById(documentId)

      if (document === null) {
        return null
      }

      return withDerivedDocuments(document, store.listDocuments())
    },
    createDocument: (input) => {
      const documentId = randomUUID()
      const documentName = input.name.trim()
      const createdAt = new Date().toISOString()
      const document: Document = {
        id: documentId,
        name: documentName,
        kind: input.kind,
        status: "draft",
        createdAt,
        origin: null,
        sourceArtifact: buildSourceArtifact(
          documentId,
          documentName,
          input.kind,
          createdAt
        ),
        operations: buildPlannedOperations(documentId, input.kind),
        metadata: buildDocumentMetadata(documentName, input.kind),
        derivedDocuments: []
      }

      return withDerivedDocuments(store.createDocument(document), store.listDocuments())
    },
    getDerivedDocumentDownload: async (documentId, derivedDocumentId) => {
      const document = store.getDocumentById(documentId)

      if (document === null) {
        return {
          kind: "document-not-found"
        }
      }

      const derivedDocument = store.getDocumentById(derivedDocumentId)

      if (
        derivedDocument === null ||
        derivedDocument.origin?.documentId !== document.id
      ) {
        return {
          kind: "derived-document-not-found"
        }
      }

      if (
        derivedDocument.sourceArtifact.storageKind !== "local-file" ||
        derivedDocument.sourceArtifact.path === undefined
      ) {
        return {
          kind: "file-not-found"
        }
      }

      const storagePath = derivedDocument.sourceArtifact.path

      if (!(await localFileStorage.storagePathExists(storagePath))) {
        return {
          kind: "file-not-found"
        }
      }

      try {
        return {
          kind: "ready",
          contents: await localFileStorage.readStorageFile(storagePath),
          fileName: derivedDocument.sourceArtifact.fileName,
          mediaType: derivedDocument.metadata.mimeType
        }
      } catch (error) {
        return {
          kind: "error",
          message:
            error instanceof Error
              ? error.message
              : "Unknown local storage read error."
        }
      }
    },
    uploadDocumentSourceFile: async (documentId, input) => {
      const document = store.getDocumentById(documentId)

      if (document === null) {
        return {
          kind: "not-found"
        }
      }

      const sourceKind = resolveDocumentKindFromSourceFile({
        fileName: input.fileName,
        mimeType: input.mimeType
      })

      if (sourceKind === null) {
        return {
          kind: "invalid-file",
          message: "Only PDF and DOCX files with matching MIME types are supported."
        }
      }

      if (sourceKind !== document.kind) {
        return {
          kind: "invalid-file",
          message: "Uploaded file type must match the document kind."
        }
      }

      const savedFile = await localFileStorage.saveDocumentSourceFile({
        contents: input.contents,
        documentId: document.id,
        kind: sourceKind
      })
      const updatedDocument = store.updateDocument(
        attachUploadedDocumentSource(document, {
          fileName: input.fileName,
          kind: sourceKind,
          mimeType: input.mimeType,
          path: savedFile.path,
          sizeBytes: savedFile.sizeBytes
        })
      )

      return {
        kind: "updated",
        document: withDerivedDocuments(updatedDocument, store.listDocuments())
      }
    },
    runDocumentAction: async (documentId, input) => {
      const actionKind = input.kind
      const document = store.getDocumentById(documentId)

      if (document === null) {
        return {
          kind: "not-found"
        }
      }

      if (isPlatformDocumentActionKind(actionKind)) {
        const updatedDocument = store.updateDocument(
          applyDocumentAction(document, actionKind)
        )

        if (actionKind === "generate-derived-document") {
          const existingDerivedDocuments = store
            .listDocuments()
            .filter((currentDocument) => {
              return currentDocument.origin?.documentId === document.id
            })
          const nextIndex = existingDerivedDocuments.length + 1

          store.createDocument(
            buildDerivedDocument({
              document,
              derivationKind: resolveGeneratedDerivationKind(document, nextIndex),
              engineRequestId: null,
              nextIndex
            })
          )
        }

        return {
          kind: "updated",
          document: withDerivedDocuments(updatedDocument, store.listDocuments())
        }
      }

      if (!isPdfEngineActionSupportedForDocument(document.kind, actionKind)) {
        return createActionError({
          code: "PDF_ACTION_UNSUPPORTED_DOCUMENT_KIND",
          message: "PDF engine actions are only supported for PDF documents.",
          statusCode: 400
        })
      }

      if (document.sourceArtifact.status !== "uploaded") {
        return createActionError({
          code: "SOURCE_FILE_NOT_UPLOADED",
          message:
            actionKind === "split-pdf"
              ? "Source file is not uploaded yet. Upload a local PDF file before running split-pdf."
              : "Source file is not uploaded yet. Upload a local PDF file before running compress-pdf.",
          statusCode: 400
        })
      }

      if (
        document.sourceArtifact.storageKind !== "local-file" ||
        document.sourceArtifact.path === undefined
      ) {
        return createActionError({
          code: "SOURCE_FILE_STORAGE_UNAVAILABLE",
          message:
            "Source artifact is not backed by a local file path and cannot be sent to the PDF engine.",
          statusCode: 400
        })
      }

      const sourceFilePath = document.sourceArtifact.path

      if (!(await localFileStorage.storagePathExists(sourceFilePath))) {
        return createActionError({
          code: "SOURCE_FILE_MISSING",
          details: `Missing storage path: ${sourceFilePath}`,
          message:
            "Uploaded source PDF could not be found in local storage.",
          statusCode: 400
        })
      }

      let absoluteSourceFilePath: string

      try {
        absoluteSourceFilePath =
          localFileStorage.resolveStorageAbsolutePath(sourceFilePath)
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unknown storage path error."

        return createActionError({
          code: "SOURCE_FILE_PATH_INVALID",
          details: message,
          message: "Source file path is invalid and cannot be resolved.",
          statusCode: 400
        })
      }

      const pdfEngineResult = await pdfEngineGateway.submitPdfAction({
        actionKind,
        documentId: document.id,
        documentName: document.name,
        pageRanges: input.kind === "split-pdf" ? input.pageRanges : undefined,
        sourceFileName: document.metadata.sourceFileName,
        sourceFilePath: absoluteSourceFilePath
      })

      if (pdfEngineResult.kind === "error") {
        return pdfEngineResult
      }

      const updatedDocument = store.updateDocument(
        applyPdfEngineActionPlaceholder(document, actionKind)
      )
      const derivedDocumentId = randomUUID()
      let savedDerivedFilePath: string

      try {
        savedDerivedFilePath = (
          await localFileStorage.saveDerivedDocumentFile({
            contents: pdfEngineResult.resultFileContents,
            derivedDocumentId,
            fileName: pdfEngineResult.resultFileName,
            originDocumentId: document.id
          })
        ).path
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unknown local storage error."

        return createActionError({
          code: "LOCAL_DERIVED_FILE_SAVE_FAILED",
          details: message,
          message:
            actionKind === "split-pdf"
              ? "Split PDF result was created but could not be saved locally."
              : "Compressed PDF was created but could not be saved locally.",
          statusCode: 500
        })
      }

      store.createDocument(
        buildPdfEngineDerivedDocument({
          derivationKind:
            actionKind === "split-pdf" ? "split-pdf" : "compressed-pdf",
          document,
          derivedDocumentId,
          fileName: pdfEngineResult.resultFileName,
          mediaType: pdfEngineResult.mediaType,
          savedFilePath: savedDerivedFilePath,
          sizeBytes: pdfEngineResult.resultFileContents.byteLength
        })
      )

      return {
        kind: "updated",
        document: withDerivedDocuments(updatedDocument, store.listDocuments())
      }
    }
  }
}
