"use client";

import LoaderImage from "@/app/loader-image";
import { useMsal } from "@azure/msal-react";
import { useState } from "react";
import { ensureActiveAccount, initializeMsal, loginRequest, msalConfigError } from "@/lib/auth/msal-client";

type Props = {
  compact?: boolean;
  onAuthChanged?: () => void;
};

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
      if (response.account) {
        instance.setActiveAccount(response.account);
      } else {
        ensureActiveAccount();
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
