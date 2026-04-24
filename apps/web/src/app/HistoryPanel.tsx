import { useEffect, useState } from "react"

import type { OperationHistoryEntry } from "./documents-api"
import { ApiError, loadOperationsHistory, runDocumentAction } from "./documents-api"
import {
  formatCreatedAt,
  formatFinishedAt,
  formatOperationErrorMessage,
  formatOperationKind,
  formatOperationRetrySummary,
  formatOperationStatus
} from "./document-formatters"

type HistoryFilter = "all" | "completed" | "failed"

type HistoryState =
  | { kind: "loading" }
  | { kind: "ready"; operations: OperationHistoryEntry[] }
  | { kind: "error"; message: string }

type RetryState =
  | { kind: "idle" }
  | { kind: "submitting"; operationId: string }
  | { kind: "success"; message: string }
  | { kind: "error"; message: string }

const HISTORY_FILTERS: Array<{
  id: HistoryFilter
  label: string
}> = [
  { id: "all", label: "All" },
  { id: "completed", label: "Success" },
  { id: "failed", label: "Failed" }
]

const isToday = (value: string): boolean => {
  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return false
  }

  const now = new Date()

  return (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  )
}

const groupOperations = (
  operations: OperationHistoryEntry[]
): Array<{
  title: "Today" | "Earlier"
  operations: OperationHistoryEntry[]
}> => {
  const todayOperations = operations.filter((operation) => isToday(operation.createdAt))
  const earlierOperations = operations.filter((operation) => !isToday(operation.createdAt))
  const groups: Array<{
    title: "Today" | "Earlier"
    operations: OperationHistoryEntry[]
  }> = []

  if (todayOperations.length > 0) {
    groups.push({
      title: "Today",
      operations: todayOperations
    })
  }

  if (earlierOperations.length > 0) {
    groups.push({
      title: "Earlier",
      operations: earlierOperations
    })
  }

  return groups
}

