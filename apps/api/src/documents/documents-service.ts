import { randomUUID } from "node:crypto"

import { applyDocumentAction } from "./document-actions.js"
import {
  attachUploadedDocumentSource,
  buildDocumentMetadata,
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
  DocumentOperation,
  DocumentSummary,
  MergePdfActionInput,
  MergePdfPageNumberingMode
} from "./document.js"
import type { DocumentActionKind, PdfEngineActionKind } from "./document.js"
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
      kind: Exclude<DocumentActionKind, "split-pdf" | "merge-pdf">
    }
  | {
      kind: "split-pdf"
      pageRanges: string
    }
  | MergePdfActionInput

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

type MergePdfSourceDocument = {
  document: Document
  sourceFilePath: string
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

const buildDocumentOperation = (
  actionKind: PdfEngineActionKind
): DocumentOperation => {
  return {
    id: randomUUID(),
    kind: actionKind,
    status: "completed",
    createdAt: new Date().toISOString(),
    finishedAt: null
  }
}

const finalizeDocumentOperation = ({
  operation,
  errorCode,
  errorMessage,
  status
}: {
  operation: DocumentOperation
  errorCode?: string
  errorMessage?: string
  status: DocumentOperation["status"]
}): DocumentOperation => {
  return {
    ...operation,
    status,
    finishedAt: new Date().toISOString(),
    errorCode,
    errorMessage
  }
}

const prependDocumentOperation = (
  document: Document,
  operation: DocumentOperation
): Document => {
  return {
    ...document,
    operations: [operation, ...document.operations]
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

const buildDerivedDocumentName = ({
  document,
  derivationKind,
  nextIndex,
  engineRequestId
}: {
  document: Document
  derivationKind: DocumentDerivationKind
  engineRequestId: string | null
  nextIndex: number
}): string => {
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
    case "merge-pdf":
      return `${trimmedName} merged PDF placeholder (stub ${engineRequestId ?? "local"})`
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
  const documentName = buildDerivedDocumentName({
    document,
    derivationKind,
    engineRequestId,
    nextIndex
  })
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
    operations: [],
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
  derivationKind: Extract<
    DocumentDerivationKind,
    "compressed-pdf" | "split-pdf" | "merge-pdf"
  >
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
      : derivationKind === "split-pdf"
        ? `${document.name.trim()} split PDF`
        : `${document.name.trim()} merged PDF`

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

const getOperationErrorMessage = (
  actionKind: PdfEngineActionKind,
  errorCode: string
): string => {
  if (actionKind === "merge-pdf") {
    switch (errorCode) {
      case "MERGE_SOURCE_DOCUMENTS_REQUIRED":
        return "Merge PDF requires at least one additional uploaded PDF source."
      case "MERGE_SOURCE_DOCUMENT_NOT_FOUND":
        return "One of the merge source documents was not found."
      case "MERGE_SOURCE_DOCUMENT_UNSUPPORTED_KIND":
        return "Every merge source must be a PDF document."
      case "MERGE_SOURCE_FILE_NOT_UPLOADED":
        return "Every merge source must have an uploaded source PDF."
      case "MERGE_SOURCE_FILE_MISSING":
        return "One of the uploaded merge source PDFs is missing on disk."
      default:
        return "Merged PDF action failed."
    }
  }

  return actionKind === "split-pdf"
    ? "Split PDF action failed."
    : "Compressed PDF action failed."
}

const resolveSourceFilePath = async (
  document: Document,
  localFileStorage: LocalDocumentFileStorage,
  errorCodes: {
    missing: string
    pathInvalid: string
    storageUnavailable: string
    notUploaded: string
  },
  actionErrorMessage: string
): Promise<
  | {
      kind: "ready"
      absolutePath: string
    }
  | Extract<RunDocumentActionResult, { kind: "error" }>
> => {
  if (document.sourceArtifact.status !== "uploaded") {
    return createActionError({
      code: errorCodes.notUploaded,
      message: actionErrorMessage,
      statusCode: 400
    })
  }

  if (
    document.sourceArtifact.storageKind !== "local-file" ||
    document.sourceArtifact.path === undefined
  ) {
    return createActionError({
      code: errorCodes.storageUnavailable,
      message:
        "Source artifact is not backed by a local file path and cannot be sent to the PDF engine.",
      statusCode: 400
    })
  }

  const sourceFilePath = document.sourceArtifact.path

  if (!(await localFileStorage.storagePathExists(sourceFilePath))) {
    return createActionError({
      code: errorCodes.missing,
      details: `Missing storage path: ${sourceFilePath}`,
      message: "Uploaded source PDF could not be found in local storage.",
      statusCode: 400
    })
  }

  try {
    return {
      kind: "ready",
      absolutePath: localFileStorage.resolveStorageAbsolutePath(sourceFilePath)
    }
  } catch (error) {
    return createActionError({
      code: errorCodes.pathInvalid,
      details: error instanceof Error ? error.message : "Unknown storage path error.",
      message: "Source file path is invalid and cannot be resolved.",
      statusCode: 400
    })
  }
}

const validateMergeSourceDocuments = async ({
  rootDocument,
  input,
  localFileStorage,
  store
}: {
  rootDocument: Document
  input: MergePdfActionInput
  localFileStorage: LocalDocumentFileStorage
  store: DocumentsStore
}): Promise<
  | {
      kind: "ready"
      sources: MergePdfSourceDocument[]
    }
  | Extract<RunDocumentActionResult, { kind: "error" }>
> => {
  if (input.sourceDocumentIds.length === 0) {
    return createActionError({
      code: "MERGE_SOURCE_DOCUMENTS_REQUIRED",
      message:
        "Merge PDF requires at least one additional source document because the current document is always the first merge source.",
      statusCode: 400
    })
  }

  const orderedSourceDocuments = [
    rootDocument,
    ...input.sourceDocumentIds.map((sourceDocumentId) => {
      return store.getDocumentById(sourceDocumentId)
    })
  ]

  const sourceDocuments: MergePdfSourceDocument[] = []

  for (const sourceDocument of orderedSourceDocuments) {
    if (sourceDocument === null) {
      return createActionError({
        code: "MERGE_SOURCE_DOCUMENT_NOT_FOUND",
        message: "Merge PDF source document was not found.",
        statusCode: 400
      })
    }

    if (sourceDocument.kind !== "pdf") {
      return createActionError({
        code: "MERGE_SOURCE_DOCUMENT_UNSUPPORTED_KIND",
        message:
          "Merge PDF only supports PDF source documents. DOCX and ZIP sources are not allowed.",
        statusCode: 400
      })
    }

    const resolvedSourceFilePath = await resolveSourceFilePath(
      sourceDocument,
      localFileStorage,
      {
        missing: "MERGE_SOURCE_FILE_MISSING",
        pathInvalid: "MERGE_SOURCE_FILE_MISSING",
        storageUnavailable: "MERGE_SOURCE_FILE_NOT_UPLOADED",
        notUploaded: "MERGE_SOURCE_FILE_NOT_UPLOADED"
      },
      "Every merge source must have an uploaded source PDF before running merge-pdf."
    )

    if (resolvedSourceFilePath.kind !== "ready") {
      return resolvedSourceFilePath
    }

    sourceDocuments.push({
      document: sourceDocument,
      sourceFilePath: resolvedSourceFilePath.absolutePath
    })
  }

  return {
    kind: "ready",
    sources: sourceDocuments
  }
}

const getMergePageNumberingMode = (
  input: MergePdfActionInput
): MergePdfPageNumberingMode => {
  return input.pageNumberingMode ?? "none"
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
        operations: [],
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

      const operation = buildDocumentOperation(actionKind)
      const storeFailedOperation = (
        errorResult: Extract<RunDocumentActionResult, { kind: "error" }>
      ): Extract<RunDocumentActionResult, { kind: "error" }> => {
        store.updateDocument(
          prependDocumentOperation(
            document,
            finalizeDocumentOperation({
              operation,
              errorCode: errorResult.code,
              errorMessage: errorResult.message,
              status: "failed"
            })
          )
        )

        return errorResult
      }

      if (!isPdfEngineActionSupportedForDocument(document.kind, actionKind)) {
        return storeFailedOperation(
          createActionError({
            code: "PDF_ACTION_UNSUPPORTED_DOCUMENT_KIND",
            message: "PDF engine actions are only supported for PDF documents.",
            statusCode: 400
          })
        )
      }

      if (actionKind === "merge-pdf") {
        const validatedSources = await validateMergeSourceDocuments({
          rootDocument: document,
          input,
          localFileStorage,
          store
        })

        if (validatedSources.kind !== "ready") {
          return storeFailedOperation(validatedSources)
        }

        const pdfEngineResult = await pdfEngineGateway.submitPdfAction({
          actionKind,
          documentId: document.id,
          documentName: document.name,
          sourceDocumentIds: input.sourceDocumentIds,
          excludePageRanges: input.excludePageRanges,
          pageNumberingMode: getMergePageNumberingMode(input),
          sourceDocuments: validatedSources.sources.map((source) => {
            return {
              documentId: source.document.id,
              documentName: source.document.name,
              sourceFileName: source.document.metadata.sourceFileName,
              sourceFilePath: source.sourceFilePath
            }
          })
        })

        if (pdfEngineResult.kind === "error") {
          return storeFailedOperation(pdfEngineResult)
        }

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
          return storeFailedOperation(
            createActionError({
              code: "LOCAL_DERIVED_FILE_SAVE_FAILED",
              details: error instanceof Error ? error.message : "Unknown local storage error.",
              message: "Merged PDF was created but could not be saved locally.",
              statusCode: 500
            })
          )
        }

        const updatedDocument = store.updateDocument(
          prependDocumentOperation(
            document,
            finalizeDocumentOperation({
              operation,
              status: "completed"
            })
          )
        )

        store.createDocument(
          buildPdfEngineDerivedDocument({
            derivationKind: "merge-pdf",
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

      const resolvedSourceFilePath = await resolveSourceFilePath(
        document,
        localFileStorage,
        {
          missing: "SOURCE_FILE_MISSING",
          pathInvalid: "SOURCE_FILE_PATH_INVALID",
          storageUnavailable: "SOURCE_FILE_STORAGE_UNAVAILABLE",
          notUploaded: "SOURCE_FILE_NOT_UPLOADED"
        },
        actionKind === "split-pdf"
          ? "Source file is not uploaded yet. Upload a local PDF file before running split-pdf."
          : "Source file is not uploaded yet. Upload a local PDF file before running compress-pdf."
      )

      if (resolvedSourceFilePath.kind !== "ready") {
        return storeFailedOperation(resolvedSourceFilePath)
      }

      const pdfEngineResult = await pdfEngineGateway.submitPdfAction({
        actionKind,
        documentId: document.id,
        documentName: document.name,
        pageRanges: input.kind === "split-pdf" ? input.pageRanges : undefined,
        sourceFileName: document.metadata.sourceFileName,
        sourceFilePath: resolvedSourceFilePath.absolutePath
      })

      if (pdfEngineResult.kind === "error") {
        return storeFailedOperation(pdfEngineResult)
      }

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
        return storeFailedOperation(
          createActionError({
            code: "LOCAL_DERIVED_FILE_SAVE_FAILED",
            details: error instanceof Error ? error.message : "Unknown local storage error.",
            message: getOperationErrorMessage(actionKind, "LOCAL_DERIVED_FILE_SAVE_FAILED"),
            statusCode: 500
          })
        )
      }

      const updatedDocument = store.updateDocument(
        prependDocumentOperation(
          document,
          finalizeDocumentOperation({
            operation,
            status: "completed"
          })
        )
      )

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
