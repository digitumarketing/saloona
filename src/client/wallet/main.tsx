/**
 * Customer wallet entry point.
 *
 * A separate bundle from the dashboard on purpose. This runs on a customer's
 * phone, often on a hotspot at a reception desk, and it has no business shipping
 * the checkout screen, the reports, or the campaign composer to get someone their
 * points balance.
 *
 * Two routes, both under the salon's public slug:
 *   /j/:slug          — join
 *   /j/:slug/wallet   — the points card
 */

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { setUnauthenticatedHandler } from "../lib/api";
import { RouterProvider, matchPath, useRoute } from "../lib/router";
import { JoinScreen } from "./Join";
import { WalletScreen } from "./Wallet";
import { Frame, Notice } from "./Frame";
import "../styles/app.css";

// A 401 here means "no wallet on this device", which the wallet screen handles
// itself. Redirecting a salon's customer to the salon's staff login page would be
// both baffling and wrong.
setUnauthenticatedHandler(null);

function WalletApp() {
  const route = useRoute();
  const path = route.path.replace(/\/$/, "");

  const wallet = matchPath("/j/:slug/wallet", path);
  if (wallet) return <WalletScreen slug={wallet.slug!} />;

  const join = matchPath("/j/:slug", path);
  if (join) return <JoinScreen slug={join.slug!} />;

  return (
    <Frame salon={null}>
      <Notice
        title="Nothing here"
        body="This link does not point at a salon. Scan the code at reception to collect your points."
      />
    </Frame>
  );
}

const mount = document.getElementById("root");

if (!mount) {
  throw new Error("Saloona: no #root element to mount the customer wallet into.");
}

createRoot(mount).render(
  <StrictMode>
    <RouterProvider>
      <WalletApp />
    </RouterProvider>
  </StrictMode>
);
