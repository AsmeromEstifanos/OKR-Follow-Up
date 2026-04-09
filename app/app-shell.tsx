"use client";

import AuthButtons from "@/app/auth-buttons";
import AuthGate from "@/app/auth-gate";
import SharePointActivityLoader from "@/app/sharepoint-activity-loader";
import useSharePointConnection from "@/app/use-sharepoint-connection";
import useCurrentUserEmail from "@/app/use-current-user-email";
import { ensureActiveAccount } from "@/lib/auth/msal-client";
import { apiPath, stripBasePath } from "@/lib/base-path";
import { OKR_REFRESH_SYNC_KEY } from "@/lib/tab-sync";
import { useIsAuthenticated, useMsal } from "@azure/msal-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

type Props = {
  children: React.ReactNode;
};

function getPrincipalName(
  activeUsername: string | undefined,
  preferredUsername: unknown,
  email: unknown,
  name: unknown
): string {
  if (typeof activeUsername === "string" && activeUsername.trim()) {
    return activeUsername;
  }

  if (typeof preferredUsername === "string" && preferredUsername.trim()) {
    return preferredUsername;
  }

  if (typeof email === "string" && email.trim()) {
    return email;
  }

  if (typeof name === "string" && name.trim()) {
    return name;
  }

  return "";
}

function getActiveAccountSafely(
  instance: ReturnType<typeof useMsal>["instance"],
  accounts: ReturnType<typeof useMsal>["accounts"]
) {
  try {
    return instance.getActiveAccount() ?? accounts[0] ?? null;
  } catch {
    return accounts[0] ?? null;
  }
}

function DashboardIcon(): JSX.Element {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M3 3h8v8H3V3zm10 0h8v5h-8V3zM3 13h5v8H3v-8zm7 0h11v8H10v-8z" fill="currentColor" />
    </svg>
  );
}

function BoardIcon(): JSX.Element {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M4 4h16v4H4V4zm0 6h16v10H4V10zm2 2v2h4v-2H6zm0 4v2h4v-2H6zm6-4h6v2h-6v-2zm0 4h6v2h-6v-2z" fill="currentColor" />
    </svg>
  );
}

function ConfigIcon(): JSX.Element {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M19.14 12.94c.04-.31.06-.63.06-.94s-.02-.63-.06-.94l2.03-1.58a.5.5 0 0 0 .12-.64l-1.92-3.32a.5.5 0 0 0-.6-.22l-2.39.96a7.2 7.2 0 0 0-1.63-.94l-.36-2.54A.5.5 0 0 0 13.9 2h-3.8a.5.5 0 0 0-.49.42L9.25 4.96c-.58.23-1.12.54-1.63.94l-2.39-.96a.5.5 0 0 0-.6.22L2.71 8.48a.5.5 0 0 0 .12.64l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94l-2.03 1.58a.5.5 0 0 0-.12.64l1.92 3.32c.13.22.39.31.6.22l2.39-.96c.51.4 1.05.72 1.63.94l.36 2.54c.04.24.25.42.49.42h3.8c.24 0 .45-.18.49-.42l.36-2.54c.58-.23 1.12-.54 1.63-.94l2.39.96c.22.09.47 0 .6-.22l1.92-3.32a.5.5 0 0 0-.12-.64l-2.03-1.58zM12 15.5A3.5 3.5 0 1 1 12 8a3.5 3.5 0 0 1 0 7.5z" fill="currentColor" />
    </svg>
  );
}

