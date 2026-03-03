"use client";

import { useMsal } from "@azure/msal-react";
import { useCallback, useEffect, useState } from "react";
import { initializeMsal, sharePointProbeScopes } from "@/lib/auth/msal-client";
import { getConfiguredSharePointSiteUrl, probeSharePointSiteConnection } from "@/lib/sharepoint/graph-client";

export type SharePointConnectionStatus = "not-configured" | "checking" | "linked" | "error";

type SharePointConnectionState = {
  status: SharePointConnectionStatus;
  message: string;
  detail: string;
};

const INITIAL_STATE: SharePointConnectionState = {
  status: "not-configured",
  message: "Not configured",
  detail: "Set NEXT_PUBLIC_SHAREPOINT_SITE_URL to enable SharePoint checks."
};

export default function useSharePointConnection(enabled: boolean): SharePointConnectionState & { refresh: () => void } {
  const { instance, accounts } = useMsal();
  const [state, setState] = useState<SharePointConnectionState>(INITIAL_STATE);
  const [refreshToken, setRefreshToken] = useState<number>(0);

  const refresh = useCallback(() => {
    setRefreshToken((value) => value + 1);
  }, []);

  useEffect(() => {
    const siteUrl = getConfiguredSharePointSiteUrl();

    if (!siteUrl) {
      setState(INITIAL_STATE);
      return;
    }

    if (!enabled) {
      setState({
        status: "error",
        message: "Authentication required",
        detail: "Sign in to verify SharePoint connectivity."
      });
      return;
    }

    let cancelled = false;
    setState({
      status: "checking",
      message: "Checking",
      detail: "Validating SharePoint site access..."
    });

    void initializeMsal()
      .then(() => probeSharePointSiteConnection(instance, siteUrl, sharePointProbeScopes))
      .then((site) => {
        if (cancelled) {
          return;
        }

        setState({
          status: "linked",
          message: "Linked",
          detail: site.displayName || site.webUrl || site.id
        });
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }

        setState({
          status: "error",
          message: "Error",
          detail: error instanceof Error ? error.message : "Failed to verify SharePoint site."
        });
      });

    return () => {
      cancelled = true;
    };
  }, [accounts, enabled, instance, refreshToken]);

  return { ...state, refresh };
}
