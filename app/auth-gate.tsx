"use client";

import LoaderImage from "@/app/loader-image";
import { attemptSilentSso, ensureActiveAccount } from "@/lib/auth/msal-client";
import { withBasePath } from "@/lib/base-path";
import { useIsAuthenticated, useMsal } from "@azure/msal-react";
import { useEffect, useState } from "react";

type Props = {
  children: React.ReactNode;
};

export default function AuthGate({ children }: Props): JSX.Element {
  const isAuthenticated = useIsAuthenticated();
  const { accounts, inProgress } = useMsal();
  const [isAttemptingSso, setIsAttemptingSso] = useState<boolean>(true);

  useEffect(() => {
    if (accounts.length > 0) {
      ensureActiveAccount();
    }
  }, [accounts]);

  // On first load, if not already signed in, try silent SSO from the shared
  // tenant session (so switching from the companion app doesn't re-prompt).
  useEffect(() => {
    let cancelled = false;
    if (accounts.length > 0) {
      setIsAttemptingSso(false);
      return;
    }
    void attemptSilentSso().finally(() => {
      if (!cancelled) {
        setIsAttemptingSso(false);
      }
    });
    return () => {
      cancelled = true;
    };
    // Run once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (inProgress !== "none" || (isAttemptingSso && !isAuthenticated)) {
    const loaderSrc =
      inProgress === "logout" ? withBasePath("/SVH.gif") : undefined;

    return (
      <div className="auth-loader" aria-live="polite" aria-busy="true">
        <LoaderImage size={320} src={loaderSrc} />
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="auth-loader" aria-live="polite">
        <LoaderImage size={220} src={withBasePath("/SVH.gif")} />
      </div>
    );
  }

  return <>{children}</>;
}
