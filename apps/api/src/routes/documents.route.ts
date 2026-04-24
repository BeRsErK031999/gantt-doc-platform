import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify"

import type {
  CreateDocumentInput,
  DocumentActionKind,
  MergePdfPageNumberingMode
} from "../documents/document.js"
import {
  isDocumentActionKind
} from "../documents/document.js"
import type { DocumentsService } from "../documents/documents-service.js"

const INVALID_DOCUMENT_PAYLOAD_MESSAGE =
  "Document payload must include a non-empty name and a valid kind."
const INVALID_DOCUMENT_ACTION_PAYLOAD_MESSAGE =
  "Document action payload must include a supported action kind."
const INVALID_SPLIT_PAGE_RANGES_MESSAGE =
  "Split PDF action payload must include a non-empty pageRanges string using values such as \"1\", \"1-2\", or \"1-3,5\"."
const INVALID_MERGE_ACTION_PAYLOAD_MESSAGE =
  "Merge PDF action payload must include additional sourceDocumentIds excluding the current document and may optionally include excludePageRanges and pageNumberingMode."
const INVALID_DOCUMENT_UPLOAD_PAYLOAD_MESSAGE =
  "Document upload must include one file field named file."
const DOCUMENT_NOT_FOUND_MESSAGE = "Document was not found."
const DERIVED_DOCUMENT_NOT_FOUND_MESSAGE = "Derived document was not found."
const DERIVED_DOCUMENT_FILE_NOT_FOUND_MESSAGE =
  "Derived document file was not found."

type ErrorResponseBody = {
  code: string
  details?: string
  message: string
}

type ParsedDocumentActionInput =
  | {
      kind: Exclude<DocumentActionKind, "split-pdf" | "merge-pdf">
    }
  | {
      kind: "split-pdf"
      pageRanges: string
    }
  | {
      kind: "merge-pdf"
      sourceDocumentIds: string[]
      excludePageRanges?: string
      pageNumberingMode?: MergePdfPageNumberingMode
    }

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === "object" && value !== null
}

const isCreatableDocumentKind = (value: unknown): value is CreateDocumentInput["kind"] => {
  return value === "pdf" || value === "docx"
}

const parseCreateDocumentInput = (
  value: unknown
): CreateDocumentInput | null => {
  if (!isRecord(value)) {
    return null
  }

  const { kind, name } = value

  if (typeof name !== "string" || name.trim().length === 0) {
    return null
  }

  if (!isCreatableDocumentKind(kind)) {
    return null
  }

  return {
    name,
    kind
  }
}

const isValidSplitPageRanges = (value: string): boolean => {
  return /^[\d,\-\s]+$/.test(value)
}

const isMergePdfPageNumberingMode = (
  value: unknown
): value is MergePdfPageNumberingMode => {
  return value === "none" || value === "append"
}

const normalizeOptionalPageRanges = (value: unknown): string | null | undefined => {
  if (value === undefined) {
    return undefined
  }

  if (typeof value !== "string") {
    return null
  }

  const normalizedValue = value.trim()

  if (normalizedValue.length === 0) {
    return undefined
  }

  if (!isValidSplitPageRanges(normalizedValue)) {
    return null
  }

  return normalizedValue
}

const parseDocumentActionInput = (
  value: unknown,
  currentDocumentId: string
): ParsedDocumentActionInput | null => {
  if (!isRecord(value)) {
    return null
  }

  const { kind } = value

  if (!isDocumentActionKind(kind)) {
    return null
  }

  if (kind !== "split-pdf") {
    if (kind !== "merge-pdf") {
      return {
        kind
      }
    }

    const { excludePageRanges, pageNumberingMode, sourceDocumentIds } = value

    if (
      !Array.isArray(sourceDocumentIds)
    ) {
      return null
    }

    const normalizedSourceDocumentIds: string[] = []
    const seenSourceDocumentIds = new Set<string>()

    for (const sourceDocumentId of sourceDocumentIds) {
      if (typeof sourceDocumentId !== "string") {
        return null
      }

      const normalizedSourceDocumentId = sourceDocumentId.trim()

      if (
        normalizedSourceDocumentId.length === 0 ||
        normalizedSourceDocumentId === currentDocumentId ||
        seenSourceDocumentIds.has(normalizedSourceDocumentId)
      ) {
        return null
      }

      seenSourceDocumentIds.add(normalizedSourceDocumentId)
      normalizedSourceDocumentIds.push(normalizedSourceDocumentId)
    }

    const normalizedExcludePageRanges =
      normalizeOptionalPageRanges(excludePageRanges)

    if (normalizedExcludePageRanges === null) {
      return null
    }

    if (
      pageNumberingMode !== undefined &&
      !isMergePdfPageNumberingMode(pageNumberingMode)
    ) {
      return null
    }

    return {
      kind,
      sourceDocumentIds: normalizedSourceDocumentIds,
      excludePageRanges: normalizedExcludePageRanges,
      pageNumberingMode
    }
  }

  const { pageRanges } = value

  if (typeof pageRanges !== "string") {
    return null
  }

  const normalizedPageRanges = pageRanges.trim()

  if (
    normalizedPageRanges.length === 0 ||
    !isValidSplitPageRanges(normalizedPageRanges)
  ) {
    return null
  }

  return {
    kind,
    pageRanges: normalizedPageRanges
  }
}

const buildErrorResponse = ({
  code,
  details,
  message
}: ErrorResponseBody): ErrorResponseBody => {
  return {
    code,
    details,
    message
  }
}

