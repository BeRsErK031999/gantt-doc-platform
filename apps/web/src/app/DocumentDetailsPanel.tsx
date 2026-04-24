import { useEffect, useState } from "react"
import type { ChangeEvent, FormEvent } from "react"

import { DocumentActionsPanel } from "./DocumentActionsPanel"
import {
  buildDerivedDocumentDownloadUrl,
  uploadDocumentSourceFile
} from "./documents-api"
import type { DocumentDetails } from "./documents-api"
import {
  formatCreatedAt,
  formatDerivationKind,
  formatDocumentKind,
  formatDocumentStatus,
  formatFinishedAt,
  formatOperationBoundary,
  formatOperationKind,
  formatOperationStatus,
  formatPageCount,
  formatSizeBytes,
  formatSourceArtifactStatus,
  formatSourceArtifactStorageKind,
  formatWordCount
} from "./document-formatters"

const MetadataValue = ({
  isMissing = false,
  value
}: {
  isMissing?: boolean
  value: string
}) => {
  return <dd className={isMissing ? "details-value is-placeholder" : "details-value"}>{value}</dd>
}

type UploadState =
  | { kind: "idle" }
  | { kind: "submitting" }
  | { kind: "success"; message: string }
  | { kind: "error"; message: string }

export const DocumentDetailsPanel = ({
  document,
  onDocumentUpdated,
  onOpenDocument
}: {
  document: DocumentDetails
  onDocumentUpdated: (document: DocumentDetails) => void | Promise<void>
  onOpenDocument: (documentId: string) => void
}) => {
  const origin = document.origin
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [uploadState, setUploadState] = useState<UploadState>({ kind: "idle" })

  useEffect(() => {
    setSelectedFile(null)
    setUploadState({ kind: "idle" })
  }, [document.id])

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>): void => {
    setSelectedFile(event.currentTarget.files?.[0] ?? null)
    setUploadState({ kind: "idle" })
  }

  const handleUploadSubmit = async (
    event: FormEvent<HTMLFormElement>
  ): Promise<void> => {
    event.preventDefault()

    if (selectedFile === null) {
      setUploadState({
        kind: "error",
        message: "Choose a PDF or DOCX file before uploading."
      })

      return
    }

    setUploadState({ kind: "submitting" })

    try {
      const updatedDocument = await uploadDocumentSourceFile(
        document.id,
        selectedFile
      )

      await onDocumentUpdated(updatedDocument)
      setSelectedFile(null)
      setUploadState({
        kind: "success",
        message: "Source file uploaded."
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error"

      setUploadState({
        kind: "error",
        message
      })
    }
  }

  const handleDerivedDocumentDownload = (derivedDocumentId: string): void => {
    const downloadLink = window.document.createElement("a")

    downloadLink.href = buildDerivedDocumentDownloadUrl(
      document.id,
      derivedDocumentId
    )
    downloadLink.rel = "noopener"
    window.document.body.append(downloadLink)
    downloadLink.click()
    downloadLink.remove()
  }

  return (
    <div className="details-card">
      <section className="details-section">
        <div className="section-header compact-section-header">
          <h3>Document overview</h3>
          <p>Core identity and lifecycle fields for the selected document.</p>
        </div>

        <dl className="details-grid">
          <div>
            <dt>ID</dt>
            <dd>
              <code>{document.id}</code>
            </dd>
          </div>
          <div>
            <dt>Name</dt>
            <dd>{document.name}</dd>
          </div>
          <div>
            <dt>Kind</dt>
            <dd>{formatDocumentKind(document.kind)}</dd>
          </div>
          <div>
            <dt>Status</dt>
            <dd>{formatDocumentStatus(document.status)}</dd>
          </div>
          <div>
            <dt>Created at</dt>
            <dd>{formatCreatedAt(document.createdAt)}</dd>
          </div>
        </dl>
      </section>

      <section className="details-section">
        <div className="section-header compact-section-header">
          <h3>Source artifact</h3>
          <p>Registered source artifact for the selected document.</p>
        </div>

        <dl className="details-grid">
          <div>
            <dt>Artifact ID</dt>
            <dd>
              <code>{document.sourceArtifact.id}</code>
            </dd>
          </div>
          <div>
            <dt>File name</dt>
            <dd>{document.sourceArtifact.fileName}</dd>
          </div>
          <div>
            <dt>Kind</dt>
            <dd>{formatDocumentKind(document.sourceArtifact.kind)}</dd>
          </div>
          <div>
            <dt>Storage kind</dt>
            <dd>
              {formatSourceArtifactStorageKind(
                document.sourceArtifact.storageKind
              )}
            </dd>
          </div>
          <div>
            <dt>Status</dt>
            <dd>{formatSourceArtifactStatus(document.sourceArtifact.status)}</dd>
          </div>
          {document.sourceArtifact.path === undefined ? null : (
            <div>
              <dt>Storage path</dt>
              <dd>
                <code>{document.sourceArtifact.path}</code>
              </dd>
            </div>
          )}
          <div>
            <dt>Created at</dt>
            <dd>{formatCreatedAt(document.sourceArtifact.createdAt)}</dd>
          </div>
        </dl>

        <form
          className="upload-form"
          onSubmit={(event) => void handleUploadSubmit(event)}
        >
          <label className="field upload-field">
            <span>Upload source file</span>
            <input
              accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              type="file"
              onChange={handleFileChange}
              disabled={uploadState.kind === "submitting"}
            />
          </label>
          <button
            className="primary-button"
            type="submit"
            disabled={uploadState.kind === "submitting"}
          >
            {uploadState.kind === "submitting" ? "Uploading..." : "Upload"}
          </button>
        </form>

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
      </section>

      <DocumentActionsPanel
        document={document}
        onDocumentUpdated={onDocumentUpdated}
      />

      <section className="details-section">
        <div className="section-header compact-section-header">
          <h3>Lineage</h3>
          <p>Parent and derived document relationships for this document.</p>
        </div>

        <h4 className="actions-group-title">Origin document</h4>
        {origin === null ? (
          <div className="empty-state section-empty-state">
            <h4>No origin document</h4>
            <p>This document is a root document in the local workspace.</p>
          </div>
        ) : (
          <div className="relationship-item">
            <div>
              <p className="details-list-title">Parent document</p>
              <p className="details-list-caption">
                {formatDerivationKind(origin.derivationKind)}
              </p>
              <p className="details-list-meta">
                Origin ID: <code>{origin.documentId}</code>
              </p>
            </div>
            <button
              className="secondary-button"
              type="button"
              onClick={() => onOpenDocument(origin.documentId)}
            >
              Open origin
            </button>
          </div>
        )}

        <h4 className="actions-group-title">Derived documents</h4>
        {document.derivedDocuments.length === 0 ? (
          <div className="empty-state section-empty-state">
            <h4>No derived documents</h4>
            <p>No child documents have been derived from this document yet.</p>
          </div>
        ) : (
          <ul className="details-list">
            {document.derivedDocuments.map((derivedDocument) => (
              <li className="details-list-item" key={derivedDocument.id}>
                <div>
                  <p className="details-list-title">{derivedDocument.name}</p>
                  <p className="details-list-caption">
                    {formatDerivationKind(derivedDocument.derivationKind)}
                  </p>
                  <p className="details-list-meta">
                    Document ID: <code>{derivedDocument.id}</code>
                  </p>
                </div>
                <button
                  className="secondary-button"
                  type="button"
                  onClick={() => onOpenDocument(derivedDocument.id)}
                >
                  Open details
                </button>
                <button
                  className="secondary-button"
                  type="button"
                  onClick={() => handleDerivedDocumentDownload(derivedDocument.id)}
                >
                  Download
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="details-section">
        <div className="section-header compact-section-header">
          <h3>Operations history</h3>
          <p>Recorded PDF engine actions for this document, newest first.</p>
        </div>

        {document.operations.length === 0 ? (
          <div className="empty-state section-empty-state">
            <h4>No operations yet</h4>
            <p>No PDF operation history has been recorded for this document.</p>
          </div>
        ) : (
          <ul className="details-list">
            {document.operations.map((operation) => (
              <li
                className={`details-list-item${
                  operation.status === "failed" ? " details-list-item-error" : ""
                }`}
                key={operation.id}
              >
                <div>
                  <p className="details-list-title">
                    {formatOperationKind(operation.kind)}
                  </p>
                  <p className="details-list-caption">
                    <code>{operation.id}</code>
                  </p>
                  <p className="details-list-meta">
                    Boundary: {formatOperationBoundary(operation.kind)}
                  </p>
                  <p className="details-list-meta">
                    Created: {formatCreatedAt(operation.createdAt)}
                  </p>
                  <p className="details-list-meta">
                    Finished: {formatFinishedAt(operation.finishedAt)}
                  </p>
                  {operation.errorMessage === undefined ? null : (
                    <p className="details-list-meta details-list-error">
                      Error: {operation.errorMessage}
                    </p>
                  )}
                </div>
                <span
                  className={`details-badge${
                    operation.status === "failed" ? " details-badge-error" : ""
                  }`}
                >
                  {formatOperationStatus(operation.status)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="details-section">
        <div className="section-header compact-section-header">
          <h3>Metadata</h3>
          <p>Current metadata known to the document platform.</p>
        </div>

        <dl className="details-grid">
          <div>
            <dt>Source file name</dt>
            <MetadataValue value={document.metadata.sourceFileName} />
          </div>
          <div>
            <dt>MIME type</dt>
            <MetadataValue value={document.metadata.mimeType} />
          </div>
          <div>
            <dt>Size</dt>
            <MetadataValue value={formatSizeBytes(document.metadata.sizeBytes)} />
          </div>
          <div>
            <dt>Page count</dt>
            <MetadataValue
              isMissing={document.metadata.pageCount === null}
              value={formatPageCount(document.metadata.pageCount)}
            />
          </div>
          <div>
            <dt>Word count</dt>
            <MetadataValue
              isMissing={document.metadata.wordCount === null}
              value={formatWordCount(document.metadata.wordCount)}
            />
          </div>
        </dl>
      </section>

    </div>
  )
}
