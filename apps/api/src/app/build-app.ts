import Fastify from "fastify"
import type { FastifyInstance } from "fastify"

import { createDocumentsService } from "../documents/documents-service.js"
import { createFileBackedDocumentsStore } from "../documents/documents-store.js"
import { createStubPdfEngineGateway } from "../pdf-engine/pdf-engine-gateway.js"
import { registerHealthRoute } from "../routes/health.route.js"
import { registerDocumentsRoute } from "../routes/documents.route.js"

export const buildApp = (): FastifyInstance => {
  const app = Fastify()
  const documentsStore = createFileBackedDocumentsStore()
  const pdfEngineGateway = createStubPdfEngineGateway()
  const documentsService = createDocumentsService(
    documentsStore,
    pdfEngineGateway
  )

  registerHealthRoute(app)
  registerDocumentsRoute(app, documentsService)

  return app
}
