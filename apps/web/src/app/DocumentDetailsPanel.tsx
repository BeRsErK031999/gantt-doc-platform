import { DocumentActionsPanel } from "./DocumentActionsPanel"
import type { DocumentDetails } from "./documents-api"
import {
  formatCreatedAt,
  formatDerivationKind,
  formatDocumentKind,
  formatDocumentStatus,
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
          <p>Registered placeholder for the original document artifact.</p>
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
          <div>
            <dt>Created at</dt>
            <dd>{formatCreatedAt(document.sourceArtifact.createdAt)}</dd>
          </div>
        </dl>
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
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="details-section">
        <div className="section-header compact-section-header">
          <h3>Document operations</h3>
          <p>Placeholder operations with document platform and PDF engine boundaries.</p>
        </div>

        {document.operations.length === 0 ? (
          <div className="empty-state section-empty-state">
            <h4>No planned operations</h4>
            <p>This document does not have operation placeholders yet.</p>
          </div>
        ) : (
          <ul className="details-list">
            {document.operations.map((operation) => (
              <li className="details-list-item" key={operation.id}>
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
                </div>
                <span className="details-badge">
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
          <p>Placeholder metadata for the future document platform.</p>
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
