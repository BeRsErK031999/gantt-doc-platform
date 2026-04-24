import { buildApp } from "./app/build-app.js"
import { apiConfig } from "./config.js"

const HOST = "0.0.0.0"

const start = async (): Promise<void> => {
  try {
    const app = buildApp()
    const address = await app.listen({ host: HOST, port: apiConfig.port })

    console.log(`gantt-doc-api listening on ${address}`)
  } catch (error) {
    console.error("Failed to start gantt-doc-api", error)
    process.exit(1)
  }
}

void start()
