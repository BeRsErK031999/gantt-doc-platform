import type { PdfEngineActionKind } from "../documents/document.js"

export type SubmitPdfActionInput = {
  actionKind: PdfEngineActionKind
  documentId: string
  sourceFileName: string
}

export type PdfEngineActionSubmissionResult = {
  engineRequestId: string
  status: "stubbed"
}

export type PdfEngineGateway = {
  submitPdfAction: (
    input: SubmitPdfActionInput
  ) => Promise<PdfEngineActionSubmissionResult>
}

export const createStubPdfEngineGateway = (): PdfEngineGateway => {
  return {
    submitPdfAction: async (input) => ({
      engineRequestId: `${input.documentId}-${input.actionKind}-stub`,
      status: "stubbed"
    })
  }
}
