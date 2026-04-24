import { useEffect, useState } from "react"

import { ApiError, runDocumentAction } from "./documents-api"
import type {
  DocumentDetails,
  DocumentActionKind,
  PlatformDocumentActionKind,
  PdfEngineActionKind,
  RunDocumentActionRequest
} from "./documents-api"

type ActionState =
  | { kind: "idle" }
  | { kind: "submitting"; actionKind: DocumentActionKind }
  | { kind: "success"; message: string }
  | {
      kind: "error"
      code?: string
      message: string
      technicalDetails?: string
    }

type ActionDefinition = {
  description: string
  kind: Exclude<DocumentActionKind, "merge-pdf">
  label: string
  successMessage: string
}

type SupportedDetailsPdfEngineActionKind = Exclude<
  PdfEngineActionKind,
  "merge-pdf"
>

type SplitFormState = {
  pageRanges: string
}

const PLATFORM_ACTIONS: Array<
  ActionDefinition & { kind: PlatformDocumentActionKind }
> = [
  {
    kind: "extract-metadata",
    label: "Extract metadata",
    description: "Regenerate the metadata placeholder for this document.",
    successMessage: "Metadata placeholder refreshed."
  },
  {
    kind: "generate-derived-document",
    label: "Generate derived document",
    description: "Append one more derived document placeholder to the current details.",
    successMessage: "Derived document placeholder added."
  }
]

const PDF_ENGINE_ACTIONS: Array<
  ActionDefinition & { kind: SupportedDetailsPdfEngineActionKind }
> = [
  {
    kind: "compress-pdf",
    label: "Compress PDF",
    description:
      "Send the uploaded PDF to the external PDF engine and save the compressed result locally.",
    successMessage: "Compressed PDF saved as a derived document."
  },
  {
    kind: "split-pdf",
    label: "Split PDF",
    description:
      "Send the uploaded PDF to the external PDF engine, split by page ranges, and save the returned artifact locally.",
    successMessage: "Split PDF result saved as a derived document."
  }
]

const INITIAL_SPLIT_FORM_STATE: SplitFormState = {
  pageRanges: "1"
}

export const DocumentActionsPanel = ({
  document,
  onDocumentUpdated
}: {
  document: DocumentDetails
  onDocumentUpdated: (document: DocumentDetails) => void | Promise<void>
}) => {
  const [actionState, setActionState] = useState<ActionState>({ kind: "idle" })
  const [splitFormState, setSplitFormState] = useState<SplitFormState>(
    INITIAL_SPLIT_FORM_STATE
  )

  useEffect(() => {
    setActionState({ kind: "idle" })
    setSplitFormState(INITIAL_SPLIT_FORM_STATE)
  }, [document.id])

  const handleAction = async (
    action: ActionDefinition
  ): Promise<void> => {
    const request: RunDocumentActionRequest =
      action.kind === "split-pdf"
        ? {
            kind: "split-pdf",
            pageRanges: splitFormState.pageRanges.trim()
          }
        : {
            kind: action.kind
          }

    setActionState({
      kind: "submitting",
      actionKind: action.kind
    })

    try {
      const updatedDocument = await runDocumentAction(document.id, request)

      await onDocumentUpdated(updatedDocument)
      setActionState({
        kind: "success",
        message: action.successMessage
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

      const message = error instanceof Error ? error.message : "Unknown error"

      setActionState({
        kind: "error",
        message,
        technicalDetails: undefined
      })
    }
  }

  return (
    <section className="details-section">
      <div className="section-header compact-section-header">
        <h3>Document actions</h3>
        <p>Run the current document action flow for local and external operations.</p>
      </div>

      <h4 className="actions-group-title">Platform actions</h4>
      <div className="document-actions">
        {PLATFORM_ACTIONS.map((action) => (
          <button
            className="document-action-button secondary-button"
            key={action.kind}
            type="button"
            disabled={actionState.kind === "submitting"}
            onClick={() => void handleAction(action)}
          >
            <span>{action.label}</span>
            <small>{action.description}</small>
            {actionState.kind === "submitting" &&
            actionState.actionKind === action.kind ? (
              <strong>Running...</strong>
            ) : null}
          </button>
        ))}
      </div>

      <h4 className="actions-group-title">PDF engine actions</h4>
      <div className="document-actions">
        {PDF_ENGINE_ACTIONS.map((action) => (
          <div className="document-action-card" key={action.kind}>
            <button
              className="document-action-button secondary-button"
              type="button"
              disabled={
                actionState.kind === "submitting" ||
                (action.kind === "split-pdf" &&
                  splitFormState.pageRanges.trim().length === 0)
              }
              onClick={() => void handleAction(action)}
            >
              <span>{action.label}</span>
              <small>{action.description}</small>
              {actionState.kind === "submitting" &&
              actionState.actionKind === action.kind ? (
                <strong>Running...</strong>
              ) : null}
            </button>

            {action.kind === "split-pdf" ? (
              <label className="field split-field">
                <span>Page ranges</span>
                <input
                  name="pageRanges"
                  placeholder="1-3,5"
                  value={splitFormState.pageRanges}
                  onChange={(event) =>
                    setSplitFormState({
                      pageRanges: event.currentTarget.value
                    })
                  }
                  disabled={actionState.kind === "submitting"}
                />
              </label>
            ) : null}
          </div>
        ))}
      </div>

      {actionState.kind === "submitting" ? (
        <p className="status status-loading action-status">
          Applying action to document <code>{document.id}</code>...
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
    </section>
  )
}
