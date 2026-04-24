# PDF Engine Integration

## Purpose

This document records the first real integration step between `gantt-doc-platform` and `gantt-pdf-platform`.

`gantt-doc-platform` acts as the document layer. It owns document records, source artifacts, derived documents, local storage paths, and the API/UI flow visible to the user.

`gantt-pdf-platform` acts as the PDF execution engine. It receives PDF-specific requests, executes PDF processing, and returns result artifacts back to the document layer.

## Supported Operations

The current integration supports two PDF engine operations:

- `compress-pdf`
- `split-pdf`

No other PDF engine action should be treated as currently supported by `gantt-doc-platform`.

## Environment Configuration

The API integration depends on two environment variables:

- `PDF_ENGINE_BASE_URL`
- `PDF_ENGINE_AUTH_TOKEN`

For local happy-path runtime validation, `gantt-pdf-platform` must also run with `PDF_OPERATION_EXECUTION_MODE=real`; `simulate` mode does not guarantee a downloadable result artifact for `compress` or `split`.

`PDF_ENGINE_BASE_URL` must point to the reachable base URL of `gantt-pdf-platform`.

`PDF_ENGINE_AUTH_TOKEN` is used as a bearer token for authenticated requests to the PDF engine.

Operational rules:

- do not log the token value;
- do not commit the token to git;
- keep the token in local environment configuration only.

## Actual Flow

The current shared engine flow is:

1. Create a document in `gantt-pdf-platform`.
2. Upload the input source PDF file to that PDF engine document.
3. Create an engine operation:
   - `compress` for `compress-pdf`
   - `split` with `pageRanges` for `split-pdf`
4. Execute the operation.
5. Download the result artifact.
6. Save the downloaded result into `gantt-doc-platform` local storage.
7. Create a derived document record in `gantt-doc-platform`.

From the document-platform point of view, the PDF engine is an external execution boundary. The document platform remains responsible for document metadata, storage references, and derived-document registration.

For `split-pdf`, the engine contract is:

```json
{
  "operationType": "split",
  "pageRanges": "1-3,5"
}
```

The split result is not fixed to one artifact type. The engine may return:

- `application/pdf`
- `application/zip`
- `application/octet-stream`

The document platform preserves the returned file name and media type when saving the derived artifact locally.

## Error Response Shape

`compress-pdf` failures are returned as structured API errors.

Current response shape:

- `code`: stable machine-readable error code;
- `message`: user-facing error message;
- `details`: optional diagnostic details for developers and local troubleshooting.

Example shape:

```json
{
  "code": "PDF_ENGINE_UNAVAILABLE",
  "message": "PDF engine is unavailable or unreachable.",
  "details": "fetch failed"
}
```

The backend must not return raw stack traces to the user in this contract.

## User-Facing Messages And Technical Diagnostics

The error contract separates safe user messaging from implementation diagnostics.

- `message` is safe to show in UI near the action block;
- `details` is diagnostic only and may contain HTTP status context, storage paths, or downstream error text;
- `code` is the stable programmatic identifier for UI logic, debugging, and runbook references.

Operational rules:

- never log the bearer token value;
- never return the bearer token in API responses;
- do not place secrets into `details`;
- prefer explicit diagnostics instead of generic `"Something went wrong"` messages.

## PDF Engine Error Codes

The current engine-backed flows can return the following stable error codes.

### Local document and source validation

- `SOURCE_FILE_NOT_UPLOADED`
  returned when `compress-pdf` is triggered before a local PDF source file was uploaded.
- `SOURCE_FILE_MISSING`
  returned when the source artifact is marked as uploaded but the local file is no longer present on disk.
- `PDF_ACTION_UNSUPPORTED_DOCUMENT_KIND`
  returned when a PDF engine action is requested for a non-PDF document.

### Server configuration

- `PDF_ENGINE_BASE_URL_MISSING`
  returned when `PDF_ENGINE_BASE_URL` is not configured in `gantt-doc-platform`.
