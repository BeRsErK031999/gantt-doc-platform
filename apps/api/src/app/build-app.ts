import fastifyMultipart from "@fastify/multipart"
import Fastify from "fastify"
import type { FastifyInstance } from "fastify"

import { createDocumentsService } from "../documents/documents-service.js"
import { createFileBackedDocumentsStore } from "../documents/documents-store.js"
import { createLocalDocumentFileStorage } from "../documents/local-file-storage.js"
import { createHttpPdfEngineGateway } from "../pdf-engine/pdf-engine-gateway.js"
import { registerHealthRoute } from "../routes/health.route.js"
import { registerDocumentsRoute } from "../routes/documents.route.js"
import { apiConfig } from "../config.js"

export const buildApp = (): FastifyInstance => {
  const app = Fastify()
  const documentsStore = createFileBackedDocumentsStore()
  const pdfEngineGateway = createHttpPdfEngineGateway(apiConfig.pdfEngine)
  const localFileStorage = createLocalDocumentFileStorage()
  const documentsService = createDocumentsService(
    documentsStore,
    pdfEngineGateway,
    localFileStorage
  )

  app.register(fastifyMultipart)
  registerHealthRoute(app)
  registerDocumentsRoute(app, documentsService)

  return app
}
