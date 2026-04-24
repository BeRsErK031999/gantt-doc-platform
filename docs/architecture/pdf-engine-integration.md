# PDF Engine Integration

## Purpose

This document records the current real integration between `gantt-doc-platform` and `gantt-pdf-platform`.

`gantt-doc-platform` remains the orchestration layer. It owns:

- document records;
- uploaded source artifacts;
- derived documents;
- operation history;
- local storage paths;
- API and UI behavior visible to the user.

`gantt-pdf-platform` remains the execution engine. It owns:

- PDF operation contract validation;
- authenticated PDF execution;
- downloadable operation results.

`gantt-doc-platform` must not implement local PDF merge logic.

## Supported Operations

The current integration supports three real PDF engine actions:

- `compress-pdf`
- `split-pdf`
- `merge-pdf`

Operational constraints for the current milestone:

- `compress-pdf` accepts one uploaded PDF source;
- `split-pdf` accepts one uploaded PDF source plus required `pageRanges`;
- `merge-pdf` accepts one root uploaded PDF plus at least one additional uploaded PDF source;
- DOCX and ZIP cannot be used as merge sources;
- merge result must stay a PDF artifact;
- split result may still be PDF or ZIP depending on the engine response.

## Environment Configuration

The API integration depends on two environment variables:

- `PDF_ENGINE_BASE_URL`
- `PDF_ENGINE_AUTH_TOKEN`

`PDF_ENGINE_BASE_URL` must point to the reachable base URL of `gantt-pdf-platform`.

`PDF_ENGINE_AUTH_TOKEN` is used as a bearer token for every authenticated engine request.

Operational rules:

- do not log the token value;
- do not commit the token to git;
- keep the token in local environment configuration only.

For local happy-path runtime validation, `gantt-pdf-platform` must run with `PDF_OPERATION_EXECUTION_MODE=real`.

## Actual Engine Contract

The current doc-platform integration uses these `gantt-pdf-platform` endpoints:

- `POST /api/v1/documents`
- `POST /api/v1/documents/:documentId/upload-input-file`
- `POST /api/v1/documents/:documentId/operations`
- `POST /api/v1/documents/:documentId/operations/:jobId/execute`
- `GET /api/v1/documents/:documentId/operations/:jobId/result`

Every `/api/v1/*` request requires:

- `Authorization: Bearer <token>`

The create-document request must include:

```json
{
  "name": "Document name",
  "source": "manual-upload"
}
```

The current operation payloads are:

```json
{ "operationType": "compress" }
```

```json
{ "operationType": "split", "pageRanges": "1-3,5" }
```

```json
{
  "operationType": "merge",
  "sourceDocumentIds": ["additional-engine-document-id"],
  "excludePageRanges": "1",
  "pageNumberingMode": "none"
}
```

Important merge contract detail:

- the current engine document is always the implicit first merge source;
- `sourceDocumentIds` must contain only additional engine document ids in the requested order;
- `pageNumberingMode` supports `none` and `append`;
- `excludePageRanges` is optional.

## Actual Flow

### Compress and split

1. Create a document in `gantt-pdf-platform`.
2. Upload the root PDF file to that engine document.
3. Create the engine operation.
4. Execute the operation.
5. Download the result artifact.
6. Save the result under local `storage/`.
7. Create a derived document in `gantt-doc-platform`.

### Merge

1. Validate the root document exists, is a PDF, and has an uploaded local source file.
2. Validate every additional `sourceDocumentId` exists, is a PDF, and has an uploaded local source file.
3. Create a primary engine document for the root source.
4. Upload the root source PDF to the primary engine document.
5. Create one additional engine document per extra merge source.
6. Upload each additional source PDF to its own engine document.
7. Create one merge operation on the primary engine document with ordered additional engine document ids.
8. Execute the merge operation.
9. Download the merge result from the primary engine document job result endpoint.
10. Save the merged PDF locally.
11. Register a derived document with `origin.derivationKind = "merge-pdf"`.
12. Add operation history on the root document.

## Local Storage Paths

`gantt-doc-platform` stores runtime files under ignored local storage paths:

