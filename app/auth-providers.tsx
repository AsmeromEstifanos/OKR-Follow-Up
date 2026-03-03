"use client";

import { MsalProvider } from "@azure/msal-react";
import { ensureActiveAccount, initializeMsal, msalInstance } from "@/lib/auth/msal-client";
import { useEffect } from "react";

type Props = {
  children: React.ReactNode;
};

export default function AuthProviders({ children }: Props): JSX.Element {
  useEffect(() => {
    void initializeMsal().then(() => {
      ensureActiveAccount();
    });
  }, []);

  return <MsalProvider instance={msalInstance}>{children}</MsalProvider>;
}
