"use client";

import LoaderImage from "@/app/loader-image";
import { apiPath } from "@/lib/base-path";
import { useMsal } from "@azure/msal-react";
import { useState } from "react";
import { ensureActiveAccount, initializeMsal, loginRequest, msalConfigError } from "@/lib/auth/msal-client";

type Props = {
  compact?: boolean;
  onAuthChanged?: () => void;
};

function normalizeEmail(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

export default function AuthButtons({ compact = false, onAuthChanged }: Props): JSX.Element {
  const { instance, accounts } = useMsal();
  const [isBusy, setIsBusy] = useState<boolean>(false);
  const [error, setError] = useState<string>("");
  const isAuthenticated = accounts.length > 0;
  const isDisabled = isBusy || Boolean(msalConfigError);

  const handleLogin = async (): Promise<void> => {
    if (isDisabled) {
      return;
    }

    setIsBusy(true);
    setError("");

    try {
      await initializeMsal();
      const response = await instance.loginPopup(loginRequest);
      const activeAccount = response.account ?? ensureActiveAccount();
      if (response.account) {
        instance.setActiveAccount(response.account);
      }

      if (activeAccount) {
        const claims = activeAccount.idTokenClaims as { preferred_username?: unknown; email?: unknown; name?: unknown } | undefined;
        const email =
          normalizeEmail(typeof claims?.email === "string" ? claims.email : "") ||
          normalizeEmail(typeof claims?.preferred_username === "string" ? claims.preferred_username : "") ||
          normalizeEmail(activeAccount.username);
        const displayName =
          (typeof claims?.name === "string" ? claims.name : activeAccount.name ?? "").trim();

        if (email) {
          try {
            await fetch(apiPath("/api/auth/logins"), {
              method: "POST",
              headers: {
                "content-type": "application/json",
                "x-user-email": email
              },
              body: JSON.stringify({
                email,
                displayName
              })
            });
          } catch {
            // Auth logging should not block sign-in.
          }
        }
      }

      onAuthChanged?.();
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : "Sign in failed.");
    } finally {
      setIsBusy(false);
    }
  };

  const handleLogout = async (): Promise<void> => {
    if (isBusy) {
      return;
    }

    setIsBusy(true);
    setError("");

    try {
      await initializeMsal();
      await instance.logoutPopup();
      onAuthChanged?.();
    } catch (logoutError) {
      setError(logoutError instanceof Error ? logoutError.message : "Sign out failed.");
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <div className="shell-auth-wrap">
      {isAuthenticated ? (
        <button
          type="button"
          className={`shell-auth-btn ${compact ? "shell-auth-btn-compact" : ""}`}
          onClick={() => void handleLogout()}
          disabled={isBusy}
        >
          {isBusy ? (
            <span className="shell-auth-btn-loading">
              <LoaderImage size={20} className="shell-auth-btn-loader" />
              Working...
            </span>
          ) : (
            "Sign Out"
          )}
        </button>
      ) : (
        <button
          type="button"
          className={`shell-auth-btn ${compact ? "shell-auth-btn-compact" : ""}`}
          onClick={() => void handleLogin()}
          disabled={isDisabled}
          title={msalConfigError || "Sign in with Microsoft"}
        >
          {isBusy ? (
            <span className="shell-auth-btn-loading">
              <LoaderImage size={20} className="shell-auth-btn-loader" />
              Working...
            </span>
          ) : (
            "Sign In"
          )}
        </button>
      )}
      {error ? <p className="message danger shell-auth-error">{error}</p> : null}
      {!isAuthenticated && msalConfigError ? <p className="message danger shell-auth-error">{msalConfigError}</p> : null}
    </div>
  );
}
