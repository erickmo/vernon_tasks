import React from "react";
import ReactDOM from "react-dom/client";
import { RouterProvider } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { registerSW } from "virtual:pwa-register";
import { router } from "./router";
import { logEvent } from "./telemetry";
import "./theme";

const qc = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: 1 } },
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={qc}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </React.StrictMode>,
);

try {
  registerSW({ immediate: true });
} catch {
  logEvent("sw_register_failed", {});
}

const displayMode = window.matchMedia("(display-mode: standalone)").matches
  ? "standalone"
  : "browser";
logEvent("pwa_boot", { version: __SW_VERSION__, display_mode: displayMode });

if (
  !localStorage.getItem("vt_pwa_onboarded") &&
  !location.pathname.startsWith("/m/login") &&
  !location.pathname.startsWith("/m/onboarding")
) {
  history.replaceState(null, "", "/m/onboarding");
}
