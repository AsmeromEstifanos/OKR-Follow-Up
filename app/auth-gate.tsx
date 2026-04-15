"use client";

import AuthButtons from "@/app/auth-buttons";
import LoaderImage from "@/app/loader-image";
import { ensureActiveAccount, msalConfigError } from "@/lib/auth/msal-client";
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
      <section className="auth-gate" aria-live="polite">
        <LoaderImage size={180} />
        <h1>Authentication required</h1>
        <p>Sign in with your Microsoft account to open the OKR workspace.</p>
        {msalConfigError ? <p className="message danger">{msalConfigError}</p> : null}
        <AuthButtons />
      </section>
    );
  }

  return <>{children}</>;
}
