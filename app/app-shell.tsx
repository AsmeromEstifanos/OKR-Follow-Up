"use client";

import AuthButtons from "@/app/auth-buttons";
import AuthGate from "@/app/auth-gate";
import SharePointActivityLoader from "@/app/sharepoint-activity-loader";
import useSharePointConnection from "@/app/use-sharepoint-connection";
import { ensureActiveAccount } from "@/lib/auth/msal-client";
import { useIsAuthenticated, useMsal } from "@azure/msal-react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
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

export default function AppShell({ children }: Props): JSX.Element {
  const { instance, accounts } = useMsal();
  const isAuthenticated = useIsAuthenticated();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isMobile, setIsMobile] = useState<boolean>(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState<boolean>(false);
  const [isDesktopHovered, setIsDesktopHovered] = useState<boolean>(false);

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
  const isDashboardRoute = pathname.startsWith("/dashboard");
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
  const refreshConnection = useCallback(() => {
    connection.refresh();
  }, [connection]);

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
            href={boardHref}
            className={`ln-nav-item ${!isDashboardRoute ? "ln-nav-item-active" : ""} ${
              isNavCollapsed ? "ln-nav-item-collapsed" : ""
            }`}
            onClick={() => {
              if (isMobile) {
                setIsMobileMenuOpen(false);
              }
            }}
          >
            {isNavCollapsed ? "B" : "OKR Board"}
          </Link>
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
            {isNavCollapsed ? "D" : "Dashboard"}
          </Link>
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
