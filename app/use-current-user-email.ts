"use client";

import { useMsal } from "@azure/msal-react";
import { useMemo } from "react";

function normalizeEmail(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

export default function useCurrentUserEmail(): string {
  const { accounts, instance } = useMsal();

  return useMemo(() => {
    const active = instance.getActiveAccount() ?? accounts[0] ?? null;
    if (!active) {
      return "";
    }

    const claims = active.idTokenClaims as { preferred_username?: unknown; email?: unknown } | undefined;
    const preferred = typeof claims?.preferred_username === "string" ? claims.preferred_username : "";
    const emailClaim = typeof claims?.email === "string" ? claims.email : "";

    return (
      normalizeEmail(emailClaim) ||
      normalizeEmail(preferred) ||
      normalizeEmail(active.username)
    );
  }, [accounts, instance]);
}
