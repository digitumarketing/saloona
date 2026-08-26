/**
 * The dashboard shell.
 *
 * Blocks on one `GET /api/bootstrap` call and then renders. The previous build
 * painted the shell before its data existed and crashed on `undefined.customers`;
 * here nothing renders until the payload is in hand, and a failure shows a
 * retryable message instead of a blank screen.
 */

import { useCallback, useEffect, useState } from "react";
import { api, errorMessage } from "../lib/api";
import { Link, matchPath, navigate, useRoute } from "../lib/router";
import type { Bootstrap } from "../lib/types";
import { formatDate, formatPkr, initials, pluralize } from "../lib/format";
import { AppProvider, useApp, type AppContextValue } from "./context";
import { Button, Spinner, ToastProvider, useToast } from "../components/ui";
import { DashboardPage } from "./pages/Dashboard";
import { CustomersPage } from "./pages/Customers";
import { CustomerDetailPage } from "./pages/CustomerDetail";
import { CheckoutPage } from "./pages/Checkout";
import { CampaignsPage } from "./pages/Campaigns";
import { CampaignReportPage } from "./pages/CampaignReport";
import { CatalogPage } from "./pages/Catalog";
import { ReportsPage } from "./pages/Reports";
import { MessagesPage } from "./pages/Messages";
import { SettingsPage } from "./pages/Settings";
import { SetupPage } from "./pages/Setup";

// ---------------------------------------------------------------------------
// Navigation
// ---------------------------------------------------------------------------

interface NavEntry {
  to: string;
  label: string;
  icon: string;
  /** Shown in the mobile bar; the rest live behind "More". */
  primary?: boolean;
}

/**
 * Icons are inline SVG path data rather than an icon package: eight glyphs do not
 * justify a dependency, and the sidebar must render before any font loads.
 */
const NAV: NavEntry[] = [
  { to: "/app", label: "Dashboard", icon: "M3 11.5 12 4l9 7.5M5.5 10v9h13v-9", primary: true },
  { to: "/app/checkout", label: "Checkout", icon: "M4 6h16l-1.5 11H5.5L4 6Zm4 0V4.5A2 2 0 0 1 10 3h4a2 2 0 0 1 2 1.5V6", primary: true },
  { to: "/app/customers", label: "Customers", icon: "M4 19c0-3 3.5-4.5 8-4.5s8 1.5 8 4.5M12 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z", primary: true },
  { to: "/app/campaigns", label: "Campaigns", icon: "M4 8.5 20 4v13l-16-4.5V8.5Zm3 4.2V19h3v-5.4", primary: true },
  { to: "/app/catalog", label: "Services & staff", icon: "M4 7h16M4 12h16M4 17h10" },
  { to: "/app/reports", label: "Reports", icon: "M5 19V9m7 10V5m7 14v-6" },
  { to: "/app/messages", label: "Messages", icon: "M4 5h16v11H9l-5 4V5Z" },
  { to: "/app/settings", label: "Settings", icon: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm8-3-1.8-.5-.6-1.5.9-1.6-1.4-1.4-1.6.9-1.5-.6L13.5 4h-3l-.5 1.8-1.5.6-1.6-.9L5.5 6.9l.9 1.6-.6 1.5L4 12l1.8.5.6 1.5-.9 1.6 1.4 1.4 1.6-.9 1.5.6.5 1.8h3l.5-1.8 1.5-.6 1.6.9 1.4-1.4-.9-1.6.6-1.5L20 12Z" }
];

function NavIcon({ path }: { path: string }) {
  return (
    <svg
      className="size-5 shrink-0"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={path} />
    </svg>
  );
}

function isActive(entry: NavEntry, path: string): boolean {
  if (entry.to === "/app") return path === "/app" || path === "/app/";
  return path === entry.to || path.startsWith(`${entry.to}/`);
}

// ---------------------------------------------------------------------------
// Shell
// ---------------------------------------------------------------------------

export function AppShell() {
  const [data, setData] = useState<Bootstrap | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let active = true;
    setError(null);
    api
      .get<Bootstrap>("/api/bootstrap")
      .then((payload) => {
        if (active) setData(payload);
      })
      .catch((cause: unknown) => {
        // A 401 has already redirected to /login inside the api client.
        if (active) setError(errorMessage(cause));
      });
    return () => {
      active = false;
    };
  }, [nonce]);

  const refresh = useCallback(() => setNonce((value) => value + 1), []);

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <div className="card max-w-md">
          <div className="card-body text-center">
            <h1 className="text-lg">Could not load your workspace</h1>
            <p className="mt-2 text-sm text-ink-600">{error}</p>
            <div className="mt-5 flex justify-center gap-2">
              <Button onClick={refresh} variant="primary">
                Try again
              </Button>
              <a className="btn btn-ghost" href="/login">
                Sign in again
              </a>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex min-h-screen items-center justify-center text-brand-600">
        <Spinner size={32} />
        <span className="sr-only">Loading your workspace</span>
      </div>
    );
  }

  const value: AppContextValue = {
    data,
    refresh,
    can: (capability) => data.plan.capabilities.includes(capability)
  };

  return (
    <AppProvider value={value}>
      <ToastProvider>
        <Chrome />
      </ToastProvider>
    </AppProvider>
  );
}

