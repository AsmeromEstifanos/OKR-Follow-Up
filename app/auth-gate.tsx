"use client";

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
    const loaderSrc = inProgress === "logout" ? withBasePath("/svh.gif") : undefined;

    return (
      <div className="auth-loader" aria-live="polite" aria-busy="true">
        <LoaderImage size={320} src={loaderSrc} />
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="auth-loader" aria-live="polite">
        <LoaderImage size={220} src={withBasePath("/svh.gif")} />
      </div>
    );
  }

  return <>{children}</>;
}
