import { useEffect, useState } from "react"

import { runDocumentAction } from "./documents-api"
import type {
  DocumentActionKind,
  DocumentDetails,
  PdfEngineActionKind,
  PlatformDocumentActionKind
} from "./documents-api"

type ActionState =
  | { kind: "idle" }
  | { kind: "submitting"; actionKind: DocumentActionKind }
  | { kind: "success"; message: string }
  | { kind: "error"; message: string }

type ActionDefinition = {
  description: string
  kind: DocumentActionKind
  label: string
  successMessage: string
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
  ActionDefinition & { kind: PdfEngineActionKind }
> = [
  {
    kind: "compress-pdf",
    label: "Compress PDF",
    description: "Submit a local PDF engine placeholder for this document.",
    successMessage: "PDF compression placeholder submitted."
  },
  {
    kind: "split-pdf",
    label: "Split PDF",
    description: "Submit a local PDF split placeholder for this document.",
    successMessage: "PDF split placeholder submitted."
  }
]

export const DocumentActionsPanel = ({
  document,
  onDocumentUpdated
}: {
  document: DocumentDetails
  onDocumentUpdated: (document: DocumentDetails) => void | Promise<void>
}) => {
  const [actionState, setActionState] = useState<ActionState>({ kind: "idle" })

  useEffect(() => {
    setActionState({ kind: "idle" })
  }, [document.id])

  const handleAction = async (
    action: ActionDefinition
  ): Promise<void> => {
    setActionState({
      kind: "submitting",
      actionKind: action.kind
    })

    try {
      const updatedDocument = await runDocumentAction(document.id, {
        kind: action.kind
      })

      await onDocumentUpdated(updatedDocument)
      setActionState({
        kind: "success",
        message: action.successMessage
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error"

      setActionState({
        kind: "error",
        message
      })
    }
  }

  return (
    <section className="details-section">
      <div className="section-header compact-section-header">
        <h3>Document actions</h3>
        <p>Run placeholder actions through the current document action flow.</p>
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
              <strong>Submitting...</strong>
            ) : null}
          </button>
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
        <p className="status status-error action-status">
          Failed to run document action: {actionState.message}
        </p>
      ) : null}
    </section>
  )
}