function Chrome() {
  const route = useRoute();
  const [menuOpen, setMenuOpen] = useState(false);

  // Any navigation closes the mobile drawer, otherwise it stays over the new page.
  useEffect(() => setMenuOpen(false), [route.path]);

  return (
    <div className="min-h-screen bg-ink-50/60 lg:flex">
      <MobileDrawer open={menuOpen} onClose={() => setMenuOpen(false)} path={route.path} />

      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-ink-100 bg-white lg:flex">
        <SidebarBrand />
        <NavList path={route.path} />
        <PlanFooter />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar onOpenMenu={() => setMenuOpen(true)} />
        <StatusBanner />
        <main id="main" className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8">
          <Routes path={route.path} />
        </main>
      </div>

      <MobileNav path={route.path} onOpenMenu={() => setMenuOpen(true)} />
    </div>
  );
}

function SidebarBrand() {
  const { data } = useApp();
  return (
    <div className="flex h-16 items-center gap-2.5 border-b border-ink-100 px-5">
      <span className="flex size-8 items-center justify-center rounded-lg bg-brand-600 text-sm font-bold text-white">
        S
      </span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-semibold text-ink-900">{data.organization.name}</span>
        <span className="block text-xs text-ink-400">Saloona</span>
      </span>
    </div>
  );
}

