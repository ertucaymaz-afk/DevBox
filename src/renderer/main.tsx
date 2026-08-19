import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./styles.css";
import "./light-theme-v016.css";
import "./remixrota-v016.css";
import "./design-system-v2.css";
import "./design-system-v2-components.css";
import "./plugins-skills-v2.css";
import "./catalog-v2.css";

const root = document.getElementById("root");
if (!root) throw new Error("DevBox renderer root was not found.");

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>
);