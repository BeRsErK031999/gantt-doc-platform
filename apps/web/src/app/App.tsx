import { useEffect, useState } from "react"
import type { ChangeEvent, FormEvent } from "react"

import { DocumentDetailsPanel } from "./DocumentDetailsPanel"
import { ApiError, createDocument, loadDocument, loadDocuments } from "./documents-api"
import type {
  DocumentDetails,
  DocumentKind,
  DocumentSummary
} from "./documents-api"
import {
  formatCreatedAt,
  formatDocumentKind,
  formatDocumentStatus
} from "./document-formatters"

type DocumentsState =
  | { kind: "loading" }
  | { kind: "ready"; documents: DocumentSummary[] }
  | { kind: "error"; message: string }

type DocumentDetailsState =
  | { kind: "idle" }
  | { kind: "loading"; documentId: string }
  | { kind: "ready"; document: DocumentDetails }
  | { kind: "not-found"; documentId: string; message: string }
  | { kind: "error"; documentId: string; message: string }

type CreateState =
  | { kind: "idle" }
  | { kind: "submitting" }
  | { kind: "error"; message: string }

type CreateFormState = {
  name: string
  kind: DocumentKind
}

const INITIAL_DOCUMENTS_STATE: DocumentsState = { kind: "loading" }
const INITIAL_DOCUMENT_DETAILS_STATE: DocumentDetailsState = { kind: "idle" }
const INITIAL_CREATE_STATE: CreateState = { kind: "idle" }
const INITIAL_FORM_STATE: CreateFormState = {
  name: "",
  kind: "pdf"
}

const getSelectedDocumentIdFromLocation = (): string | null => {
  const params = new URLSearchParams(window.location.search)
  const documentId = params.get("documentId")

  if (documentId === null || documentId.trim().length === 0) {
    return null
  }

  return documentId
}

const syncSelectedDocumentIdInLocation = (
  documentId: string | null,
  mode: "push" | "replace" = "push"
): void => {
  const url = new URL(window.location.href)

  if (documentId === null) {
    url.searchParams.delete("documentId")
  } else {
    url.searchParams.set("documentId", documentId)
  }

  const nextUrl = `${url.pathname}${url.search}${url.hash}`

  if (mode === "replace") {
    window.history.replaceState(null, "", nextUrl)
    return
  }

  window.history.pushState(null, "", nextUrl)
}

