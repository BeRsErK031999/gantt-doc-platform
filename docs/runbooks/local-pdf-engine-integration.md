# Local PDF Engine Integration

## Purpose

This runbook records the current local runtime flow between:

- `C:\Projects\gantt-pdf-platform` as the PDF execution engine;
- `C:\Projects\gantt-doc-platform` API as the orchestration layer;
- `C:\Projects\gantt-doc-platform` web as the local validation UI.

Current integration scope:

- `compress-pdf`
- `split-pdf`
- `merge-pdf`

No queue, polling, drag-and-drop upload, or local PDF merge logic is part of this step.

## Local Ports

Recommended local setup:

- `gantt-pdf-platform` API: `3101`
- `gantt-doc-platform` API: `3004`
- `gantt-doc-platform` web: `4173`

If you want browser validation through the current Vite proxy without changing config, start `gantt-doc-platform` API on `3000`.

## Required Environment

For `gantt-doc-platform` API:

```powershell
$env:PORT="3004"
$env:PDF_ENGINE_BASE_URL="http://localhost:3101"
$env:PDF_ENGINE_AUTH_TOKEN="local-dev-token"
```

For `gantt-pdf-platform` API:

```powershell
$env:API_PORT="3101"
$env:API_AUTH_TOKEN="local-dev-token"
$env:PDF_OPERATION_EXECUTION_MODE="real"
```

Security rules:

- keep `PDF_ENGINE_AUTH_TOKEN` only in local env or `.env`;
- do not log the token value;
- do not return the token in API responses;
- read env only through `apps/api/src/config.ts`.

## Start The Services

Start `gantt-pdf-platform`:

```powershell
cd C:\Projects\gantt-pdf-platform
yarn.cmd workspace @gantt-pdf-platform/api dev
```

Check health:

```powershell
Invoke-WebRequest -Uri http://localhost:3101/health -UseBasicParsing
```

Start `gantt-doc-platform` API:

```powershell
cd C:\Projects\gantt-doc-platform
yarn.cmd workspace @gantt-doc/api dev
```

Check health:

```powershell
Invoke-WebRequest -Uri http://localhost:3004/health -UseBasicParsing
```

Start `gantt-doc-platform` web:

```powershell
cd C:\Projects\gantt-doc-platform
yarn.cmd workspace @gantt-doc/web dev --host localhost --port 4173
```

## Real PDF Engine Contract

The current doc-platform integration uses these engine endpoints:

- `POST /api/v1/documents`
- `POST /api/v1/documents/:documentId/upload-input-file`
- `POST /api/v1/documents/:documentId/operations`
- `POST /api/v1/documents/:documentId/operations/:jobId/execute`
- `GET /api/v1/documents/:documentId/operations/:jobId/result`

Every `/api/v1/*` request requires:

- `Authorization: Bearer <token>`

Create-document payload:

```json
{
  "name": "Local Runtime PDF Check",
  "source": "manual-upload"
}
```

Operation payloads:

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

Important merge behavior:

- the engine document used in `POST /operations` is always the implicit first source;
- `sourceDocumentIds` must contain only additional engine document ids in order;
- result download stays on the primary document job result endpoint.

## Happy Path Runtime Check

### 1. Open Toolbox

Open the local web app and choose `Merge PDF`.

### 2. Choose two small PDFs

Use the merge tool input:

```text
<input type="file" multiple accept="application/pdf">
```

Expected UI behavior:

- both files appear in the selected list;
- upload button is enabled.

### 3. Upload files

Expected result:

- HTTP `201` for each `POST /documents`;
- HTTP `200` for each `POST /documents/:id/upload`;
- two local source files stored under `storage/documents/<documentId>/original.pdf`;
- Toolbox shows uploaded document ids;
- the first uploaded document becomes the root merge document.

### 4. Run `merge-pdf`

Request from doc-platform API:

```json
{
  "kind": "merge-pdf",
  "sourceDocumentIds": ["<second-doc-id>"],
  "pageNumberingMode": "none"
}
```

Expected result:

- HTTP `200`;
- operation history gets a completed `merge-pdf` entry on the root document;
- derived document has `derivationKind = "merge-pdf"`;
- derived document kind stays `pdf`;
- file stored under `storage/documents/<rootDocumentId>/derived/<derivedDocumentId>/<engineFileName>`;
- if the engine omits a filename, local fallback is `merged.pdf`.

### 5. Download merged result

Download endpoint:

```text
GET /documents/:id/derived/:derivedId/download
```

Checks:

- HTTP `200`;
- non-empty file;
- `Content-Type = application/pdf`;
- `Content-Disposition` uses the stored filename;
- first bytes start with `%PDF-`.

### 6. Verify document details

Open the root document details screen and confirm:

- operation history contains completed `merge-pdf`;
- derived documents contains the merged PDF;
- download button works for the merged derived document.

## Negative Checks

### Merge with less than two PDFs

Request:

```json
{
  "kind": "merge-pdf",
  "sourceDocumentIds": []
}
```

Expected:

- HTTP `400`;
- `code = "MERGE_SOURCE_DOCUMENTS_REQUIRED"`.

### Merge with DOCX source

Use a `docx` document id inside `sourceDocumentIds`.

Expected:

- HTTP `400`;
- `code = "MERGE_SOURCE_DOCUMENT_UNSUPPORTED_KIND"`.

### Merge with missing uploaded source

Create a PDF document but do not upload its source file, then use it as an additional merge source.

Expected:

- HTTP `400`;
- `code = "MERGE_SOURCE_FILE_NOT_UPLOADED"`.

### Wrong token

Set an invalid `PDF_ENGINE_AUTH_TOKEN` in `gantt-doc-platform`.

Expected:

- engine request fails;
- token value is not logged;
- token value is not returned in API response;
- API error uses `PDF_ENGINE_AUTH_INVALID`.

### Engine unavailable

Stop `gantt-pdf-platform` and rerun `merge-pdf`.

Expected:

- API error uses `PDF_ENGINE_UNAVAILABLE`.

## Runtime Check Notes

- merge uses the current root document as the implicit first source because that is the actual `gantt-pdf-platform` contract;
- doc-platform uploads each additional merge source as its own engine document before creating the merge job;
- doc-platform does not merge bytes locally;
- local runtime artifacts under `data/`, `storage/`, `dist/`, `node_modules/`, and `.yarn/` must remain untracked.
