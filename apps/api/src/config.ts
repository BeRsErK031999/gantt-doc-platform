import { existsSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const PROJECT_ROOT_PATH = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../.."
)
const DEFAULT_PORT = 3000

const loadEnvironmentFile = (): void => {
  const environmentFilePath = resolve(PROJECT_ROOT_PATH, ".env")

  if (!existsSync(environmentFilePath)) {
    return
  }

  process.loadEnvFile(environmentFilePath)
}

const parsePort = (value: string | undefined): number => {
  if (value === undefined) {
    return DEFAULT_PORT
  }

  const port = Number(value)

  if (!Number.isInteger(port) || port <= 0) {
    throw new Error("PORT must be a positive integer")
  }

  return port
}

const parseOptionalAbsoluteUrl = (
  value: string | undefined,
  envName: string
): string | undefined => {
  const normalizedValue = value?.trim()

  if (normalizedValue === undefined || normalizedValue.length === 0) {
    return undefined
  }

  try {
    return new URL(normalizedValue).toString().replace(/\/$/, "")
  } catch {
    throw new Error(`${envName} must be a valid absolute URL`)
  }
}

const parseOptionalToken = (value: string | undefined): string | undefined => {
  const normalizedValue = value?.trim()

  if (normalizedValue === undefined || normalizedValue.length === 0) {
    return undefined
  }

  return normalizedValue
}

loadEnvironmentFile()

export const apiConfig = {
  port: parsePort(process.env.PORT),
  pdfEngine: {
    baseUrl: parseOptionalAbsoluteUrl(
      process.env.PDF_ENGINE_BASE_URL,
      "PDF_ENGINE_BASE_URL"
    ),
    authToken: parseOptionalToken(process.env.PDF_ENGINE_AUTH_TOKEN)
  }
}
