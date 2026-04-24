import { access, mkdir, readFile, writeFile } from "node:fs/promises"
import { dirname, isAbsolute, resolve, sep } from "node:path"
import { fileURLToPath } from "node:url"

import type { DocumentKind } from "./document.js"

type SaveDocumentSourceFileInput = {
  contents: Uint8Array
  documentId: string
  kind: DocumentKind
}

type SavedDocumentSourceFile = {
  path: string
  sizeBytes: number
}

type SaveDerivedDocumentFileInput = {
  contents: Uint8Array
  derivedDocumentId: string
  fileName: string
  originDocumentId: string
}

type SavedDerivedDocumentFile = {
  path: string
  sizeBytes: number
}

export type LocalDocumentFileStorage = {
  saveDocumentSourceFile: (
    input: SaveDocumentSourceFileInput
  ) => Promise<SavedDocumentSourceFile>
  saveDerivedDocumentFile: (
    input: SaveDerivedDocumentFileInput
  ) => Promise<SavedDerivedDocumentFile>
  readStorageFile: (storagePath: string) => Promise<Uint8Array>
  resolveStorageAbsolutePath: (storagePath: string) => string
  storagePathExists: (storagePath: string) => Promise<boolean>
}

const PROJECT_ROOT_PATH = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../../"
)
const STORAGE_ROOT_PATH = resolve(PROJECT_ROOT_PATH, "storage")

const DOCUMENT_EXTENSIONS: Record<DocumentKind, string> = {
  pdf: "pdf",
  docx: "docx",
  zip: "zip"
}

const buildDocumentSourceFilePath = (
  documentId: string,
  kind: DocumentKind
): string => {
  return `storage/documents/${documentId}/original.${DOCUMENT_EXTENSIONS[kind]}`
}

const buildDerivedDocumentFilePath = (
  originDocumentId: string,
  derivedDocumentId: string,
  fileName: string
): string => {
  return `storage/documents/${originDocumentId}/derived/${derivedDocumentId}/${fileName}`
}

const ensurePathIsWithinStorageRoot = (absolutePath: string): void => {
  const normalizedStorageRoot = `${STORAGE_ROOT_PATH}${sep}`

  if (
    absolutePath !== STORAGE_ROOT_PATH &&
    !absolutePath.startsWith(normalizedStorageRoot)
  ) {
    throw new Error("Storage path must stay within the local storage root.")
  }
}

const resolveStorageAbsolutePath = (storagePath: string): string => {
  const normalizedStoragePath = storagePath.trim()

  if (normalizedStoragePath.length === 0) {
    throw new Error("Storage path must not be empty.")
  }

  if (isAbsolute(normalizedStoragePath)) {
    throw new Error("Storage path must be relative to the project root.")
  }

  const absolutePath = resolve(PROJECT_ROOT_PATH, normalizedStoragePath)

  ensurePathIsWithinStorageRoot(absolutePath)

  return absolutePath
}

export const createLocalDocumentFileStorage = (): LocalDocumentFileStorage => {
  return {
    saveDocumentSourceFile: async ({ contents, documentId, kind }) => {
      const storagePath = buildDocumentSourceFilePath(documentId, kind)
      const absolutePath = resolveStorageAbsolutePath(storagePath)

      await mkdir(dirname(absolutePath), { recursive: true })
      await writeFile(absolutePath, contents)

      return {
        path: storagePath,
        sizeBytes: contents.byteLength
      }
    },
    saveDerivedDocumentFile: async ({
      contents,
      derivedDocumentId,
      fileName,
      originDocumentId
    }) => {
      const storagePath = buildDerivedDocumentFilePath(
        originDocumentId,
        derivedDocumentId,
        fileName
      )
      const absolutePath = resolveStorageAbsolutePath(storagePath)

      await mkdir(dirname(absolutePath), { recursive: true })
      await writeFile(absolutePath, contents)

      return {
        path: storagePath,
        sizeBytes: contents.byteLength
      }
    },
    readStorageFile: async (storagePath) => {
      return readFile(resolveStorageAbsolutePath(storagePath))
    },
    resolveStorageAbsolutePath,
    storagePathExists: async (storagePath) => {
      try {
        await access(resolveStorageAbsolutePath(storagePath))

        return true
      } catch {
        return false
      }
    }
  }
}
