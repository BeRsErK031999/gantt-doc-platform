import { useEffect, useState } from "react"
import type { ChangeEvent, FormEvent } from "react"

import {
  ApiError,
  buildDerivedDocumentDownloadUrl,
  createDocument,
  runDocumentAction,
  uploadDocumentSourceFile
} from "./documents-api"
import type {
  DerivedDocument,
  DocumentDetails,
  RunDocumentActionRequest
} from "./documents-api"

export type ActiveTool = "compress" | "split" | "merge"

type UploadState =
  | { kind: "idle" }
  | { kind: "submitting" }
  | { kind: "success"; message: string }
  | { kind: "error"; message: string }

type ActionState =
  | { kind: "idle" }
  | { kind: "submitting" }
  | { kind: "success"; message: string }
  | {
      kind: "error"
      code?: string
      message: string
      technicalDetails?: string
    }

type UploadedMergeSource = {
  document: DocumentDetails
  fileName: string
}

const INITIAL_UPLOAD_STATE: UploadState = { kind: "idle" }
const INITIAL_ACTION_STATE: ActionState = { kind: "idle" }
const INITIAL_PAGE_RANGES = "1"

const TOOL_CONTENT: Record<
  ActiveTool,
  {
    actionLabel: string
    description: string
    pendingActionLabel: string
    resultDescription: string
    successMessage: string
    title: string
    uploadLabel: string
  }
> = {
  compress: {
    title: "Compress PDF",
    actionLabel: "Compress",
    pendingActionLabel: "Compressing...",
    uploadLabel: "Upload file",
    description:
      "Upload a PDF, create a document automatically, then run the existing compression action.",
    resultDescription:
      "The backend creates a derived compressed PDF and keeps operation history on the source document.",
    successMessage: "Compressed PDF is ready to download."
  },
  split: {
    title: "Split PDF",
    actionLabel: "Split",
    pendingActionLabel: "Splitting...",
    uploadLabel: "Upload file",
    description:
      "Upload a PDF, create a document automatically, then run the existing split action with page ranges.",
    resultDescription:
      "The backend creates a derived split result and keeps operation history on the source document.",
    successMessage: "Split result is ready to download."
  },
  merge: {
    title: "Merge PDF",
    actionLabel: "Merge",
    pendingActionLabel: "Merging...",
    uploadLabel: "Upload files",
    description:
      "Choose multiple PDFs, create documents for each upload, then merge them through the external PDF engine.",
    resultDescription:
      "The first uploaded PDF becomes the root document, additional PDFs are sent as ordered merge sources, and the merged PDF is saved as a derived document.",
    successMessage: "Merged PDF is ready to download."
  }
}

const getDocumentNameFromFile = (fileName: string): string => {
  const trimmedFileName = fileName.trim()

  if (trimmedFileName.length === 0) {
    return "PDF document"
  }

  const extensionIndex = trimmedFileName.lastIndexOf(".")

  if (extensionIndex <= 0) {
    return trimmedFileName
  }

  return trimmedFileName.slice(0, extensionIndex)
}

const getNewDerivedDocument = (
  previousDocument: DocumentDetails | null,
  nextDocument: DocumentDetails
): DerivedDocument | null => {
  const previousDocumentIds = new Set(
    previousDocument?.derivedDocuments.map((document) => document.id) ?? []
  )

  for (const derivedDocument of nextDocument.derivedDocuments) {
    if (!previousDocumentIds.has(derivedDocument.id)) {
      return derivedDocument
    }
  }

  return nextDocument.derivedDocuments[0] ?? null
}

const triggerDownload = (downloadUrl: string): void => {
  const downloadLink = window.document.createElement("a")

  downloadLink.href = downloadUrl
  downloadLink.rel = "noopener"
  window.document.body.append(downloadLink)
  downloadLink.click()
  downloadLink.remove()
}