export const HistoryPanel = ({
  onBack
}: {
  onBack: () => void
}) => {
  const [historyState, setHistoryState] = useState<HistoryState>({
    kind: "loading"
  })
  const [activeFilter, setActiveFilter] = useState<HistoryFilter>("all")
  const [retryState, setRetryState] = useState<RetryState>({ kind: "idle" })

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

  const handleReload = async (): Promise<void> => {
    setRetryState({ kind: "idle" })
    setHistoryState({ kind: "loading" })

    try {
      const operations = await loadOperationsHistory()

      setHistoryState({
        kind: "ready",
        operations
      })
    } catch (error) {
      setHistoryState({
        kind: "error",
        message: error instanceof Error ? error.message : "Unknown error"
      })
    }
  }

  const handleRetry = async (
    operation: OperationHistoryEntry
  ): Promise<void> => {
    if (operation.input === undefined) {
      setRetryState({
        kind: "error",
        message:
          "Retry is unavailable for this legacy history entry because the original action input was not saved."
      })

      return
    }

    setRetryState({
      kind: "submitting",
      operationId: operation.id
    })

    try {
      await runDocumentAction(operation.documentId, operation.input)
      const operations = await loadOperationsHistory()

      setHistoryState({
        kind: "ready",
        operations
      })
      setRetryState({
        kind: "success",
        message: `${formatOperationKind(operation.kind)} was queued again for ${operation.documentName}.`
      })
    } catch (error) {
      if (error instanceof ApiError) {
        setRetryState({
          kind: "error",
          message: formatOperationErrorMessage({
            code: error.code,
            fallbackMessage: error.message
          })
        })

        return
      }

      setRetryState({
        kind: "error",
        message: error instanceof Error ? error.message : "Unknown error"
      })
    }
  }

  const filteredOperations =
    historyState.kind === "ready"
      ? historyState.operations.filter((operation) => {
          if (activeFilter === "all") {
            return true
          }

          return operation.status === activeFilter
        })
      : []

  const groupedOperations = groupOperations(filteredOperations)

  return (
    <>
      <div className="hero">
        <p className="eyebrow">Document platform</p>
        <h1 className="title">Operations History</h1>
        <p className="description">
          Global PDF action history with filters, retry actions, and clearer failure visibility.
        </p>
      </div>

      <section className="section tool-panel-section">
        <div className="tool-panel-header">
          <div className="section-header">
            <h2>History</h2>
            <p>Completed and failed PDF actions from the current local workspace.</p>
          </div>

          <div className="panel-actions">
            <button className="secondary-button" type="button" onClick={() => void handleReload()}>
              Refresh
            </button>
            <button className="secondary-button" type="button" onClick={onBack}>
              Back to toolbox
            </button>
          </div>
        </div>

        <div className="filter-row" aria-label="History filters">
          {HISTORY_FILTERS.map((filter) => (
            <button
              className={`filter-chip${
                activeFilter === filter.id ? " filter-chip-active" : ""
              }`}
              key={filter.id}
              type="button"
              onClick={() => setActiveFilter(filter.id)}
            >
              {filter.label}
            </button>
          ))}
        </div>

        {retryState.kind === "success" ? (
          <p className="status status-loading">{retryState.message}</p>
        ) : null}

        {retryState.kind === "error" ? (
          <p className="status status-error">{retryState.message}</p>
        ) : null}

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

        {historyState.kind === "ready" &&
        historyState.operations.length > 0 &&
        filteredOperations.length === 0 ? (
          <div className="empty-state">
            <h3>No matches for this filter</h3>
            <p>Try another filter to see the rest of the workspace history.</p>
          </div>
        ) : null}

        {groupedOperations.map((group) => (
          <section className="history-group" key={group.title}>
            <div className="section-header compact-section-header">
              <h3>{group.title}</h3>
              <p>{group.operations.length} operation(s)</p>
            </div>

            <ul className="details-list history-list">
              {group.operations.map((operation) => (
                <li
                  className={`details-list-item history-list-item${
                    operation.status === "failed" ? " details-list-item-error history-list-item-error" : ""
                  }`}
                  key={operation.id}
                >
                  <div className="history-list-content">
                    <div>
                      <div className="history-item-header">
                        <div>
                          <p className="details-list-title">
                            {formatOperationKind(operation.kind)}
                          </p>
                          <p className="details-list-caption">{operation.documentName}</p>
                        </div>

                        <span
                          className={`details-badge${
                            operation.status === "failed" ? " details-badge-error" : ""
                          }`}
                        >
                          {formatOperationStatus(operation.status)}
                        </span>
                      </div>
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
                        <dt>Retry setup</dt>
                        <dd>{formatOperationRetrySummary(operation.input)}</dd>
                      </div>
                    </dl>

                    {operation.errorMessage === undefined ? null : (
                      <div className="history-error-block">
                        <p className="details-list-error">
                          {formatOperationErrorMessage({
                            code: operation.errorCode,
                            fallbackMessage: operation.errorMessage
                          })}
                        </p>
                        {operation.errorCode !== undefined ? (
                          <p className="status-technical-details">
                            Error code: <code>{operation.errorCode}</code>
                          </p>
                        ) : null}
                      </div>
                    )}

                    {operation.status === "failed" ? (
                      <div className="tool-action-row">
                        <button
                          className="primary-button"
                          type="button"
                          disabled={
                            operation.input === undefined ||
                            retryState.kind === "submitting" &&
                            retryState.operationId === operation.id
                          }
                          onClick={() => void handleRetry(operation)}
                        >
                          {operation.input === undefined
                            ? "Retry unavailable"
                            : retryState.kind === "submitting" &&
                          retryState.operationId === operation.id
                            ? "Retrying..."
                            : "Retry"}
                        </button>
                      </div>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </section>
    </>
  )
}
