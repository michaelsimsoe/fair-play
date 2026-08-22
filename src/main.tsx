import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app/App";
import { ErrorBoundary } from "./app/ErrorBoundary";
import { ServicesProvider } from "./app/services";
import "./styles/global.css";
import "./styles/features.css";

const root = document.getElementById("root");
if (!root) throw new Error("App root was not found.");

createRoot(root).render(
  <StrictMode>
    <ErrorBoundary>
      <ServicesProvider>
        <App />
      </ServicesProvider>
    </ErrorBoundary>
  </StrictMode>,
);
