import { useEffect, useState } from "react"

import type { OperationHistoryEntry } from "./documents-api"
import { loadOperationsHistory } from "./documents-api"
import {
  formatCreatedAt,
  formatFinishedAt,
  formatOperationKind,
  formatOperationStatus
} from "./document-formatters"

type HistoryState =
  | { kind: "loading" }
  | { kind: "ready"; operations: OperationHistoryEntry[] }
  | { kind: "error"; message: string }

export const OperationsHistoryPanel = ({
  onBack
}: {
  onBack: () => void
}) => {
  const [historyState, setHistoryState] = useState<HistoryState>({
    kind: "loading"
  })

  useEffect(() => {
    const abortController = new AbortController()

    const loadHistory = async (): Promise<void> => {
      setHistoryState({
        kind: "loading"
      })

      try {
        const operations = await loadOperationsHistory(abortController.signal)

        setHistoryState({
          kind: "ready",
          operations
        })
      } catch (error) {
        if (abortController.signal.aborted) {
          return
        }

        setHistoryState({
          kind: "error",
          message: error instanceof Error ? error.message : "Unknown error"
        })
      }
    }

    void loadHistory()

    return () => {
      abortController.abort()
    }
  }, [])

  return (
    <>
      <div className="hero">
        <p className="eyebrow">Document platform</p>
        <h1 className="title">Operations History</h1>
        <p className="description">
          Global PDF action history across all documents, sorted newest first.
        </p>
      </div>

      <section className="section tool-panel-section">
        <div className="tool-panel-header">
          <div className="section-header">
            <h2>History</h2>
            <p>Completed and failed PDF actions from the current local workspace.</p>
          </div>

          <button className="secondary-button" type="button" onClick={onBack}>
            Back to toolbox
          </button>
        </div>

        {historyState.kind === "loading" ? (
          <p className="status status-loading">Loading operations history...</p>
        ) : null}

        {historyState.kind === "error" ? (
          <p className="status status-error">
            Failed to load operations history: {historyState.message}
          </p>
        ) : null}

        {historyState.kind === "ready" && historyState.operations.length === 0 ? (
          <div className="empty-state">
            <h3>No operations yet</h3>
            <p>No PDF actions have been recorded across documents yet.</p>
          </div>
        ) : null}

        {historyState.kind === "ready" && historyState.operations.length > 0 ? (
          <ul className="details-list history-list">
            {historyState.operations.map((operation) => (
              <li
                className={`details-list-item history-list-item${
                  operation.status === "failed" ? " details-list-item-error" : ""
                }`}
                key={operation.id}
              >
                <div className="history-list-content">
                  <div>
                    <p className="details-list-title">
                      {formatOperationKind(operation.kind)}
                    </p>
                    <p className="details-list-caption">{operation.documentName}</p>
                  </div>

                  <dl className="history-meta">
                    <div>
                      <dt>Document ID</dt>
                      <dd>
                        <code>{operation.documentId}</code>
                      </dd>
                    </div>
                    <div>
                      <dt>Created</dt>
                      <dd>{formatCreatedAt(operation.createdAt)}</dd>
                    </div>
                    <div>
                      <dt>Finished</dt>
                      <dd>{formatFinishedAt(operation.finishedAt)}</dd>
                    </div>
                    <div>
                      <dt>Status</dt>
                      <dd>{formatOperationStatus(operation.status)}</dd>
                    </div>
                  </dl>

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
        ) : null}
      </section>
    </>
  )
}