- source upload: `storage/documents/<documentId>/original.pdf`
- compressed result: `storage/documents/<rootDocumentId>/derived/<derivedDocumentId>/<engineFileName>`
- split result: `storage/documents/<rootDocumentId>/derived/<derivedDocumentId>/<engineFileName>`
- merge result: `storage/documents/<rootDocumentId>/derived/<derivedDocumentId>/<engineFileName>`

If the engine does not provide a merge filename, doc-platform falls back to `merged.pdf`.

The stored derived media type and file name are preserved and reused by the download endpoint.

## Download Behavior

Derived artifacts are downloaded from:

- `GET /documents/:id/derived/:derivedId/download`

Current behavior:

- the API reads the saved local artifact referenced by the derived document;
- `Content-Disposition` uses the stored file name;
- `Content-Type` uses the stored media type;
- merge downloads reuse the stored merge filename and media type instead of hardcoding PDF headers globally;
- split results may still download as PDF or ZIP depending on the stored engine output.

## Error Response Shape

Engine-backed failures use the same structured contract:

- `code`: stable machine-readable error code;
- `message`: user-facing error message;
- `details`: optional diagnostic details.

Example:

```json
{
  "code": "PDF_ENGINE_MERGE_FAILED",
  "message": "PDF engine merge execution failed.",
  "details": "HTTP 400. Field 'sourceDocumentIds' must contain at least one additional document id for merge operations."
}
```

The backend must not return raw stack traces or secrets in this contract.

## Runtime Checks

Current runtime checks for `merge-pdf`:

- require at least two uploaded PDFs in Toolbox before merge can run;
- reject non-PDF merge sources;
- reject sources without uploaded local files;
- reject missing local storage files before calling the engine;
- reject wrong engine token through `PDF_ENGINE_AUTH_INVALID`;
- reject engine downtime through `PDF_ENGINE_UNAVAILABLE`;
- reject invalid merge result artifacts through `PDF_ENGINE_MERGE_RESULT_INVALID`.

## Stable Error Codes

Local document and source validation:

- `SOURCE_FILE_NOT_UPLOADED`
- `SOURCE_FILE_MISSING`
- `PDF_ACTION_UNSUPPORTED_DOCUMENT_KIND`
- `MERGE_SOURCE_DOCUMENTS_REQUIRED`
- `MERGE_SOURCE_DOCUMENT_NOT_FOUND`
- `MERGE_SOURCE_DOCUMENT_UNSUPPORTED_KIND`
- `MERGE_SOURCE_FILE_NOT_UPLOADED`
- `MERGE_SOURCE_FILE_MISSING`

Server configuration:

- `PDF_ENGINE_BASE_URL_MISSING`
- `PDF_ENGINE_AUTH_TOKEN_MISSING`

External PDF engine access:

- `PDF_ENGINE_AUTH_INVALID`
- `PDF_ENGINE_UNAVAILABLE`
- `PDF_ENGINE_DOCUMENT_CREATE_FAILED`
- `PDF_ENGINE_SOURCE_UPLOAD_FAILED`
- `PDF_ENGINE_JOB_CREATE_FAILED`
- `PDF_ENGINE_EXECUTION_FAILED`
- `PDF_ENGINE_EXECUTION_UNEXPECTED_STATUS`
- `PDF_ENGINE_RESULT_DOWNLOAD_FAILED`
- `PDF_ENGINE_SPLIT_FAILED`
- `PDF_ENGINE_SPLIT_RESULT_INVALID`
- `PDF_ENGINE_MERGE_FAILED`
- `PDF_ENGINE_MERGE_RESULT_INVALID`

Local persistence after engine success:

- `LOCAL_DERIVED_FILE_SAVE_FAILED`

## Current Limitations

The current integration intentionally stays narrow:

- no queue or polling workflow;
- no drag-and-drop upload UI;
- no page thumbnail UI;
- no client-side PDF merge implementation;
- no shared SDK between repositories;
- no new engine actions beyond `compress-pdf`, `split-pdf`, and `merge-pdf`.

## Git Hygiene

The integration produces runtime data that must stay out of tracked changes:

- `data/`
- `storage/`
- `dist/`
- `node_modules/`
- `.yarn/`