export const App = () => {
  const [documentsState, setDocumentsState] = useState<DocumentsState>(
    INITIAL_DOCUMENTS_STATE
  )
  const [documentDetailsState, setDocumentDetailsState] =
    useState<DocumentDetailsState>(INITIAL_DOCUMENT_DETAILS_STATE)
  const [selectedDocumentId, setSelectedDocumentId] = useState<string | null>(
    () => getSelectedDocumentIdFromLocation()
  )
  const [createState, setCreateState] =
    useState<CreateState>(INITIAL_CREATE_STATE)
  const [formState, setFormState] = useState<CreateFormState>(INITIAL_FORM_STATE)

  useEffect(() => {
    const abortController = new AbortController()

    const fetchDocuments = async (): Promise<void> => {
      try {
        const documents = await loadDocuments(abortController.signal)

        setDocumentsState({
          kind: "ready",
          documents
        })
      } catch (error) {
        if (abortController.signal.aborted) {
          return
        }

        const message =
          error instanceof Error ? error.message : "Unknown error"

        setDocumentsState({
          kind: "error",
          message
        })
      }
    }

    void fetchDocuments()

    return () => {
      abortController.abort()
    }
  }, [])

  useEffect(() => {
    const handlePopState = () => {
      setSelectedDocumentId(getSelectedDocumentIdFromLocation())
    }

    window.addEventListener("popstate", handlePopState)

    return () => {
      window.removeEventListener("popstate", handlePopState)
    }
  }, [])

  useEffect(() => {
    if (selectedDocumentId === null) {
      setDocumentDetailsState(INITIAL_DOCUMENT_DETAILS_STATE)
      syncSelectedDocumentIdInLocation(null, "replace")

      return
    }

    const abortController = new AbortController()

    setDocumentDetailsState({
      kind: "loading",
      documentId: selectedDocumentId
    })
    syncSelectedDocumentIdInLocation(selectedDocumentId, "replace")

    const fetchDocumentDetails = async (): Promise<void> => {
      try {
        const document = await loadDocument(
          selectedDocumentId,
          abortController.signal
        )

        setDocumentDetailsState({
          kind: "ready",
          document
        })
      } catch (error) {
        if (abortController.signal.aborted) {
          return
        }

        if (error instanceof ApiError && error.status === 404) {
          setDocumentDetailsState({
            kind: "not-found",
            documentId: selectedDocumentId,
            message: error.message
          })

          return
        }

        const message =
          error instanceof Error ? error.message : "Unknown error"

        setDocumentDetailsState({
          kind: "error",
          documentId: selectedDocumentId,
          message
        })
      }
    }

    void fetchDocumentDetails()

    return () => {
      abortController.abort()
    }
  }, [selectedDocumentId])

  const handleNameChange = (event: ChangeEvent<HTMLInputElement>) => {
    const { value } = event.currentTarget

    setFormState((currentState) => ({
      ...currentState,
      name: value
    }))
  }

  const handleKindChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const { value } = event.currentTarget

    setFormState((currentState) => ({
      ...currentState,
      kind: value === "docx" ? "docx" : "pdf"
    }))
  }

  const openDocument = (documentId: string) => {
    if (documentId === selectedDocumentId) {
      return
    }

    syncSelectedDocumentIdInLocation(documentId)
    setSelectedDocumentId(documentId)
  }

  const handleSubmit = async (
    event: FormEvent<HTMLFormElement>
  ): Promise<void> => {
    event.preventDefault()

    setCreateState({ kind: "submitting" })

    try {
      const createdDocument = await createDocument(formState)
      const documents = await loadDocuments()

      setDocumentsState({
        kind: "ready",
        documents
      })
      setFormState((currentState) => ({
        name: "",
        kind: currentState.kind
      }))
      setCreateState({ kind: "idle" })
      openDocument(createdDocument.id)
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error"

      setCreateState({
        kind: "error",
        message
      })
    }
  }

  const handleDocumentUpdated = async (
    updatedDocument: DocumentDetails
  ): Promise<void> => {
    const documents = await loadDocuments()

    setDocumentDetailsState({
      kind: "ready",
      document: updatedDocument
    })
    setDocumentsState({
      kind: "ready",
      documents
    })
  }

  return (
    <main className="page">
      <section className="panel">
        <div className="hero">
          <p className="eyebrow">Document platform</p>
          <h1 className="title">Documents</h1>
          <p className="description">
            This slice keeps local document records, source artifacts, and
            derived documents, and now delegates PDF compression to an external
            PDF engine.
          </p>
        </div>

        <section className="section">
          <div className="section-header">
            <h2>Create document</h2>
            <p>Add a document stub with the minimum metadata required today.</p>
          </div>

          <form
            className="document-form"
            onSubmit={(event) => void handleSubmit(event)}
          >
            <label className="field">
              <span>Name</span>
              <input
                name="name"
                placeholder="Quarterly report"
                value={formState.name}
                onChange={handleNameChange}
                disabled={createState.kind === "submitting"}
              />
            </label>

            <label className="field">
              <span>Kind</span>
              <select
                name="kind"
                value={formState.kind}
                onChange={handleKindChange}
                disabled={createState.kind === "submitting"}
              >
                <option value="pdf">PDF</option>
                <option value="docx">DOCX</option>
              </select>
            </label>

            <button
              className="primary-button"
              type="submit"
              disabled={createState.kind === "submitting"}
            >
              {createState.kind === "submitting"
                ? "Creating..."
                : "Create document"}
            </button>
          </form>

          {createState.kind === "error" ? (
            <p className="status status-error">
              Failed to create document: {createState.message}
            </p>
          ) : null}
        </section>

        <section className="section">
          <div className="section-header">
            <h2>Documents workspace</h2>
            <p>
              Open a document from the list to inspect overview, operations,
              metadata, and derived documents produced by the current action
              flow.
            </p>
          </div>

          <div className="documents-workspace">
            <div className="workspace-column">
              <div className="section-header compact-section-header">
                <h3>Document list</h3>
                <p>Current documents returned by the backend.</p>
              </div>

              {documentsState.kind === "loading" ? (
                <p className="status status-loading">Loading documents...</p>
              ) : null}

              {documentsState.kind === "error" ? (
                <p className="status status-error">
                  Failed to load documents: {documentsState.message}
                </p>
              ) : null}

              {documentsState.kind === "ready" &&
              documentsState.documents.length === 0 ? (
                <div className="empty-state">
                  <h3>No documents yet</h3>
                  <p>Create the first document to start the platform flow.</p>
                </div>
              ) : null}

              {documentsState.kind === "ready" &&
              documentsState.documents.length > 0 ? (
                <ul className="document-list">
                  {documentsState.documents.map((document) => (
                    <li
                      className={`document-item${
                        document.id === selectedDocumentId ? " is-active" : ""
                      }`}
                      key={document.id}
                    >
                      <div className="document-item-header">
                        <h3>{document.name}</h3>
                        <span className="kind-badge">
                          {formatDocumentKind(document.kind)}
                        </span>
                      </div>

                      <dl className="document-meta">
                        <div>
                          <dt>Status</dt>
                          <dd>{formatDocumentStatus(document.status)}</dd>
                        </div>
                        <div>
                          <dt>Created</dt>
                          <dd>{formatCreatedAt(document.createdAt)}</dd>
                        </div>
                      </dl>

                      <div className="document-item-actions">
                        <button
                          className="secondary-button"
                          type="button"
                          onClick={() => openDocument(document.id)}
                        >
                          Open details
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>

            <div className="workspace-column">
              <div className="section-header compact-section-header">
                <h3>Document details</h3>
                <p>
                  Direct links are supported through the <code>documentId</code>{" "}
                  query param.
                </p>
              </div>

              {documentDetailsState.kind === "idle" ? (
                <div className="empty-state details-empty-state">
                  <h3>No document selected</h3>
                  <p>Select a document from the list to inspect its details.</p>
                </div>
              ) : null}

              {documentDetailsState.kind === "loading" ? (
                <p className="status status-loading">Loading document details...</p>
              ) : null}

              {documentDetailsState.kind === "not-found" ? (
                <div className="status status-error">
                  <p className="status-title">Document not found</p>
                  <p>
                    {documentDetailsState.message} Requested id:{" "}
                    <code>{documentDetailsState.documentId}</code>
                  </p>
                </div>
              ) : null}

              {documentDetailsState.kind === "error" ? (
                <div className="status status-error">
                  <p className="status-title">Failed to load document details</p>
                  <p>{documentDetailsState.message}</p>
                </div>
              ) : null}

              {documentDetailsState.kind === "ready" ? (
                <DocumentDetailsPanel
                  document={documentDetailsState.document}
                  onDocumentUpdated={handleDocumentUpdated}
                  onOpenDocument={openDocument}
                />
              ) : null}
            </div>
          </div>
        </section>
      </section>
    </main>
  )
}
