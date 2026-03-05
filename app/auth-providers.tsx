"use client";

import { MsalProvider } from "@azure/msal-react";
import { ensureActiveAccount, initializeMsal, msalInstance } from "@/lib/auth/msal-client";
import { useEffect, useState } from "react";

type Props = {
  children: React.ReactNode;
};

export default function AuthProviders({ children }: Props): JSX.Element {
  const [isReady, setIsReady] = useState<boolean>(false);

  useEffect(() => {
    let cancelled = false;

    void initializeMsal()
      .then(() => {
        if (cancelled) {
          return;
        }

        ensureActiveAccount();
        setIsReady(true);
      })
      .catch(() => {
        // Let downstream UI show auth errors from explicit actions.
        if (!cancelled) {
          setIsReady(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return <MsalProvider instance={msalInstance}>{isReady ? children : null}</MsalProvider>;
}
