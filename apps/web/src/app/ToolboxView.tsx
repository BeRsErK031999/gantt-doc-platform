import type { ActiveTool } from "./ToolPanel"

type ToolDefinition = {
  description: string
  id: ActiveTool
  title: string
}

const TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    id: "compress",
    title: "Compress PDF",
    description:
      "Upload a PDF, run compression through the existing backend flow, and download the derived document."
  },
  {
    id: "split",
    title: "Split PDF",
    description:
      "Upload a PDF, define page ranges, run split through the existing backend flow, and download the ZIP result."
  },
  {
    id: "merge",
    title: "Merge PDF",
    description:
      "Upload multiple PDFs, reorder them, run merge through the external PDF engine, and manage the result set."
  }
]

export const ToolboxView = ({
  onOpenHistory,
  onOpenTool
}: {
  onOpenHistory: () => void
  onOpenTool: (tool: ActiveTool) => void
}) => {
  return (
    <>
      <div className="hero">
        <p className="eyebrow">Document platform</p>
        <h1 className="title">PDF Tools</h1>
        <p className="description">
          Start with a tool first. The document is created automatically after upload, then the existing backend flow handles processing, derived documents, history, and download.
        </p>
      </div>

      <section className="section toolbox-section">
        <div className="section-header-row">
          <div className="section-header">
            <h2>Toolbox</h2>
            <p>Choose the PDF action you want to run.</p>
          </div>

          <button className="secondary-button" type="button" onClick={onOpenHistory}>
            History
          </button>
        </div>

        <div className="toolbox-grid">
          {TOOL_DEFINITIONS.map((tool) => (
            <button
              className="toolbox-card"
              key={tool.id}
              type="button"
              onClick={() => onOpenTool(tool.id)}
            >
              <span className="toolbox-card-title">{tool.title}</span>
              <span className="toolbox-card-description">{tool.description}</span>
            </button>
          ))}
        </div>
      </section>
    </>
  )
}