export const registerDocumentsRoute = (
  app: FastifyInstance,
  documentsService: DocumentsService
): void => {
  app.get("/documents", async () => documentsService.listDocuments())

  app.get(
    "/documents/:id",
    async (
      request: FastifyRequest<{ Params: { id: string } }>,
      reply: FastifyReply
    ) => {
      const document = documentsService.getDocumentById(request.params.id)

      if (document === null) {
        reply.code(404)

        return {
          code: "DOCUMENT_NOT_FOUND",
          message: DOCUMENT_NOT_FOUND_MESSAGE
        }
      }

      return document
    }
  )

  app.get(
    "/documents/:id/derived/:derivedId/download",
    async (
      request: FastifyRequest<{ Params: { derivedId: string; id: string } }>,
      reply: FastifyReply
    ) => {
      const downloadResult = await documentsService.getDerivedDocumentDownload(
        request.params.id,
        request.params.derivedId
      )

      switch (downloadResult.kind) {
        case "ready":
          reply.header("Content-Type", downloadResult.mediaType)
          reply.header(
            "Content-Disposition",
            `attachment; filename="${downloadResult.fileName}"`
          )

          return reply.send(downloadResult.contents)
        case "document-not-found":
          reply.code(404)

          return {
            code: "DOCUMENT_NOT_FOUND",
            message: DOCUMENT_NOT_FOUND_MESSAGE
          }
        case "derived-document-not-found":
          reply.code(404)

          return {
            code: "DERIVED_DOCUMENT_NOT_FOUND",
            message: DERIVED_DOCUMENT_NOT_FOUND_MESSAGE
          }
        case "file-not-found":
          reply.code(404)

          return {
            code: "DERIVED_DOCUMENT_FILE_NOT_FOUND",
            message: DERIVED_DOCUMENT_FILE_NOT_FOUND_MESSAGE
          }
        case "error":
          reply.code(500)
          request.log.error(
            {
              code: "DERIVED_DOCUMENT_DOWNLOAD_FAILED",
              details: downloadResult.message,
              derivedDocumentId: request.params.derivedId,
              documentId: request.params.id
            },
            "Derived document download failed."
          )

          return buildErrorResponse({
            code: "DERIVED_DOCUMENT_DOWNLOAD_FAILED",
            details: downloadResult.message,
            message: "Derived document download failed."
          })
      }
    }
  )

  app.post(
    "/documents",
    async (
      request: FastifyRequest<{ Body: unknown }>,
      reply: FastifyReply
    ) => {
      const input = parseCreateDocumentInput(request.body)

      if (input === null) {
        reply.code(400)

        return {
          code: "INVALID_DOCUMENT_PAYLOAD",
          message: INVALID_DOCUMENT_PAYLOAD_MESSAGE
        }
      }

      reply.code(201)

      return documentsService.createDocument(input)
    }
  )

  app.post(
    "/documents/:id/upload",
    async (
      request: FastifyRequest<{ Params: { id: string } }>,
      reply: FastifyReply
    ) => {
      const file = await request.file({
        limits: {
          files: 1,
          parts: 1
        }
      })

      if (file === undefined || file.fieldname !== "file") {
        reply.code(400)

        return {
          code: "INVALID_DOCUMENT_UPLOAD_PAYLOAD",
          message: INVALID_DOCUMENT_UPLOAD_PAYLOAD_MESSAGE
        }
      }

      const uploadResult = await documentsService.uploadDocumentSourceFile(
        request.params.id,
        {
          contents: await file.toBuffer(),
          fileName: file.filename,
          mimeType: file.mimetype
        }
      )

      switch (uploadResult.kind) {
        case "updated":
          return uploadResult.document
        case "not-found":
          reply.code(404)

          return {
            code: "DOCUMENT_NOT_FOUND",
            message: DOCUMENT_NOT_FOUND_MESSAGE
          }
        case "invalid-file":
          reply.code(400)

          return buildErrorResponse({
            code: "INVALID_DOCUMENT_UPLOAD_FILE",
            message: uploadResult.message
          })
      }
    }
  )

  app.post(
    "/documents/:id/actions",
    async (
      request: FastifyRequest<{ Params: { id: string }; Body: unknown }>,
      reply: FastifyReply
    ) => {
      const actionInput = parseDocumentActionInput(
        request.body,
        request.params.id
      )

      if (actionInput === null) {
        reply.code(400)

      if (
        isRecord(request.body) &&
        request.body.kind === "split-pdf"
      ) {
          return {
            code: "INVALID_DOCUMENT_ACTION_PAYLOAD",
          message: INVALID_SPLIT_PAGE_RANGES_MESSAGE
        }
      }

      if (
        isRecord(request.body) &&
        request.body.kind === "merge-pdf"
      ) {
        return {
          code: "INVALID_DOCUMENT_ACTION_PAYLOAD",
          message: INVALID_MERGE_ACTION_PAYLOAD_MESSAGE
        }
      }

      return {
          code: "INVALID_DOCUMENT_ACTION_PAYLOAD",
          message: INVALID_DOCUMENT_ACTION_PAYLOAD_MESSAGE
        }
      }

      const actionResult = await documentsService.runDocumentAction(
        request.params.id,
        actionInput
      )

      switch (actionResult.kind) {
        case "updated":
          return actionResult.document
        case "not-found":
          reply.code(404)

          return {
            code: "DOCUMENT_NOT_FOUND",
            message: DOCUMENT_NOT_FOUND_MESSAGE
          }
        case "error":
          reply.code(actionResult.statusCode)
          request.log.error(
            {
              actionKind: actionInput.kind,
              code: actionResult.code,
              details: actionResult.details,
              documentId: request.params.id,
              statusCode: actionResult.statusCode
            },
            "Document action failed."
          )

          return buildErrorResponse({
            code: actionResult.code,
            details: actionResult.details,
            message: actionResult.message
          })
      }
    }
  )
}