export default function AppShell({ children }: Props): JSX.Element {
  const { instance, accounts } = useMsal();
  const isAuthenticated = useIsAuthenticated();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isMobile, setIsMobile] = useState<boolean>(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState<boolean>(false);
  const [isDesktopHovered, setIsDesktopHovered] = useState<boolean>(false);
  const [isAdminUser, setIsAdminUser] = useState<boolean>(false);
  const currentUserEmail = useCurrentUserEmail();

  const connection = useSharePointConnection(isAuthenticated);

  useEffect(() => {
    const onResize = (): void => {
      const mobile = window.innerWidth < 1024;
      setIsMobile(mobile);
      if (!mobile) {
        setIsMobileMenuOpen(false);
      }
    };

    onResize();
    window.addEventListener("resize", onResize);

    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    if (accounts.length > 0) {
      ensureActiveAccount();
    }
  }, [accounts]);

  const isNavCollapsed = isMobile ? !isMobileMenuOpen : !isDesktopHovered;
  const activeAccount = useMemo(() => {
    return getActiveAccountSafely(instance, accounts);
  }, [accounts, instance]);

  const principal = useMemo(() => {
    if (!activeAccount) {
      return "";
    }

    const claims = activeAccount.idTokenClaims as { preferred_username?: unknown; email?: unknown; name?: unknown } | undefined;
    return getPrincipalName(activeAccount.username, claims?.preferred_username, claims?.email, claims?.name);
  }, [activeAccount]);

  const mainClassName = `ln-main ${isMobile ? "ln-main-mobile" : "ln-main-collapsed"}`;
  const sidebarClassName = `ln-sidebar ${isMobile ? "ln-sidebar-mobile" : "ln-sidebar-desktop"} ${
    isNavCollapsed ? "ln-sidebar-collapsed" : "ln-sidebar-expanded"
  }`;
  const isSharePointOnline = connection.status === "linked";
  const sharePointStatusLabel = isSharePointOnline ? "Online" : "Offline";
  const sharePointStatusClassName = isSharePointOnline ? "linked" : "error";
  const normalizedPathname = useMemo(() => stripBasePath(pathname), [pathname]);
  const isDashboardRoute = normalizedPathname.startsWith("/dashboard");
  const isConfigRoute = normalizedPathname.startsWith("/config");
  const navQuery = useMemo(() => {
    const params = new URLSearchParams(searchParams.toString());
    const preserved = new URLSearchParams();
    const ventureKey = params.get("ventureKey");
    const department = params.get("department");

    if (ventureKey) {
      preserved.set("ventureKey", ventureKey);
    }

    if (department) {
      preserved.set("department", department);
    }

    return preserved.toString();
  }, [searchParams]);
  const boardHref = navQuery ? `/?${navQuery}` : "/";
  const dashboardHref = navQuery ? `/dashboard?${navQuery}` : "/dashboard";
  const configHref = "/config";
  const refreshConnection = useCallback(() => {
    connection.refresh();
  }, [connection]);

  useEffect(() => {
    let isMounted = true;
    const loadAuthz = async (): Promise<void> => {
      if (!currentUserEmail) {
        if (isMounted) {
          setIsAdminUser(false);
        }
        return;
      }

      try {
        const response = await fetch(apiPath("/api/authz/me"), {
          method: "GET",
          headers: {
            "x-user-email": currentUserEmail
          }
        });
        if (!response.ok) {
          if (isMounted) {
            setIsAdminUser(false);
          }
          return;
        }

        const payload = (await response.json()) as { isAdmin?: boolean };
        if (isMounted) {
          setIsAdminUser(Boolean(payload.isAdmin));
        }
      } catch {
        if (isMounted) {
          setIsAdminUser(false);
        }
      }
    };

    void loadAuthz();

    return () => {
      isMounted = false;
    };
  }, [currentUserEmail]);

  useEffect(() => {
    const handleStorage = (event: StorageEvent): void => {
      if (event.key !== OKR_REFRESH_SYNC_KEY || !event.newValue) {
        return;
      }

      router.refresh();
    };

    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, [router]);

  return (
    <div className="ln-shell">
      {isMobile && isMobileMenuOpen ? (
        <button
          type="button"
          className="ln-sidebar-overlay"
          aria-label="Close navigation"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      ) : null}

      <aside
        className={sidebarClassName}
        onMouseEnter={() => {
          if (!isMobile) {
            setIsDesktopHovered(true);
          }
        }}
        onMouseLeave={() => {
          if (!isMobile) {
            setIsDesktopHovered(false);
          }
        }}
      >
        <div className="ln-sidebar-header">
          {!isNavCollapsed ? (
            <div className="ln-brand-wrap">
              <span className="ln-brand-title">OKR Follow-Up</span>
            </div>
          ) : null}
          {isMobile ? (
            <button
              type="button"
              className="ln-toggle-btn"
              onClick={() => setIsMobileMenuOpen((previous) => !previous)}
              aria-label={isNavCollapsed ? "Expand navigation" : "Collapse navigation"}
            >
              {isNavCollapsed ? ">" : "<"}
            </button>
          ) : null}
        </div>

        <nav className="ln-sidebar-nav" aria-label="Primary navigation">
          <Link
            href={dashboardHref}
            className={`ln-nav-item ${isDashboardRoute ? "ln-nav-item-active" : ""} ${
              isNavCollapsed ? "ln-nav-item-collapsed" : ""
            }`}
            onClick={() => {
              if (isMobile) {
                setIsMobileMenuOpen(false);
              }
            }}
          >
            <span className="ln-nav-icon" aria-hidden="true">
              <DashboardIcon />
            </span>
            <span className="ln-nav-label">{isNavCollapsed ? "" : "Dashboard"}</span>
          </Link>
          <Link
            href={boardHref}
            className={`ln-nav-item ${!isDashboardRoute && !isConfigRoute ? "ln-nav-item-active" : ""} ${
              isNavCollapsed ? "ln-nav-item-collapsed" : ""
            }`}
            onClick={() => {
              if (isMobile) {
                setIsMobileMenuOpen(false);
              }
            }}
          >
            <span className="ln-nav-icon" aria-hidden="true">
              <BoardIcon />
            </span>
            <span className="ln-nav-label">{isNavCollapsed ? "" : "OKR Board"}</span>
          </Link>
          {isAdminUser ? (
            <Link
              href={configHref}
              className={`ln-nav-item ${isConfigRoute ? "ln-nav-item-active" : ""} ${
                isNavCollapsed ? "ln-nav-item-collapsed" : ""
              }`}
              onClick={() => {
                if (isMobile) {
                  setIsMobileMenuOpen(false);
                }
              }}
            >
              <span className="ln-nav-icon" aria-hidden="true">
                <ConfigIcon />
              </span>
              <span className="ln-nav-label">{isNavCollapsed ? "" : "Config"}</span>
            </Link>
          ) : null}
        </nav>

        <div className="ln-sidebar-footer">
          {!isNavCollapsed ? (
            <div className="ln-account-block">
              <span className="ln-account-label">{principal ? "Signed in as" : "Authentication"}</span>
              {principal ? <span className="ln-account-value">{principal}</span> : null}
            </div>
          ) : null}
          <AuthButtons compact={isMobile} onAuthChanged={refreshConnection} />
          {!isNavCollapsed ? (
            <div
              className={`ln-sp-status ln-sp-status-${sharePointStatusClassName}`}
              title={connection.detail}
              aria-label={`SharePoint status: ${sharePointStatusLabel}`}
            >
              <span className="ln-sp-dot" />
              <span>{sharePointStatusLabel}</span>
            </div>
          ) : null}
        </div>
      </aside>

      {isMobile ? (
        <header className="ln-mobile-header">
          <button
            type="button"
            className="ln-mobile-menu-btn"
            onClick={() => setIsMobileMenuOpen((previous) => !previous)}
            aria-label="Open navigation"
          >
            Menu
          </button>
          <span className="ln-mobile-title">OKR Follow-Up</span>
        </header>
      ) : null}

      <main className={mainClassName}>
        <AuthGate>
          <div className="layout">{children}</div>
        </AuthGate>
      </main>

      <SharePointActivityLoader />
    </div>
  );
}
