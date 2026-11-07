import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

type RouterCtx = {
  path: string;
  navigate: (to: string) => void;
  params: Record<string, string>;
};

const Ctx = createContext<RouterCtx>({ path: "/", navigate: () => {}, params: {} });

function matchRoute(pattern: string, path: string): Record<string, string> | null {
  const pp = pattern.split("/").filter(Boolean);
  const tp = path.split("/").filter(Boolean);
  if (pp.length !== tp.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < pp.length; i++) {
    if (pp[i].startsWith(":")) params[pp[i].slice(1)] = decodeURIComponent(tp[i]);
    else if (pp[i] !== tp[i]) return null;
  }
  return params;
}

function normalizePath(to: string) {
  try {
    if (to.startsWith("http")) return normalizePathname(new URL(to).pathname || "/");
    const raw = to.split("?")[0].split("#")[0] || "/";
    return normalizePathname(raw);
  } catch {
    return "/";
  }
}

/** `/app/` → `/app` so route matching works with static hosts and trailing slashes. */
export function normalizePathname(pathname: string): string {
  if (!pathname || pathname === "/") return "/";
  return pathname.replace(/\/+$/, "") || "/";
}

export function Router({ children }: { children: ReactNode }) {
  const [path, setPath] = useState(() => normalizePathname(window.location.pathname || "/"));

  useEffect(() => {
    const onPop = () => setPath(normalizePathname(window.location.pathname || "/"));
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const navigate = useCallback((to: string) => {
    const [pathPart, search = ""] = to.split("?");
    const hash = to.includes("#") ? to.slice(to.indexOf("#")) : "";
    const normalized = normalizePathname(normalizePath(pathPart));
    const href = `${normalized}${search ? `?${search.split("#")[0]}` : ""}${hash}`;
    window.history.pushState({}, "", href);
    setPath(normalized);
    window.scrollTo(0, 0);
  }, []);

  const value = useMemo(() => ({ path, navigate, params: {} }), [path, navigate]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useRouter() {
  return useContext(Ctx);
}

export function useRoute(pattern: string) {
  const { path, navigate } = useRouter();
  const params = matchRoute(pattern, path);
  return { match: params !== null, params: params || {}, navigate, path };
}

export function Link({
  to,
  children,
  className,
}: {
  to: string;
  children: ReactNode;
  className?: string;
}) {
  const { navigate, path } = useRouter();
  const dest = normalizePathname(to.split("?")[0].split("#")[0]);
  const active = path === dest || (dest !== "/" && path.startsWith(`${dest}/`));
  return (
    <a
      href={to}
      className={`${className || ""} ${active ? "nav-active" : ""}`.trim()}
      onClick={(e) => {
        e.preventDefault();
        navigate(to);
      }}
    >
      {children}
    </a>
  );
}

export function Route({
  path: pattern,
  children,
}: {
  path: string;
  children: (ctx: { params: Record<string, string>; navigate: (to: string) => void }) => ReactNode;
}) {
  const { path, navigate } = useRouter();
  const params = matchRoute(pattern, path);
  if (!params) return null;
  return <>{children({ params, navigate })}</>;
}
