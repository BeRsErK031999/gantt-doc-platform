import { useState } from "react"

import { HistoryPanel } from "./HistoryPanel"
import { ToolPanel } from "./ToolPanel"
import type { ActiveTool } from "./ToolPanel"
import { ToolboxView } from "./ToolboxView"

export const App = () => {
  const [view, setView] = useState<"toolbox" | "history" | "tool">("toolbox")
  const [activeTool, setActiveTool] = useState<ActiveTool | null>(null)

  const handleOpenTool = (tool: ActiveTool): void => {
    setActiveTool(tool)
    setView("tool")
  }

  const handleBackToToolbox = (): void => {
    setActiveTool(null)
    setView("toolbox")
  }

  return (
    <main className="page">
      <section className="panel">
        {view === "toolbox" ? (
          <ToolboxView
            onOpenHistory={() => setView("history")}
            onOpenTool={handleOpenTool}
          />
        ) : view === "history" ? (
          <HistoryPanel onBack={handleBackToToolbox} />
        ) : (
          activeTool !== null && (
            <ToolPanel activeTool={activeTool} onBack={handleBackToToolbox} />
          )
        )}
      </section>
    </main>
  )
}
