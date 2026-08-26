/**
 * A minimal history router.
 *
 * The dashboard has a dozen routes and one dynamic segment, which is not enough
 * to justify a routing library and its bundle. `navigate` and `<Link>` behave the
 * way people expect — modifier-clicks and middle-clicks still open a new tab,
 * because a receptionist opening a customer in a second tab is a normal thing to
 * want.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

interface RouteState {
  path: string;
  search: URLSearchParams;
}

const RouterContext = createContext<RouteState | null>(null);

function current(): RouteState {
  return { path: window.location.pathname, search: new URLSearchParams(window.location.search) };
}

export function navigate(to: string, options: { replace?: boolean } = {}): void {
  if (to === window.location.pathname + window.location.search) return;
  if (options.replace) window.history.replaceState({}, "", to);
  else window.history.pushState({}, "", to);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

export function RouterProvider({ children }: { children: ReactNode }) {
  const [route, setRoute] = useState<RouteState>(current);

  useEffect(() => {
    const onChange = () => {
      setRoute(current());
      // A route change is a new screen; the browser does not reset scroll for a
      // pushState navigation.
      window.scrollTo({ top: 0 });
    };
    window.addEventListener("popstate", onChange);
    return () => window.removeEventListener("popstate", onChange);
  }, []);

  return <RouterContext.Provider value={route}>{children}</RouterContext.Provider>;
}

export function useRoute(): RouteState {
  const route = useContext(RouterContext);
  if (!route) throw new Error("useRoute must be used inside RouterProvider");
  return route;
}

/**
 * Matches the current path against a pattern with `:param` segments.
 * Returns null when it does not match, so callers can chain candidates.
 */
export function matchPath(pattern: string, path: string): Record<string, string> | null {
  const patternParts = pattern.split("/").filter(Boolean);
  const pathParts = path.split("/").filter(Boolean);
  if (patternParts.length !== pathParts.length) return null;

  const params: Record<string, string> = {};
  for (let index = 0; index < patternParts.length; index += 1) {
    const expected = patternParts[index]!;
    const actual = pathParts[index]!;
    if (expected.startsWith(":")) {
      params[expected.slice(1)] = decodeURIComponent(actual);
      continue;
    }
    if (expected !== actual) return null;
  }
  return params;
}

export function useQueryParam(key: string): [string | null, (value: string | null) => void] {
  const route = useRoute();
  const value = route.search.get(key);

  const setValue = useCallback(
    (next: string | null) => {
      const params = new URLSearchParams(window.location.search);
      if (next === null || next === "") params.delete(key);
      else params.set(key, next);
      const query = params.toString();
      navigate(`${window.location.pathname}${query ? `?${query}` : ""}`, { replace: true });
    },
    [key]
  );

  return [value, setValue];
}

interface LinkProps {
  to: string;
  children: ReactNode;
  className?: string;
  title?: string;
  onClick?: () => void;
}

export function Link({ to, children, className, title, onClick }: LinkProps) {
  return (
    <a
      href={to}
      className={className}
      title={title}
      onClick={(event) => {
        // Leave modifier and non-primary clicks to the browser.
        if (event.defaultPrevented || event.button !== 0) return;
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        event.preventDefault();
        onClick?.();
        navigate(to);
      }}
    >
      {children}
    </a>
  );
}

/** True when `to` is the active route, used for navigation highlighting. */
export function useIsActive(to: string, exact = false): boolean {
  const route = useRoute();
  return useMemo(() => (exact ? route.path === to : route.path === to || route.path.startsWith(`${to}/`)), [
    route.path,
    to,
    exact
  ]);
}
