import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify"

import type {
  CreateDocumentInput,
  DocumentActionKind
} from "../documents/document.js"
import {
  isDocumentActionKind,
  isDocumentKind
} from "../documents/document.js"
import type { DocumentsService } from "../documents/documents-service.js"

const INVALID_DOCUMENT_PAYLOAD_MESSAGE =
  "Document payload must include a non-empty name and a valid kind."
const INVALID_DOCUMENT_ACTION_PAYLOAD_MESSAGE =
  "Document action payload must include a supported action kind."
const INVALID_DOCUMENT_UPLOAD_PAYLOAD_MESSAGE =
  "Document upload must include one file field named file."
const DOCUMENT_NOT_FOUND_MESSAGE = "Document was not found."
const DERIVED_DOCUMENT_NOT_FOUND_MESSAGE = "Derived document was not found."
const DERIVED_DOCUMENT_FILE_NOT_FOUND_MESSAGE =
  "Derived document file was not found."

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === "object" && value !== null
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

  if (!isDocumentKind(kind)) {
    return null
  }

  return {
    name,
    kind
  }
}

const parseDocumentActionKind = (value: unknown): DocumentActionKind | null => {
  if (!isRecord(value)) {
    return null
  }

  const { kind } = value

  if (!isDocumentActionKind(kind)) {
    return null
  }

  return kind
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
          reply.header("Content-Type", "application/pdf")
          reply.header(
            "Content-Disposition",
            `attachment; filename="${downloadResult.fileName}"`
          )

          return reply.send(downloadResult.contents)
        case "document-not-found":
          reply.code(404)

          return {
            message: DOCUMENT_NOT_FOUND_MESSAGE
          }
        case "derived-document-not-found":
          reply.code(404)

          return {
            message: DERIVED_DOCUMENT_NOT_FOUND_MESSAGE
          }
        case "file-not-found":
          reply.code(404)

          return {
            message: DERIVED_DOCUMENT_FILE_NOT_FOUND_MESSAGE
          }
        case "error":
          reply.code(500)

          return {
            message: `Derived document download failed: ${downloadResult.message}`
          }
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
            message: DOCUMENT_NOT_FOUND_MESSAGE
          }
        case "invalid-file":
          reply.code(400)

          return {
            message: uploadResult.message
          }
      }
    }
  )

  app.post(
    "/documents/:id/actions",
    async (
      request: FastifyRequest<{ Params: { id: string }; Body: unknown }>,
      reply: FastifyReply
    ) => {
      const actionKind = parseDocumentActionKind(request.body)

      if (actionKind === null) {
        reply.code(400)

        return {
          message: INVALID_DOCUMENT_ACTION_PAYLOAD_MESSAGE
        }
      }

      const actionResult = await documentsService.runDocumentAction(
        request.params.id,
        actionKind
      )

      switch (actionResult.kind) {
        case "updated":
          return actionResult.document
        case "not-found":
          reply.code(404)

          return {
            message: DOCUMENT_NOT_FOUND_MESSAGE
          }
        case "error":
          reply.code(actionResult.statusCode)

          return {
            message: actionResult.message
          }
      }
    }
  )
}
