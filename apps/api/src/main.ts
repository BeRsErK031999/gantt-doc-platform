import { buildApp } from "./app/build-app.js"

const DEFAULT_PORT = 3000
const HOST = "0.0.0.0"

const resolvePort = (): number => {
  const portValue = process.env.PORT

  if (portValue === undefined) {
    return DEFAULT_PORT
  }

  const port = Number(portValue)

  if (!Number.isInteger(port) || port <= 0) {
    throw new Error("PORT must be a positive integer")
  }

  return port
}

const start = async (): Promise<void> => {
  try {
    const app = buildApp()
    const port = resolvePort()
    const address = await app.listen({ host: HOST, port })

    console.log(`gantt-doc-api listening on ${address}`)
  } catch (error) {
    console.error("Failed to start gantt-doc-api", error)
    process.exit(1)
  }
}

void start()