export const ToolPanel = ({
  activeTool,
  onBack
}: {
  activeTool: ActiveTool
  onBack: () => void
}) => {
  const toolContent = TOOL_CONTENT[activeTool]
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [selectedFiles, setSelectedFiles] = useState<File[]>([])
  const [fileInputKey, setFileInputKey] = useState<number>(0)
  const [pageRanges, setPageRanges] = useState<string>(INITIAL_PAGE_RANGES)
  const [uploadState, setUploadState] = useState<UploadState>(INITIAL_UPLOAD_STATE)
  const [actionState, setActionState] = useState<ActionState>(INITIAL_ACTION_STATE)
  const [workingDocument, setWorkingDocument] = useState<DocumentDetails | null>(null)
  const [resultDocument, setResultDocument] = useState<DerivedDocument | null>(null)
  const [uploadedMergeSources, setUploadedMergeSources] = useState<
    UploadedMergeSource[]
  >([])

  useEffect(() => {
    setSelectedFile(null)
    setSelectedFiles([])
    setFileInputKey(0)
    setPageRanges(INITIAL_PAGE_RANGES)
    setUploadState(INITIAL_UPLOAD_STATE)
    setActionState(INITIAL_ACTION_STATE)
    setWorkingDocument(null)
    setResultDocument(null)
    setUploadedMergeSources([])
  }, [activeTool])

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>): void => {
    if (activeTool === "merge") {
      setSelectedFiles(Array.from(event.currentTarget.files ?? []))
    } else {
      setSelectedFile(event.currentTarget.files?.[0] ?? null)
    }

    setUploadState(INITIAL_UPLOAD_STATE)
    setActionState(INITIAL_ACTION_STATE)
    setResultDocument(null)
  }

  const handleUploadSubmit = async (
    event: FormEvent<HTMLFormElement>
  ): Promise<void> => {
    event.preventDefault()

    if (activeTool === "merge") {
      if (selectedFiles.length === 0) {
        setUploadState({
          kind: "error",
          message: "Choose at least one PDF file before uploading."
        })

        return
      }

      setUploadState({ kind: "submitting" })
      setActionState(INITIAL_ACTION_STATE)
      setResultDocument(null)

      try {
        const uploadedDocuments: UploadedMergeSource[] = []

        for (const file of selectedFiles) {
          const createdDocument = await createDocument({
            name: getDocumentNameFromFile(file.name),
            kind: "pdf"
          })
          const updatedDocument = await uploadDocumentSourceFile(
            createdDocument.id,
            file
          )

          uploadedDocuments.push({
            document: updatedDocument,
            fileName: file.name
          })
        }

        setUploadedMergeSources(uploadedDocuments)
        setWorkingDocument(uploadedDocuments[0]?.document ?? null)
        setSelectedFiles([])
        setFileInputKey((currentValue) => currentValue + 1)
        setUploadState({
          kind: "success",
          message: `${uploadedDocuments.length} PDF files uploaded and registered as merge sources.`
        })
      } catch (error) {
        setUploadedMergeSources([])
        setWorkingDocument(null)
        setResultDocument(null)
        setUploadState({
          kind: "error",
          message: error instanceof Error ? error.message : "Unknown error"
        })
      }

      return
    }

    if (selectedFile === null) {
      setUploadState({
        kind: "error",
        message: "Choose a PDF file before uploading."
      })

      return
    }

    setUploadState({ kind: "submitting" })
    setActionState(INITIAL_ACTION_STATE)
    setResultDocument(null)

    try {
      const createdDocument = await createDocument({
        name: getDocumentNameFromFile(selectedFile.name),
        kind: "pdf"
      })
      const updatedDocument = await uploadDocumentSourceFile(
        createdDocument.id,
        selectedFile
      )

      setWorkingDocument(updatedDocument)
      setSelectedFile(null)
      setFileInputKey((currentValue) => currentValue + 1)
      setUploadState({
        kind: "success",
        message: "PDF uploaded. The source document was created automatically."
      })
    } catch (error) {
      setWorkingDocument(null)
      setUploadState({
        kind: "error",
        message: error instanceof Error ? error.message : "Unknown error"
      })
    }
  }

  const handleActionSubmit = async (): Promise<void> => {
    if (workingDocument === null) {
      setActionState({
        kind: "error",
        message:
          activeTool === "merge"
            ? "Upload at least two PDFs first."
            : "Upload a PDF first."
      })

      return
    }

    if (activeTool === "split" && pageRanges.trim().length === 0) {
      setActionState({
        kind: "error",
        message: "Enter page ranges before running split."
      })

      return
    }

    if (activeTool === "merge" && uploadedMergeSources.length < 2) {
      setActionState({
        kind: "error",
        message: "Upload at least two PDFs before running merge."
      })

      return
    }

    const request: RunDocumentActionRequest =
      activeTool === "split"
        ? {
            kind: "split-pdf",
            pageRanges: pageRanges.trim()
          }
        : activeTool === "merge"
          ? {
              kind: "merge-pdf",
              sourceDocumentIds: uploadedMergeSources
                .slice(1)
                .map((source) => source.document.id),
              pageNumberingMode: "none"
            }
          : {
              kind: "compress-pdf"
            }

    setActionState({ kind: "submitting" })

    try {
      const updatedDocument = await runDocumentAction(workingDocument.id, request)
      const nextResultDocument = getNewDerivedDocument(
        workingDocument,
        updatedDocument
      )

      setWorkingDocument(updatedDocument)
      setResultDocument(nextResultDocument)
      setActionState({
        kind: "success",
        message: toolContent.successMessage
      })
    } catch (error) {
      if (error instanceof ApiError) {
        setActionState({
          kind: "error",
          code: error.code,
          message: error.message,
          technicalDetails: error.details
        })

        return
      }

      setActionState({
        kind: "error",
        message: error instanceof Error ? error.message : "Unknown error"
      })
    }
  }

  const handleDownload = (): void => {
    if (workingDocument === null || resultDocument === null) {
      return
    }

    triggerDownload(
      buildDerivedDocumentDownloadUrl(workingDocument.id, resultDocument.id)
    )
  }

  return (
    <>
      <div className="hero">
        <p className="eyebrow">PDF toolbox</p>
        <h1 className="title">{toolContent.title}</h1>
        <p className="description">{toolContent.description}</p>
      </div>

      <section className="section tool-panel-section">
        <div className="tool-panel-header">
          <div className="section-header">
            <h2>Tool panel</h2>
            <p>{toolContent.resultDescription}</p>
          </div>

          <button className="secondary-button" type="button" onClick={onBack}>
            Back to tools
          </button>
        </div>

        <div className="tool-panel-card">
          <form
            className="upload-form tool-upload-form"
            onSubmit={(event) => void handleUploadSubmit(event)}
          >
            <label className="field upload-field">
              <span>{activeTool === "merge" ? "Upload PDF files" : "Upload file"}</span>
              <input
                key={fileInputKey}
                accept=".pdf,application/pdf"
                type="file"
                multiple={activeTool === "merge"}
                onChange={handleFileChange}
                disabled={
                  uploadState.kind === "submitting" ||
                  actionState.kind === "submitting"
                }
              />
            </label>

            <button
              className="primary-button"
              type="submit"
              disabled={
                (activeTool === "merge"
                  ? selectedFiles.length === 0
                  : selectedFile === null) ||
                uploadState.kind === "submitting" ||
                actionState.kind === "submitting"
              }
            >
              {uploadState.kind === "submitting"
                ? "Uploading..."
                : toolContent.uploadLabel}
            </button>
          </form>

          {activeTool === "merge" && selectedFiles.length > 0 ? (
            <div className="tool-result-card">
              <div>
                <p className="details-list-title">Selected files</p>
                <p className="details-list-meta">
                  {selectedFiles.map((file) => file.name).join(", ")}
                </p>
              </div>
            </div>
          ) : null}

          {activeTool === "split" ? (
            <label className="field tool-field">
              <span>Page ranges</span>
              <input
                name="pageRanges"
                placeholder="1-3,5"
                value={pageRanges}
                onChange={(event) => setPageRanges(event.currentTarget.value)}
                disabled={actionState.kind === "submitting"}
              />
            </label>
          ) : null}

          <div className="tool-action-row">
            <button
              className="primary-button"
              type="button"
              disabled={
                workingDocument === null ||
                actionState.kind === "submitting" ||
                (activeTool === "split" && pageRanges.trim().length === 0) ||
                (activeTool === "merge" && uploadedMergeSources.length < 2)
              }
              onClick={() => void handleActionSubmit()}
            >
              {actionState.kind === "submitting"
                ? toolContent.pendingActionLabel
                : toolContent.actionLabel}
            </button>

            <button
              className="secondary-button"
              type="button"
              disabled={resultDocument === null}
              onClick={handleDownload}
            >
              Download result
            </button>
          </div>

          {workingDocument !== null ? (
            <dl className="tool-summary">
              <div>
                <dt>Root document ID</dt>
                <dd>
                  <code>{workingDocument.id}</code>
                </dd>
              </div>
              <div>
                <dt>Source file</dt>
                <dd>{workingDocument.sourceArtifact.fileName}</dd>
              </div>
              <div>
                <dt>History entries</dt>
                <dd>{workingDocument.operations.length}</dd>
              </div>
              <div>
                <dt>Derived documents</dt>
                <dd>{workingDocument.derivedDocuments.length}</dd>
              </div>
            </dl>
          ) : null}

          {activeTool === "merge" && uploadedMergeSources.length > 0 ? (
            <div className="details-section">
              <div className="section-header compact-section-header">
                <h3>Uploaded merge sources</h3>
                <p>The first uploaded PDF is used as the root document and first merge source.</p>
              </div>

              <ul className="details-list">
                {uploadedMergeSources.map((source, index) => (
                  <li className="details-list-item" key={source.document.id}>
                    <div>
                      <p className="details-list-title">
                        {index === 0 ? "Root source" : `Additional source ${index}`}
                      </p>
                      <p className="details-list-caption">{source.fileName}</p>
                      <p className="details-list-meta">
                        Document ID: <code>{source.document.id}</code>
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {uploadState.kind === "success" ? (
            <p className="status status-loading action-status">
              {uploadState.message}
            </p>
          ) : null}

          {uploadState.kind === "error" ? (
            <p className="status status-error action-status">
              Failed to upload source file: {uploadState.message}
            </p>
          ) : null}

          {actionState.kind === "success" ? (
            <p className="status status-loading action-status">
              {actionState.message}
            </p>
          ) : null}

          {actionState.kind === "error" ? (
            <div className="status status-error action-status">
              <p className="status-title">Action failed</p>
              <p>{actionState.message}</p>
              {actionState.technicalDetails !== undefined ? (
                <p className="status-technical-details">
                  Technical details: <code>{actionState.technicalDetails}</code>
                </p>
              ) : null}
              {actionState.code !== undefined ? (
                <p className="status-technical-details">
                  Error code: <code>{actionState.code}</code>
                </p>
              ) : null}
            </div>
          ) : null}

          {resultDocument !== null ? (
            <div className="tool-result-card">
              <div>
                <p className="details-list-title">{resultDocument.name}</p>
                <p className="details-list-meta">
                  Derived ID: <code>{resultDocument.id}</code>
                </p>
              </div>

              <button
                className="secondary-button"
                type="button"
                onClick={handleDownload}
              >
                Download
              </button>
            </div>
          ) : null}
        </div>
      </section>
    </>
  )
}
