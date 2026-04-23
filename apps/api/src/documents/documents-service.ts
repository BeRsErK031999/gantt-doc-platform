import { randomUUID } from "node:crypto"

import {
  applyDocumentAction,
  applyPdfEngineActionPlaceholder
} from "./document-actions.js"
import {
  buildDocumentMetadata,
  buildPlannedOperations,
  buildSourceArtifact,
  isPdfEngineActionSupportedForDocument,
  isPlatformDocumentActionKind,
  resolveDocumentKindForDerivation
} from "./document.js"
import type {
  CreateDocumentInput,
  DerivedDocument,
  Document,
  DocumentActionKind,
  DocumentDerivationKind,
  DocumentDetails,
  DocumentSummary,
  PdfEngineActionKind
} from "./document.js"
import type { DocumentsStore } from "./documents-store.js"
import type { PdfEngineGateway } from "../pdf-engine/pdf-engine-gateway.js"

export type RunDocumentActionResult =
  | { kind: "updated"; document: DocumentDetails }
  | { kind: "not-found" }
  | { kind: "invalid-action"; message: string }

export type DocumentsService = {
  listDocuments: () => DocumentSummary[]
  getDocumentById: (documentId: string) => DocumentDetails | null
  createDocument: (input: CreateDocumentInput) => DocumentDetails
  runDocumentAction: (
    documentId: string,
    actionKind: DocumentActionKind
  ) => Promise<RunDocumentActionResult>
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

const resolvePdfEngineDerivationKind = (
  actionKind: PdfEngineActionKind
): DocumentDerivationKind => {
  switch (actionKind) {
    case "compress-pdf":
      return "compressed-pdf"
    case "split-pdf":
      return "split-pdf-set"
  }
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
    case "split-pdf-set":
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

export const createDocumentsService = (
  store: DocumentsStore,
  pdfEngineGateway: PdfEngineGateway
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
    runDocumentAction: async (documentId, actionKind) => {
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
        return {
          kind: "invalid-action",
          message: "PDF engine actions are only supported for PDF documents."
        }
      }

      const pdfEngineResult = await pdfEngineGateway.submitPdfAction({
        actionKind,
        documentId: document.id,
        sourceFileName: document.metadata.sourceFileName
      })
      const updatedDocument = store.updateDocument(
        applyPdfEngineActionPlaceholder(document, actionKind)
      )
      const existingDerivedDocuments = store
        .listDocuments()
        .filter((currentDocument) => {
          return currentDocument.origin?.documentId === document.id
        })
      const nextIndex = existingDerivedDocuments.length + 1

      store.createDocument(
        buildDerivedDocument({
          document,
          derivationKind: resolvePdfEngineDerivationKind(actionKind),
          engineRequestId: pdfEngineResult.engineRequestId,
          nextIndex
        })
      )

      return {
        kind: "updated",
        document: withDerivedDocuments(updatedDocument, store.listDocuments())
      }
    }
  }
}