function NavList({ path, onNavigate }: { path: string; onNavigate?: () => void }) {
  return (
    <nav className="flex-1 space-y-0.5 overflow-y-auto p-3" aria-label="Main">
      {NAV.map((entry) => {
        const active = isActive(entry, path);
        return (
          <Link
            key={entry.to}
            to={entry.to}
            onClick={onNavigate}
            className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
              active ? "bg-brand-50 text-brand-800" : "text-ink-600 hover:bg-ink-50 hover:text-ink-900"
            }`}
          >
            <NavIcon path={entry.icon} />
            {entry.label}
          </Link>
        );
      })}
    </nav>
  );
}

function PlanFooter() {
  const { data } = useApp();
  const used = data.messageStats.sent;
  const total = data.limits.monthlyMessages;
  const percent = total > 0 ? Math.min(100, Math.round((used / total) * 100)) : 0;

  return (
    <div className="border-t border-ink-100 p-4">
      <div className="flex items-baseline justify-between text-xs">
        <span className="font-medium text-ink-700">{data.plan.name} plan</span>
        <Link to="/app/settings" className="text-brand-700 hover:underline">
          Manage
        </Link>
      </div>
      <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-ink-100">
        <div
          className={`h-full rounded-full ${percent >= 90 ? "bg-red-500" : "bg-brand-500"}`}
          style={{ width: `${percent}%` }}
        />
      </div>
      <p className="tabular mt-1.5 text-xs text-ink-400">
        {used.toLocaleString("en-US")} of {total.toLocaleString("en-US")} messages this month
      </p>
    </div>
  );
}

function Topbar({ onOpenMenu }: { onOpenMenu: () => void }) {
  const { data } = useApp();
  const [userOpen, setUserOpen] = useState(false);
  const toast = useToast();

  const logout = async () => {
    try {
      await api.post<{ redirect: string }>("/api/auth/logout");
      window.location.assign("/");
    } catch (cause) {
      toast.error(errorMessage(cause));
    }
  };

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-ink-100 bg-white/90 px-4 backdrop-blur sm:px-6 lg:px-8">
      <button
        type="button"
        onClick={onOpenMenu}
        aria-label="Open menu"
        className="-ml-1 rounded-lg p-2 text-ink-600 hover:bg-ink-50 lg:hidden"
      >
        <svg width="22" height="22" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8" fill="none">
          <path d="M4 7h16M4 12h16M4 17h16" strokeLinecap="round" />
        </svg>
      </button>

      <span className="truncate font-semibold text-ink-900 lg:hidden">{data.organization.name}</span>

      <div className="ml-auto flex items-center gap-2">
        <Link to="/app/checkout" className="btn btn-primary btn-sm">
          <svg width="16" height="16" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" fill="none">
            <path d="M12 5v14M5 12h14" strokeLinecap="round" />
          </svg>
          New visit
        </Link>

        <div className="relative">
          <button
            type="button"
            onClick={() => setUserOpen((open) => !open)}
            aria-expanded={userOpen}
            aria-label="Account menu"
            className="flex size-9 items-center justify-center rounded-full bg-ink-100 text-sm font-semibold text-ink-700 hover:bg-ink-200"
          >
            {initials(data.user.name)}
          </button>

          {userOpen ? (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setUserOpen(false)} aria-hidden="true" />
              <div className="absolute right-0 z-20 mt-2 w-60 rounded-xl border border-ink-100 bg-white p-1.5 shadow-[--shadow-lift]">
                <div className="px-3 py-2">
                  <p className="truncate text-sm font-semibold text-ink-900">{data.user.name}</p>
                  <p className="truncate text-xs text-ink-500">{data.user.email}</p>
                  <p className="mt-1 text-xs capitalize text-ink-400">{data.user.role}</p>
                </div>
                <hr className="my-1 border-ink-100" />
                <Link
                  to="/app/settings"
                  onClick={() => setUserOpen(false)}
                  className="block rounded-lg px-3 py-2 text-sm text-ink-700 hover:bg-ink-50"
                >
                  Settings
                </Link>
                <a href="/support" className="block rounded-lg px-3 py-2 text-sm text-ink-700 hover:bg-ink-50">
                  Help &amp; support
                </a>
                <button
                  type="button"
                  onClick={logout}
                  className="block w-full rounded-lg px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50"
                >
                  Sign out
                </button>
              </div>
            </>
          ) : null}
        </div>
      </div>
    </header>
  );
}

function MobileDrawer({ open, onClose, path }: { open: boolean; onClose: () => void; path: string }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-40 lg:hidden">
      <div className="absolute inset-0 bg-ink-900/40" onClick={onClose} aria-hidden="true" />
      <div className="relative flex h-full w-72 max-w-[85vw] flex-col bg-white shadow-[--shadow-lift]">
        <SidebarBrand />
        <NavList path={path} onNavigate={onClose} />
        <PlanFooter />
      </div>
    </div>
  );
}

/**
 * A bottom bar on phones. Reception staff work standing up with one hand, and the
 * four screens they use all day need to be one tap away.
 */
function MobileNav({ path, onOpenMenu }: { path: string; onOpenMenu: () => void }) {
  const primary = NAV.filter((entry) => entry.primary);
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-30 flex border-t border-ink-100 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
      aria-label="Quick navigation"
    >
      {primary.map((entry) => {
        const active = isActive(entry, path);
        return (
          <Link
            key={entry.to}
            to={entry.to}
            className={`flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px] font-medium ${
              active ? "text-brand-700" : "text-ink-500"
            }`}
          >
            <NavIcon path={entry.icon} />
            {entry.label}
          </Link>
        );
      })}
      <button
        type="button"
        onClick={onOpenMenu}
        className="flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px] font-medium text-ink-500"
      >
        <NavIcon path="M5 12h.01M12 12h.01M19 12h.01" />
        More
      </button>
    </nav>
  );
}

/**
 * Trial countdown and payment state.
 *
 * A past-due workspace keeps working: the customer records belong to the salon,
 * and locking them out of their own customer list is the wrong response to an
 * unpaid invoice. The banner is persistent instead.
 */
function StatusBanner() {
  const { data } = useApp();
  const org = data.organization;

  if (org.status === "past_due") {
    return (
      <div className="border-b border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 sm:px-6 lg:px-8">
        <strong className="font-semibold">Your subscription is unpaid.</strong> Automated messages are paused until
        payment clears. Your customer records are untouched.{" "}
        <Link to="/app/settings" className="font-semibold underline">
          Update billing
        </Link>
      </div>
    );
  }

  if (org.status === "trialing" && data.trial.daysLeft !== null) {
    const days = data.trial.daysLeft;
    const urgent = days <= 3;
    return (
      <div
        className={`border-b px-4 py-3 text-sm sm:px-6 lg:px-8 ${
          urgent ? "border-gold-300 bg-gold-100 text-gold-700" : "border-brand-100 bg-brand-50 text-brand-800"
        }`}
      >
        <strong className="font-semibold">
          {days === 0 ? "Your trial ends today." : `${pluralize(days, "day")} left in your free trial.`}
        </strong>{" "}
        {data.trial.endsAt ? `Ends ${formatDate(data.trial.endsAt)}. ` : ""}
        {data.plan.name} is {formatPkr(data.plan.pricePkr)}/month after that.{" "}
        <Link to="/app/settings" className="font-semibold underline">
          Choose a plan
        </Link>
      </div>
    );
  }

  return null;
}

// ---------------------------------------------------------------------------
// Routing
// ---------------------------------------------------------------------------

function Routes({ path }: { path: string }) {
  const normalized = path.replace(/\/$/, "") || "/app";

  if (normalized === "/app") return <DashboardPage />;
  if (normalized === "/app/setup") return <SetupPage />;
  if (normalized === "/app/checkout") return <CheckoutPage />;
  if (normalized === "/app/customers") return <CustomersPage />;
  if (normalized === "/app/campaigns") return <CampaignsPage />;
  if (normalized === "/app/catalog") return <CatalogPage />;
  if (normalized === "/app/reports") return <ReportsPage />;
  if (normalized === "/app/messages") return <MessagesPage />;
  if (normalized === "/app/settings") return <SettingsPage />;

  const customer = matchPath("/app/customers/:id", normalized);
  if (customer) return <CustomerDetailPage customerId={customer.id!} />;

  const campaign = matchPath("/app/campaigns/:id", normalized);
  if (campaign) return <CampaignReportPage campaignId={campaign.id!} />;

  return (
    <div className="empty">
      <p className="empty-title">Page not found</p>
      <p className="empty-body">The link you followed does not match a screen in the app.</p>
      <Button onClick={() => navigate("/app")} variant="primary">
        Back to dashboard
      </Button>
    </div>
  );
}
