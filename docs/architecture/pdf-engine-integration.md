# PDF Engine Integration

## Purpose

This document records the first real integration step between `gantt-doc-platform` and `gantt-pdf-platform`.

`gantt-doc-platform` acts as the document layer. It owns document records, source artifacts, derived documents, local storage paths, and the API/UI flow visible to the user.

`gantt-pdf-platform` acts as the PDF execution engine. It receives PDF-specific requests, executes PDF processing, and returns result artifacts back to the document layer.

## Supported Operation

The current integration supports only one PDF engine operation:

- `compress-pdf`

No other PDF engine action should be treated as currently supported by `gantt-doc-platform`.

## Environment Configuration

The API integration depends on two environment variables:

- `PDF_ENGINE_BASE_URL`
- `PDF_ENGINE_AUTH_TOKEN`

`PDF_ENGINE_BASE_URL` must point to the reachable base URL of `gantt-pdf-platform`.

`PDF_ENGINE_AUTH_TOKEN` is used as a bearer token for authenticated requests to the PDF engine.

Operational rules:

- do not log the token value;
- do not commit the token to git;
- keep the token in local environment configuration only.

## Actual Flow

The current `compress-pdf` flow is:

1. Create a document in `gantt-pdf-platform`.
2. Upload the input source PDF file to that PDF engine document.
3. Create a `compress` operation in the PDF engine.
4. Execute the operation.
5. Download the compressed result artifact.
6. Save the downloaded result into `gantt-doc-platform` local storage.
7. Create a derived document record in `gantt-doc-platform`.

From the document-platform point of view, the PDF engine is an external execution boundary. The document platform remains responsible for document metadata, storage references, and derived-document registration.

## Local Storage Paths

The current implementation stores local runtime artifacts under ignored project storage.

Stored artifact categories:

- source uploads: local files uploaded for a document before `compress-pdf` is executed;
- compressed derived result: the downloaded compressed PDF saved after the PDF engine returns the result.

These files are runtime artifacts, not source code assets.

## Current Limitations

The current integration intentionally stays narrow.

- no `split-pdf`;
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

`compress-pdf` requires an uploaded local PDF source file. If the source artifact is still only registered as a placeholder, the action must fail.

### PDF engine unavailable

If `gantt-pdf-platform` is down, unreachable, or otherwise unavailable, the gateway request will fail and `compress-pdf` cannot complete.

### Result download failed

If the PDF engine finishes processing but the result artifact cannot be downloaded, the document platform must report that failure instead of pretending the operation succeeded.
