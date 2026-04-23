import { createRoot } from "react-dom/client"

import { App } from "./app/App"
import "./index.css"

const container = document.getElementById("root")

if (container === null) {
  throw new Error("Root element was not found")
}

createRoot(container).render(<App />)
