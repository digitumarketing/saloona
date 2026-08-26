/**
 * Application context.
 *
 * The bootstrap payload is fetched once and shared: it carries the signed-in
 * user, the organization, the plan, and the first-paint dashboard data. Screens
 * read plan capabilities from here rather than hard-coding which tier unlocks
 * what, so the gate in the UI and the gate in the API come from the same list.
 */

import { createContext, useContext, type ReactNode } from "react";
import type { Bootstrap } from "../lib/types";

export interface AppContextValue {
  data: Bootstrap;
  /** Refetches the bootstrap payload, e.g. after finishing setup. */
  refresh: () => void;
  /** True when the plan includes a capability. Mirrors `planAllows` on the server. */
  can: (capability: string) => boolean;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ value, children }: { value: AppContextValue; children: ReactNode }) {
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextValue {
  const value = useContext(AppContext);
  if (!value) throw new Error("useApp must be used inside AppProvider");
  return value;
}

/** Convenience accessors, so screens are not full of `app.data.organization`. */
export function useOrg() {
  return useApp().data.organization;
}

export function useUser() {
  return useApp().data.user;
}
