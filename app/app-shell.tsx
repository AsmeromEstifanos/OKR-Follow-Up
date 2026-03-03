"use client";

import AuthButtons from "@/app/auth-buttons";
import AuthGate from "@/app/auth-gate";
import useSharePointConnection from "@/app/use-sharepoint-connection";
import { ensureActiveAccount } from "@/lib/auth/msal-client";
import { useIsAuthenticated, useMsal } from "@azure/msal-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

type Props = {
  children: React.ReactNode;
};

type NavItem = {
  href: string;
  label: string;
};

const NAV_ITEMS: NavItem[] = [{ href: "/", label: "OKR Board" }];

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

export default function AppShell({ children }: Props): JSX.Element {
  const pathname = usePathname();
  const { instance, accounts } = useMsal();
  const isAuthenticated = useIsAuthenticated();
  const [isMobile, setIsMobile] = useState<boolean>(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState<boolean>(false);
  const [isCollapsed, setIsCollapsed] = useState<boolean>(false);

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

  const isNavCollapsed = isMobile ? !isMobileMenuOpen : isCollapsed;
  const activeAccount = useMemo(() => {
    return instance.getActiveAccount() ?? accounts[0] ?? null;
  }, [accounts, instance]);

  const principal = useMemo(() => {
    if (!activeAccount) {
      return "";
    }

    const claims = activeAccount.idTokenClaims as { preferred_username?: unknown; email?: unknown; name?: unknown } | undefined;
    return getPrincipalName(activeAccount.username, claims?.preferred_username, claims?.email, claims?.name);
  }, [activeAccount]);

  const mainClassName = `ln-main ${isMobile ? "ln-main-mobile" : isCollapsed ? "ln-main-collapsed" : "ln-main-expanded"}`;
  const sidebarClassName = `ln-sidebar ${isMobile ? "ln-sidebar-mobile" : "ln-sidebar-desktop"} ${
    isNavCollapsed ? "ln-sidebar-collapsed" : "ln-sidebar-expanded"
  }`;
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

      <aside className={sidebarClassName}>
        <div className="ln-sidebar-header">
          {!isNavCollapsed ? (
            <div className="ln-brand-wrap">
              <span className="ln-brand-title">OKR Follow-Up</span>
            </div>
          ) : null}
          <button
            type="button"
            className="ln-toggle-btn"
            onClick={() => {
              if (isMobile) {
                setIsMobileMenuOpen((previous) => !previous);
                return;
              }

              setIsCollapsed((previous) => !previous);
            }}
            aria-label={isNavCollapsed ? "Expand navigation" : "Collapse navigation"}
          >
            {isNavCollapsed ? ">" : "<"}
          </button>
        </div>

        <nav className="ln-sidebar-nav" aria-label="Primary">
          {NAV_ITEMS.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`ln-nav-item ${isActive ? "ln-nav-item-active" : ""} ${isNavCollapsed ? "ln-nav-item-collapsed" : ""}`}
                onClick={() => {
                  if (isMobile) {
                    setIsMobileMenuOpen(false);
                  }
                }}
              >
                {!isNavCollapsed ? item.label : "OKR"}
              </Link>
            );
          })}
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
              className={`ln-sp-status ln-sp-status-${connection.status}`}
              title={connection.detail}
              aria-label={`SharePoint status: ${connection.message}`}
            >
              <span className="ln-sp-dot" />
              <span>SharePoint {connection.message}</span>
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
    </div>
  );
}
