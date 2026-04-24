import { useState } from "react"

import { ToolPanel } from "./ToolPanel"

type ActiveTool = "compress" | "split"

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
  }
]

export const App = () => {
  const [activeTool, setActiveTool] = useState<ActiveTool | null>(null)

  return (
    <main className="page">
      <section className="panel">
        {activeTool === null ? (
          <>
            <div className="hero">
              <p className="eyebrow">Document platform</p>
              <h1 className="title">PDF Tools</h1>
              <p className="description">
                Start with a tool first. The document is created automatically
                after upload, then the existing backend flow handles processing,
                derived documents, history, and download.
              </p>
            </div>

            <section className="section toolbox-section">
              <div className="section-header">
                <h2>Toolbox</h2>
                <p>Choose the PDF action you want to run.</p>
              </div>

              <div className="toolbox-grid">
                {TOOL_DEFINITIONS.map((tool) => (
                  <button
                    className="toolbox-card"
                    key={tool.id}
                    type="button"
                    onClick={() => setActiveTool(tool.id)}
                  >
                    <span className="toolbox-card-title">{tool.title}</span>
                    <span className="toolbox-card-description">
                      {tool.description}
                    </span>
                  </button>
                ))}
              </div>
            </section>
          </>
        ) : (
          <ToolPanel activeTool={activeTool} onBack={() => setActiveTool(null)} />
        )}
      </section>
    </main>
  )
}
