# Local PDF Engine Integration

## Purpose

This runbook records the current local runtime flow between:

- `C:\Projects\gantt-pdf-platform` as the PDF engine
- `C:\Projects\gantt-doc-platform` API as the document layer
- `C:\Projects\gantt-doc-platform` web as the local validation UI

The current integration scope is intentionally narrow:

- `compress-pdf`
- `split-pdf`

No queue, polling, SDK, or Docker networking layer is part of this step.

## Local Ports

Recommended local setup:

- `gantt-pdf-platform` API: `3101`
- `gantt-doc-platform` API: `3004`
- `gantt-doc-platform` web: `4173`

If you want to validate the browser flow through the current Vite proxy without changing config, start `gantt-doc-platform` API on `3000`.

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

- keep `PDF_ENGINE_AUTH_TOKEN` only in local env or `.env`
- do not log the token value
- do not return the token in API responses
- read env only through `apps/api/src/config.ts`

## Start The Services

Start `gantt-pdf-platform`:

```powershell
cd C:\Projects\gantt-pdf-platform
yarn.cmd workspace @gantt-pdf-platform/api dev
```

Important runtime note:

- `PDF_OPERATION_EXECUTION_MODE` must be `real` for `compress-pdf` and `split-pdf` happy-path download checks
- in `simulate` mode the engine can complete the job without persisting a downloadable result artifact

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

The current doc-platform integration uses these PDF engine endpoints:

- `POST /api/v1/documents`
- `POST /api/v1/documents/:documentId/upload-input-file`
- `POST /api/v1/documents/:documentId/operations`
- `POST /api/v1/documents/:documentId/operations/:jobId/execute`
- `GET /api/v1/documents/:documentId/operations/:jobId/result`

Operation payloads:

```json
{ "operationType": "compress" }
```

```json
{ "operationType": "split", "pageRanges": "1-3,5" }
```

Split result shape:

- may be `application/pdf`
- may be `application/zip`
- may be `application/octet-stream`
- filename comes from `content-disposition` when present, otherwise doc-platform uses a local fallback

## Happy Path Runtime Check

### 1. Create PDF document

```powershell
$createBody = @{
  name = "Local Runtime PDF Check"
  kind = "pdf"
} | ConvertTo-Json

$document = Invoke-RestMethod `
  -Uri "http://localhost:3004/documents" `
  -Method Post `
  -ContentType "application/json" `
  -Body $createBody
```

### 2. Upload source PDF

Upload a valid local PDF to:

```text
POST http://localhost:3004/documents/:id/upload
```

Expected result:

- HTTP `200`
- `sourceArtifact.status = "uploaded"`
- file stored under `storage/documents/<documentId>/original.pdf`

### 3. Run `compress-pdf`

```powershell
$compressBody = @{ kind = "compress-pdf" } | ConvertTo-Json

$compressedDocument = Invoke-RestMethod `
  -Uri "http://localhost:3004/documents/$($document.id)/actions" `
  -Method Post `
  -ContentType "application/json" `
  -Body $compressBody
```

Expected result:

- HTTP `200`
- derived document with `derivationKind = "compressed-pdf"`
- compressed file stored under `storage/documents/<documentId>/derived/<derivedId>/compressed.pdf` or the returned engine filename

### 4. Run `split-pdf`

```powershell
$splitBody = @{
  kind = "split-pdf"
  pageRanges = "1"
} | ConvertTo-Json

$splitDocument = Invoke-RestMethod `
  -Uri "http://localhost:3004/documents/$($document.id)/actions" `
  -Method Post `
  -ContentType "application/json" `
  -Body $splitBody
```

Expected result:

- HTTP `200`
- derived document with `derivationKind = "split-pdf"`
- split file stored under `storage/documents/<documentId>/derived/<derivedId>/<engineFileName>`
- derived document kind is `pdf` for PDF output or `zip` for ZIP output

### 5. Download both derived artifacts

Download endpoint:

```text
GET /documents/:id/derived/:derivedId/download
```

Example:

```powershell
Invoke-WebRequest `
  -Uri "http://localhost:3004/documents/<documentId>/derived/<derivedId>/download" `
  -UseBasicParsing `
  -OutFile ".\\result.bin"
```

Checks:

- HTTP `200`
- non-empty file
- `Content-Disposition` includes the saved filename
- `Content-Type` matches the stored artifact type
- compressed result is a PDF
- split result is either a PDF or ZIP

## Negative Checks

### Split without upload

Request:

```json
{ "kind": "split-pdf", "pageRanges": "1" }
```

Expected:

- HTTP `400`
- `code = "SOURCE_FILE_NOT_UPLOADED"`

### Split for DOCX

Create a `docx` document and call:

```json
{ "kind": "split-pdf", "pageRanges": "1" }
```

Expected:

- HTTP `400`
- `code = "PDF_ACTION_UNSUPPORTED_DOCUMENT_KIND"`

### Invalid token

Set a wrong `PDF_ENGINE_AUTH_TOKEN` in `gantt-doc-platform`.

Expected:

- gateway request fails
- token value is not logged
- token value is not returned in API response
- API error uses `PDF_ENGINE_AUTH_INVALID`

### Engine down

Stop `gantt-pdf-platform` and rerun `compress-pdf` or `split-pdf`.

Expected:

- API error uses `PDF_ENGINE_UNAVAILABLE`

### Malformed split payload

Call:

```json
{ "kind": "split-pdf", "pageRanges": "4-2" }
```

Expected:

- engine rejects split job creation
- doc-platform surfaces the failure through the standard error contract
- most split engine failures map to `PDF_ENGINE_SPLIT_FAILED`

## Error Contract

Current engine-backed errors use:

```json
{
  "code": "PDF_ENGINE_SPLIT_FAILED",
  "message": "PDF engine split execution failed.",
  "details": "HTTP 400. Field 'pageRanges' must use ascending page ranges such as \"2-4\" instead of \"4-2\"."
}
```

Rules:

- `code` is stable and machine-readable
- `message` is safe for UI
- `details` is optional and diagnostic only
- `details` must not include secrets

## Runtime Artifacts And Git Hygiene

Local runtime creates artifacts under ignored paths:

- `data/`
- `storage/`
- `dist/`
- `node_modules/`
- `.yarn/`

These must remain local-only and must not be committed.
