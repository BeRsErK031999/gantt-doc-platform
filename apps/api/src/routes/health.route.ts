import type { FastifyInstance } from "fastify"

const HEALTH_RESPONSE = {
  status: "ok",
  service: "gantt-doc-api"
}

export const registerHealthRoute = (app: FastifyInstance): void => {
  app.get("/health", async () => HEALTH_RESPONSE)
}
