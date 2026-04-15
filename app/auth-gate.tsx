"use client";

import AuthButtons from "@/app/auth-buttons";
import LoaderImage from "@/app/loader-image";
import { ensureActiveAccount } from "@/lib/auth/msal-client";
import { withBasePath } from "@/lib/base-path";
import { useIsAuthenticated, useMsal } from "@azure/msal-react";
import { useEffect } from "react";

type Props = {
  children: React.ReactNode;
};

export default function AuthGate({ children }: Props): JSX.Element {
  const isAuthenticated = useIsAuthenticated();
  const { accounts, inProgress } = useMsal();

  useEffect(() => {
    if (accounts.length > 0) {
      ensureActiveAccount();
    }
  }, [accounts]);

  if (inProgress !== "none") {
    return (
      <div className="auth-loader" aria-live="polite" aria-busy="true">
        <LoaderImage size={320} />
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <section className="auth-gate auth-gate-signed-out" aria-live="polite">
        <LoaderImage size={220} src={withBasePath("/svh.gif")} />
        <div className="auth-gate-copy">
          <h1>Signed out</h1>
          <p>Use your Microsoft work account to sign back in and continue using OKR Follow-Up.</p>
        </div>
        <AuthButtons />
      </section>
    );
  }

  return <>{children}</>;
}
