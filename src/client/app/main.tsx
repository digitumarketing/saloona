/**
 * Dashboard entry point.
 *
 * The Worker serves a bare HTML shell for every `/app/*` path and this file takes
 * over from there. It is deliberately thin: mount, and get out of the way. The
 * stylesheet is imported here rather than linked by hand so Vite emits it as part
 * of this bundle's graph — a hand-maintained `<link>` and a hand-maintained import
 * eventually disagree.
 */

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "../lib/router";
import { AppShell } from "./AppShell";
import "../styles/app.css";

const mount = document.getElementById("root");

if (!mount) {
  // Not recoverable, and a blank white page with a clean console is the hardest
  // kind of bug to be handed. Say what is wrong in the place someone will look.
  throw new Error('Saloona: no #root element to mount the dashboard into.');
}

createRoot(mount).render(
  <StrictMode>
    <RouterProvider>
      <AppShell />
    </RouterProvider>
  </StrictMode>
);