- `PDF_ENGINE_AUTH_TOKEN_MISSING`
  returned when `PDF_ENGINE_AUTH_TOKEN` is not configured in `gantt-doc-platform`.

### External PDF engine access

- `PDF_ENGINE_AUTH_INVALID`
  returned when the configured bearer token is rejected by `gantt-pdf-platform`.
- `PDF_ENGINE_UNAVAILABLE`
  returned when the PDF engine cannot be reached at all.
- `PDF_ENGINE_DOCUMENT_CREATE_FAILED`
  returned when engine-side document creation returns a failing HTTP response.
- `PDF_ENGINE_SOURCE_UPLOAD_FAILED`
  returned when uploading the source PDF to the engine fails.
- `PDF_ENGINE_JOB_CREATE_FAILED`
  returned when engine-side `compress` job creation fails.
- `PDF_ENGINE_EXECUTION_FAILED`
  returned when engine execution returns a failing HTTP response before a completed result is produced.
- `PDF_ENGINE_EXECUTION_UNEXPECTED_STATUS`
  returned when the engine responds but does not finish the operation in the expected completed state.
- `PDF_ENGINE_RESULT_DOWNLOAD_FAILED`
  returned when the engine-side result artifact cannot be downloaded after processing.
- `PDF_ENGINE_SPLIT_FAILED`
  returned when engine-side `split` setup or execution fails.
- `PDF_ENGINE_SPLIT_RESULT_INVALID`
  returned when the engine-side split result is empty or has an unsupported artifact shape.

### Local persistence after engine success

- `LOCAL_DERIVED_FILE_SAVE_FAILED`
  returned when the compressed artifact was received from the engine but saving it to local storage failed.

## Local Storage Paths

The current implementation stores local runtime artifacts under ignored project storage.

Stored artifact categories:

- source uploads: local files uploaded for a document before an engine action is executed;
- compressed derived result: the downloaded compressed PDF saved after the PDF engine returns the result;
- split derived result: the downloaded PDF or ZIP saved after the PDF engine returns the split result.

These files are runtime artifacts, not source code assets.

## Current Limitations

The current integration intentionally stays narrow.

- no OCR;
- no polling workflow;
- no jobs framework;
- no Docker networking setup between repositories;
- no shared package between `gantt-doc-platform` and `gantt-pdf-platform`.

This is a direct repository-to-repository HTTP integration with local storage persistence on the document-platform side.

## Git Hygiene

The integration produces runtime data that must stay out of tracked changes.

- `data/` is ignored;
- `storage/` is ignored;
- runtime-generated files must not be committed.

This keeps the repository focused on source code and documentation rather than local execution artifacts.

## Troubleshooting

### Missing base URL

If `PDF_ENGINE_BASE_URL` is not configured, `compress-pdf` cannot call the PDF engine and the action will fail before any external request is made.

### Missing token

If `PDF_ENGINE_AUTH_TOKEN` is not configured, authenticated PDF engine requests cannot be sent and the action will fail before the external workflow starts.

### Wrong token

If the token is invalid, the PDF engine can reject the request with an authorization error. The token value itself must still never be logged.

### Source file not uploaded

`compress-pdf` and `split-pdf` require an uploaded local PDF source file. If the source artifact is still only registered as a placeholder, the action must fail.

### PDF engine unavailable

If `gantt-pdf-platform` is down, unreachable, or otherwise unavailable, the gateway request will fail and `compress-pdf` cannot complete.

### Result download failed

If the PDF engine finishes processing but the result artifact cannot be downloaded, the document platform must report that failure instead of pretending the operation succeeded.

### Invalid split result

If the split endpoint returns an empty body or an unsupported artifact shape, the document platform must fail with `PDF_ENGINE_SPLIT_RESULT_INVALID` instead of registering a fake derived document.

### Local save failed

If the PDF engine returns a valid compressed PDF but `gantt-doc-platform` cannot persist it under local `storage/`, the flow must fail with `LOCAL_DERIVED_FILE_SAVE_FAILED` and must not register a fake successful derived document.
